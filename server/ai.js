// Claude를 부르는 단 한 곳. 구조화 출력으로 JSON만 받고, 실패하면 AiError를 던진다.
// 열쇠는 process.env.ANTHROPIC_API_KEY 에서만 읽고, 어디에도 내보내거나 기록하지 않는다.
// 돈이 드는 호출이라 두 겹으로 막는다: 주소마다 10분에 30번, 사이트 전체로 하루 AI_DAILY_CAP번(기본 300).
import Anthropic from '@anthropic-ai/sdk'

/** 서버 쪽 제한 시간. 브라우저의 15초 제한보다 짧아야 기본 답으로 바꿀 시간이 남는다. */
export const AI_TIMEOUT_MS = 12000
const DEFAULT_MODEL = 'claude-opus-5-5'
// 생각(thinking)에 쓰는 토큰도 max_tokens에 들어가므로 답 길이보다 넉넉하게 잡는다.
const MAX_TOKENS = 8000

/**
 * 테스트에서 가짜를 넣을 수 있도록, 실제로 쓰는 부분만 적은 클라이언트 모양.
 * @typedef {{ beta: { messages: { create: (params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming, options?: { timeout?: number, maxRetries?: number }) => PromiseLike<Anthropic.Beta.Messages.BetaMessage> } } }} AiClient
 */

/**
 * @typedef {'no_key' | 'daily_cap' | 'timeout' | 'auth' | 'rate_limit' | 'api_error' | 'refusal' | 'max_tokens' | 'empty' | 'bad_json' | 'unknown'} AiErrorCode
 */

/** AI 호출이 실패한 까닭. 주소 함수는 이 오류를 받으면 기본 답으로 바꾼다. */
export class AiError extends Error {
  /**
   * @param {AiErrorCode} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'AiError'
    this.code = code
  }
}

/** @type {AiClient | null} */
let overrideClient = null

/**
 * 테스트용: 가짜 클라이언트를 끼운다. null이면 원래대로 돌아간다.
 * @param {AiClient | null} client
 */
export function setAiClient(client) {
  overrideClient = client
}

/** @returns {boolean} AI를 부를 수 있는 상태인지 (열쇠 값 자체는 알려 주지 않는다) */
export function isAiConfigured() {
  return overrideClient !== null || Boolean(process.env.ANTHROPIC_API_KEY)
}

/** @returns {AiClient | null} 열쇠가 없으면 null */
function getClient() {
  if (overrideClient) return overrideClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 })
}

/**
 * SDK 오류를 까닭별로 나눈다. 글자 비교가 아니라 오류 클래스로 구분한다.
 * @param {unknown} error
 * @returns {AiError}
 */
function toAiError(error) {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AiError('timeout')
  if (error instanceof Anthropic.AuthenticationError) return new AiError('auth')
  if (error instanceof Anthropic.RateLimitError) return new AiError('rate_limit')
  if (error instanceof Anthropic.APIError) return new AiError('api_error', `api_error ${error.status ?? ''}`.trim())
  return new AiError('unknown')
}

/**
 * Claude에게 묻고, JSON 스키마에 맞는 답을 풀어서 돌려준다. 실패하면 AiError를 던진다.
 * 부르기 직전에 사이트 전체 하루 한도에서 한 번을 쓰고, 한도를 넘었으면 부르지 않는다('daily_cap').
 * @param {{
 *   system: string,
 *   text: string,
 *   schema: Record<string, unknown>,
 *   image?: { mediaType: 'image/png' | 'image/jpeg' | 'image/webp', data: string },
 * }} input
 * @returns {Promise<unknown>}
 */
export async function askJson({ system, text, schema, image }) {
  const client = getClient()
  if (!client) throw new AiError('no_key')
  const turn = await takeDailyTurn()
  if (!turn.allowed) throw new AiError('daily_cap')
  // 사용량을 세느라 기다린 시간은 AI 제한 시간에서 뺀다: 둘을 합쳐도 12초를 넘지 않는다.
  const timeoutMs = AI_TIMEOUT_MS - turn.waitedMs

  /** @type {Anthropic.Beta.Messages.BetaContentBlockParam[]} */
  const content = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
  content.push({ type: 'text', text })

  /** @type {Anthropic.Beta.Messages.BetaMessage} */
  let response
  try {
    const pending = client.beta.messages.create(
      {
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content }],
        // thinking은 모델 기본값에 맡기고, 빠른 답을 위해 effort만 낮춘다.
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        // 모델이 정책 때문에 거절하면 서버가 권장 대체 모델로 한 번 더 시도한다.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      },
      { timeout: timeoutMs, maxRetries: 0 },
    )
    // SDK의 제한 시간과 따로, 답 전체가 제한 시간 안에 오지 않으면 여기서 끊는다(브라우저 15초보다 먼저).
    response = await withDeadline(pending, timeoutMs)
  } catch (error) {
    throw toAiError(error)
  }

  // 내용을 읽기 전에 멈춘 까닭부터 확인한다.
  if (response.stop_reason === 'refusal') throw new AiError('refusal')
  if (response.stop_reason === 'max_tokens') throw new AiError('max_tokens')

  let output = ''
  for (const block of Array.isArray(response.content) ? response.content : []) {
    if (block.type === 'text') output += block.text
  }
  if (!output.trim()) throw new AiError('empty')
  try {
    return JSON.parse(output)
  } catch {
    throw new AiError('bad_json')
  }
}

/**
 * 정해 둔 시간 안에 끝나지 않으면 AiError('timeout')으로 끊는다.
 * @template T
 * @param {PromiseLike<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiError('timeout')), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** 한 주소(IP)가 AI를 부를 수 있는 횟수: 10분에 30번(서버 인스턴스마다 따로 센다). */
export const AI_RATE_LIMIT = 30
export const AI_RATE_WINDOW_MS = 10 * 60 * 1000
/** @type {Map<string, number[]>} 주소별로 AI를 부른 시각 */
const aiCalls = new Map()

/** 테스트용: 횟수 기록을 비운다(주소별 기록과 하루 사용량 둘 다). */
export function resetAiRateLimit() {
  aiCalls.clear()
  daily = { day: '', shared: 0, local: 0 }
}

/**
 * 이 요청이 AI를 불러도 되는지 보고, 되면 한 번 센다. 넘었으면 false(주소 함수는 기본 답을 준다).
 * 주소는 x-forwarded-for의 첫 값으로 본다. 기록에는 주소를 남기지 않는다.
 * @param {Request} request
 * @param {number} [now]
 * @returns {boolean}
 */
export function takeAiTurn(request, now = Date.now()) {
  const client = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64) || 'unknown'
  const recent = (aiCalls.get(client) ?? []).filter((time) => now - time < AI_RATE_WINDOW_MS)
  if (recent.length >= AI_RATE_LIMIT) {
    aiCalls.set(client, recent)
    return false
  }
  recent.push(now)
  aiCalls.set(client, recent)
  // 기록이 끝없이 늘지 않게, 많아지면 오래된 주소부터 지운다.
  if (aiCalls.size > 2000) {
    for (const key of aiCalls.keys()) {
      if (aiCalls.size <= 1000) break
      aiCalls.delete(key)
    }
  }
  return true
}

/** 사이트 전체가 하루에 AI를 부를 수 있는 횟수의 기본값. 환경변수 AI_DAILY_CAP으로 바꾸고, 0이면 AI를 끈다. */
export const AI_DAILY_CAP_DEFAULT = 300
/** 사용량 저장소를 기다리는 시간 한도. 기다린 만큼은 AI 제한 시간(12초)에서 뺀다. */
export const AI_STORE_TIMEOUT_MS = 1500
// 저장소에 남긴 하루치 숫자는 사흘 뒤에 스스로 지워진다.
const DAY_COUNT_TTL_SECONDS = 3 * 24 * 60 * 60
// 하루는 한국 시간(UTC+9) 0시에 바뀐다.
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000
/**
 * 이 서버 인스턴스가 아는 오늘 사용량. 저장소가 없거나 답이 이상하면 이 숫자로 막는다.
 * shared는 저장소가 알려 준 가장 큰 숫자, local은 저장소에 올리지 못해 이 인스턴스만 아는 횟수다.
 */
let daily = { day: '', shared: 0, local: 0 }

/** @returns {number} 오늘 한도. 값이 비었거나 0 이상의 정수가 아니면 기본값이다(잘못 적어도 무제한이 되지 않게). */
function dailyCap() {
  const raw = (process.env.AI_DAILY_CAP ?? '').trim()
  return /^\d{1,9}$/.test(raw) ? Number(raw) : AI_DAILY_CAP_DEFAULT
}

/**
 * 사용량 저장소(Redis REST)에서 오늘 숫자를 하나 올리고, 올린 뒤의 숫자를 받는다. 못 받으면 null.
 * 저장소 주소와 토큰은 기록·오류·답 어디에도 넣지 않는다: 실패한 까닭은 여기서 정한 낱말로만 남긴다.
 * @param {string} url
 * @param {string} token
 * @param {string} key
 * @returns {Promise<number | null>}
 */
async function countInStore(url, token, key) {
  /** @type {string} */
  let reason
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, DAY_COUNT_TTL_SECONDS],
      ]),
      signal: AbortSignal.timeout(AI_STORE_TIMEOUT_MS),
    })
    const body = await response.text()
    if (response.ok) {
      // 답 모양: [{ "result": 올린 뒤의 숫자 }, { "result": 1 }]
      /** @type {unknown} */
      const answer = JSON.parse(body)
      const first = /** @type {{ result?: unknown } | null | undefined} */ (Array.isArray(answer) ? answer[0] : null)
      const count = first?.result
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 1) return count
      reason = 'store_bad_answer'
    } else {
      reason = `store_http_${response.status}`
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    reason = name === 'TimeoutError' || name === 'AbortError' ? 'store_timeout' : name === 'SyntaxError' ? 'store_bad_answer' : 'store_error'
  }
  console.warn('[ai] 사용량을 저장소에 세지 못해서 이 서버 안에서만 세요:', reason)
  return null
}

/**
 * 사이트 전체의 하루 한도에서 한 번을 쓴다. 한도를 넘었으면 allowed가 false다(주소 함수는 기본 답을 준다).
 * 저장소(KV_REST_API_URL, KV_REST_API_TOKEN)가 있으면 모든 서버 인스턴스가 같은 숫자를 올린다.
 * 저장소가 없거나 늦거나 답이 이상하면 이 인스턴스 안의 숫자로 막는다(모를 때도 무제한이 되지 않는다).
 * @param {number} [now]
 * @returns {Promise<{ allowed: boolean, waitedMs: number }>} waitedMs는 저장소를 기다린 시간(묻지 않았으면 0)
 */
export async function takeDailyTurn(now = Date.now()) {
  const cap = dailyCap()
  const day = new Date(now + KOREA_OFFSET_MS).toISOString().slice(0, 10)
  if (daily.day !== day) daily = { day, shared: 0, local: 0 }
  // 기다리는 사이에 날짜가 바뀌어도 그날 숫자에만 더하도록 붙잡아 둔다.
  const today = daily
  // 이미 한도에 닿은 것을 알면(한도가 0이면 처음부터) 저장소에 묻지 않고 막는다.
  if (today.shared + today.local >= cap) return { allowed: false, waitedMs: 0 }
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  /** @type {number | null} */
  let stored = null
  let waitedMs = 0
  if (url && token) {
    const startedAt = Date.now()
    stored = await countInStore(url, token, `bb:ai:${day}`)
    // 시계가 튀어도 0초에서 1.5초 사이의 값만 쓴다.
    waitedMs = Math.min(AI_STORE_TIMEOUT_MS, Math.max(0, Date.now() - startedAt))
  }
  // 저장소가 알려 준 숫자는 기억해 두고(끊겨도 거기서부터 이어서 센다), 못 올린 것은 이 인스턴스가 따로 센다.
  if (stored === null) today.local += 1
  else today.shared = Math.max(today.shared, stored)
  return { allowed: (stored ?? today.shared) + today.local <= cap, waitedMs }
}

/**
 * AI에게 물어 보고, 어떤 이유로든 실패하면 null을 돌려준다(주소 함수가 기본 답으로 바꾼다).
 * 열쇠가 없으면 부르지 않는다. request를 주면 주소별 횟수 제한을 넘었을 때도 부르지 않는다.
 * 사이트 전체 하루 한도를 넘었을 때도 부르지 않는다(askJson이 'daily_cap'으로 알려 준다).
 * 기록에는 까닭 코드(와 상태 번호)만 남긴다. 열쇠와 프롬프트는 남기지 않는다.
 * @param {Parameters<typeof askJson>[0]} input
 * @param {Request} [request]
 * @returns {Promise<unknown>}
 */
export async function tryAskJson(input, request) {
  if (!isAiConfigured()) return null
  if (request && !takeAiTurn(request)) {
    console.warn('[ai] 기본 답으로 바꿔요:', 'local_rate_limit')
    return null
  }
  try {
    return await askJson(input)
  } catch (error) {
    const aiError = toAiError(error)
    // message는 이 파일이 만든 값뿐이다: 코드 그대로이거나 'api_error 529'처럼 상태 번호가 붙은 글.
    console.warn('[ai] 기본 답으로 바꿔요:', aiError.code === 'api_error' ? aiError.message : aiError.code)
    return null
  }
}

/**
 * 사용자가 쓴 글을 프롬프트에 넣기 전에 다듬는다: 제어 문자와 꺾쇠를 빼고 길이를 자른다.
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function promptText(value, maxLength) {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]+/g, ' ').trim().slice(0, maxLength)
}

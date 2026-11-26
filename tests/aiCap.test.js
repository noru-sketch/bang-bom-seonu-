// 사이트 전체 하루 한도(AI_DAILY_CAP)와 실제 사이트의 Origin 검사 테스트.
// 네트워크를 쓰지 않는다: AI, 사용량 저장소(fetch), 시계가 모두 가짜이고 토큰과 저장소 주소도 가짜다.
/** @import { AiClient } from '../server/ai.js' */
import test, { afterEach, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { inspect } from 'node:util'

import adviceHandler from '../api/advice.js'
import consultHandler from '../api/consult.js'
import floorplanHandler from '../api/floorplan.js'
import furnitureHandler from '../api/furniture.js'
import healthHandler from '../api/health.js'
import renderPhotoHandler from '../api/render-photo.js'
import styleHandler from '../api/style.js'
import { AI_DAILY_CAP_DEFAULT, AI_RATE_LIMIT, AI_STORE_TIMEOUT_MS, AI_TIMEOUT_MS, AiError, askJson, resetAiRateLimit, setAiClient, takeDailyTurn } from '../server/ai.js'

// 가짜 값은 실행할 때 조각을 이어서 만든다(파일에 열쇠처럼 생긴 글자를 남기지 않으려고).
const FAKE_TOKEN = ['fake', 'store', 'token', 'T'.repeat(40)].join('_')
const FAKE_HOST = ['fake-usage-store', 'example', 'invalid'].join('.')
const FAKE_URL = `https://${FAKE_HOST}`
/** 어디에도 새어 나가면 안 되는 글자들. 잘린 조각만 나가도 잡는다. */
const SECRET_PIECES = [FAKE_TOKEN, 'T'.repeat(12), FAKE_HOST, 'fake-usage-store']

/** 한국 시간 2026-11-26 낮 12시 */
const NOON = Date.UTC(2026, 10, 26, 3, 0, 0)
const TODAY_KEY = 'bb:ai:2026-11-26'
const SITE = 'https://bangbom.example'
/** 코드가 잘못돼 기다림이 끝나지 않을 때, 멈춰 있지 않고 실패로 끝나게 하는 한도 */
const LIMIT = { timeout: 5000 }

const STYLE_BODY = { text: '따뜻한 우드 미드센추리' }
const STYLE_ANSWER = { name: '포근한 우드', wallColor: '#F5EFE6', floorColor: '#B98F64', floorMaterial: 'walnut_wood', accentColor: '#8C5A3C', description: '따뜻한 나무 조합' }
const ASK_INPUT = { system: '시험', text: '시험', schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }

/** @type {[string, { fetch: (request: Request) => Promise<Response> }][]} POST로 부르는 주소 여섯 곳 */
const POST_ROUTES = [
  ['/api/advice', adviceHandler],
  ['/api/consult', consultHandler],
  ['/api/floorplan', floorplanHandler],
  ['/api/furniture', furnitureHandler],
  ['/api/render-photo', renderPhotoHandler],
  ['/api/style', styleHandler],
]

/**
 * @param {string} text
 * @returns {boolean} 가짜 토큰이나 저장소 주소(의 조각)가 들어 있는지
 */
function leaks(text) {
  return SECRET_PIECES.some((piece) => text.includes(piece))
}

const ENV_NAMES = ['ANTHROPIC_API_KEY', 'AI_DAILY_CAP', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VERCEL_ENV', 'ALLOWED_ORIGINS']
/** @type {Map<string, string | undefined>} */
const savedEnv = new Map()
const realFetch = globalThis.fetch
const realAbortTimeout = AbortSignal.timeout
const LOG_LEVELS = /** @type {const} */ (['log', 'info', 'warn', 'error', 'debug'])
const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }

/** @type {string[]} 테스트 하나가 도는 동안 console에 찍힌 글 */
let logged = []
/** 저장소를 끼우지 않았는데 fetch를 부른 횟수 */
let strayFetches = 0
/** @type {{ at: number, fire: () => void }[]} 가짜 시계로 기다리는 시간 초과 신호 */
let timeouts = []
let visitor = 0

beforeEach(() => {
  for (const name of ENV_NAMES) {
    savedEnv.set(name, process.env[name])
    delete process.env[name]
  }
  setAiClient(null)
  resetAiRateLimit()
  logged = []
  strayFetches = 0
  timeouts = []
  for (const level of LOG_LEVELS) {
    console[level] = (...args) => {
      logged.push(args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 6 }))).join(' '))
    }
  }
  globalThis.fetch = () => {
    strayFetches += 1
    throw new Error('테스트에서 진짜 fetch를 부르면 안 돼요')
  }
  // 가짜 시계: Date는 node:test가 흉내 내고, AbortSignal.timeout은 같은 시계를 따르게 여기서 바꿔 끼운다.
  mock.timers.enable({ apis: ['Date'], now: NOON })
  AbortSignal.timeout = (ms) => {
    const controller = new AbortController()
    timeouts.push({ at: Date.now() + ms, fire: () => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) })
    return controller.signal
  }
})

afterEach(() => {
  mock.timers.reset()
  AbortSignal.timeout = realAbortTimeout
  globalThis.fetch = realFetch
  for (const level of LOG_LEVELS) console[level] = realConsole[level]
  for (const name of ENV_NAMES) {
    const value = savedEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  setAiClient(null)
  resetAiRateLimit()
  // 어떤 테스트에서도 기록에 토큰이나 저장소 주소가 남으면 안 된다.
  assert.deepEqual(logged.filter(leaks), [])
})

/**
 * 가짜 시계를 돌리고, 그 사이에 시간이 다 된 신호를 끊는다.
 * @param {number} ms
 */
function advance(ms) {
  mock.timers.tick(ms)
  const due = timeouts.filter((timer) => timer.at <= Date.now())
  timeouts = timeouts.filter((timer) => timer.at > Date.now())
  for (const timer of due) timer.fire()
}

/**
 * 조건이 맞을 때까지 다른 일이 먼저 돌게 비켜 준다.
 * @param {() => boolean} done
 */
async function until(done) {
  for (let i = 0; i < 1000 && !done(); i += 1) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(done(), true)
}

/** 저장소가 연결된 서버처럼 환경변수를 넣는다. */
function connectStore() {
  process.env.KV_REST_API_URL = FAKE_URL
  process.env.KV_REST_API_TOKEN = FAKE_TOKEN
}

/**
 * @typedef {{ url: string, method: string | undefined, headers: Headers, body: string, signal: AbortSignal | null | undefined }} StoreCall
 */

/**
 * 가짜 사용량 저장소를 fetch 자리에 끼운다. 받은 요청을 calls에 모으고 reply가 정한 대로 답한다.
 * @param {(call: StoreCall) => Response | Promise<Response>} reply
 */
function fakeStore(reply) {
  /** @type {StoreCall[]} */
  const calls = []
  globalThis.fetch = /** @type {typeof fetch} */ (
    async (input, init) => {
      const call = { url: String(input), method: init?.method, headers: new Headers(init?.headers), body: String(init?.body), signal: init?.signal }
      calls.push(call)
      return reply(call)
    }
  )
  return { calls }
}

/**
 * 진짜 저장소처럼 열쇠마다 숫자를 하나씩 올려서 답하는 가짜 저장소.
 * @param {() => void} [beforeReply] 답하기 직전에 부른다(늦게 답하는 흉내를 낼 때)
 */
function countingStore(beforeReply) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  const { calls } = fakeStore((call) => {
    /** @type {[string, string, number?][]} */
    const commands = JSON.parse(call.body)
    const key = commands[0][1]
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    beforeReply?.()
    return Response.json([{ result: count }, { result: 1 }])
  })
  return { calls, counts }
}

/**
 * 정해 둔 답(기본은 색 조합)을 돌려주는 가짜 AI를 끼운다. 받은 요청을 calls에 모은다.
 * @param {unknown} [answer]
 */
function fakeAi(answer = STYLE_ANSWER) {
  /** @type {{ params: Record<string, unknown>, options: unknown }[]} */
  const calls = []
  const client = {
    beta: {
      messages: {
        /**
         * @param {Record<string, unknown>} params
         * @param {unknown} options
         */
        async create(params, options) {
          calls.push({ params, options })
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] }
        },
      },
    },
  }
  setAiClient(/** @type {AiClient} */ (/** @type {unknown} */ (client)))
  return { calls }
}

/**
 * /api/style을 부른다. 주소별 제한(10분에 30번)에 걸리지 않게 부를 때마다 다른 주소에서 온 것처럼 보낸다.
 * 답의 본문과 머리말에 토큰이나 저장소 주소가 없는지도 매번 본다.
 * @param {{ url?: string, headers?: Record<string, string> }} [options]
 * @returns {Promise<{ status: number, data: any, headers: Headers }>}
 */
async function postStyle({ url = 'http://test.local/api/style', headers = {} } = {}) {
  visitor += 1
  const response = await styleHandler.fetch(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `203.0.113.${visitor % 250}`, ...headers },
      body: JSON.stringify(STYLE_BODY),
    }),
  )
  const text = await response.text()
  assert.equal(leaks(text), false)
  response.headers.forEach((value) => assert.equal(leaks(value), false))
  return { status: response.status, data: JSON.parse(text), headers: response.headers }
}

/**
 * 테스트에서는 답의 모양을 직접 확인하므로 느슨한 타입으로 읽는다.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function bodyOf(response) {
  return JSON.parse(await response.text())
}

test('한도 아래: AI를 부르고, 저장소에는 오늘 숫자 올리기(INCR)와 사흘 뒤 지우기(EXPIRE)를 한 번에 보내요', LIMIT, async () => {
  assert.equal(AI_DAILY_CAP_DEFAULT, 300)
  assert.equal(AI_STORE_TIMEOUT_MS, 1500)
  connectStore()
  const store = countingStore()
  const ai = fakeAi()
  const first = await postStyle()
  assert.equal(first.status, 200)
  assert.equal(first.data.isFallback, false)
  assert.equal(ai.calls.length, 1)
  assert.equal(store.calls.length, 1)

  const call = store.calls[0]
  assert.equal(call.url, `${FAKE_URL}/pipeline`)
  assert.equal(call.method, 'POST')
  assert.equal(call.headers.get('authorization'), `Bearer ${FAKE_TOKEN}`)
  assert.equal(call.headers.get('content-type'), 'application/json')
  assert.deepEqual(JSON.parse(call.body), [
    ['INCR', TODAY_KEY],
    ['EXPIRE', TODAY_KEY, 259200],
  ])
  // 토큰은 Authorization 머리말로만 보낸다(주소나 본문에 넣지 않는다)
  assert.equal(leaks(call.url.replace(FAKE_URL, '')), false)
  assert.equal(leaks(call.body), false)
  // 1.5초 뒤에 끊기는 신호를 함께 보낸다
  assert.ok(call.signal instanceof AbortSignal)
  assert.equal(call.signal.aborted, false)
  advance(AI_STORE_TIMEOUT_MS - 1)
  assert.equal(call.signal.aborted, false)
  advance(1)
  assert.equal(call.signal.aborted, true)

  // 저장소 주소 끝에 빗금이 있어도 같은 곳으로 보낸다
  process.env.KV_REST_API_URL = `${FAKE_URL}/`
  await postStyle()
  assert.equal(store.calls[1].url, `${FAKE_URL}/pipeline`)
  assert.equal(store.counts.get(TODAY_KEY), 2)
  assert.deepEqual(logged, [])
})

test('한도 + 1번째: AI를 부르지 않고 규칙 기반 기본 답(isFallback: true)을 줘요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '3'
  connectStore()
  const store = countingStore()
  const ai = fakeAi()
  for (let i = 0; i < 3; i += 1) assert.equal((await postStyle()).data.isFallback, false, String(i))
  const over = await postStyle()
  assert.equal(over.status, 200)
  assert.equal(over.data.isFallback, true)
  assert.equal(over.data.style.id, 'midcentury_walnut')
  // 답의 모양은 열쇠가 없을 때의 기본 답과 같다: 횟수나 한도를 알려 주는 칸이 없다
  assert.deepEqual(Object.keys(over.data).sort(), ['isFallback', 'note', 'style'])
  assert.equal(ai.calls.length, 3)
  // 한도에 닿은 것을 알면 저장소에 다시 묻지 않는다
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(store.calls.length, 3)

  // 다른 서버 인스턴스(기억이 비어 있다)도 저장소의 숫자를 보고 멈춘다
  resetAiRateLimit()
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(store.counts.get(TODAY_KEY), 4)
  assert.equal(ai.calls.length, 3)
  // 기록에는 까닭 낱말만 남는다
  assert.deepEqual(logged, Array(3).fill('[ai] 기본 답으로 바꿔요: daily_cap'))
})

test('한도는 기능을 가리지 않고 사이트 전체로 세요: 상담도 한도를 넘으면 규칙이 만든 답을 줘요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '2'
  connectStore()
  const store = countingStore()
  const ai = fakeAi({ reply: '확인 필요는 정보가 더 필요하다는 뜻이에요.' })
  const draft = '시중은행 전세대출: 확인 필요. 은행 심사로 결정돼요'
  const consult = async () => {
    const response = await consultHandler.fetch(
      new Request('http://test.local/api/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '확인 필요가 무슨 뜻이에요?', draft }),
      }),
    )
    return bodyOf(response)
  }
  assert.equal((await consult()).isFallback, false)
  // 기능마다 서버 인스턴스가 따로라서 기억은 비어 있고, 저장소의 숫자만 같이 본다
  resetAiRateLimit()
  await postStyle()
  resetAiRateLimit()
  const over = await consult()
  assert.equal(over.isFallback, true)
  assert.equal(over.answer, draft)
  assert.deepEqual(Object.keys(over).sort(), ['answer', 'isFallback', 'note'])
  assert.equal(ai.calls.length, 2)
  assert.equal(store.counts.get(TODAY_KEY), 3)
})

test('AI를 부르지 않는 요청은 세지 않아요: 열쇠 없음, 틀린 입력, 주소별 제한에 걸린 요청', LIMIT, async () => {
  connectStore()
  const store = countingStore()
  // 열쇠가 없을 때
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(store.calls.length, 0)
  const ai = fakeAi()
  // 틀린 입력(400)
  const bad = await styleHandler.fetch(new Request('http://test.local/api/style', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
  assert.equal(bad.status, 400)
  assert.equal(store.calls.length, 0)
  // 한 주소가 10분에 30번을 다 쓰면, 그 뒤 요청은 하루 한도에서 빼지 않는다
  const sameVisitor = { headers: { 'x-forwarded-for': '198.51.100.7' } }
  for (let i = 0; i < AI_RATE_LIMIT; i += 1) assert.equal((await postStyle(sameVisitor)).data.isFallback, false, String(i))
  assert.equal((await postStyle(sameVisitor)).data.isFallback, true)
  assert.equal(ai.calls.length, AI_RATE_LIMIT)
  assert.equal(store.calls.length, AI_RATE_LIMIT)
  assert.equal(store.counts.get(TODAY_KEY), AI_RATE_LIMIT)
})

test('저장소가 없으면 이 서버 안에서 세요: 기본 한도 300번까지만 AI를 불러요', LIMIT, async () => {
  const ai = fakeAi()
  for (let i = 0; i < AI_DAILY_CAP_DEFAULT; i += 1) assert.equal((await postStyle()).data.isFallback, false, String(i))
  for (let i = 0; i < 3; i += 1) assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(ai.calls.length, AI_DAILY_CAP_DEFAULT)
  assert.equal(strayFetches, 0)
  // 저장소에 다녀오지 않았으면 AI 제한 시간은 12초 그대로다
  assert.deepEqual(ai.calls[0].options, { timeout: AI_TIMEOUT_MS, maxRetries: 0 })
})

test('AI_DAILY_CAP=0이면 AI를 끄고 저장소에도 묻지 않아요. /api/health 답은 그대로예요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '0'
  connectStore()
  const store = countingStore()
  const ai = fakeAi()
  const off = await postStyle()
  assert.equal(off.status, 200)
  assert.equal(off.data.isFallback, true)
  assert.equal(off.data.style.id, 'midcentury_walnut')
  assert.equal(ai.calls.length, 0)
  assert.equal(store.calls.length, 0)
  assert.deepEqual(await takeDailyTurn(), { allowed: false, waitedMs: 0 })
  // 상태 확인은 횟수나 한도를 알려 주지 않는다
  const health = await healthHandler.fetch(new Request('http://test.local/api/health'))
  assert.deepEqual(await bodyOf(health), { status: 'ok', aiConfigured: true })
})

test('AI_DAILY_CAP을 잘못 적으면 무제한이 아니라 기본값(300)으로 봐요', LIMIT, async () => {
  for (const wrong of ['', '   ', 'abc', '-1', '1.5', '1e3', '0x10', '300번', '9999999999']) {
    process.env.AI_DAILY_CAP = wrong
    resetAiRateLimit()
    for (let i = 0; i < AI_DAILY_CAP_DEFAULT; i += 1) assert.equal((await takeDailyTurn()).allowed, true, `${wrong} ${i}`)
    assert.equal((await takeDailyTurn()).allowed, false, wrong)
  }
  // 앞뒤 빈칸은 봐준다
  process.env.AI_DAILY_CAP = ' 2 '
  resetAiRateLimit()
  assert.deepEqual([(await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed], [true, true, false])
})

test('하루는 한국 시간 0시(UTC 15시)에 바뀌어요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '2'
  connectStore()
  const store = countingStore()
  const ai = fakeAi()
  // 한국 시간 26일 23:59:59
  mock.timers.setTime(Date.UTC(2026, 10, 26, 14, 59, 59))
  assert.equal((await postStyle()).data.isFallback, false)
  assert.equal((await postStyle()).data.isFallback, false)
  assert.equal((await postStyle()).data.isFallback, true)
  assert.deepEqual([...store.counts.keys()], ['bb:ai:2026-11-26'])
  // 1초 뒤는 한국 시간 27일 00:00:00: 새 날의 열쇠로 다시 1부터 센다
  advance(1000)
  assert.equal((await postStyle()).data.isFallback, false)
  assert.deepEqual([...store.counts], [['bb:ai:2026-11-26', 2], ['bb:ai:2026-11-27', 1]])
  assert.equal((await postStyle()).data.isFallback, false)
  assert.equal((await postStyle()).data.isFallback, true)
  // UTC 0시(한국 시간 오전 9시)에는 바뀌지 않는다
  mock.timers.setTime(Date.UTC(2026, 10, 27, 0, 0, 0))
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(ai.calls.length, 4)

  // 저장소 없이 이 서버 안에서 셀 때도 같은 때에 바뀐다
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
  resetAiRateLimit()
  mock.timers.setTime(Date.UTC(2026, 10, 27, 14, 59, 59))
  assert.deepEqual([(await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed], [true, true, false])
  advance(1000)
  assert.deepEqual([(await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed, (await takeDailyTurn()).allowed], [true, true, false])
})

/** 저장소가 제대로 답하지 않는 여러 경우. 오류 글과 답 안에 일부러 토큰과 주소를 넣어 둔다. */
const BROKEN_STORES = [
  {
    name: '연결 오류',
    reason: 'store_error',
    reply: () => {
      throw new TypeError(`fetch failed ${FAKE_URL}/pipeline Bearer ${FAKE_TOKEN}`, { cause: new Error(`getaddrinfo ENOTFOUND ${FAKE_HOST}`) })
    },
  },
  { name: '토큰이 틀림(401)', reason: 'store_http_401', reply: () => Response.json({ error: `WRONGPASS invalid token ${FAKE_TOKEN}` }, { status: 401 }) },
  { name: '서버 오류(500)', reason: 'store_http_500', reply: () => new Response(`<html>${FAKE_URL}</html>`, { status: 500 }) },
  { name: 'JSON이 아닌 답', reason: 'store_bad_answer', reply: () => new Response(`<html>${FAKE_URL} ${FAKE_TOKEN}</html>`) },
  { name: '배열이 아닌 답', reason: 'store_bad_answer', reply: () => Response.json({ result: 1 }) },
  { name: '빈 배열', reason: 'store_bad_answer', reply: () => Response.json([]) },
  { name: 'null', reason: 'store_bad_answer', reply: () => Response.json(null) },
  { name: '명령 오류', reason: 'store_bad_answer', reply: () => Response.json([{ error: `ERR ${FAKE_TOKEN}` }, { result: 1 }]) },
  { name: '글자로 온 숫자', reason: 'store_bad_answer', reply: () => Response.json([{ result: '1' }, { result: 1 }]) },
  { name: '0', reason: 'store_bad_answer', reply: () => Response.json([{ result: 0 }, { result: 1 }]) },
  { name: '소수', reason: 'store_bad_answer', reply: () => Response.json([{ result: 1.5 }, { result: 1 }]) },
]

for (const { name, reason, reply } of BROKEN_STORES) {
  test(`저장소가 이상할 때(${name}): 이 서버 안에서 세고, 그래도 한도에서 멈춰요`, LIMIT, async () => {
    process.env.AI_DAILY_CAP = '3'
    connectStore()
    const store = fakeStore(reply)
    const ai = fakeAi()
    for (let i = 0; i < 3; i += 1) assert.equal((await postStyle()).data.isFallback, false, String(i))
    assert.equal((await postStyle()).data.isFallback, true)
    assert.equal((await postStyle()).data.isFallback, true)
    assert.equal(ai.calls.length, 3)
    // 한도 아래에서는 부를 때마다 저장소를 다시 시도하고, 기록에는 정해 둔 까닭 낱말만 남긴다
    assert.equal(store.calls.length, 3)
    assert.deepEqual(logged, [
      ...Array(3).fill(`[ai] 사용량을 저장소에 세지 못해서 이 서버 안에서만 세요: ${reason}`),
      ...Array(2).fill('[ai] 기본 답으로 바꿔요: daily_cap'),
    ])
  })
}

test('저장소가 1.5초 안에 답하지 않으면 끊고 이 서버 안에서 세요. 기다린 만큼 AI 제한 시간을 줄여요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '2'
  connectStore()
  // 진짜 fetch처럼, 신호가 끊기면 그 까닭으로 거절한다
  const store = fakeStore((call) => new Promise((_resolve, reject) => call.signal?.addEventListener('abort', () => reject(call.signal?.reason))))
  const ai = fakeAi()
  for (let i = 0; i < 2; i += 1) {
    const pending = postStyle()
    await until(() => store.calls.length === i + 1)
    advance(AI_STORE_TIMEOUT_MS - 1)
    assert.equal(store.calls[i].signal?.aborted, false)
    assert.equal(ai.calls.length, i)
    advance(1)
    assert.equal((await pending).data.isFallback, false)
    // 저장소 1.5초 + AI 10.5초 = 12초: 브라우저의 15초보다 먼저 끝난다
    assert.deepEqual(ai.calls[i].options, { timeout: AI_TIMEOUT_MS - AI_STORE_TIMEOUT_MS, maxRetries: 0 })
  }
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(ai.calls.length, 2)
  assert.equal(store.calls.length, 2)
  assert.deepEqual(logged, [
    ...Array(2).fill('[ai] 사용량을 저장소에 세지 못해서 이 서버 안에서만 세요: store_timeout'),
    '[ai] 기본 답으로 바꿔요: daily_cap',
  ])
})

test('저장소가 늦게 답하면 그만큼 AI 제한 시간을 줄여서, 합쳐도 12초를 넘지 않아요', LIMIT, async () => {
  connectStore()
  countingStore(() => advance(400))
  const ai = fakeAi()
  assert.equal((await postStyle()).data.isFallback, false)
  assert.deepEqual(ai.calls[0].options, { timeout: AI_TIMEOUT_MS - 400, maxRetries: 0 })
  assert.deepEqual(await takeDailyTurn(), { allowed: true, waitedMs: 400 })
})

test('저장소가 중간에 끊기면 마지막으로 들은 숫자부터 이어서 세요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '5'
  connectStore()
  let broken = false
  // 다른 서버 인스턴스가 이미 2번 써서, 이 인스턴스의 첫 호출이 사이트 전체로는 3번째다
  fakeStore(() => {
    if (broken) throw new TypeError('fetch failed')
    return Response.json([{ result: 3 }, { result: 1 }])
  })
  const ai = fakeAi()
  assert.equal((await postStyle()).data.isFallback, false)
  broken = true
  assert.equal((await postStyle()).data.isFallback, false)
  assert.equal((await postStyle()).data.isFallback, false)
  assert.equal((await postStyle()).data.isFallback, true)
  assert.equal(ai.calls.length, 3)
})

test('저장소가 됐다 안 됐다 해도 한도만큼만 AI를 불러요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '3'
  connectStore()
  let count = 0
  // 홀수 번째 요청은 실패하고(저장소는 세지 못했다), 짝수 번째만 저장소가 센다
  const store = fakeStore(() => {
    if (store.calls.length % 2 === 1) throw new TypeError('fetch failed')
    count += 1
    return Response.json([{ result: count }, { result: 1 }])
  })
  const ai = fakeAi()
  const results = []
  for (let i = 0; i < 6; i += 1) results.push((await postStyle()).data.isFallback)
  assert.deepEqual(results, [false, false, false, true, true, true])
  assert.equal(ai.calls.length, 3)
})

test('여러 요청이 한꺼번에 와서 저장소 답의 순서가 뒤바뀌어도 한도만큼만 AI를 불러요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '3'
  connectStore()
  let count = 0
  /** @type {(() => void)[]} */
  const replies = []
  // 저장소는 도착한 순서대로 세지만, 답은 테스트가 보내라고 할 때까지 붙잡아 둔다
  const store = fakeStore(() => {
    count += 1
    const mine = count
    return new Promise((resolve) => replies.push(() => resolve(Response.json([{ result: mine }, { result: 1 }]))))
  })
  const ai = fakeAi()
  const pending = [1, 2, 3, 4, 5].map(() => postStyle())
  await until(() => store.calls.length === 5)
  // 답은 거꾸로 돌아온다
  for (const send of replies.reverse()) send()
  const results = await Promise.all(pending)
  assert.equal(results.filter((result) => result.data.isFallback === false).length, 3)
  assert.equal(ai.calls.length, 3)
})

test('한도를 넘으면 askJson은 daily_cap으로 알리고, 던진 글에도 토큰이나 저장소 주소가 없어요', LIMIT, async () => {
  process.env.AI_DAILY_CAP = '1'
  connectStore()
  fakeStore(() => {
    throw new TypeError(`fetch failed ${FAKE_URL}/pipeline Bearer ${FAKE_TOKEN}`)
  })
  const ai = fakeAi()
  assert.deepEqual(await askJson(ASK_INPUT), STYLE_ANSWER)
  await assert.rejects(askJson(ASK_INPUT), (error) => {
    assert.ok(error instanceof AiError)
    assert.equal(error.code, 'daily_cap')
    assert.equal(leaks(`${error.message}\n${error.stack}\n${inspect(error, { depth: 6 })}`), false)
    return true
  })
  assert.equal(ai.calls.length, 1)
  // 저장소가 고장 나 있어도 횟수를 세는 함수는 오류를 던지지 않는다
  process.env.AI_DAILY_CAP = '5'
  assert.deepEqual(await takeDailyTurn(), { allowed: true, waitedMs: 0 })
})

test('실제 사이트(VERCEL_ENV=production)에서만 Origin 머리말이 없는 POST를 막아요', LIMIT, async () => {
  connectStore()
  const store = countingStore()
  const ai = fakeAi()
  // 내 PC, 미리 보기, 테스트에서는 전과 같이 받는다
  for (const env of [undefined, 'development', 'preview']) {
    if (env === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = env
    const response = await postStyle({ url: `${SITE}/api/style` })
    assert.equal(response.status, 200, String(env))
    assert.equal(response.data.isFallback, false, String(env))
  }
  assert.equal(ai.calls.length, 3)

  process.env.VERCEL_ENV = 'production'
  const foreign = await postStyle({ url: `${SITE}/api/style`, headers: { Origin: 'https://evil.example' } })
  const missing = await postStyle({ url: `${SITE}/api/style` })
  // 남의 출처에서 왔을 때와 상태·코드·문장이 똑같다
  assert.equal(foreign.status, 403)
  assert.equal(missing.status, 403)
  assert.deepEqual(missing.data, foreign.data)
  assert.deepEqual(missing.data, { error: { code: 'forbidden_origin', message: '이 주소에서는 부를 수 없어요.' } })
  assert.equal(missing.headers.get('access-control-allow-origin'), null)
  // 막힌 요청은 AI도 저장소도 부르지 않는다
  assert.equal(ai.calls.length, 3)
  assert.equal(store.calls.length, 3)

  // 사이트 자신의 화면에서 온 요청(브라우저가 Origin을 붙인다)은 그대로 된다
  const own = await postStyle({ url: `${SITE}/api/style`, headers: { Origin: SITE } })
  assert.equal(own.status, 200)
  assert.equal(own.data.isFallback, false)
  assert.equal(own.headers.get('access-control-allow-origin'), SITE)
  assert.equal(ai.calls.length, 4)
})

test('실제 사이트에서는 POST 주소 여섯 곳 모두 Origin 없는 POST를 막고, GET과 OPTIONS는 전과 같아요', LIMIT, async () => {
  const ai = fakeAi()
  for (const [path, handler] of POST_ROUTES) {
    const post = () => handler.fetch(new Request(`${SITE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
    // 실제 사이트가 아니면 전과 같이 입력 검사까지 간다
    delete process.env.VERCEL_ENV
    assert.equal((await post()).status, 400, path)
    process.env.VERCEL_ENV = 'production'
    const blocked = await post()
    assert.equal(blocked.status, 403, path)
    assert.equal((await bodyOf(blocked)).error.code, 'forbidden_origin', path)
    assert.equal((await handler.fetch(new Request(`${SITE}${path}`))).status, 405, path)
    assert.equal((await handler.fetch(new Request(`${SITE}${path}`, { method: 'OPTIONS' }))).status, 204, path)
  }
  // 상태 확인(GET)은 Origin이 없어도 전과 같은 답을 준다
  const health = await healthHandler.fetch(new Request(`${SITE}/api/health`))
  assert.equal(health.status, 200)
  assert.deepEqual(await bodyOf(health), { status: 'ok', aiConfigured: true })
  assert.equal(ai.calls.length, 0)
})

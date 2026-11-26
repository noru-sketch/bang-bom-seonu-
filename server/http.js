// 서버 함수들이 같이 쓰는 HTTP 도우미. CORS와 출처 검사는 여기 한 곳에서만 한다.

/** CORS 머리말(출처 허용 줄은 요청을 보고 guardOrigin()이 따로 붙인다). */
export const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

/** 내 PC와 앱(웹뷰)에서 오는 출처. 포트는 무엇이든 된다. */
const LOCAL_ORIGIN = /^(?:http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|https:\/\/localhost(?::\d+)?|capacitor:\/\/localhost)$/

/**
 * 이 요청의 출처(Origin)를 받아도 되는지 본다.
 * Origin 머리말이 없으면(같은 주소에서 연 화면, 상태 확인) 그대로 받는다. 실제 사이트의 POST만 handle()이 따로 막는다.
 * 받는 출처: 사이트 자신(요청과 같은 호스트), localhost·127.0.0.1, 앱 웹뷰, 환경변수 ALLOWED_ORIGINS(쉼표로 구분).
 * @param {Request} request
 * @returns {{ allowed: boolean, origin: string | null }} origin은 답에 그대로 돌려줄 출처(없으면 null)
 */
export function checkOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return { allowed: true, origin: null }
  if (LOCAL_ORIGIN.test(origin)) return { allowed: true, origin }
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  if (extra.includes(origin)) return { allowed: true, origin }
  /** @type {string} */
  let originHost
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return { allowed: false, origin: null }
  }
  if (!originHost) return { allowed: false, origin: null }
  // 사이트 자신: 요청 주소의 호스트, Host 머리말, 프록시가 알려 준 호스트, Vercel이 알려 주는 배포 주소
  /** @type {(string | null | undefined)[]} */
  const own = [
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
  try {
    own.push(new URL(request.url).host)
  } catch {
    // 주소를 못 읽으면 머리말만으로 본다.
  }
  const same = own.some((host) => typeof host === 'string' && host.trim().toLowerCase() === originHost)
  return same ? { allowed: true, origin } : { allowed: false, origin: null }
}

/**
 * 출처 검사를 거친 뒤에 답을 만든다. 허용하지 않는 출처면 403이고 출처 허용 줄을 붙이지 않는다.
 * 허용된 출처는 별표 대신 그 출처를 그대로 돌려준다. 출처가 없는 요청에는 붙이지 않는다.
 * @param {Request} request
 * @param {() => Promise<Response> | Response} respond
 * @returns {Promise<Response>}
 */
export async function guardOrigin(request, respond) {
  const { allowed, origin } = checkOrigin(request)
  if (!allowed) return forbiddenOrigin()
  const response = await respond()
  if (origin) response.headers.set('Access-Control-Allow-Origin', origin)
  return response
}

/** @returns {Response} 받지 않는 출처에 주는 답(403). 출처 허용 줄은 붙이지 않는다. */
function forbiddenOrigin() {
  return errorJson(403, 'forbidden_origin', '이 주소에서는 부를 수 없어요.')
}

/** 글만 오는 요청의 크기 한도 */
export const TEXT_BODY_LIMIT = 512 * 1024
/** 사진이 오는 요청의 크기 한도 (Vercel 한도 4.5MB보다 조금 넉넉하게 받아 사진 크기 안내를 직접 한다) */
export const IMAGE_BODY_LIMIT = 5 * 1024 * 1024
/** 풀어낸 사진의 크기 한도 (약 3.3MB) */
export const IMAGE_DECODED_LIMIT = Math.floor(3.3 * 1024 * 1024)

/** 입력이 틀렸을 때 던지는 오류. handle()이 { error: { code, message } }로 바꿔 준다. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message 사용자에게 보여 줄 한국어 문장
   */
  constructor(status, code, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/** @returns {Response} OPTIONS 미리 묻기에 대한 답 (204 + CORS). 출처 허용 줄은 guardOrigin()이 붙인다. */
export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * @param {unknown} data
 * @param {number} [status]
 * @returns {Response} CORS가 붙은 JSON 답
 */
export function json(data, status = 200) {
  return Response.json(data, { status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
}

/**
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @returns {Response}
 */
export function errorJson(status, code, message) {
  return json({ error: { code, message } }, status)
}

/**
 * 요청 본문을 JSON 객체로 읽는다. 너무 크거나, 깨졌거나, 객체가 아니면 400 오류를 던진다.
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJson(request, maxBytes) {
  const tooLarge = new HttpError(400, 'too_large', '보낸 자료가 너무 커요. 사진이라면 크기를 줄여서 다시 보내 주세요.')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge
  /** @type {ArrayBuffer} */
  let buffer
  try {
    buffer = await request.arrayBuffer()
  } catch {
    throw new HttpError(400, 'invalid_body', '보낸 자료를 읽지 못했어요.')
  }
  if (buffer.byteLength > maxBytes) throw tooLarge
  /** @type {unknown} */
  let parsed
  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw new HttpError(400, 'invalid_json', '보낸 자료의 형식이 올바르지 않아요.')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_json', '보낸 자료의 형식이 올바르지 않아요.')
  }
  return /** @type {Record<string, unknown>} */ (parsed)
}

/**
 * 사진 값을 읽는다. data URL 또는 맨 Base64(png·jpeg·webp)만 받고, 풀어낸 크기가 한도를 넘으면 400.
 * @param {unknown} value
 * @returns {{ mediaType: 'image/png' | 'image/jpeg' | 'image/webp', data: string }}
 */
export function parseImage(value) {
  const invalid = new HttpError(400, 'invalid_image', '사진을 읽지 못했어요. PNG, JPG, WEBP 사진만 쓸 수 있어요.')
  if (typeof value !== 'string' || value.length < 16) throw invalid
  let data = value.trim()
  /** @type {'image/png' | 'image/jpeg' | 'image/webp' | null} */
  let mediaType = null
  const header = /^data:(image\/(?:png|jpeg|jpg|webp));base64,/i.exec(data)
  if (header) {
    const declared = header[1].toLowerCase()
    mediaType = declared === 'image/png' ? 'image/png' : declared === 'image/webp' ? 'image/webp' : 'image/jpeg'
    data = data.slice(header[0].length)
  } else if (data.startsWith('data:')) {
    throw invalid
  } else if (data.startsWith('iVBOR')) {
    mediaType = 'image/png'
  } else if (data.startsWith('/9j/')) {
    mediaType = 'image/jpeg'
  } else if (data.startsWith('UklGR')) {
    mediaType = 'image/webp'
  }
  if (!mediaType) throw invalid
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  const decodedBytes = Math.floor((data.length * 3) / 4) - padding
  if (decodedBytes > IMAGE_DECODED_LIMIT) {
    throw new HttpError(400, 'image_too_large', '사진이 너무 커요. 사진 크기를 줄여서 다시 보내 주세요.')
  }
  // 길이를 먼저 본 뒤에 글자를 검사한다(큰 자료에 정규식을 돌리지 않으려고).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw invalid
  return { mediaType, data }
}

/**
 * POST 주소의 공통 틀. 허용하지 않는 출처 → 403, OPTIONS → 204, POST가 아니면 405, 입력 오류 → 400, 그 밖의 오류 → 500.
 * 실제 사이트(Vercel production)에서는 Origin 머리말이 없는 POST도 403이다.
 * AI 실패는 fn 안에서 기본 답(200)으로 바꾼다.
 * @param {(body: Record<string, unknown>, request: Request) => Promise<unknown> | unknown} fn
 * @param {{ maxBytes?: number }} [options]
 * @returns {{ fetch: (request: Request) => Promise<Response> }}
 */
export function handle(fn, options = {}) {
  const maxBytes = options.maxBytes ?? TEXT_BODY_LIMIT
  return {
    fetch(request) {
      return guardOrigin(request, async () => {
        if (request.method === 'OPTIONS') return preflight()
        if (request.method !== 'POST') return errorJson(405, 'method_not_allowed', 'POST로만 부를 수 있어요.')
        // 실제 사이트에서는 Origin 머리말이 없는 POST를 남의 출처처럼 막는다(브라우저는 POST에 Origin을 꼭 붙인다).
        // 머리말은 지어 보낼 수 있어서 가벼운 스크립트만 막힌다. 작정한 호출까지 막는 진짜 한도는 server/ai.js의 하루 한도다.
        if (process.env.VERCEL_ENV === 'production' && !request.headers.get('origin')) return forbiddenOrigin()
        try {
          const body = await readJson(request, maxBytes)
          return json(await fn(body, request))
        } catch (error) {
          if (error instanceof HttpError) return errorJson(error.status, error.code, error.message)
          console.error('[api] 처리 중 오류:', error instanceof Error ? error.name : 'unknown')
          return errorJson(500, 'server_error', '서버에서 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.')
        }
      })
    },
  }
}

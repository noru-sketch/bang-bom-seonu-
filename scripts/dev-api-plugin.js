// 내 PC에서 /api/* 를 Vercel과 같은 방식으로 돌려 주는 Vite 플러그인.
// `npm run dev`와 `npm run serve`(내 PC를 서버로 쓸 때) 둘 다에서 api/*.js 를 그대로 부른다.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

const MAX_BODY_BYTES = 4.5 * 1024 * 1024 // Vercel의 요청 크기 한도와 같게 맞춘다

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Buffer | null>} 한도를 넘으면 null
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    req.on('data', (/** @type {Buffer} */ chunk) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    req.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * @param {string} root 프로젝트 폴더
 * @param {boolean} fresh true면 고친 파일을 바로 다시 읽는다(개발 중)
 * @returns {import('vite').Connect.NextHandleFunction}
 */
function createMiddleware(root, fresh) {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const match = /^\/api\/([a-z0-9-]+)\/?$/.exec(url.pathname)
    if (!match) return next()
    const file = path.join(root, 'api', `${match[1]}.js`)
    if (!existsSync(file)) return next()
    try {
      const moduleUrl = pathToFileURL(file).href + (fresh ? `?t=${Date.now()}` : '')
      const handler = (await import(moduleUrl)).default
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
      const body = hasBody ? await readBody(req) : undefined
      if (body === null) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: { code: 'too_large', message: '보낸 자료가 너무 커요.' } }))
        return
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(name, value)
      }
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
        method: req.method,
        headers,
        body: body && body.length > 0 ? new Uint8Array(body) : undefined,
      })
      /** @type {Response} */
      const response = await handler.fetch(request)
      res.statusCode = response.status
      response.headers.forEach((value, name) => res.setHeader(name, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      console.error('[api]', error)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: { code: 'server_error', message: '서버에서 문제가 생겼어요.' } }))
    }
  }
}

/**
 * 서버 전용 환경변수(.env, .env.local)를 process.env에 올린다. VITE_ 값은 Vite가 따로 다룬다.
 * @param {string} mode
 * @param {string} root
 */
function loadServerEnv(mode, root) {
  for (const [name, value] of Object.entries(loadEnv(mode, root, ''))) {
    if (!name.startsWith('VITE_') && process.env[name] === undefined) process.env[name] = value
  }
}

/**
 * 서버가 내 PC 밖(같은 와이파이의 다른 기기)에서도 열리는 설정인지.
 * Vite의 host 값은 --host 만 주면 true, 주소를 주면 그 글자, 안 주면 비어 있다(내 PC에서만 열림).
 * @param {string | boolean | undefined} host
 */
export function isOpenToNetwork(host) {
  if (typeof host !== 'string') return host === true
  const name = host.trim().toLowerCase()
  return !(name === 'localhost' || name === '::1' || name === '[::1]' || /^127(\.\d{1,3}){3}$/.test(name))
}

/**
 * AI 열쇠가 든 서버 환경변수를 읽어도 되는지.
 * 와이파이에 열린 서버가 열쇠를 읽으면 같은 와이파이의 누구나 내 열쇠로 AI를 쓸 수 있어서, SERVE_AI=1 을 줄 때만 읽는다.
 * @param {string | boolean | undefined} host
 * @param {Record<string, string | undefined>} [env]
 */
export function shouldLoadServerEnv(host, env = process.env) {
  return !isOpenToNetwork(host) || env.SERVE_AI === '1'
}

/**
 * 읽어도 될 때만 서버 환경변수를 올리고, 읽지 않았으면 까닭을 한 줄로 알린다.
 * @param {string | boolean | undefined} host
 * @param {string} mode
 * @param {string} root
 */
function loadServerEnvIfSafe(host, mode, root) {
  if (shouldLoadServerEnv(host)) {
    loadServerEnv(mode, root)
    return
  }
  // 터미널에 이미 들어 있던 열쇠도 이 서버에서는 쓰지 않는다 (파일을 안 읽는 것만으로는 막히지 않아서)
  delete process.env.ANTHROPIC_API_KEY
  console.log('같은 와이파이에 열려 있어서 AI 열쇠를 읽지 않았어요. AI까지 쓰려면 SERVE_AI=1 을 주고 다시 켜세요 (방법은 docs/SECURITY.md).')
}

/** @returns {import('vite').Plugin} */
export function devApi() {
  return {
    name: 'bangkkumi-dev-api',
    configureServer(server) {
      loadServerEnvIfSafe(server.config.server.host, server.config.mode, server.config.root)
      // 개발 서버에서도 첫 화면(/)이 방봄(public/index.html)으로 열리게 한다. 빌드한 사이트는 원래 그렇게 열린다.
      server.middlewares.use((request, _response, next) => {
        if (request.url === '/' || request.url?.startsWith('/?')) request.url = `/index.html${request.url.slice(1)}`
        next()
      })
      server.middlewares.use(createMiddleware(server.config.root, true))
    },
    configurePreviewServer(server) {
      loadServerEnvIfSafe(server.config.preview.host, server.config.mode, server.config.root)
      server.middlewares.use(createMiddleware(server.config.root, false))
    },
  }
}

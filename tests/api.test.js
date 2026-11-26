// 서버 함수(api/*.js) 테스트. 네트워크를 쓰지 않는다: AI는 가짜 클라이언트를 끼워서 확인한다.
/** @import { AiClient } from '../server/ai.js' */
import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import adviceHandler from '../api/advice.js'
import furnitureHandler from '../api/furniture.js'
import styleHandler from '../api/style.js'
import floorplanHandler from '../api/floorplan.js'
import homeplanHandler, { HOMEPLAN_FALLBACK_NOTE, HOMEPLAN_NOTE } from '../api/homeplan.js'
import renderPhotoHandler from '../api/render-photo.js'
import healthHandler from '../api/health.js'
import { AI_RATE_LIMIT, AI_TIMEOUT_MS, AiError, askJson, resetAiRateLimit, setAiClient, withDeadline } from '../server/ai.js'
import { IMAGE_DECODED_LIMIT } from '../server/http.js'
import { NOTICES } from '../src/data/labels.js'
import { DEFAULT_STYLE, createExampleProject } from '../src/data/exampleProject.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const FAKE_KEY = 'sk-ant-test-0000-절대-나가면-안-되는-값'
const SCORE_WORDS = /점수|등급|만점|\d+\s*점/

const ROOM = createExampleProject().rooms[0]
const VALIDATION = {
  errors: [{ code: 'OVERLAP', severity: 'error', furnitureIds: ['a', 'b'], title: '가구가 겹쳐요', message: '책상과 침대가 12cm 겹쳐요.' }],
  tips: [],
  strengths: ['책상이 창가에 있어요'],
  matZone: null,
}

/** 주소마다: 처리 함수와 올바른 요청 본문 */
const ENDPOINTS = [
  { path: '/api/advice', handler: adviceHandler, body: { room: ROOM, validationResult: VALIDATION, lifestyle: 'single' } },
  { path: '/api/furniture', handler: furnitureHandler, body: { text: '슈퍼싱글 침대, 1200 책상' } },
  { path: '/api/style', handler: styleHandler, body: { text: '따뜻한 우드 미드센추리' } },
  { path: '/api/floorplan', handler: floorplanHandler, body: { imageBase64: PNG, areaPyeong: 6 } },
  { path: '/api/homeplan', handler: homeplanHandler, body: { imageBase64: PNG } },
  { path: '/api/render-photo', handler: renderPhotoHandler, body: { snapshotBase64: PNG, styleName: '웜 미니멀', timeOfDay: 'noon' } },
]

/**
 * 테스트에서는 답의 모양을 직접 확인하므로 json()을 느슨한 타입으로 읽는다.
 * @typedef {Omit<Response, 'json'> & { json(): Promise<any> }} LooseResponse
 */

/**
 * @param {{ fetch: (request: Request) => Promise<Response> }} handler
 * @param {Request} request
 * @returns {Promise<LooseResponse>}
 */
function send(handler, request) {
  return handler.fetch(request)
}

/**
 * @param {{ fetch: (request: Request) => Promise<Response> }} handler
 * @param {string} path
 * @param {unknown} body
 */
function post(handler, path, body) {
  return send(
    handler,
    new Request(`http://test.local${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

/**
 * 정해 둔 답을 돌려주는 가짜 AI. 받은 요청을 calls에 모아 둔다.
 * @param {unknown} answer 문자열이면 그대로, 아니면 JSON으로 바꿔 글 블록에 담는다
 * @param {{ stopReason?: string, fail?: Error }} [options]
 */
function fakeAi(answer, options = {}) {
  /** @type {{ params: Record<string, unknown>, options: unknown }[]} */
  const calls = []
  const client = {
    beta: {
      messages: {
        /**
         * @param {Record<string, unknown>} params
         * @param {unknown} requestOptions
         */
        async create(params, requestOptions) {
          calls.push({ params, options: requestOptions })
          if (options.fail) throw options.fail
          return {
            stop_reason: options.stopReason ?? 'end_turn',
            content: [
              { type: 'thinking', thinking: '' },
              { type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) },
            ],
          }
        },
      },
    },
  }
  return { client: /** @type {AiClient} */ (/** @type {unknown} */ (client)), calls }
}

/** @type {string | undefined} */
let savedKey
const realFetch = globalThis.fetch

beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  setAiClient(null)
  resetAiRateLimit()
  delete process.env.ALLOWED_ORIGINS
  // 어떤 테스트에서도 진짜 네트워크를 쓰면 안 된다.
  globalThis.fetch = () => {
    throw new Error('테스트에서 fetch를 부르면 안 돼요')
  }
})

afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = savedKey
  setAiClient(null)
  globalThis.fetch = realFetch
})

for (const { path, handler, body } of ENDPOINTS) {
  test(`${path}: OPTIONS는 204와 CORS 머리말을 돌려줘요`, async () => {
    const response = await handler.fetch(new Request(`http://test.local${path}`, { method: 'OPTIONS' }))
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    assert.equal(response.headers.get('vary'), 'Origin')
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS')
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type')
  })

  test(`${path}: GET은 405예요`, async () => {
    const response = await send(handler, new Request(`http://test.local${path}`))
    assert.equal(response.status, 405)
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
    const data = await response.json()
    assert.equal(data.error.code, 'method_not_allowed')
    assert.equal(typeof data.error.message, 'string')
  })

  test(`${path}: 깨진 JSON과 틀린 입력은 400이에요`, async () => {
    for (const bad of ['{"text": ', '[1,2]', '"글자"', '{}']) {
      const response = await post(handler, path, bad)
      assert.equal(response.status, 400, bad)
      assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
      const data = await response.json()
      assert.equal(typeof data.error.code, 'string')
      assert.match(data.error.message, /[가-힣]/)
    }
  })

  test(`${path}: 열쇠가 없으면 200과 기본 답(isFallback: true)을 돌려줘요`, async () => {
    const response = await post(handler, path, body)
    assert.equal(response.status, 200)
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*')
    const data = await response.json()
    assert.equal(data.isFallback, true)
    assert.doesNotMatch(JSON.stringify(data), /"score"|"grade"/)
  })
}

test('/api/advice: 기본 답은 판정 결과 그대로이고 점수가 없어요', async () => {
  const data = await (await post(adviceHandler, '/api/advice', ENDPOINTS[0].body)).json()
  assert.deepEqual(Object.keys(data).sort(), ['highlights', 'improvements', 'isFallback', 'summary'])
  assert.match(data.summary, /문제가 1개/)
  assert.deepEqual(data.highlights, ['책상이 창가에 있어요'])
  assert.deepEqual(data.improvements, ['가구가 겹쳐요: 책상과 침대가 12cm 겹쳐요.'])
  assert.doesNotMatch(JSON.stringify(data), SCORE_WORDS)
})

test('/api/advice: 가짜 AI의 좋은 답은 다듬어서 isFallback: false로 내보내요', async () => {
  const { client, calls } = fakeAi({
    summary: '책상과 침대가 겹쳐 있어서 먼저 떼어 놓아야 해요.',
    highlights: ['책상이 창가에 있어서 낮에 밝아요.', '이 배치는 80점이에요.'],
    improvements: ['책상을 12cm 이상 옮겨 침대와 겹치지 않게 해 보세요.'],
    score: 80,
  })
  setAiClient(client)
  const response = await post(adviceHandler, '/api/advice', ENDPOINTS[0].body)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.isFallback, false)
  assert.deepEqual(Object.keys(data).sort(), ['highlights', 'improvements', 'isFallback', 'summary'])
  assert.deepEqual(data.highlights, ['책상이 창가에 있어서 낮에 밝아요.'])
  assert.equal(data.improvements.length, 1)
  assert.doesNotMatch(JSON.stringify(data), SCORE_WORDS)

  // 요청 모양: 모델, 구조화 출력, 낮은 effort, 거절 대비, 12초 제한, 재시도 없음
  assert.equal(calls.length, 1)
  const { params, options } = calls[0]
  assert.equal(params.model, 'claude-opus-5-5')
  assert.equal('thinking' in params, false)
  const outputConfig = /** @type {{ effort: string, format: { type: string, schema: { additionalProperties: boolean } } }} */ (params.output_config)
  assert.equal(outputConfig.effort, 'low')
  assert.equal(outputConfig.format.type, 'json_schema')
  assert.equal(outputConfig.format.schema.additionalProperties, false)
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01'])
  assert.equal(params.fallbacks, 'default')
  assert.deepEqual(options, { timeout: 12000, maxRetries: 0 })
  assert.match(String(params.system), /점수/)
  const prompt = JSON.stringify(params.messages)
  assert.match(prompt, /책상과 침대가 12cm 겹쳐요/)
  assert.doesNotMatch(prompt, /xCm|yCm/)
})

test('/api/advice: 문제가 없다는 판정이면 AI가 지어낸 고칠 점을 내보내지 않아요', async () => {
  setAiClient(fakeAi({ summary: '지금 배치는 무난해요.', highlights: ['깔끔해요.'], improvements: ['침대를 옮겨 보세요.'] }).client)
  const body = { room: ROOM, validationResult: { errors: [], tips: [], strengths: [], matZone: null }, lifestyle: 'single' }
  const data = await (await post(adviceHandler, '/api/advice', body)).json()
  assert.equal(data.isFallback, false)
  assert.deepEqual(data.improvements, [])
})

test('/api/furniture: 기본 답은 스키마 모양과 고지 문구를 지켜요', async () => {
  const data = await (await post(furnitureHandler, '/api/furniture', ENDPOINTS[1].body)).json()
  assert.deepEqual(Object.keys(data).sort(), ['isFallback', 'items', 'note'])
  assert.equal(data.note, NOTICES.fallback)
  assert.deepEqual(data.items.map((/** @type {{ category: string }} */ item) => item.category), ['bed', 'desk'])
  assert.equal(data.items[1].widthCm, 120)
  assert.deepEqual(data.items[1].price, { estimatedKrw: 90000, manualKrw: null, source: 'estimated' })
})

test('/api/furniture: 가짜 AI의 좋은 답은 범위 안으로 다듬어요', async () => {
  const { client, calls } = fakeAi({
    items: [
      { name: '원목 책상', category: 'desk', widthCm: 140, depthCm: 70, heightCm: 72, color: '#c9a77c', material: 'wood', estimatedKrw: 150000, xCm: 5 },
      { name: '거대 소파', category: 'sofa', widthCm: 99999, depthCm: 1, heightCm: 80, color: '갈색', material: 'leather', estimatedKrw: -1 },
    ],
  })
  setAiClient(client)
  const data = await (await post(furnitureHandler, '/api/furniture', { text: '원목 책상이랑 소파', imageBase64: PNG })).json()
  assert.equal(data.isFallback, false)
  assert.equal(data.note, NOTICES.aiEstimate)
  assert.deepEqual(data.items[0], {
    category: 'desk', name: '원목 책상', widthCm: 140, depthCm: 70, heightCm: 72, color: '#C9A77C', material: 'wood',
    price: { estimatedKrw: 150000, manualKrw: null, source: 'estimated' },
  })
  assert.equal(data.items[1].widthCm, 1000)
  assert.equal(data.items[1].depthCm, 20)
  assert.equal(data.items[1].price.estimatedKrw, 0)
  assert.equal('color' in data.items[1], false)
  assert.equal('material' in data.items[1], false)
  // 사진은 비전 블록(base64)으로 전달된다
  const content = /** @type {{ content: { type: string, source?: { type: string, media_type: string } }[] }[]} */ (calls[0].params.messages)[0].content
  assert.equal(content[0].type, 'image')
  assert.deepEqual({ type: content[0].source?.type, media: content[0].source?.media_type }, { type: 'base64', media: 'image/png' })
})

test('/api/furniture: 링크를 보내도 서버는 fetch를 부르지 않아요', async () => {
  let fetchCalls = 0
  globalThis.fetch = () => {
    fetchCalls += 1
    throw new Error('서버가 링크를 열면 안 돼요')
  }
  const url = 'https://shop.example/goods/옷장-800?id=1'
  // 열쇠가 없을 때
  const plain = await (await post(furnitureHandler, '/api/furniture', { url })).json()
  assert.equal(plain.isFallback, true)
  assert.equal(plain.items[0].category, 'wardrobe')
  // AI가 있을 때: 링크는 글자로만 프롬프트에 들어간다
  const { client, calls } = fakeAi({
    items: [{ name: '800 옷장', category: 'wardrobe', widthCm: 80, depthCm: 60, heightCm: 200, color: '#F2EFE9', material: 'white_matte', estimatedKrw: 150000 }],
  })
  setAiClient(client)
  const withAi = await (await post(furnitureHandler, '/api/furniture', { url })).json()
  assert.equal(withAi.isFallback, false)
  assert.match(JSON.stringify(calls[0].params.messages), /shop\.example/)
  assert.equal('tools' in calls[0].params, false)
  assert.equal(fetchCalls, 0)
})

test('/api/style: 기본 답은 가장 가까운 프리셋이고, AI 답은 색을 검사해요', async () => {
  const fallback = await (await post(styleHandler, '/api/style', ENDPOINTS[2].body)).json()
  assert.deepEqual(Object.keys(fallback).sort(), ['isFallback', 'note', 'style'])
  assert.equal(fallback.style.id, 'midcentury_walnut')
  assert.equal(fallback.note, NOTICES.fallback)
  assert.deepEqual(Object.keys(fallback.style).sort(), Object.keys(DEFAULT_STYLE).sort())

  setAiClient(fakeAi({ name: '포근한 우드', wallColor: '#f5efe6', floorColor: '#B98F64', floorMaterial: 'walnut_wood', accentColor: '#8C5A3C', description: '따뜻한 나무 조합' }).client)
  const good = await (await post(styleHandler, '/api/style', ENDPOINTS[2].body)).json()
  assert.equal(good.isFallback, false)
  // 색 조합에는 치수·가격 문구가 아니라 스타일 문구를 단다
  assert.equal(good.note, /** @type {Record<string, string | undefined>} */ (NOTICES).aiStyle ?? 'AI가 제안한 색이에요. 직접 고칠 수 있어요')
  assert.doesNotMatch(good.note, /치수|가격/)
  assert.deepEqual(good.style, {
    id: 'custom_ai', name: '포근한 우드', wallColor: '#F5EFE6', floorColor: '#B98F64', floorMaterial: 'walnut_wood', accentColor: '#8C5A3C', description: '따뜻한 나무 조합',
  })

  setAiClient(fakeAi({ name: '이상한 색', wallColor: 'beige', floorColor: '#B98F64', floorMaterial: 'walnut_wood', accentColor: '#8C5A3C', description: '' }).client)
  const bad = await (await post(styleHandler, '/api/style', ENDPOINTS[2].body)).json()
  assert.equal(bad.isFallback, true)
  assert.equal(bad.style.id, 'midcentury_walnut')
})

test('/api/floorplan: 기본 답은 평수 어림값이고, AI 답은 방 크기에 맞게 다듬어요', async () => {
  const fallback = await (await post(floorplanHandler, '/api/floorplan', ENDPOINTS[3].body)).json()
  assert.deepEqual(Object.keys(fallback).sort(), ['depthCm', 'isFallback', 'note', 'openings', 'widthCm'])
  assert.equal(fallback.widthCm, 390)
  assert.equal(fallback.depthCm, 510)
  // 사진을 읽지 못한 답은 사진을 읽은 답과 다른 안내를 달고, AI 문구가 없다
  assert.notEqual(fallback.note, NOTICES.floorplan)
  assert.doesNotMatch(fallback.note, /AI/)
  assert.match(fallback.note, /읽지 못해/)
  assert.equal(fallback.openings.length, 2)

  const { client, calls } = fakeAi({ widthCm: 320, depthCm: 450, openings: [{ type: 'door', wall: 'left', offsetCm: 9000, widthCm: 90 }] })
  setAiClient(client)
  const good = await (await post(floorplanHandler, '/api/floorplan', ENDPOINTS[3].body)).json()
  assert.equal(good.isFallback, false)
  assert.equal(good.note, NOTICES.floorplan)
  assert.equal(good.widthCm, 320)
  assert.deepEqual(good.openings, [{ id: 'op_door_1', type: 'door', wall: 'left', offsetCm: 360, widthCm: 90, sillHeightCm: 0, swingInward: true }])
  assert.match(JSON.stringify(calls[0].params.messages), /"type":"image"/)

  // 평면도가 아니라는 답(0)은 기본 답으로 바꾼다
  setAiClient(fakeAi({ widthCm: 0, depthCm: 0, openings: [] }).client)
  const unreadable = await (await post(floorplanHandler, '/api/floorplan', { imageBase64: PNG })).json()
  assert.equal(unreadable.isFallback, true)
  assert.equal(unreadable.widthCm, 300)
  assert.equal(unreadable.depthCm, 400)
})

test('/api/render-photo: AI가 있어도 항상 받은 그림을 그대로 돌려줘요', async () => {
  const { client, calls } = fakeAi({ imageUrlOrBase64: 'https://example.com/x.png' })
  setAiClient(client)
  const data = await (await post(renderPhotoHandler, '/api/render-photo', ENDPOINTS[5].body)).json()
  assert.equal(data.imageUrlOrBase64, PNG)
  assert.equal(data.isFallback, true)
  // AI가 만든 그림이 아니므로 "AI 연출 이미지"라고 하지 않는다
  assert.notEqual(data.disclaimer, NOTICES.aiImageDisclaimer)
  assert.match(data.disclaimer, /AI 연출 아님/)
  assert.deepEqual(Object.keys(data).sort(), ['disclaimer', 'imageUrlOrBase64', 'isFallback'])
  assert.equal(calls.length, 0)
  const wrongTime = await post(renderPhotoHandler, '/api/render-photo', { snapshotBase64: PNG, styleName: 'a', timeOfDay: 'midnight' })
  assert.equal(wrongTime.status, 400)
})

test('AI가 쓰레기 값을 주거나, 거절하거나, 오류를 내면 200과 기본 답으로 바꿔요', async () => {
  const failures = [
    fakeAi('죄송하지만 JSON이 아니에요'),
    fakeAi({ 엉뚱한: '모양' }),
    fakeAi([1, 2, 3]),
    fakeAi({ summary: '좋아요' }, { stopReason: 'refusal' }),
    fakeAi('{"summary": "잘린', { stopReason: 'max_tokens' }),
    fakeAi(null, { fail: new Error('연결이 끊겼어요') }),
  ]
  for (const { client, calls } of failures) {
    setAiClient(client)
    for (const { path, handler, body } of ENDPOINTS.slice(0, 4)) {
      const response = await post(handler, path, body)
      assert.equal(response.status, 200, path)
      const data = await response.json()
      assert.equal(data.isFallback, true, path)
    }
    assert.equal(calls.length, 4)
  }
})

test('askJson: 멈춘 까닭을 내용보다 먼저 확인하고, 열쇠가 없으면 부르지 않아요', async () => {
  const input = { system: '시험', text: '시험', schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }
  await assert.rejects(askJson(input), (error) => error instanceof AiError && error.code === 'no_key')
  // 거절이면 내용이 올바른 JSON이어도 쓰지 않는다
  setAiClient(fakeAi({ ok: true }, { stopReason: 'refusal' }).client)
  await assert.rejects(askJson(input), (error) => error instanceof AiError && error.code === 'refusal')
  setAiClient(fakeAi({ ok: true }, { stopReason: 'max_tokens' }).client)
  await assert.rejects(askJson(input), (error) => error instanceof AiError && error.code === 'max_tokens')
  setAiClient(fakeAi('   ').client)
  await assert.rejects(askJson(input), (error) => error instanceof AiError && error.code === 'empty')
  setAiClient(fakeAi({ ok: true }).client)
  assert.deepEqual(await askJson(input), { ok: true })
})

test('사진: 너무 큰 사진은 줄여 달라는 400이고, 사진이 아닌 값도 400이에요', async () => {
  const big = `data:image/jpeg;base64,/9j/${'A'.repeat(Math.ceil(((IMAGE_DECODED_LIMIT + 20000) * 4) / 3))}`
  const cases = [
    { handler: floorplanHandler, path: '/api/floorplan', body: { imageBase64: big } },
    { handler: furnitureHandler, path: '/api/furniture', body: { imageBase64: big } },
    { handler: renderPhotoHandler, path: '/api/render-photo', body: { snapshotBase64: big, styleName: 'a', timeOfDay: 'noon' } },
  ]
  for (const { handler, path, body } of cases) {
    const response = await post(handler, path, body)
    assert.equal(response.status, 400, path)
    const data = await response.json()
    assert.equal(data.error.code, 'image_too_large', path)
    assert.match(data.error.message, /줄여/)
  }
  // 한도를 훌쩍 넘는 본문도 400이다
  const huge = await post(floorplanHandler, '/api/floorplan', { imageBase64: 'A'.repeat(6 * 1024 * 1024) })
  assert.equal(huge.status, 400)
  assert.equal((await huge.json()).error.code, 'too_large')
  for (const imageBase64 of ['그림이 아니에요 그림이 아니에요', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'data:text/html;base64,PGI+PC9iPjxiPjwvYj4=']) {
    const response = await post(floorplanHandler, '/api/floorplan', { imageBase64 })
    assert.equal(response.status, 400, imageBase64)
    assert.equal((await response.json()).error.code, 'invalid_image')
  }
  // 맨 Base64(머리말 없음)도 받는다
  const bare = await post(floorplanHandler, '/api/floorplan', { imageBase64: PNG.slice(PNG.indexOf(',') + 1) })
  assert.equal(bare.status, 200)
})

test('/api/health: 상태만 알려 주고 열쇠 값은 어디에도 내보내지 않아요', async () => {
  const without = await healthHandler.fetch(new Request('http://test.local/api/health'))
  assert.equal(without.status, 200)
  assert.deepEqual(await without.json(), { status: 'ok', aiConfigured: false })

  process.env.ANTHROPIC_API_KEY = FAKE_KEY
  const withKey = await healthHandler.fetch(new Request('http://test.local/api/health'))
  const text = await withKey.text()
  assert.deepEqual(JSON.parse(text), { status: 'ok', aiConfigured: true })
  assert.equal(text.includes(FAKE_KEY), false)
  withKey.headers.forEach((value) => assert.equal(value.includes(FAKE_KEY), false))

  const wrongMethod = await healthHandler.fetch(new Request('http://test.local/api/health', { method: 'POST', body: '{}' }))
  assert.equal(wrongMethod.status, 405)
  const options = await healthHandler.fetch(new Request('http://test.local/api/health', { method: 'OPTIONS' }))
  assert.equal(options.status, 204)
})

/**
 * @param {{ fetch: (request: Request) => Promise<Response> }} handler
 * @param {string} url
 * @param {unknown} body
 * @param {Record<string, string>} headers
 * @returns {Promise<LooseResponse>}
 */
function postFrom(handler, url, body, headers) {
  return handler.fetch(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }))
}

test('출처 검사: 사이트 자신·내 PC·앱·허용 목록만 받고, 그 출처를 그대로 돌려줘요', async () => {
  const style = ENDPOINTS[2]
  const allowed = [
    ['https://bangkkumi.example/api/style', 'https://bangkkumi.example'],
    ['https://bangkkumi.example/api/style', 'http://localhost:5173'],
    ['https://bangkkumi.example/api/style', 'http://127.0.0.1:4173'],
    ['https://bangkkumi.example/api/style', 'https://localhost'],
    ['https://bangkkumi.example/api/style', 'capacitor://localhost'],
    ['http://192.168.0.7:5173/api/style', 'http://192.168.0.7:5173'],
  ]
  for (const [url, origin] of allowed) {
    const response = await postFrom(style.handler, url, style.body, { Origin: origin })
    assert.equal(response.status, 200, origin)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('vary'), 'Origin')
    const options = await style.handler.fetch(new Request(url, { method: 'OPTIONS', headers: { Origin: origin } }))
    assert.equal(options.status, 204, origin)
    assert.equal(options.headers.get('access-control-allow-origin'), origin)
  }
  // 프록시 뒤에서는 Host 머리말이나 x-forwarded-host로도 사이트 자신을 알아본다
  const proxied = await postFrom(style.handler, 'http://internal.local/api/style', style.body, { Origin: 'https://bangkkumi.example', 'x-forwarded-host': 'bangkkumi.example' })
  assert.equal(proxied.status, 200)

  const blocked = ['https://evil.example', 'https://bangkkumi.example.evil.example', 'http://localhost.evil.example', 'https://localhost.evil.example:8080', 'null', 'capacitor://evil']
  for (const origin of blocked) {
    for (const method of ['POST', 'OPTIONS']) {
      const response = await style.handler.fetch(
        new Request('https://bangkkumi.example/api/style', {
          method,
          headers: { 'Content-Type': 'text/plain', Origin: origin },
          body: method === 'POST' ? JSON.stringify(style.body) : undefined,
        }),
      )
      assert.equal(response.status, 403, `${method} ${origin}`)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    }
  }
  const health = await send(healthHandler, new Request('https://bangkkumi.example/api/health', { headers: { Origin: 'https://evil.example' } }))
  assert.equal(health.status, 403)
  assert.equal((await health.json()).error.code, 'forbidden_origin')

  // 환경변수 ALLOWED_ORIGINS에 적은 출처는 받는다
  process.env.ALLOWED_ORIGINS = 'https://partner.example, https://other.example/'
  const listed = await postFrom(style.handler, 'https://bangkkumi.example/api/style', style.body, { Origin: 'https://other.example' })
  assert.equal(listed.status, 200)
  assert.equal(listed.headers.get('access-control-allow-origin'), 'https://other.example')
  delete process.env.ALLOWED_ORIGINS
})

test('막힌 출처에서는 AI를 한 번도 부르지 않아요', async () => {
  const { client, calls } = fakeAi({ summary: '좋아요', highlights: [], improvements: [] })
  setAiClient(client)
  const response = await postFrom(adviceHandler, 'https://bangkkumi.example/api/advice', ENDPOINTS[0].body, { Origin: 'https://evil.example' })
  assert.equal(response.status, 403)
  assert.equal(calls.length, 0)
})

test('횟수 제한: 한 주소가 AI를 너무 많이 부르면 오류 대신 기본 답을 줘요', async () => {
  const { client, calls } = fakeAi({ name: '포근한 우드', wallColor: '#F5EFE6', floorColor: '#B98F64', floorMaterial: 'walnut_wood', accentColor: '#8C5A3C', description: '따뜻한 나무 조합' })
  setAiClient(client)
  const style = ENDPOINTS[2]
  for (let i = 0; i < AI_RATE_LIMIT; i += 1) {
    const data = await (await postFrom(style.handler, 'https://bangkkumi.example/api/style', style.body, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })).json()
    assert.equal(data.isFallback, false, String(i))
  }
  const over = await postFrom(style.handler, 'https://bangkkumi.example/api/style', style.body, { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' })
  assert.equal(over.status, 200)
  const overData = await over.json()
  assert.equal(overData.isFallback, true)
  assert.equal(overData.style.id, 'midcentury_walnut')
  assert.equal(calls.length, AI_RATE_LIMIT)
  // 다른 주소는 그대로 AI 답을 받는다
  const other = await (await postFrom(style.handler, 'https://bangkkumi.example/api/style', style.body, { 'x-forwarded-for': '198.51.100.4' })).json()
  assert.equal(other.isFallback, false)
  // 틀린 입력(400)은 횟수에 들어가지 않는다
  resetAiRateLimit()
  for (let i = 0; i < AI_RATE_LIMIT + 5; i += 1) await postFrom(style.handler, 'https://bangkkumi.example/api/style', {}, { 'x-forwarded-for': '203.0.113.9' })
  const afterBad = await (await postFrom(style.handler, 'https://bangkkumi.example/api/style', style.body, { 'x-forwarded-for': '203.0.113.9' })).json()
  assert.equal(afterBad.isFallback, false)
})

test('제한 시간: 서버는 브라우저의 15초보다 먼저(12초) 끊고, 늦는 답은 timeout으로 바꿔요', async () => {
  assert.equal(AI_TIMEOUT_MS, 12000)
  await assert.rejects(withDeadline(new Promise(() => {}), 20), (error) => error instanceof AiError && error.code === 'timeout')
  assert.equal(await withDeadline(Promise.resolve('ok'), 20), 'ok')
})

test('AI 실패 기록에는 까닭 코드만 남고 열쇠와 프롬프트는 남지 않아요', async () => {
  /** @type {string[]} */
  const lines = []
  const realWarn = console.warn
  console.warn = (...args) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY
    setAiClient(fakeAi(null, { fail: new Error(`연결 실패 ${FAKE_KEY}`) }).client)
    await post(styleHandler, '/api/style', { text: '비밀스러운 분위기 글' })
    setAiClient(fakeAi({ summary: '좋아요' }, { stopReason: 'refusal' }).client)
    await post(styleHandler, '/api/style', { text: '비밀스러운 분위기 글' })
  } finally {
    console.warn = realWarn
  }
  assert.equal(lines.length, 2)
  assert.match(lines[0], /unknown$/)
  assert.match(lines[1], /refusal$/)
  for (const line of lines) {
    assert.equal(line.includes(FAKE_KEY), false)
    assert.equal(line.includes('비밀스러운'), false)
  }
})

test('/api/homeplan: AI가 없으면 표준 구조를 쓰라는 기본 답, AI 답은 코드가 검사한 집 구조예요', async () => {
  const fallback = await (await post(homeplanHandler, '/api/homeplan', { imageBase64: PNG })).json()
  assert.deepEqual(fallback, { layout: null, note: HOMEPLAN_FALLBACK_NOTE, isFallback: true })

  const { client, calls } = fakeAi({ widthCm: 840, depthCm: 740, entrySide: 'E', rooms: [
    { type: 'living', xCm: 290, yCm: 300, widthCm: 300, depthCm: 440 },
    { type: 'bed', xCm: 0, yCm: 300, widthCm: 290, depthCm: 440 },
    { type: 'garage', xCm: 0, yCm: 0, widthCm: 200, depthCm: 200 },
  ] })
  setAiClient(client)
  const good = await (await post(homeplanHandler, '/api/homeplan', { imageBase64: PNG })).json()
  assert.equal(good.isFallback, false)
  assert.equal(good.note, HOMEPLAN_NOTE)
  assert.equal(good.layout.W, 8.4)
  assert.deepEqual(good.layout.rooms.map((/** @type {{ id: string }} */ r) => r.id), ['liv', 'r1'])
  assert.match(JSON.stringify(calls[0].params.messages), /"type":"image"/)

  setAiClient(fakeAi({ widthCm: 800, depthCm: 600, entrySide: 'N', rooms: [] }).client)
  const empty = await (await post(homeplanHandler, '/api/homeplan', { imageBase64: PNG })).json()
  assert.equal(empty.isFallback, true)
  assert.equal(empty.layout, null)
})

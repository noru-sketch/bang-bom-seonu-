// POST /api/consult (방봄 24시간 상담) 테스트. 네트워크를 쓰지 않는다: AI는 가짜 클라이언트를 끼워서 확인한다.
/** @import { AiClient } from '../server/ai.js' */
import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import consultHandler, { cleanReply, hasNewNumber } from '../api/consult.js'
import { resetAiRateLimit, setAiClient } from '../server/ai.js'
import { NOTICES } from '../src/data/labels.js'

const DRAFT = '시중은행 전세대출: 확인 필요. 시중은행 대출은 은행 심사로 결정돼요'
const FACTS = '[규칙 판정 결과]\n- 시중은행 전세대출: 확인 필요 · 이유: 시중은행 대출은 은행 심사로 결정돼요 · 최종 결정: 각 은행'
const QUESTION = '확인 필요라고 뜨면 계약하면 안 되는 건가요?'

/**
 * @param {unknown} body
 * @returns {Promise<{ status: number, data: any }>}
 */
async function post(body) {
  const response = await consultHandler.fetch(
    new Request('http://test.local/api/consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, data: await response.json() }
}

/**
 * 정해 둔 답을 돌려주는 가짜 AI. 받은 요청을 calls에 모아 둔다.
 * @param {unknown} answer
 */
function fakeAi(answer) {
  /** @type {Record<string, unknown>[]} */
  const calls = []
  const client = {
    beta: {
      messages: {
        /** @param {Record<string, unknown>} params */
        async create(params) {
          calls.push(params)
          return {
            stop_reason: 'end_turn',
            content: [
              { type: 'thinking', thinking: '' },
              { type: 'text', text: JSON.stringify(answer) },
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

test('상담: 열쇠가 없으면 AI를 부르지 않고 규칙이 만든 답을 그대로 돌려줘요', async () => {
  const { status, data } = await post({ question: QUESTION, draft: DRAFT, facts: FACTS })
  assert.equal(status, 200)
  assert.equal(data.isFallback, true)
  assert.equal(data.answer, DRAFT)
  assert.equal(data.note, NOTICES.fallback)
})

test('상담: AI 답에서 주소를 지우고, 단정 표현이 든 문장은 안전한 문장으로 바꿔요', async () => {
  const fake = fakeAi({ reply: '대출이 가능합니다. 자세한 내용은 https://example.com/apply 에서 보세요.\n\n먼저 할 일: **은행**에 문의해 보세요.' })
  setAiClient(fake.client)
  const { status, data } = await post({ question: QUESTION, draft: DRAFT, facts: FACTS })
  assert.equal(status, 200)
  assert.equal(data.isFallback, false)
  assert.doesNotMatch(data.answer, /https?:|example\.com|가능합니다|\*/)
  assert.match(data.answer, /최종 결정은 각 기관이 해요/)
  assert.match(data.answer, /먼저 할 일: 은행에 문의해 보세요\./)
  // AI에게는 질문, 규칙 판정, 규칙이 만든 답이 함께 간다
  assert.equal(fake.calls.length, 1)
  const sent = JSON.stringify(fake.calls[0])
  assert.match(sent, /방봄 안내 도우미/)
  assert.ok(sent.includes(QUESTION))
  assert.ok(sent.includes('규칙이 만든 기본 답'))
})

test('상담: "불가능합니다", "미확정이에요", "최종 승인돼요" 같은 말은 건드리지 않아요', () => {
  for (const text of ['중복 신청은 불가능합니다.', '아직 미확정이에요.', '은행에서 최종 승인돼요.']) {
    assert.equal(cleanReply(text), text)
  }
  assert.equal(cleanReply('이 조건이면 승인돼요.'), '최종 결정은 각 기관이 해요.')
})

test('상담: 문장은 문장부호에서만 나누고, "가능해요"는 대출·지원 이야기일 때만 바꿔요', () => {
  // "확인 필요 " 뒤에서 잘라 앞뒤가 다른 문장이 붙으면 안 된다: 단정 표현이 든 문장은 통째로 바꾼다
  assert.equal(cleanReply('시중은행 전세대출은 확인 필요 상태라서 은행 심사 뒤에 승인이 나요.'), '최종 결정은 각 기관이 해요.')
  assert.equal(cleanReply('이 조건이면 대출이 가능해요. 먼저 은행에 물어보세요.'), '최종 결정은 각 기관이 해요. 먼저 은행에 물어보세요.')
  // 판정과 상관없는 "가능해요"는 그대로 둔다
  for (const text of ['확인 필요 항목은 은행 사전 상담에서 확인이 가능해요.', '신청은 복지로에서 온라인으로 가능해요.']) {
    assert.equal(cleanReply(text), text)
  }
})

test('상담: 주민번호 모양이 있으면 AI로 보내지 않아요', async () => {
  const fake = fakeAi({ reply: '보내면 안 되는 답' })
  setAiClient(fake.client)
  const { data } = await post({ question: '제 주민번호는 900101-1234567 인데 대출 돼요?', draft: DRAFT, facts: FACTS })
  assert.equal(fake.calls.length, 0)
  assert.equal(data.isFallback, true)
  assert.equal(data.answer, DRAFT)
})

test('상담: AI가 빈 답이나 틀린 모양을 주면 규칙이 만든 답으로 바꿔요', async () => {
  for (const answer of [{ reply: '   ' }, { text: '모양이 달라요' }]) {
    setAiClient(fakeAi(answer).client)
    const { data } = await post({ question: QUESTION, draft: DRAFT, facts: FACTS })
    assert.equal(data.isFallback, true)
    assert.equal(data.answer, DRAFT)
  }
})

test('상담: AI가 자료에 없는 숫자를 말하면 그 답을 쓰지 않고 규칙이 만든 답을 돌려줘요', async () => {
  const draft = '관리비 15.0만 + 대출이자 29.2만(1억 4,000만 원 × 2.5% ÷ 12) = 월 44.2만 원'
  // 자료에 있는 숫자만 쓴 답은 그대로 쓴다 (쉼표가 달라도 같은 숫자로 본다)
  setAiClient(fakeAi({ reply: '월 부담은 44.2만 원이에요.\n\n관리비 15.0만 원에 대출이자 29.2만 원을 더했어요. 대출은 1억 4000만 원 기준이에요.' }).client)
  const kept = await post({ question: '월 부담은 어떻게 계산했어요?', draft, facts: FACTS })
  assert.equal(kept.data.isFallback, false)
  assert.match(kept.data.answer, /44\.2만 원/)
  // "15.0"을 "15"로 쓰거나 "24시간 상담"을 말하는 것은 새 숫자가 아니다
  assert.equal(hasNewNumber('관리비 15만 원이에요. 24시간 상담에서 다시 물어보셔도 돼요.', draft), false)
  assert.equal(hasNewNumber('약 44만 원이에요.', draft), true)
  // 자료에 없는 금액이나 기준을 지어내면 규칙 답으로 돌아간다
  for (const reply of ['월 부담은 45.7만 원이에요.', '만 19~34세면 받을 수 있어요.', '약 44만 원이에요.']) {
    setAiClient(fakeAi({ reply }).client)
    const { data } = await post({ question: '월 부담은 어떻게 계산했어요?', draft, facts: FACTS })
    assert.equal(data.isFallback, true, reply)
    assert.equal(data.answer, draft)
  }
})

test('상담: 질문이 없거나 500자를 넘으면 400이에요', async () => {
  for (const body of [{}, { question: '   ' }, { question: '가'.repeat(501) }]) {
    const { status, data } = await post(body)
    assert.equal(status, 400)
    assert.match(data.error.message, /[가-힣]/)
  }
})

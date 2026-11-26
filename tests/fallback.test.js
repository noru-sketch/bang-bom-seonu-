// 규칙 기반 기본 답(fallback.js), 다듬기(sanitize.js), 기본 자료(catalog.js·styles.js) 단위 테스트.
/** @import { ValidationResult } from '../src/types/schema.ts' */
import test from 'node:test'
import assert from 'node:assert/strict'

import { CATALOG, findCatalogItem } from '../src/data/catalog.js'
import { STYLE_PRESETS } from '../src/data/styles.js'
import { DEFAULT_STYLE, createExampleProject } from '../src/data/exampleProject.js'
import { NOTICES } from '../src/data/labels.js'
import {
  fallbackAdvice,
  fallbackFloorplan,
  fallbackFurniture,
  fallbackRenderPhoto,
  fallbackStyle,
} from '../src/engine/fallback.js'
import {
  FURNITURE_CATEGORIES,
  sanitizeAdvice,
  sanitizeFloorplan,
  sanitizeFurnitureItems,
  sanitizeImageRef,
  sanitizeStyle,
} from '../src/engine/sanitize.js'

const SCORE_WORDS = /점수|등급|만점|\d+\s*점/

/** @type {ValidationResult} */
const VALIDATION = {
  errors: [
    { code: 'OVERLAP', severity: 'error', furnitureIds: ['a', 'b'], title: '가구가 겹쳐요', message: '책상과 침대가 12cm 겹쳐요.' },
  ],
  tips: [
    {
      code: 'DEAD_SPACE_GAP', severity: 'tip', category: 'interior', furnitureIds: ['a', 'c'],
      title: '어정쩡한 틈이 있어요', message: '책상과 책장 사이에 28cm 틈이 있어요.', isReferenceValue: true,
    },
  ],
  strengths: ['책상이 창가에 있어요'],
  matZone: null,
}

test('카탈로그: 18개 안팎이고 key가 겹치지 않으며 값이 스키마 범위 안이에요', () => {
  assert.ok(CATALOG.length >= 16 && CATALOG.length <= 24)
  assert.equal(new Set(CATALOG.map((item) => item.key)).size, CATALOG.length)
  for (const item of CATALOG) {
    assert.ok(FURNITURE_CATEGORIES.includes(item.category), item.key)
    assert.ok(item.widthCm >= 20 && item.widthCm <= 300, item.key)
    assert.ok(item.depthCm >= 20 && item.depthCm <= 300, item.key)
    assert.match(item.color, /^#[0-9A-F]{6}$/, item.key)
    assert.ok(Number.isInteger(item.estimatedKrw) && item.estimatedKrw >= 0, item.key)
    assert.ok(item.keywords.length > 0, item.key)
    if (item.category === 'wardrobe' || item.category === 'drawer') assert.equal(item.clearanceFrontCm, 50, item.key)
    if (item.category === 'desk' || item.category === 'table') assert.equal(item.clearanceFrontCm, 60, item.key)
  }
})

test('카탈로그: findCatalogItem은 key로 찾고 없으면 undefined예요', () => {
  assert.equal(findCatalogItem('desk_1200')?.widthCm, 120)
  assert.equal(findCatalogItem('cat_tower')?.category, 'other')
  assert.equal(findCatalogItem('없는_가구'), undefined)
})

test('스타일: 프리셋은 5~6개이고 첫 번째가 기본 스타일과 같아요', () => {
  assert.ok(STYLE_PRESETS.length >= 5 && STYLE_PRESETS.length <= 6)
  assert.deepEqual(STYLE_PRESETS[0], DEFAULT_STYLE)
  assert.equal(new Set(STYLE_PRESETS.map((style) => style.id)).size, STYLE_PRESETS.length)
  for (const style of STYLE_PRESETS) assert.deepEqual(sanitizeStyle(style), style)
})

test('해설 기본 답: 판정 결과의 개수·제목·문장만 쓰고 점수가 없어요', () => {
  const room = createExampleProject().rooms[0]
  const answer = fallbackAdvice({ room, validationResult: VALIDATION, lifestyle: 'single' })
  assert.equal(answer.isFallback, true)
  assert.deepEqual(Object.keys(answer).sort(), ['highlights', 'improvements', 'isFallback', 'summary'])
  assert.match(answer.summary, /문제가 1개/)
  assert.match(answer.summary, /제안이 1개/)
  assert.deepEqual(answer.highlights, ['책상이 창가에 있어요'])
  assert.deepEqual(answer.improvements, ['가구가 겹쳐요: 책상과 침대가 12cm 겹쳐요.', '어정쩡한 틈이 있어요: 책상과 책장 사이에 28cm 틈이 있어요.'])
  assert.doesNotMatch(JSON.stringify(answer), SCORE_WORDS)
  assert.deepEqual(fallbackAdvice({ room, validationResult: VALIDATION, lifestyle: 'single' }), answer)
})

test('해설 기본 답: 문제가 없으면 고칠 점이 비어 있고, 문제만 있으면 칭찬하지 않아요', () => {
  const room = createExampleProject().rooms[0]
  const clean = fallbackAdvice({ room, validationResult: { errors: [], tips: [], strengths: [], matZone: null }, lifestyle: 'couple' })
  assert.deepEqual(clean.improvements, [])
  assert.equal(clean.highlights.length, 1)
  assert.match(clean.summary, /확실한 문제도/)
  const onlyErrors = fallbackAdvice({ room, validationResult: { ...VALIDATION, tips: [], strengths: [] }, lifestyle: 'single' })
  assert.deepEqual(onlyErrors.highlights, [])
  assert.equal(onlyErrors.improvements.length, 1)
})

test('가구 기본 답: 쉼표로 나눈 글을 카탈로그 낱말로 읽어요', () => {
  const answer = fallbackFurniture({ text: '슈퍼싱글 침대, 1200 책상\n의자 2개' })
  assert.equal(answer.isFallback, true)
  assert.equal(answer.note, NOTICES.fallback)
  assert.deepEqual(answer.items.map((item) => item.category), ['bed', 'desk', 'chair', 'chair'])
  assert.equal(answer.items[0].widthCm, 110)
  assert.equal(answer.items[1].widthCm, 120)
  assert.equal(answer.items[1].clearanceFrontCm, 60)
  assert.deepEqual(answer.items[1].price, { estimatedKrw: 90000, manualKrw: null, source: 'estimated' })
  for (const item of answer.items) {
    assert.equal('xCm' in item, false)
    assert.equal('id' in item, false)
  }
})

test('가구 기본 답: 직접 적은 숫자("1400 책상", "120x60", "80cm")를 치수로 써요', () => {
  const answer = fallbackFurniture({ text: '1400 책상, 식탁 120x60, 책장 60cm, 2인 소파' })
  assert.equal(answer.items[0].widthCm, 140)
  assert.equal(answer.items[0].depthCm, 70)
  assert.equal(answer.items[1].category, 'table')
  assert.equal(answer.items[1].widthCm, 120)
  assert.equal(answer.items[1].depthCm, 60)
  assert.equal(answer.items[2].widthCm, 60)
  assert.equal(answer.items[3].category, 'sofa')
  assert.equal(answer.items[3].widthCm, 150)
})

test('가구 기본 답: 모르는 가구는 기타로 두고, 빈 글은 빈 목록이에요', () => {
  const unknown = fallbackFurniture({ text: '안마기' })
  assert.equal(unknown.items.length, 1)
  assert.equal(unknown.items[0].category, 'other')
  assert.equal(unknown.items[0].name, '안마기')
  assert.deepEqual(fallbackFurniture({ text: '  ' }).items, [])
  assert.deepEqual(fallbackFurniture({}).items, [])
  assert.ok(fallbackFurniture({ text: Array(40).fill('의자').join(',') }).items.length <= 12)
})

test('가구 기본 답: 링크는 열지 않고 글자 안의 낱말만 찾아요', () => {
  const original = globalThis.fetch
  globalThis.fetch = () => {
    throw new Error('기본 답은 네트워크를 쓰면 안 돼요')
  }
  try {
    const answer = fallbackFurniture({ url: 'https://shop.example/search?q=%EC%98%B7%EC%9E%A5-800' })
    assert.equal(answer.items.length, 1)
    assert.equal(answer.items[0].category, 'wardrobe')
    assert.deepEqual(fallbackFurniture({ url: 'https://shop.example/p/12345' }).items, [])
    assert.deepEqual(fallbackFurniture({ url: '%E0%A4%A' }).items, [])
  } finally {
    globalThis.fetch = original
  }
})

test('스타일 기본 답: 낱말이 가장 많이 맞는 프리셋을 고르고, 없으면 기본 프리셋이에요', () => {
  const walnut = fallbackStyle({ text: '따뜻한 우드 미드센추리 월넛' })
  assert.equal(walnut.style.id, 'midcentury_walnut')
  assert.equal(walnut.isFallback, true)
  assert.equal(walnut.note, NOTICES.fallback)
  assert.equal(fallbackStyle({ text: '회색 타일로 시크하게' }).style.id, 'calm_gray')
  assert.deepEqual(fallbackStyle({ text: 'ㅁㄴㅇㄹ' }).style, DEFAULT_STYLE)
  assert.notEqual(fallbackStyle({ text: '' }).style, STYLE_PRESETS[0])
})

test('평면도 기본 답: 평수로 3:4 직사각형을 10cm 단위로 어림해요', () => {
  const six = fallbackFloorplan({ areaPyeong: 6 })
  assert.equal(six.widthCm, 390)
  assert.equal(six.depthCm, 510)
  assert.equal(six.note, NOTICES.floorplan)
  assert.equal(six.isFallback, true)
  assert.deepEqual(six.openings.map((opening) => opening.type), ['door', 'window'])
  for (const opening of six.openings) assert.ok(opening.offsetCm + opening.widthCm <= six.widthCm)
})

test('평면도 기본 답: 평수가 없거나 이상하면 300 x 400이에요', () => {
  for (const areaPyeong of [undefined, 0, -3, Number.NaN]) {
    const answer = fallbackFloorplan({ areaPyeong })
    assert.equal(answer.widthCm, 300)
    assert.equal(answer.depthCm, 400)
    assert.equal(answer.openings.length, 2)
  }
})

test('연출 이미지 기본 답: 받은 그림을 그대로 돌려주고 고지 문구를 붙여요', () => {
  const answer = fallbackRenderPhoto({ snapshotBase64: 'data:image/png;base64,iVBORw0KGgo=' })
  assert.deepEqual(answer, {
    imageUrlOrBase64: 'data:image/png;base64,iVBORw0KGgo=',
    disclaimer: NOTICES.aiImageDisclaimer,
    isFallback: true,
  })
})

test('다듬기(해설): 길이와 개수를 자르고, 점수 표현이 든 줄은 버려요', () => {
  const clean = sanitizeAdvice({
    summary: `  ${'가'.repeat(600)}  `,
    highlights: ['창가 책상이 좋아요', '이 배치는 85점이에요', 7, '', '창가 책상이 좋아요'],
    improvements: Array.from({ length: 20 }, (_, index) => `고칠 점 ${index}번`),
    score: 90,
  })
  assert.ok(clean)
  assert.equal(clean.summary.length, 400)
  assert.deepEqual(clean.highlights, ['창가 책상이 좋아요'])
  assert.equal(clean.improvements.length, 6)
  assert.equal('score' in clean, false)
  assert.equal(sanitizeAdvice({ summary: '종합 점수는 90점이에요', highlights: [], improvements: [] }), null)
  assert.equal(sanitizeAdvice({ summary: '' }), null)
  assert.equal(sanitizeAdvice('글자'), null)
  assert.equal(sanitizeAdvice(null), null)
  assert.ok(sanitizeAdvice({ summary: '좋은 점이 많고 점검할 곳은 적어요' }))
})

test('다듬기(가구): 분류·치수·가격·색을 범위 안으로 고치고 좌표는 버려요', () => {
  const items = sanitizeFurnitureItems([
    {
      id: 'x', name: '큰 책상', category: 'desk', widthCm: 5000, depthCm: 3, heightCm: '72',
      color: '#abcdef', material: 'gold', estimatedKrw: -500, xCm: 10, yCm: 20, rotation: 90, score: 3,
    },
    { name: '이상한 것', category: 'spaceship', price: { estimatedKrw: 12345.6, manualKrw: 1, source: 'manual' }, color: 'red' },
    { widthCm: 100 },
    null,
    '의자',
  ])
  assert.ok(items)
  assert.equal(items.length, 2)
  assert.deepEqual(items[0], {
    category: 'desk', name: '큰 책상', widthCm: 1000, depthCm: 20, heightCm: 72, color: '#ABCDEF',
    price: { estimatedKrw: 0, manualKrw: null, source: 'estimated' },
  })
  assert.equal(items[1].category, 'other')
  assert.deepEqual(items[1].price, { estimatedKrw: 12346, manualKrw: null, source: 'estimated' })
  assert.equal('color' in items[1], false)
})

test('다듬기(가구): 배열이 아니면 null, 너무 많으면 12개까지만이에요', () => {
  assert.equal(sanitizeFurnitureItems('침대'), null)
  assert.equal(sanitizeFurnitureItems({ list: [] }), null)
  assert.deepEqual(sanitizeFurnitureItems([]), [])
  assert.equal(sanitizeFurnitureItems({ items: [{ name: '침대', category: 'bed' }] })?.length, 1)
  assert.equal(sanitizeFurnitureItems(Array.from({ length: 50 }, () => ({ name: '의자', category: 'chair' })))?.length, 12)
})

test('다듬기(스타일): 색이 #RRGGBB가 아니면 null이고 바닥 재질은 정해진 값만 써요', () => {
  const clean = sanitizeStyle({
    id: 'my style!<script>', name: '가'.repeat(100), wallColor: '#ffffff', floorColor: '#C8AD86',
    floorMaterial: 'marble', accentColor: '#5B7C99', description: 7,
  })
  assert.ok(clean)
  assert.equal(clean.id, 'mystylescript')
  assert.equal(clean.name.length, 30)
  assert.equal(clean.wallColor, '#FFFFFF')
  assert.equal(clean.floorMaterial, 'oak_wood')
  assert.equal(clean.description, '')
  assert.equal(sanitizeStyle({ wallColor: 'white', floorColor: '#C8AD86', accentColor: '#5B7C99' }), null)
  assert.equal(sanitizeStyle({ wallColor: '#FFF', floorColor: '#C8AD86', accentColor: '#5B7C99' }), null)
  assert.equal(sanitizeStyle([]), null)
})

test('다듬기(평면도): 방 크기를 범위 안으로 맞추고 문·창문을 벽 안으로 넣어요', () => {
  const clean = sanitizeFloorplan({
    widthCm: 300.4, depthCm: 99999,
    openings: [
      { type: 'door', wall: 'bottom', offsetCm: 280, widthCm: 90 },
      { type: 'window', wall: 'top', offsetCm: -50, widthCm: 5000, sillHeightCm: 100 },
      { type: 'hole', wall: 'top', offsetCm: 0, widthCm: 50 },
      { type: 'door', wall: 'ceiling', offsetCm: 0, widthCm: 90 },
    ],
  })
  assert.ok(clean)
  assert.equal(clean.widthCm, 300)
  assert.equal(clean.depthCm, 2000)
  assert.equal(clean.openings.length, 2)
  assert.deepEqual(clean.openings[0], {
    id: 'op_door_1', type: 'door', wall: 'bottom', offsetCm: 210, widthCm: 90, sillHeightCm: 0, swingInward: true,
  })
  assert.deepEqual(clean.openings[1], {
    id: 'op_win_2', type: 'window', wall: 'top', offsetCm: 0, widthCm: 300, sillHeightCm: 100, swingInward: false,
  })
  assert.equal(sanitizeFloorplan({ widthCm: '넓음', depthCm: 400 }), null)
  assert.equal(sanitizeFloorplan(undefined), null)
  assert.deepEqual(sanitizeFloorplan({ widthCm: 300, depthCm: 400 })?.openings, [])
})

test('다듬기(그림): data URL, https 주소, 맨 Base64만 받아요', () => {
  assert.equal(sanitizeImageRef({ imageUrlOrBase64: 'data:image/png;base64,iVBORw0KGgo=' }), 'data:image/png;base64,iVBORw0KGgo=')
  assert.equal(sanitizeImageRef('https://example.com/a.png'), 'https://example.com/a.png')
  assert.equal(sanitizeImageRef('iVBORw0KGgo='), 'iVBORw0KGgo=')
  assert.equal(sanitizeImageRef('javascript:alert(1)'), null)
  assert.equal(sanitizeImageRef('data:text/html;base64,PGI+'), null)
  assert.equal(sanitizeImageRef({ imageUrlOrBase64: 5 }), null)
})

// ── 검토에서 나온 문제 다시 생기지 않게 하기 ──
import { NOTICES as REVIEW_NOTICES, THEMES as REVIEW_THEMES } from '../src/data/labels.js'
import * as reviewSanitize from '../src/engine/sanitize.js'
import * as reviewFallback from '../src/engine/fallback.js'

test('해설 다듬기: 점수·순위·별점·퍼센트·좌표 글은 빼고 보통 문장은 남겨요', () => {
  const clean = reviewSanitize.sanitizeAdvice({
    summary: '이 배치는 상위 10% 수준이고 별 4개, A급이에요. 순위로는 2위예요. 침대 옆 통로가 넉넉해요.',
    highlights: ['완성도 90%', '배치 완성도 8/10', '★★★★☆', '평점 4.5', '책상 앞에 60cm가 비어 있어요', '예상 비용은 120,000원이에요', '3점 세트 소파가 잘 어울려요'],
    improvements: ['침대를 x=120, y=40 으로 옮기세요', '옷장을 벽 쪽으로 30cm 옮겨 보세요'],
  })
  assert.ok(clean)
  assert.equal(clean.summary, '침대 옆 통로가 넉넉해요.')
  assert.deepEqual(clean.highlights, ['책상 앞에 60cm가 비어 있어요', '예상 비용은 120,000원이에요', '3점 세트 소파가 잘 어울려요'])
  assert.deepEqual(clean.improvements, ['옷장을 벽 쪽으로 30cm 옮겨 보세요'])
  assert.equal(reviewSanitize.sanitizeAdvice({ summary: '완성도 85%' }), null)
  assert.equal(reviewSanitize.sanitizeAdvice({ summary: '상위 10퍼센트 랭크 S' }), null)
  const style = reviewSanitize.sanitizeStyle({ name: '100점 스타일', description: '이 조합은 95점', wallColor: '#FFFFFF', floorColor: '#C8AD86', accentColor: '#5B7C99' })
  assert.ok(style)
  assert.equal(style.name, '맞춤 스타일')
  assert.equal(style.description, '')
})

test('글자 다듬기: 이모지 가운데에서 잘라도 반쪽 글자가 남지 않아요', () => {
  const name = reviewSanitize.cleanText('가'.repeat(39) + '\u{1F600}', 40)
  assert.equal(name, '가'.repeat(39))
})

test('글로 가구 추가: 한 조각에 가구가 여러 개 있어도 읽어요', () => {
  const names = (/** @type {string} */ text) => reviewFallback.fallbackFurniture({ text }).items.map((item) => item.category)
  assert.deepEqual(names('침대랑 책상'), ['bed', 'desk'])
  assert.deepEqual(names('책상과 의자'), ['desk', 'chair'])
  assert.deepEqual(names('침대/책상/의자'), ['bed', 'desk', 'chair'])
  assert.deepEqual(names('침대 및 옷장'), ['bed', 'wardrobe'])
  const desks = reviewFallback.fallbackFurniture({ text: '1400 책상 2개' }).items
  assert.equal(desks.length, 2)
  assert.equal(desks[0].widthCm, 140)
  assert.equal(reviewFallback.fallbackFurniture({ text: '의자 12개' }).items.length, 4)
  assert.equal(reviewFallback.fallbackFurniture({ text: '퀸사이즈 침대' }).items[0].widthCm, 150)
})

test('문구: 배치안 설명은 "~요"로 끝나고 AI 색 안내 문구가 있어요', () => {
  for (const theme of REVIEW_THEMES) assert.match(theme.summary, /요\.$/)
  assert.equal(REVIEW_NOTICES.aiStyle, 'AI가 제안한 색이에요. 직접 고칠 수 있어요')
})

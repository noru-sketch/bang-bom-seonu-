// 배치 검사기(validateRoom) 테스트. 규칙마다 걸리는 경우와 안 걸리는 경우를 하나씩 본다.

/** @import { FurnitureItem, FurnitureCategory, Opening, Room, ValidationResult } from '../src/types/schema.ts' */

import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRoom, REFERENCE } from '../src/engine/validator.js'
import { createExampleProject, createRoom } from '../src/data/exampleProject.js'

let serial = 0

/**
 * 테스트용 가구. 사용 공간(clearanceFrontCm)은 따로 주지 않으면 0이다.
 * @param {FurnitureCategory} category
 * @param {Partial<FurnitureItem>} [overrides]
 * @returns {FurnitureItem}
 */
function item(category, overrides = {}) {
  serial += 1
  return {
    id: `f${serial}`,
    name: category,
    category,
    widthCm: 80,
    depthCm: 40,
    heightCm: 80,
    xCm: 0,
    yCm: 0,
    rotation: 0,
    color: '#CCCCCC',
    material: 'wood',
    owned: false,
    clearanceFrontCm: 0,
    hasSharpCorner: false,
    price: { estimatedKrw: 0, manualKrw: null, source: 'estimated' },
    locked: false,
    ...overrides,
  }
}

/**
 * 문·창문이 없는 방(필요한 것만 넣는다).
 * @param {FurnitureItem[]} furniture
 * @param {{ widthCm?: number, depthCm?: number, openings?: Opening[] }} [overrides]
 * @returns {Room}
 */
function room(furniture, overrides = {}) {
  const base = createRoom({ widthCm: overrides.widthCm ?? 400, depthCm: overrides.depthCm ?? 400 })
  return { ...base, openings: overrides.openings ?? [], furniture }
}

/** @param {Partial<Opening>} [overrides] @returns {Opening} */
function door(overrides = {}) {
  return { id: 'door', type: 'door', wall: 'bottom', offsetCm: 150, widthCm: 90, sillHeightCm: 0, swingInward: false, ...overrides }
}

/** @param {Partial<Opening>} [overrides] @returns {Opening} */
function win(overrides = {}) {
  return { id: 'win', type: 'window', wall: 'top', offsetCm: 100, widthCm: 100, sillHeightCm: 90, swingInward: false, ...overrides }
}

/** @param {ValidationResult} result */
function codes(result) {
  return [...result.errors.map((e) => e.code), ...result.tips.map((t) => t.code)]
}

/** @param {ValidationResult} result @param {string} code */
function find(result, code) {
  const found = [...result.errors, ...result.tips].find((i) => i.code === code)
  assert.ok(found, `${code} 항목이 있어야 해요`)
  return found
}

test('결과 객체에는 errors, tips, strengths, matZone 네 가지만 있어요', () => {
  const result = validateRoom(room([item('bed')]))
  assert.deepEqual(Object.keys(result).sort(), ['errors', 'matZone', 'strengths', 'tips'])
  assert.equal(result.matZone, null)
  assert.equal(REFERENCE.passageCm, 60)
  assert.equal(REFERENCE.deadSpaceMinCm, 5)
  assert.equal(REFERENCE.deadSpaceMaxCm, 50)
})

test('결과 어디에도 점수·등급 같은 필드나 글자가 없어요', () => {
  const result = validateRoom(createExampleProject().rooms[0], { lifestyle: 'family_child' })
  const text = JSON.stringify(result)
  assert.doesNotMatch(text, /score|grade|point|점수|등급/i)
  assert.doesNotMatch(text, /\d+\s*점/)
})

test('겹침: 1cm 이상 겹치면 OVERLAP이고 잰 길이를 알려 줘요', () => {
  const a = item('drawer', { name: '서랍장' })
  const b = item('bookshelf', { name: '책장', xCm: 70, yCm: 30 })
  const result = validateRoom(room([a, b]))
  const error = find(result, 'OVERLAP')
  assert.equal(error.severity, 'error')
  assert.deepEqual(error.furnitureIds, [a.id, b.id])
  assert.match(error.title, /서랍장과 책장이 겹쳐요/)
  assert.match(error.message, /가로 10cm, 세로 10cm/)
})

test('겹침: 맞닿기만 한 가구는 OVERLAP이 아니에요', () => {
  const result = validateRoom(room([item('drawer'), item('bookshelf', { xCm: 80 })]))
  assert.deepEqual(codes(result), [])
})

test('매트와 의자 예외: 매트 위 가구, 책상 밑 의자는 겹침이 아니에요', () => {
  const mat = item('mat', { widthCm: 200, depthCm: 200, heightCm: 2 })
  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45 })
  const desk = item('desk', { widthCm: 120, depthCm: 60, xCm: 250, yCm: 0, clearanceFrontCm: 60 })
  const chair = item('chair', { widthCm: 50, depthCm: 50, xCm: 285, yCm: 40 })
  const result = validateRoom(room([mat, bed, desk, chair]))
  assert.deepEqual(result.errors, [])
})

test('의자 예외는 책상·테이블에만: 의자와 침대가 겹치면 OVERLAP이에요', () => {
  const bed = item('bed', { widthCm: 100, depthCm: 200 })
  const chair = item('chair', { widthCm: 50, depthCm: 50, xCm: 80, yCm: 50 })
  assert.ok(codes(validateRoom(room([bed, chair]))).includes('OVERLAP'))
})

test('방 밖 이탈: 벽을 넘으면 OUT_OF_BOUNDS, 벽에 딱 붙으면 아무 말도 없어요', () => {
  const out = validateRoom(room([item('drawer', { name: '서랍장', xCm: 335, yCm: 0 })]))
  assert.match(find(out, 'OUT_OF_BOUNDS').message, /15cm/)
  const flush = validateRoom(room([item('drawer', { xCm: 320, yCm: 360 })]))
  assert.deepEqual(codes(flush), [])
})

test('문 막힘: 안으로 열리는 문 자리에 가구가 있으면 DOOR_BLOCKED예요', () => {
  const inward = door({ swingInward: true })
  const blocked = validateRoom(room([item('drawer', { xCm: 160, yCm: 330 })], { openings: [inward] }))
  assert.equal(find(blocked, 'DOOR_BLOCKED').severity, 'error')
})

test('문 막힘 아님: 밖으로 열리는 문, 문 자리의 매트, 문 옆 가구는 괜찮아요', () => {
  const outward = validateRoom(room([item('drawer', { xCm: 160, yCm: 300 })], { openings: [door()] }))
  assert.ok(!codes(outward).includes('DOOR_BLOCKED'))
  const inward = door({ swingInward: true })
  const mat = item('mat', { widthCm: 90, depthCm: 60, heightCm: 1, xCm: 150, yCm: 340 })
  const beside = item('drawer', { xCm: 240, yCm: 360 })
  assert.ok(!codes(validateRoom(room([mat, beside], { openings: [inward] }))).includes('DOOR_BLOCKED'))
})

test('정면 공간 막힘: 옷장 앞 50cm 안에 가구가 있으면 CLEARANCE_BLOCKED이고 참고값이라고 말해요', () => {
  const wardrobe = item('wardrobe', { name: '옷장', depthCm: 60, heightCm: 200, clearanceFrontCm: 50 })
  const drawer = item('drawer', { name: '서랍장', yCm: 90 })
  const result = validateRoom(room([wardrobe, drawer]))
  const error = find(result, 'CLEARANCE_BLOCKED')
  assert.deepEqual(error.furnitureIds, [wardrobe.id, drawer.id])
  assert.match(error.message, /30cm만 비어/)
  assert.match(error.message, /참고값/)
})

// 벽은 문제도 팁도 만들지 않는다. 정면 공간이 방 밖으로 나가도(정면이 벽에 가깝거나 딱 붙어도) 알리지 않는다.
test('정면 공간 막힘 아님: 정면이 벽에 가깝거나 벽에 딱 붙어도 아무 말도 없어요', () => {
  const near = item('wardrobe', { depthCm: 60, yCm: 30, rotation: 180, clearanceFrontCm: 50 })
  assert.deepEqual(codes(validateRoom(room([near]))), [])
  // 발치를 아래 벽에 딱 붙인 수납 침대
  const bed = item('bed', { widthCm: 110, depthCm: 200, heightCm: 45, xCm: 0, yCm: 200, clearanceFrontCm: 50 })
  assert.deepEqual(codes(validateRoom(room([bed], { widthCm: 300, openings: [door({ offsetCm: 200 })] }))), [])
})

test('정면 공간 막힘: 책상·테이블 앞이 아닌 곳의 의자는 옷장 앞을 막아요', () => {
  const wardrobe = item('wardrobe', { name: '옷장', depthCm: 60, heightCm: 200, xCm: 200, clearanceFrontCm: 50 })
  const chair = item('chair', { name: '의자', widthCm: 50, depthCm: 50, xCm: 210, yCm: 70 })
  const error = find(validateRoom(room([wardrobe, chair])), 'CLEARANCE_BLOCKED')
  assert.deepEqual(error.furnitureIds, [wardrobe.id, chair.id])
  assert.match(error.message, /10cm만 비어/)

  // 책상에 앉는 자리에 있는 의자는 옆 옷장의 정면에 걸쳐도 확실한 문제가 아니다
  const desk = item('desk', { widthCm: 120, depthCm: 60, xCm: 0, yCm: 0, clearanceFrontCm: 60 })
  const side = item('wardrobe', { widthCm: 80, depthCm: 60, heightCm: 200, xCm: 120, yCm: 0, clearanceFrontCm: 50 })
  const seat = item('chair', { widthCm: 50, depthCm: 50, xCm: 90, yCm: 65 })
  assert.deepEqual(validateRoom(room([desk, side, seat])).errors, [])
})

test('정면 공간 막힘 아님: 책상 옆 책장·ㄱ자 책상이 정면 한쪽만 가리고 의자 자리(폭 60cm)가 남으면 괜찮아요', () => {
  const desk = item('desk', { name: '책상', widthCm: 120, depthCm: 60, xCm: 180, clearanceFrontCm: 60 })
  const shelf = item('bookshelf', { name: '책장', widthCm: 80, depthCm: 30, heightCm: 180, xCm: 270, yCm: 60, rotation: 270 })
  const opts = { widthCm: 300, depthCm: 400, openings: [door({ offsetCm: 20 })] }
  assert.deepEqual(validateRoom(room([desk, shelf], opts)).errors, [])
  const second = item('desk', { name: '책상2', widthCm: 120, depthCm: 60, xCm: 240, yCm: 60, rotation: 270 })
  assert.deepEqual(validateRoom(room([desk, second], opts)).errors, [])
})

test('정면 공간 막힘: 책상 앞에 남은 폭이 60cm보다 좁으면 남은 폭을 알려 줘요', () => {
  const desk = item('desk', { name: '책상', widthCm: 120, depthCm: 60, xCm: 180, clearanceFrontCm: 60 })
  const box = item('other', { name: '상자', widthCm: 70, depthCm: 40, xCm: 230, yCm: 60 })
  const error = find(validateRoom(room([desk, box], { widthCm: 300 })), 'CLEARANCE_BLOCKED')
  assert.deepEqual(error.furnitureIds, [desk.id, box.id])
  assert.match(error.message, /폭 50cm/)
  assert.doesNotMatch(error.message, /0cm만 비어/)
})

test('창문 막힘: 가구 두 개가 나란히 창 전체를 가려도 WINDOW_BLOCKED 한 건이에요', () => {
  const a = item('wardrobe', { name: '장1', widthCm: 75, depthCm: 40, heightCm: 180, xCm: 100 })
  const b = item('wardrobe', { name: '장2', widthCm: 75, depthCm: 40, heightCm: 180, xCm: 175 })
  const result = validateRoom(room([a, b], { openings: [win({ widthCm: 150 })] }))
  const blocked = result.errors.filter((e) => e.code === 'WINDOW_BLOCKED')
  assert.equal(blocked.length, 1)
  assert.deepEqual(blocked[0].furnitureIds, [a.id, b.id])
  assert.match(blocked[0].title, /장1, 장2/)

  // 사이가 비어 창이 보이면 막힘이 아니다
  const c = item('wardrobe', { widthCm: 60, depthCm: 40, heightCm: 180, xCm: 190 })
  assert.ok(!codes(validateRoom(room([a, c], { openings: [win({ widthCm: 150 })] }))).includes('WINDOW_BLOCKED'))
})

test('정면 공간 막힘 아님: 딱 50cm 떨어진 가구, 책상 앞의 의자와 매트는 괜찮아요', () => {
  const wardrobe = item('wardrobe', { depthCm: 60, clearanceFrontCm: 50 })
  const far = item('drawer', { yCm: 110 })
  assert.deepEqual(validateRoom(room([wardrobe, far])).errors, [])

  const desk = item('desk', { widthCm: 120, depthCm: 60, xCm: 200, clearanceFrontCm: 60 })
  const chair = item('chair', { widthCm: 50, depthCm: 50, xCm: 235, yCm: 62 })
  const mat = item('mat', { widthCm: 150, depthCm: 100, heightCm: 1, xCm: 190, yCm: 50 })
  assert.deepEqual(validateRoom(room([desk, chair, mat])).errors, [])
})

test('창문 막힘: 창턱보다 높은 가구가 창 전체를 가리면 WINDOW_BLOCKED예요', () => {
  const tall = item('wardrobe', { widthCm: 120, depthCm: 60, heightCm: 200, xCm: 90 })
  const result = validateRoom(room([tall], { openings: [win()] }))
  assert.match(find(result, 'WINDOW_BLOCKED').message, /200cm/)
})

test('창문 막힘 아님: 낮은 가구, 창을 일부만 가린 가구, 20cm 넘게 떨어진 가구', () => {
  const low = item('drawer', { widthCm: 120, heightCm: 80, xCm: 90 })
  const partial = item('bookshelf', { widthCm: 80, heightCm: 180, xCm: 100 })
  const away = item('wardrobe', { widthCm: 120, heightCm: 200, xCm: 90, yCm: 25 })
  for (const one of [low, partial, away]) {
    assert.ok(!codes(validateRoom(room([one], { openings: [win()] }))).includes('WINDOW_BLOCKED'))
  }
})

test('접근 불가: 30cm 길도 없이 갇힌 가구는 NO_ACCESS예요', () => {
  const target = item('other', { name: '상자', widthCm: 50, depthCm: 50 })
  const right = item('other', { widthCm: 30, depthCm: 80, xCm: 50 })
  const below = item('other', { widthCm: 50, depthCm: 30, yCm: 50 })
  const result = validateRoom(room([target, right, below], { widthCm: 300, depthCm: 300, openings: [door({ offsetCm: 100 })] }))
  const noAccess = result.errors.filter((e) => e.code === 'NO_ACCESS')
  assert.equal(noAccess.length, 1)
  assert.deepEqual(noAccess[0].furnitureIds, [target.id])
  assert.match(noAccess[0].title, /상자까지 갈 길이 없어요/)
  assert.ok(!codes(result).includes('NARROW_PASSAGE'))
})

test('좁은 통로: 60cm로는 못 가고 45cm 틈으로만 닿으면 NARROW_PASSAGE 팁이에요', () => {
  const target = item('other', { name: '상자', widthCm: 50, depthCm: 50 })
  const wall = item('other', { name: '긴 수납장', widthCm: 255, depthCm: 50, yCm: 100 })
  const result = validateRoom(room([target, wall], { widthCm: 300, depthCm: 300, openings: [door({ offsetCm: 0 })] }))
  assert.deepEqual(result.errors, [])
  const tip = result.tips.find((t) => t.code === 'NARROW_PASSAGE')
  assert.ok(tip)
  assert.equal(tip.isReferenceValue, true)
  assert.deepEqual(tip.furnitureIds, [target.id])
  assert.match(tip.message, /상자\(약 45cm\)/)
  assert.match(tip.message, /60cm는 참고값/)
})

test('통로 문제 없음: 60cm 틈이 있으면 아무 말도 없고, 문이 없으면 검사하지 않아요', () => {
  const target = item('other', { widthCm: 50, depthCm: 50 })
  const wall = item('other', { widthCm: 240, depthCm: 50, yCm: 120 })
  const open = validateRoom(room([target, wall], { widthCm: 300, depthCm: 300, openings: [door({ offsetCm: 0 })] }))
  assert.deepEqual(codes(open), [])

  const closed = item('other', { widthCm: 300, depthCm: 50, yCm: 120 })
  const noDoor = validateRoom(room([item('other', { widthCm: 50, depthCm: 50 }), closed], { widthCm: 300, depthCm: 300 }))
  assert.deepEqual(codes(noDoor), [])
})

test('밀착 배치: 벽 | 협탁 | 침대를 모두 딱 붙이면 문제와 제안이 0건이에요', () => {
  const opts = { widthCm: 300, depthCm: 400, openings: [door({ offsetCm: 200 })] }
  const stand = item('other', { name: '협탁', widthCm: 45, depthCm: 40, heightCm: 50, clearanceFrontCm: 50 })
  const bed = item('bed', { name: '침대', widthCm: 150, depthCm: 200, heightCm: 45, xCm: 45 })
  assert.deepEqual(codes(validateRoom(room([stand, bed], opts))), [])

  // 침대와 오른쪽 벽 사이에 끼운 협탁, 폭 25cm 틈새 협탁
  for (const widthCm of [45, 25]) {
    const single = item('bed', { name: '침대', widthCm: 300 - 145 - widthCm, depthCm: 200, heightCm: 45, xCm: 145 })
    const tucked = item('other', { name: '틈새 협탁', widthCm, depthCm: 40, heightCm: 50, xCm: 300 - widthCm, clearanceFrontCm: 50 })
    assert.deepEqual(codes(validateRoom(room([single, tucked], { ...opts, openings: [door({ offsetCm: 20 })] }))), [])
  }

  // 침대 | 협탁 | 침대
  const left = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45, xCm: 0 })
  const mid = item('other', { name: '협탁', widthCm: 45, depthCm: 40, heightCm: 50, xCm: 100, clearanceFrontCm: 50 })
  const right = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45, xCm: 145 })
  const twin = validateRoom(room([left, mid, right], { widthCm: 400, depthCm: 400, openings: [door({ wall: 'right', offsetCm: 300 })] }))
  assert.ok(!codes(twin).includes('NARROW_PASSAGE') && !codes(twin).includes('NO_ACCESS'))
})

test('밀착 배치: 애매한 틈에 좁은 선반을 끼워 넣어도 NO_ACCESS나 NARROW_PASSAGE가 아니에요', () => {
  const desk = item('desk', { name: '책상', widthCm: 120, depthCm: 60 })
  const wardrobe = item('wardrobe', { name: '옷장', widthCm: 80, depthCm: 60, heightCm: 200, xCm: 145 })
  const opts = { widthCm: 300, depthCm: 400, openings: [door({ offsetCm: 200 })] }
  assert.deepEqual(codes(validateRoom(room([desk, wardrobe], opts))), ['DEAD_SPACE_GAP'])
  const shelf = item('bookshelf', { name: '틈새 선반', widthCm: 25, depthCm: 30, heightCm: 100, xCm: 120 })
  assert.deepEqual(codes(validateRoom(room([desk, wardrobe, shelf], opts))), [])
})

test('밀착 예외는 갇힌 가구를 봐주지 않아요: 좁은 가구 앞이 다른 가구로 막히면 그대로 NO_ACCESS예요', () => {
  const stand = item('other', { name: '협탁', widthCm: 25, depthCm: 40 })
  const bed = item('bed', { widthCm: 150, depthCm: 200, heightCm: 45, xCm: 25 })
  const lid = item('other', { name: '상자', widthCm: 25, depthCm: 160, yCm: 40 })
  const result = validateRoom(room([stand, bed, lid], { widthCm: 300, depthCm: 400, openings: [door({ offsetCm: 200 })] }))
  const noAccess = result.errors.filter((e) => e.code === 'NO_ACCESS')
  assert.deepEqual(noAccess.map((e) => e.furnitureIds), [[stand.id]])
})

test('매트와 의자는 통로를 막지 않아요', () => {
  const target = item('other', { widthCm: 50, depthCm: 50 })
  const mat = item('mat', { widthCm: 300, depthCm: 80, heightCm: 1, yCm: 60 })
  const chair = item('chair', { widthCm: 50, depthCm: 50, xCm: 250, yCm: 150 })
  const wall = item('other', { widthCm: 240, depthCm: 50, yCm: 150 })
  const result = validateRoom(room([target, mat, chair, wall], { widthCm: 300, depthCm: 300, openings: [door({ offsetCm: 0 })] }))
  assert.deepEqual(codes(result), [])
})

test('애매한 틈: 가구 사이 28cm 틈은 DEAD_SPACE_GAP이고 "28"이 들어가요', () => {
  const a = item('drawer', { name: '서랍장' })
  const b = item('bookshelf', { name: '책장', xCm: 108 })
  const result = validateRoom(room([a, b]))
  assert.deepEqual(result.errors, [])
  const tip = find(result, 'DEAD_SPACE_GAP')
  assert.equal(tip.severity, 'tip')
  assert.match(tip.title, /28cm/)
  assert.match(tip.message, /28/)
})

test('애매한 틈 아님: 벽에 붙임, 벽과의 틈, 딱 붙임(0cm), 4cm, 51cm는 아무 말도 없어요', () => {
  // 벽에서 28cm 떨어진 가구 하나
  assert.deepEqual(codes(validateRoom(room([item('drawer', { xCm: 28, yCm: 28 })]))), [])
  // 네 벽 모서리에 딱 붙인 가구
  assert.deepEqual(codes(validateRoom(room([item('drawer'), item('drawer', { xCm: 320, yCm: 360 })]))), [])
  for (const gap of [0, 4, 51]) {
    const result = validateRoom(room([item('drawer'), item('bookshelf', { xCm: 80 + gap })]))
    assert.deepEqual(codes(result), [], `${gap}cm 틈`)
  }
  for (const gap of [5, 50]) {
    const result = validateRoom(room([item('drawer'), item('bookshelf', { xCm: 80 + gap })]))
    assert.deepEqual(codes(result), ['DEAD_SPACE_GAP'], `${gap}cm 틈`)
  }
})

test('애매한 틈 아님: 의자·매트와의 틈, 마주 보는 길이가 20cm보다 짧은 틈', () => {
  const chair = item('chair', { widthCm: 50, depthCm: 50, xCm: 100 })
  const mat = item('mat', { widthCm: 100, depthCm: 100, heightCm: 1, yCm: 60 })
  assert.deepEqual(codes(validateRoom(room([item('drawer'), chair, mat]))), [])
  const corner = item('bookshelf', { xCm: 100, yCm: 25 })
  assert.deepEqual(codes(validateRoom(room([item('drawer'), corner]))), [])
})

test('책상+책장, 침대+서랍장을 딱 붙여도 문제와 제안이 0건이에요', () => {
  const desk = item('desk', { widthCm: 120, depthCm: 60, clearanceFrontCm: 60 })
  const shelf = item('bookshelf', { widthCm: 80, depthCm: 30, heightCm: 180, xCm: 120 })
  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45, xCm: 300, yCm: 200 })
  const drawer = item('drawer', { widthCm: 60, depthCm: 40, xCm: 240, yCm: 200 })
  const result = validateRoom(room([desk, shelf, bed, drawer]))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.tips, [])
})

test('창 아래 침대: 침대 머리가 창문 벽 40cm 안이면 BED_UNDER_WINDOW예요', () => {
  const flush = validateRoom(room([item('bed', { widthCm: 100, depthCm: 200, xCm: 100 })], { openings: [win()] }))
  assert.equal(find(flush, 'BED_UNDER_WINDOW').severity, 'tip')
  const near = validateRoom(room([item('bed', { widthCm: 100, depthCm: 200, xCm: 100, yCm: 30 })], { openings: [win()] }))
  assert.match(find(near, 'BED_UNDER_WINDOW').message, /30cm/)
})

test('창 아래 침대 아님: 머리가 다른 벽 쪽, 창과 어긋난 자리, 41cm 떨어진 자리', () => {
  const turned = item('bed', { widthCm: 100, depthCm: 200, xCm: 100, yCm: 0, rotation: 180 })
  const aside = item('bed', { widthCm: 100, depthCm: 200, xCm: 250 })
  const far = item('bed', { widthCm: 100, depthCm: 200, xCm: 100, yCm: 41 })
  for (const bed of [turned, aside, far]) {
    assert.ok(!codes(validateRoom(room([bed], { openings: [win()] }))).includes('BED_UNDER_WINDOW'))
  }
})

test('현관 직시선: 문에서 곧게 들어온 자리에 침대가 먼저 있으면 DOOR_BED_SIGHTLINE이에요', () => {
  const bed = item('bed', { name: '침대', widthCm: 100, depthCm: 200, heightCm: 45, xCm: 150 })
  const low = item('drawer', { widthCm: 90, depthCm: 40, heightCm: 80, xCm: 150, yCm: 250 })
  const result = validateRoom(room([bed, low], { openings: [door()] }))
  const tip = find(result, 'DOOR_BED_SIGHTLINE')
  assert.deepEqual(tip.furnitureIds, [bed.id])
  assert.match(tip.message, /200cm 앞/)
})

test('현관 직시선 아님: 키 120cm 이상 가구가 가리거나, 침대가 문 앞 띠 밖에 있으면 괜찮아요', () => {
  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45, xCm: 150 })
  const screen = item('bookshelf', { widthCm: 100, depthCm: 30, heightCm: 180, xCm: 150, yCm: 250 })
  assert.ok(!codes(validateRoom(room([bed, screen], { openings: [door()] }))).includes('DOOR_BED_SIGHTLINE'))
  const aside = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45, xCm: 300 })
  const result = validateRoom(room([aside], { openings: [door()] }))
  assert.ok(!codes(result).includes('DOOR_BED_SIGHTLINE'))
  assert.ok(result.strengths.some((s) => s.includes('침대가 바로 보이지 않아')))
})

test('침대·책상 밀착: 침대와 책상이 맞닿으면 BED_DESK_ADJACENT예요 (순서를 바꿔도 같아요)', () => {
  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45 })
  const desk = item('desk', { widthCm: 120, depthCm: 60, xCm: 100 })
  for (const furniture of [[bed, desk], [desk, bed]]) {
    const result = validateRoom(room(furniture))
    assert.deepEqual(codes(result), ['BED_DESK_ADJACENT'])
    assert.deepEqual(result.tips[0].furnitureIds, [bed.id, desk.id])
  }
})

test('침대·책상 밀착 아님: 침대+서랍장·책장·기타, 책상+책장은 순서와 상관없이 아무 말도 없어요', () => {
  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45 })
  const desk = item('desk', { widthCm: 120, depthCm: 60 })
  /** @type {[FurnitureItem, FurnitureCategory][]} */
  const pairs = [[bed, 'drawer'], [bed, 'bookshelf'], [bed, 'other'], [desk, 'bookshelf']]
  for (const [main, category] of pairs) {
    const side = item(category, { widthCm: 60, depthCm: 40, xCm: main.widthCm })
    for (const furniture of [[main, side], [side, main]]) {
      const result = validateRoom(room(furniture))
      assert.deepEqual(codes(result), [], `${main.category}+${category}`)
    }
  }
  // 침대와 책상이 60cm 떨어져 있으면 밀착이 아니다
  const apart = validateRoom(room([bed, item('desk', { widthCm: 120, depthCm: 60, xCm: 160 })]))
  assert.deepEqual(codes(apart), [])
})

test('아이 안전: 영유아 가족일 때만 세 가지 참고 체크가 나와요', () => {
  const shelf = item('bookshelf', { name: '책장', widthCm: 80, depthCm: 30, heightCm: 180 })
  const mat = item('mat', { name: '놀이 매트', widthCm: 150, depthCm: 150, heightCm: 2, yCm: 60 })
  const low = item('drawer', { name: '낮은 서랍장', widthCm: 60, depthCm: 40, heightCm: 60, xCm: 250 })
  const desk = item('desk', { name: '책상', widthCm: 100, depthCm: 60, heightCm: 72, xCm: 180, yCm: 200, hasSharpCorner: true })
  const side = item('other', { name: '수납함', widthCm: 60, depthCm: 60, heightCm: 20, xCm: 340, yCm: 200 })
  const target = room([shelf, mat, low, desk, side], { openings: [win({ offsetCm: 230 })] })

  const off = validateRoom(target, { lifestyle: 'single' })
  assert.ok(off.tips.every((t) => t.category === 'interior'))
  assert.equal(off.matZone, null)
  assert.deepEqual(validateRoom(target).tips, off.tips)

  const on = validateRoom(target, { lifestyle: 'family_child' })
  const child = on.tips.filter((t) => t.category === 'child_safety')
  assert.deepEqual(child.map((t) => t.code).sort(), ['CHILD_SHARP_CORNER', 'CHILD_TIP_RISK', 'CHILD_WINDOW_CLIMB'])
  for (const tip of child) {
    assert.equal(tip.isReferenceValue, true)
    assert.match(tip.message, /참고용 안전 체크/)
  }
  assert.match(find(on, 'CHILD_TIP_RISK').message, /30cm 거리/)
  assert.deepEqual(find(on, 'CHILD_WINDOW_CLIMB').furnitureIds, [low.id])
  assert.match(find(on, 'CHILD_SHARP_CORNER').message, /60cm로 좁아요/)
})

test('아이 안전 아님: 멀리 있는 높은 가구, 창에서 떨어진 낮은 가구, 넓은 길 옆 모서리', () => {
  const shelf = item('bookshelf', { widthCm: 80, depthCm: 30, heightCm: 180 })
  const mat = item('mat', { widthCm: 150, depthCm: 150, heightCm: 2, yCm: 100 })
  const low = item('drawer', { widthCm: 60, depthCm: 40, heightCm: 60, xCm: 250, yCm: 30 })
  const desk = item('desk', { widthCm: 100, depthCm: 60, heightCm: 72, xCm: 160, yCm: 300, hasSharpCorner: true })
  const side = item('other', { widthCm: 60, depthCm: 60, heightCm: 20, xCm: 340, yCm: 300 })
  const result = validateRoom(room([shelf, mat, low, desk, side], { openings: [win({ offsetCm: 230 })] }), { lifestyle: 'family_child' })
  assert.deepEqual(result.tips.filter((t) => t.category === 'child_safety'), [])
})

test('매트 자리: 영유아 가족일 때만 가장 넓은 빈 바닥을 알려 줘요', () => {
  const empty = room([], { widthCm: 300, depthCm: 400 })
  assert.deepEqual(validateRoom(empty, { lifestyle: 'family_child' }).matZone, { xCm: 0, yCm: 0, widthCm: 300, depthCm: 400 })
  assert.equal(validateRoom(empty, { lifestyle: 'couple' }).matZone, null)

  const bed = item('bed', { widthCm: 100, depthCm: 200, heightCm: 45 })
  const withBed = validateRoom(room([bed], { widthCm: 300, depthCm: 400 }), { lifestyle: 'family_child' })
  assert.deepEqual(withBed.matZone, { xCm: 100, yCm: 0, widthCm: 200, depthCm: 400 })

  const narrow = room([], { widthCm: 110, depthCm: 400 })
  assert.equal(validateRoom(narrow, { lifestyle: 'family_child' }).matZone, null)
})

test('좋은 점: 확인된 사실만 말하고, 문제나 제안이 걸린 가구는 칭찬하지 않아요', () => {
  const desk = item('desk', { name: '책상', widthCm: 120, depthCm: 60, xCm: 100, clearanceFrontCm: 60 })
  const good = validateRoom(room([desk], { openings: [win(), door()] }))
  assert.deepEqual(good.errors, [])
  assert.ok(good.strengths.some((s) => s.includes('책상이 창가에')))
  assert.ok(good.strengths.some((s) => s.includes('막힌 곳 없이')))

  const blocker = item('drawer', { xCm: 100, yCm: 80 })
  const bad = validateRoom(room([desk, blocker], { openings: [win(), door()] }))
  assert.ok(bad.errors.length > 0)
  assert.ok(!bad.strengths.some((s) => s.includes('창가')))
  assert.ok(!bad.strengths.some((s) => s.includes('막힌 곳 없이')))
  assert.deepEqual(validateRoom(room([])).strengths, [])
})

test('예시 방: 정면 공간 말고 다른 확실한 문제는 없어요 (침대 발치와 옷장 사이 45cm)', () => {
  const result = validateRoom(createExampleProject().rooms[0])
  for (const error of result.errors) {
    assert.equal(error.code, 'CLEARANCE_BLOCKED')
    assert.deepEqual(error.furnitureIds, ['furn_bed_1', 'furn_wardrobe_1'])
    assert.match(error.message, /45cm/)
  }
  assert.ok(result.errors.length <= 1)
})

// 예시 자료(src/data/exampleProject.js)의 옷장이 침대 정면 50cm 공간에 5cm 들어와 있어서 지금은 실패한다.
// 규칙을 느슨하게 하지 않고, 예시 자료를 고치면 통과하도록 할 일로 남긴다.
test('예시 방에는 확실한 문제가 0건이에요', () => {
  assert.deepEqual(validateRoom(createExampleProject().rooms[0]).errors, [])
})

test('속도: 300×400cm 방의 가구 15개 검사가 10ms보다 훨씬 빨라요', () => {
  /** @type {FurnitureItem[]} */
  const furniture = []
  /** @type {FurnitureCategory[]} */
  const kinds = ['drawer', 'bookshelf', 'other', 'desk', 'chair']
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      furniture.push(item(kinds[col], { widthCm: 40, depthCm: 30, xCm: 10 + col * 58, yCm: 10 + row * 100, clearanceFrontCm: col === 3 ? 60 : 0 }))
    }
  }
  const target = room(furniture, { widthCm: 300, depthCm: 400, openings: [door({ offsetCm: 20, swingInward: true }), win()] })
  for (let i = 0; i < 20; i++) validateRoom(target, { lifestyle: 'family_child' })
  const runs = 200
  const started = performance.now()
  for (let i = 0; i < runs; i++) validateRoom(target, { lifestyle: i % 2 ? 'family_child' : 'single' })
  const perRunMs = (performance.now() - started) / runs
  console.log(`가구 15개 검사 한 번: ${perRunMs.toFixed(3)}ms`)
  assert.ok(perRunMs < 10, `한 번에 ${perRunMs.toFixed(2)}ms`)
})

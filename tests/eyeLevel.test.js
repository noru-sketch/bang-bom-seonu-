// 눈높이 보기 계산(eyeLevel.js) 테스트: 눈높이 값, 설 수 있는 자리, 처음 서는 자리, 걸어가는 길, 빨간 점.

/** @import { FurnitureItem, Opening, Room } from '../src/types/schema.ts' */

import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG } from '../src/data/catalog.js'
import { createExampleProject, createRoom } from '../src/data/exampleProject.js'
import { REFERENCE } from '../src/engine/validator.js'
import {
  EYE_REFERENCE,
  canStandAt,
  eyeHeightCm,
  initialStandSpot,
  nearestStandSpot,
  sharpCornerMarkers,
  standObstacles,
  walkPath,
  yawTowardDeg,
} from '../src/engine/eyeLevel.js'

/**
 * @param {Partial<FurnitureItem> & { id: string }} seed
 * @returns {FurnitureItem}
 */
function item(seed) {
  return {
    name: seed.id,
    category: 'other',
    widthCm: 60,
    depthCm: 60,
    heightCm: 80,
    xCm: 0,
    yCm: 0,
    rotation: 0,
    color: '#cccccc',
    material: 'wood',
    owned: false,
    clearanceFrontCm: 0,
    hasSharpCorner: false,
    price: { estimatedKrw: 0, manualKrw: null, source: 'estimated' },
    locked: false,
    ...seed,
  }
}

/**
 * 가로 300 × 세로 400cm 방. 문은 아래 벽(왼쪽 끝에서 20cm, 폭 90cm), 창문은 위 벽.
 * @param {FurnitureItem[]} furniture
 * @param {Opening[]} [openings]
 * @returns {Room}
 */
function room(furniture, openings) {
  const base = createRoom({ widthCm: 300, depthCm: 400 })
  return { ...base, furniture, openings: openings ?? base.openings }
}

/** @param {Opening['wall']} wall @param {number} offsetCm @returns {Opening} */
function door(wall, offsetCm) {
  return { id: `op_door_${wall}`, type: 'door', wall, offsetCm, widthCm: 90, sillHeightCm: 0, swingInward: true }
}

/** 점에서 직사각형까지의 거리 @param {{ xCm: number, yCm: number }} p @param {{ xCm: number, yCm: number, widthCm: number, depthCm: number }} r */
function distanceTo(p, r) {
  const dx = Math.max(r.xCm - p.xCm, 0, p.xCm - (r.xCm + r.widthCm))
  const dy = Math.max(r.yCm - p.yCm, 0, p.yCm - (r.yCm + r.depthCm))
  return Math.hypot(dx, dy)
}

const box = item({ id: 'box', xCm: 100, yCm: 100 }) // x 100~160, y 100~160, 높이 80

// ── 눈높이 값 ───────────────────────────────────────────────────────────

test('눈높이: 아이는 90cm, 어른은 160cm, 둘러보기는 값이 없어요', () => {
  assert.equal(eyeHeightCm('child'), 90)
  assert.equal(eyeHeightCm('adult'), 160)
  assert.equal(eyeHeightCm('off'), null)
  assert.equal(EYE_REFERENCE.childEyeCm, 90)
  assert.equal(EYE_REFERENCE.adultEyeCm, 160)
})

// ── 설 수 있는 자리 ─────────────────────────────────────────────────────

test('설 수 있는 자리: 벽에서 20cm 이상 떨어진 방 안쪽이에요', () => {
  const empty = room([])
  assert.equal(EYE_REFERENCE.standMarginCm, 20)
  assert.equal(canStandAt(empty, 150, 200), true)
  assert.equal(canStandAt(empty, 20, 200), true)
  assert.equal(canStandAt(empty, 19, 200), false)
  assert.equal(canStandAt(empty, 280, 200), true)
  assert.equal(canStandAt(empty, 281, 200), false)
  assert.equal(canStandAt(empty, 150, 380), true)
  assert.equal(canStandAt(empty, 150, 381), false)
})

test('설 수 있는 자리: 방 밖과 숫자가 아닌 값은 설 수 없어요', () => {
  const empty = room([])
  assert.equal(canStandAt(empty, -10, 50), false)
  assert.equal(canStandAt(empty, 310, 200), false)
  assert.equal(canStandAt(empty, 150, 999), false)
  assert.equal(canStandAt(empty, Number.NaN, 200), false)
})

test('설 수 있는 자리: 가구 안과 가구에서 20cm 안쪽은 설 수 없어요', () => {
  const r = room([box])
  assert.equal(canStandAt(r, 130, 130), false) // 가구 안
  assert.equal(canStandAt(r, 81, 130), false) // 19cm
  assert.equal(canStandAt(r, 80, 130), true) // 20cm
  assert.equal(canStandAt(r, 130, 181), true) // 21cm
  // 모서리에서는 대각선 거리로 잰다
  assert.equal(canStandAt(r, 86, 86), false) // 약 19.8cm
  assert.equal(canStandAt(r, 85, 85), true) // 약 21.2cm
})

test('설 수 있는 자리: 매트와 높이 10cm 미만인 것은 밟을 수 있어요', () => {
  const mat = item({ id: 'mat', category: 'mat', widthCm: 140, depthCm: 200, heightCm: 4, xCm: 80, yCm: 100 })
  assert.equal(canStandAt(room([mat]), 150, 200), true)
  assert.deepEqual(standObstacles(room([mat])), [])
  const low = item({ id: 'low', heightCm: 9, xCm: 100, yCm: 100 })
  assert.equal(canStandAt(room([low]), 130, 130), true)
  const step = item({ id: 'step', heightCm: 10, xCm: 100, yCm: 100 })
  assert.equal(EYE_REFERENCE.walkOverCm, 10)
  assert.equal(canStandAt(room([step]), 130, 130), false)
  // 회전한 가구는 바닥 차지 영역으로 본다
  const turned = item({ id: 'turned', widthCm: 120, depthCm: 40, rotation: 90, xCm: 100, yCm: 100 })
  assert.deepEqual(standObstacles(room([turned])), [{ xCm: 100, yCm: 100, widthCm: 40, depthCm: 120 }])
})

// ── 가장 가까운 설 수 있는 자리 ─────────────────────────────────────────

test('가장 가까운 자리: 설 수 있는 곳은 그 자리 그대로(정수 cm)예요', () => {
  assert.deepEqual(nearestStandSpot(room([]), 150.4, 199.6), { xCm: 150, yCm: 200 })
})

test('가장 가까운 자리: 방 밖이나 벽 바로 옆은 벽에서 20cm 들어온 곳이에요', () => {
  const empty = room([])
  assert.deepEqual(nearestStandSpot(empty, -50, 200), { xCm: 20, yCm: 200 })
  assert.deepEqual(nearestStandSpot(empty, 500, 900), { xCm: 280, yCm: 380 })
  assert.deepEqual(nearestStandSpot(empty, 5, 5), { xCm: 20, yCm: 20 })
  assert.deepEqual(nearestStandSpot(empty, 150, 395), { xCm: 150, yCm: 380 })
})

test('가장 가까운 자리: 가구 안을 누르면 가장 가까운 가구 바깥 20cm 자리예요', () => {
  const r = room([box])
  assert.deepEqual(nearestStandSpot(r, 110, 130), { xCm: 80, yCm: 130 })
  assert.deepEqual(nearestStandSpot(r, 130, 155), { xCm: 130, yCm: 180 })
  // 벽에 붙은 가구 안이면 벽 반대쪽으로 나온다
  const wardrobe = item({ id: 'wardrobe', widthCm: 60, depthCm: 80, heightCm: 200, xCm: 240, yCm: 260 })
  assert.deepEqual(nearestStandSpot(room([wardrobe]), 270, 300), { xCm: 220, yCm: 300 })
})

test('가장 가까운 자리: 돌려준 자리는 언제나 설 수 있는 자리예요', () => {
  const example = createExampleProject().rooms[0]
  for (let y = -40; y <= 440; y += 37) {
    for (let x = -40; x <= 340; x += 29) {
      const spot = nearestStandSpot(example, x, y)
      assert.ok(spot, `(${x}, ${y})에서 자리를 찾지 못했어요`)
      assert.equal(canStandAt(example, spot.xCm, spot.yCm), true, `(${x}, ${y}) → (${spot.xCm}, ${spot.yCm})`)
      assert.ok(Number.isInteger(spot.xCm) && Number.isInteger(spot.yCm))
    }
  }
})

test('가장 가까운 자리: 설 곳이 하나도 없으면 null이에요', () => {
  const full = item({ id: 'full', widthCm: 300, depthCm: 400, xCm: 0, yCm: 0 })
  assert.equal(nearestStandSpot(room([full]), 150, 200), null)
  assert.equal(nearestStandSpot(room([]), Number.NaN, 200), null)
})

// ── 처음 서는 자리 ──────────────────────────────────────────────────────

test('보는 방향: 0도는 아래(+y), 90도는 오른쪽(+x), 180도는 위, 270도는 왼쪽이에요', () => {
  const from = { xCm: 100, yCm: 100 }
  assert.equal(yawTowardDeg(from, { xCm: 100, yCm: 150 }), 0)
  assert.equal(yawTowardDeg(from, { xCm: 150, yCm: 100 }), 90)
  assert.equal(yawTowardDeg(from, { xCm: 100, yCm: 50 }), 180)
  assert.equal(yawTowardDeg(from, { xCm: 50, yCm: 100 }), 270)
})

test('처음 서는 자리: 문에서 방 안쪽으로 한 걸음(70cm) 들어와 방 가운데를 봐요', () => {
  assert.equal(EYE_REFERENCE.entryStepCm, 70)
  // 아래 벽 문(가운데 x=65): (65, 330)에서 방 가운데 (150, 200)을 본다
  assert.deepEqual(initialStandSpot(room([])), { xCm: 65, yCm: 330, yawDeg: 147 })
  assert.deepEqual(initialStandSpot(room([], [door('left', 100)])), { xCm: 70, yCm: 145, yawDeg: 55 })
  assert.deepEqual(initialStandSpot(room([], [door('top', 105)])), { xCm: 150, yCm: 70, yawDeg: 0 })
  assert.deepEqual(initialStandSpot(room([], [door('right', 155)])), { xCm: 230, yCm: 200, yawDeg: 270 })
})

test('처음 서는 자리: 문이 여러 개면 첫 번째 문(현관)을 써요', () => {
  const spot = initialStandSpot(room([], [door('top', 105), door('left', 100)]))
  assert.deepEqual(spot, { xCm: 150, yCm: 70, yawDeg: 0 })
})

test('처음 서는 자리: 문이 없으면 방 가운데 근처의 빈 자리예요', () => {
  /** @type {Opening} */
  const windowOnly = { id: 'op_win_1', type: 'window', wall: 'top', offsetCm: 80, widthCm: 150, sillHeightCm: 90, swingInward: false }
  // 가운데가 비어 있으면 가운데에 서서 위쪽 벽을 본다
  assert.deepEqual(initialStandSpot(room([], [])), { xCm: 150, yCm: 200, yawDeg: 180 })
  assert.deepEqual(initialStandSpot(room([], [windowOnly])), { xCm: 150, yCm: 200, yawDeg: 180 })
  // 가운데에 식탁이 있으면 가장 가까운 빈 자리에서 가운데를 본다
  const table = item({ id: 'table', widthCm: 80, depthCm: 60, heightCm: 73, xCm: 110, yCm: 175 })
  const r = room([table], [])
  assert.deepEqual(initialStandSpot(r), { xCm: 150, yCm: 155, yawDeg: 0 })
  assert.equal(canStandAt(r, 150, 155), true)
})

test('처음 서는 자리: 문 앞이 가구로 막혀 있으면 가장 가까운 설 수 있는 자리예요', () => {
  const sofa = item({ id: 'sofa', category: 'sofa', widthCm: 150, depthCm: 80, heightCm: 80, xCm: 20, yCm: 300 })
  const r = room([sofa])
  const spot = initialStandSpot(r)
  assert.deepEqual(spot, { xCm: 65, yCm: 280, yawDeg: 133 })
  assert.equal(canStandAt(r, spot.xCm, spot.yCm), true)
})

test('처음 보는 방향: 방 가운데 쪽에 가구가 하나도 안 보이면 가구가 모인 쪽을 봐요', () => {
  assert.equal(EYE_REFERENCE.entryViewHalfDeg, 30)
  assert.equal(EYE_REFERENCE.entryNearCm, 100)
  // 방봄 거실 모양(400×500, 문은 왼쪽 벽): 가구가 위쪽 두 구석과 아래 왼쪽 구석에 있어 가운데 쪽(80도)에는 빈 벽뿐이다
  const base = createRoom({ widthCm: 400, depthCm: 500 })
  const sofa = item({ id: 'sofa', category: 'sofa', widthCm: 150, depthCm: 80, heightCm: 80, xCm: 0, yCm: 0 })
  const tv = item({ id: 'tv', category: 'tv_stand', widthCm: 120, depthCm: 40, heightCm: 45, xCm: 280, yCm: 0 })
  const table = item({ id: 'table', category: 'table', widthCm: 80, depthCm: 60, heightCm: 73, rotation: 90, xCm: 0, yCm: 420 })
  const living = { ...base, openings: [door('left', 183)], furniture: [sofa, tv, table] }
  assert.deepEqual(initialStandSpot({ ...living, furniture: [] }), { xCm: 70, yCm: 228, yawDeg: 80 })
  assert.deepEqual(initialStandSpot(living), { xCm: 70, yCm: 228, yawDeg: 151 })
  // 가운데 쪽에 가구가 하나라도 보이면 그대로 가운데를 본다
  const chair = item({ id: 'chair', category: 'chair', widthCm: 50, depthCm: 50, heightCm: 85, xCm: 250, yCm: 230 })
  assert.equal(initialStandSpot({ ...living, furniture: [sofa, tv, table, chair] }).yawDeg, 80)
  // 매트는 가구로 치지 않는다
  const mat = item({ id: 'mat', category: 'mat', widthCm: 140, depthCm: 200, heightCm: 4, xCm: 200, yCm: 150 })
  assert.equal(initialStandSpot({ ...living, furniture: [sofa, tv, table, mat] }).yawDeg, 151)
  // 발밑(100cm 안)의 가구뿐이면 그 가구를 쳐다보지 않고 가운데를 본다
  const near = item({ id: 'near', widthCm: 40, depthCm: 40, heightCm: 60, xCm: 20, yCm: 290 })
  assert.equal(initialStandSpot({ ...living, furniture: [near] }).yawDeg, 80)
})

test('처음 서는 자리: 설 곳이 없는 방이어도 방 가운데 값을 돌려줘요', () => {
  const full = item({ id: 'full', widthCm: 300, depthCm: 400, xCm: 0, yCm: 0 })
  assert.deepEqual(initialStandSpot(room([full])), { xCm: 150, yCm: 200, yawDeg: 180 })
})

test('처음 서는 자리: 예시 방에서는 문 앞에 서고 그 자리는 가구 밖이에요', () => {
  const example = createExampleProject().rooms[0]
  const spot = initialStandSpot(example)
  assert.deepEqual(spot, { xCm: 65, yCm: 330, yawDeg: 147 })
  assert.equal(canStandAt(example, spot.xCm, spot.yCm), true)
})

// ── 걸어가는 길 ─────────────────────────────────────────────────────────

test('걸어가는 길: 사이에 가구가 없으면 곧장 가요', () => {
  const path = walkPath(room([]), { xCm: 65, yCm: 330 }, { xCm: 200, yCm: 100 })
  assert.deepEqual(path, { points: [{ xCm: 200, yCm: 100 }], reachable: true })
})

test('걸어가는 길: 가구가 가로막으면 돌아서 가고, 길 위의 모든 곳이 가구에서 떨어져 있어요', () => {
  const block = item({ id: 'block', widthCm: 100, depthCm: 100, xCm: 100, yCm: 150 }) // x 100~200, y 150~250
  const r = room([block])
  const from = { xCm: 150, yCm: 300 }
  const to = { xCm: 150, yCm: 100 }
  const path = walkPath(r, from, to)
  assert.equal(path.reachable, true)
  assert.ok(path.points.length >= 2, '돌아가는 길에는 꺾이는 곳이 있어야 해요')
  assert.deepEqual(path.points[path.points.length - 1], to)
  const stops = [from, ...path.points]
  const body = standObstacles(r)[0]
  for (let i = 1; i < stops.length; i += 1) {
    for (let t = 0; t <= 1; t += 0.02) {
      const p = {
        xCm: stops[i - 1].xCm + (stops[i].xCm - stops[i - 1].xCm) * t,
        yCm: stops[i - 1].yCm + (stops[i].yCm - stops[i - 1].yCm) * t,
      }
      assert.ok(distanceTo(p, body) >= EYE_REFERENCE.standMarginCm - 3, `가구에 너무 가까워요 (${p.xCm}, ${p.yCm})`)
      assert.ok(p.xCm >= 17 && p.xCm <= 283 && p.yCm >= 17 && p.yCm <= 383)
    }
  }
})

test('걸어가는 길: 가구로 완전히 나뉜 곳은 걸어서 갈 수 없다고 알려 줘요', () => {
  const wall = item({ id: 'wall', widthCm: 300, depthCm: 40, xCm: 0, yCm: 180 })
  const path = walkPath(room([wall]), { xCm: 150, yCm: 100 }, { xCm: 150, yCm: 300 })
  assert.deepEqual(path, { points: [{ xCm: 150, yCm: 300 }], reachable: false })
})

// ── 빨간 점 (부딪히기 쉬운 모서리) ──────────────────────────────────────

/** @param {Partial<FurnitureItem>} [patch] */
function sharpTable(patch) {
  return item({ id: 'table', category: 'table', widthCm: 80, depthCm: 60, heightCm: 73, xCm: 100, yCm: 150, hasSharpCorner: true, ...patch })
}

/** @param {Room} r */
function cornerList(r) {
  return sharpCornerMarkers(r).map((m) => [m.xCm, m.yCm])
}

test('빨간 점: 방 가운데에 놓인 뾰족한 가구는 윗면 꼭짓점 네 곳이에요', () => {
  const markers = sharpCornerMarkers(room([sharpTable()]))
  assert.deepEqual(markers, [
    { furnitureId: 'table', xCm: 100, yCm: 150, heightCm: 73 },
    { furnitureId: 'table', xCm: 180, yCm: 150, heightCm: 73 },
    { furnitureId: 'table', xCm: 100, yCm: 210, heightCm: 73 },
    { furnitureId: 'table', xCm: 180, yCm: 210, heightCm: 73 },
  ])
})

test('빨간 점: 점수나 등급 없이 위치와 높이만 돌려줘요', () => {
  for (const marker of sharpCornerMarkers(room([sharpTable()]))) {
    assert.deepEqual(Object.keys(marker).sort(), ['furnitureId', 'heightCm', 'xCm', 'yCm'])
  }
})

test('빨간 점: 윗면 높이가 40~110cm인 가구만 표시해요', () => {
  assert.equal(EYE_REFERENCE.cornerMinCm, 40)
  assert.equal(EYE_REFERENCE.cornerMaxCm, 110)
  assert.equal(sharpCornerMarkers(room([sharpTable({ heightCm: 39 })])).length, 0)
  assert.equal(sharpCornerMarkers(room([sharpTable({ heightCm: 40 })])).length, 4)
  assert.equal(sharpCornerMarkers(room([sharpTable({ heightCm: 110 })])).length, 4)
  assert.equal(sharpCornerMarkers(room([sharpTable({ heightCm: 111 })])).length, 0)
  assert.equal(sharpCornerMarkers(room([sharpTable({ heightCm: 200 })])).length, 0)
})

test('빨간 점: 뾰족하지 않은 가구와 매트는 표시하지 않아요', () => {
  assert.equal(sharpCornerMarkers(room([sharpTable({ hasSharpCorner: false })])).length, 0)
  assert.equal(sharpCornerMarkers(room([sharpTable({ category: 'mat', heightCm: 50 })])).length, 0)
  assert.equal(sharpCornerMarkers(room([])).length, 0)
})

test('빨간 점: 벽에서 5cm 안에 붙은 꼭짓점은 빼요', () => {
  assert.equal(EYE_REFERENCE.cornerWallCm, 5)
  // 왼쪽 위 구석에 붙인 책상: 방 쪽으로 나온 꼭짓점 하나만 남는다
  const desk = item({ id: 'desk', category: 'desk', widthCm: 120, depthCm: 60, heightCm: 72, hasSharpCorner: true })
  assert.deepEqual(cornerList(room([desk])), [[120, 60]])
  // 왼쪽 벽에서 5cm: 왼쪽 두 꼭짓점을 뺀다. 6cm면 넣는다
  assert.deepEqual(cornerList(room([sharpTable({ xCm: 5 })])), [[85, 150], [85, 210]])
  assert.equal(cornerList(room([sharpTable({ xCm: 6 })])).length, 4)
  // 오른쪽·아래 벽도 같다
  assert.deepEqual(cornerList(room([sharpTable({ xCm: 220, yCm: 340 })])), [[220, 340]])
})

test('빨간 점: 회전한 가구는 회전한 바닥 차지 영역의 꼭짓점이에요', () => {
  const desk = item({ id: 'desk', category: 'desk', widthCm: 120, depthCm: 60, heightCm: 72, rotation: 90, xCm: 100, yCm: 100, hasSharpCorner: true })
  assert.deepEqual(cornerList(room([desk])), [[100, 100], [160, 100], [100, 220], [160, 220]])
})

test('빨간 점: 같거나 더 높은 가구에 맞닿아 가려진 꼭짓점은 빼요 (의자는 가린 것으로 보지 않아요)', () => {
  const desk = item({ id: 'desk', category: 'desk', widthCm: 120, depthCm: 60, heightCm: 72, hasSharpCorner: true })
  // 책상 옆에 딱 붙인 옷장(높이 200): 책상 꼭짓점이 옷장에 붙어 튀어나오지 않는다
  const wardrobe = item({ id: 'wardrobe', category: 'wardrobe', widthCm: 80, depthCm: 60, heightCm: 200, xCm: 120, yCm: 0 })
  assert.deepEqual(cornerList(room([desk, wardrobe])), [])
  // 옷장이 책상보다 얕으면 책상 꼭짓점이 튀어나온다
  assert.deepEqual(cornerList(room([desk, { ...wardrobe, depthCm: 40 }])), [[120, 60]])
  // 책상보다 낮은 침대 옆이면 꼭짓점이 그대로 드러난다
  const bed = item({ id: 'bed', category: 'bed', widthCm: 115, depthCm: 205, heightCm: 45, xCm: 120, yCm: 0 })
  assert.deepEqual(cornerList(room([desk, bed])), [[120, 60]])
  // 의자는 자주 옮기고 다리 사이가 비어 있어서 가린 것으로 보지 않는다
  const chair = item({ id: 'chair', category: 'chair', widthCm: 50, depthCm: 50, heightCm: 85, xCm: 120, yCm: 40 })
  assert.deepEqual(cornerList(room([desk, chair])), [[120, 60]])
})

test('빨간 점: 예시 방에서는 책상의 방 쪽 꼭짓점 한 곳이에요', () => {
  const example = createExampleProject().rooms[0]
  assert.deepEqual(sharpCornerMarkers(example), [{ furnitureId: 'furn_desk_1', xCm: 120, yCm: 60, heightCm: 72 }])
})

test('빨간 점: validator.js의 아이 안전 참고값과 어긋나지 않아요', () => {
  // 키 큰 가구(넘어짐 팁 대상)의 윗모서리는 아이 머리보다 높아서 표시하지 않는다
  assert.ok(EYE_REFERENCE.cornerMaxCm < REFERENCE.tallFurnitureCm)
  // 아이 눈높이는 표시하는 높이대 안에 있다
  assert.ok(EYE_REFERENCE.childEyeCm > EYE_REFERENCE.cornerMinCm && EYE_REFERENCE.childEyeCm < EYE_REFERENCE.cornerMaxCm)
  // 카탈로그에서 뾰족한 모서리가 있다고 적힌 가구(validator의 CHILD_SHARP_CORNER 대상)는 모두 높이대 안이다
  const sharp = CATALOG.filter((entry) => entry.hasSharpCorner)
  assert.ok(sharp.length > 0)
  for (const entry of sharp) {
    assert.ok(
      entry.heightCm >= EYE_REFERENCE.cornerMinCm && entry.heightCm <= EYE_REFERENCE.cornerMaxCm,
      `${entry.name}(높이 ${entry.heightCm}cm)이 높이대 밖이에요`,
    )
  }
})

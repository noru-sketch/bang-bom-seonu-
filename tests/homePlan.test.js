// 평면도 사진 → 집 구조(homePlan.js) 테스트: AI가 준 어림값을 코드가 검사·정리한다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { HOME_LIMITS, sanitizeHome } from '../src/engine/homePlan.js'

const GOOD = {
  widthCm: 1040, depthCm: 860, entrySide: 'E',
  rooms: [
    { type: 'living', xCm: 340, yCm: 360, widthCm: 400, depthCm: 500 },
    { type: 'bed', xCm: 0, yCm: 540, widthCm: 340, depthCm: 320 },
    { type: 'bed', xCm: 740, yCm: 360, widthCm: 300, depthCm: 500 },
    { type: 'kitchen', xCm: 340, yCm: 0, widthCm: 400, depthCm: 360 },
    { type: 'bath', xCm: 740, yCm: 0, widthCm: 300, depthCm: 200 },
  ],
}

test('평면도 사진: 바른 값은 m 단위 집 구조가 되고, 침실 id는 큰 순서, 닫힌 방에는 문이 생겨요', () => {
  const L = sanitizeHome(GOOD)
  assert.ok(L)
  assert.equal(L.W, 10.4)
  assert.equal(L.D, 8.6)
  assert.equal(L.entry.side, 'E')
  assert.equal(L.fromPhoto, true)
  assert.deepEqual(L.rooms.map((r) => r.id), ['liv', 'r2', 'r1', 'kit', 'bath'])
  const liv = L.rooms.find((r) => r.id === 'liv')
  assert.equal(liv?.open, true)
  const bath = L.rooms.find((r) => r.id === 'bath')
  assert.ok(bath?.door)
  assert.equal(bath?.open, undefined)
})

test('평면도 사진: 망가진 값, 너무 작은 방, 같은 방 두 번, 모르는 종류는 버려요', () => {
  const L = sanitizeHome({
    widthCm: 900, depthCm: 700,
    rooms: [
      { type: 'living', xCm: 0, yCm: 0, widthCm: 400, depthCm: 400 },
      { type: 'living', xCm: 10, yCm: 10, widthCm: 395, depthCm: 390 },
      { type: 'bed', xCm: 500, yCm: 0, widthCm: 50, depthCm: 300 },
      { type: 'garage', xCm: 0, yCm: 400, widthCm: 300, depthCm: 300 },
      { type: 'bed', xCm: NaN, yCm: 0, widthCm: 300, depthCm: 300 },
      { type: 'bed', xCm: '1', yCm: 0, widthCm: 300, depthCm: 300 },
      null, 'x',
    ],
  })
  assert.ok(L)
  assert.deepEqual(L.rooms.map((r) => r.id), ['liv'])
})

test('평면도 사진: 크기는 범위 안으로, 방은 집 밖으로 나가지 않고, 14개까지만 받아요', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ type: 'bed', xCm: (i % 8) * 120, yCm: Math.floor(i / 8) * 120, widthCm: 110, depthCm: 110 }))
  const L = sanitizeHome({ widthCm: 3000, depthCm: 10, rooms: [{ type: 'living', xCm: 2900, yCm: 0, widthCm: 900, depthCm: 900 }, ...many] })
  assert.ok(L)
  assert.equal(L.W, HOME_LIMITS.maxSideCm / 100)
  assert.equal(L.D, HOME_LIMITS.minSideCm / 100)
  assert.ok(L.rooms.length <= HOME_LIMITS.maxRooms)
  for (const r of L.rooms) {
    assert.ok(r.x + r.w <= L.W + 1e-9 && r.z + r.d <= L.D + 1e-9, r.id)
  }
})

test('평면도 사진: 거실이나 침실이 없거나 모양이 틀리면 null이에요', () => {
  assert.equal(sanitizeHome(null), null)
  assert.equal(sanitizeHome({ widthCm: 800, depthCm: 600, rooms: 'x' }), null)
  assert.equal(sanitizeHome({ widthCm: 800, depthCm: 600, rooms: [{ type: 'bath', xCm: 0, yCm: 0, widthCm: 200, depthCm: 200 }] }), null)
  assert.equal(sanitizeHome({ widthCm: 'a', depthCm: 600, rooms: GOOD.rooms }), null)
})

test('평면도 사진: 치수를 mm로 읽어 오면(집이 30m 넘음) cm로 바꿔요', () => {
  const L = sanitizeHome({ ...GOOD, widthCm: 10400, depthCm: 8600, rooms: GOOD.rooms.map((r) => ({ ...r, xCm: r.xCm * 10, yCm: r.yCm * 10, widthCm: r.widthCm * 10, depthCm: r.depthCm * 10 })) })
  assert.deepEqual(L, sanitizeHome(GOOD))
})

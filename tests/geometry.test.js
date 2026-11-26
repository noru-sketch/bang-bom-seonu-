// 좌표·도형 계산(geometry.js) 테스트.

/** @import { Opening, Rotation } from '../src/types/schema.ts' */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OVERLAP_TOLERANCE_CM,
  footprint,
  footprintSize,
  overlapCm,
  rectsOverlap,
  isInsideRoom,
  clampToRoom,
  frontDirection,
  frontZone,
  backWall,
  openingSpan,
  openingFrontZone,
  doorSwingZone,
  gapBetween,
  distanceToWalls,
  rotateInPlace,
  nextRotation,
  toModelPlacement,
} from '../src/engine/geometry.js'

const room = { widthCm: 300, depthCm: 400 }

/** @param {Rotation} rotation */
function desk(rotation) {
  return { xCm: 100, yCm: 100, widthCm: 120, depthCm: 60, rotation, clearanceFrontCm: 50 }
}

/** @param {number} xCm @param {number} yCm @param {number} widthCm @param {number} depthCm */
function rect(xCm, yCm, widthCm, depthCm) {
  return { xCm, yCm, widthCm, depthCm }
}

test('footprint: 회전 0·180은 크기 그대로, 90·270은 가로와 깊이가 바뀌어요', () => {
  assert.deepEqual(footprint(desk(0)), rect(100, 100, 120, 60))
  assert.deepEqual(footprint(desk(180)), rect(100, 100, 120, 60))
  assert.deepEqual(footprint(desk(90)), rect(100, 100, 60, 120))
  assert.deepEqual(footprint(desk(270)), rect(100, 100, 60, 120))
  assert.deepEqual(footprintSize(desk(90)), { widthCm: 60, depthCm: 120 })
})

test('겹침 허용값: 맞닿은 것은 겹침이 아니고 1cm부터 겹침이에요', () => {
  assert.equal(OVERLAP_TOLERANCE_CM, 1)
  const a = rect(0, 0, 100, 100)
  assert.equal(rectsOverlap(a, rect(100, 0, 50, 50)), false)
  assert.equal(rectsOverlap(a, rect(99.5, 0, 50, 50)), false)
  assert.equal(rectsOverlap(a, rect(99, 0, 50, 50)), true)
  assert.equal(rectsOverlap(a, rect(99, 99.5, 50, 50)), false)
  assert.equal(rectsOverlap(a, rect(90, 90, 50, 50), 20), false)
  assert.deepEqual(overlapCm(a, rect(90, 70, 50, 50)), { xCm: 10, yCm: 30 })
  assert.deepEqual(overlapCm(a, rect(200, 200, 50, 50)), { xCm: 0, yCm: 0 })
})

test('frontZone: 네 회전 모두 정면 쪽에 사용 공간이 생겨요', () => {
  assert.deepEqual(frontDirection(0), { dx: 0, dy: 1 })
  assert.deepEqual(frontDirection(90), { dx: 1, dy: 0 })
  assert.deepEqual(frontDirection(180), { dx: 0, dy: -1 })
  assert.deepEqual(frontDirection(270), { dx: -1, dy: 0 })
  assert.deepEqual(frontZone(desk(0)), rect(100, 160, 120, 50))
  assert.deepEqual(frontZone(desk(90)), rect(160, 100, 50, 120))
  assert.deepEqual(frontZone(desk(180)), rect(100, 50, 120, 50))
  assert.deepEqual(frontZone(desk(270)), rect(50, 100, 50, 120))
  assert.deepEqual(frontZone(desk(0), 10), rect(100, 160, 120, 10))
  assert.equal(frontZone({ ...desk(0), clearanceFrontCm: 0 }), null)
})

test('rotateInPlace: 돌려도 가운데가 그대로예요', () => {
  /** @type {Rotation[]} */
  const rotations = [0, 90, 180, 270]
  for (const from of rotations) {
    for (const to of rotations) {
      const before = footprint(desk(from))
      const moved = rotateInPlace(desk(from), to)
      const after = footprint({ ...desk(from), ...moved })
      assert.equal(moved.rotation, to)
      assert.equal(after.xCm + after.widthCm / 2, before.xCm + before.widthCm / 2)
      assert.equal(after.yCm + after.depthCm / 2, before.yCm + before.depthCm / 2)
    }
  }
  assert.deepEqual(rotateInPlace(desk(0), 90), { xCm: 130, yCm: 70, rotation: 90 })
  assert.deepEqual([0, 90, 180, 270].map((r) => nextRotation(/** @type {Rotation} */ (r))), [90, 180, 270, 0])
})

test('toModelPlacement: 방 가운데가 원점이고 단위는 m, 회전은 라디안이에요', () => {
  const center = toModelPlacement({ xCm: 90, yCm: 170, widthCm: 120, depthCm: 60, rotation: 0 }, room)
  assert.deepEqual(center, { x: 0, z: 0, rotation_y: 0 })
  const corner = toModelPlacement({ xCm: 0, yCm: 0, widthCm: 120, depthCm: 60, rotation: 90 }, room)
  assert.equal(corner.x, -1.2)
  assert.equal(corner.z, -1.4)
  assert.equal(corner.rotation_y, Math.PI / 2)
  assert.equal(toModelPlacement(desk(270), room).rotation_y, (3 * Math.PI) / 2)
})

test('gapBetween: 마주 보는 두 직사각형의 틈과 마주 보는 길이를 알려 줘요', () => {
  const a = rect(0, 0, 100, 100)
  assert.deepEqual(gapBetween(a, rect(128, 40, 50, 100)), { axis: 'x', gapCm: 28, facingCm: 60 })
  assert.deepEqual(gapBetween(rect(128, 40, 50, 100), a), { axis: 'x', gapCm: 28, facingCm: 60 })
  assert.deepEqual(gapBetween(a, rect(20, 130, 50, 50)), { axis: 'y', gapCm: 30, facingCm: 50 })
  assert.deepEqual(gapBetween(a, rect(100, 0, 50, 100)), { axis: 'x', gapCm: 0, facingCm: 100 })
  // 대각선으로 떨어져 있거나 겹쳐 있으면 틈이 아니다
  assert.equal(gapBetween(a, rect(150, 150, 50, 50)), null)
  assert.equal(gapBetween(a, rect(50, 50, 100, 100)), null)
})

test('doorSwingZone: 안으로 열리는 문만 문 폭 × 문 폭 자리를 써요', () => {
  /** @type {Opening} */
  const door = { id: 'd', type: 'door', wall: 'bottom', offsetCm: 20, widthCm: 90, sillHeightCm: 0, swingInward: true }
  assert.deepEqual(doorSwingZone(door, room), rect(20, 310, 90, 90))
  assert.deepEqual(doorSwingZone({ ...door, wall: 'top' }, room), rect(20, 0, 90, 90))
  assert.deepEqual(doorSwingZone({ ...door, wall: 'left' }, room), rect(0, 20, 90, 90))
  assert.deepEqual(doorSwingZone({ ...door, wall: 'right' }, room), rect(210, 20, 90, 90))
  assert.equal(doorSwingZone({ ...door, swingInward: false }, room), null)
  assert.equal(doorSwingZone({ ...door, type: 'window' }, room), null)
})

test('openingSpan·openingFrontZone: 벽에 따라 축과 앞 공간이 달라져요', () => {
  assert.deepEqual(openingSpan({ wall: 'top', offsetCm: 80, widthCm: 150 }), { axis: 'x', startCm: 80, endCm: 230 })
  assert.deepEqual(openingSpan({ wall: 'right', offsetCm: 50, widthCm: 100 }), { axis: 'y', startCm: 50, endCm: 150 })
  assert.deepEqual(openingFrontZone({ wall: 'top', offsetCm: 80, widthCm: 150 }, room, 20), rect(80, 0, 150, 20))
  assert.deepEqual(openingFrontZone({ wall: 'right', offsetCm: 50, widthCm: 100 }, room, 20), rect(280, 50, 20, 100))
})

test('clampToRoom·isInsideRoom: 방 밖으로 나간 좌표를 안으로 넣어요', () => {
  assert.deepEqual(clampToRoom(rect(-30, 380, 100, 50), room), { xCm: 0, yCm: 350 })
  assert.deepEqual(clampToRoom(rect(250, -5, 100, 50), room), { xCm: 200, yCm: 0 })
  assert.deepEqual(clampToRoom(rect(50, 60, 100, 50), room), { xCm: 50, yCm: 60 })
  // 방보다 큰 가구는 (0, 0)에 붙인다
  assert.deepEqual(clampToRoom(rect(40, 40, 500, 500), room), { xCm: 0, yCm: 0 })
  assert.equal(isInsideRoom(rect(200, 350, 100, 50), room), true)
  assert.equal(isInsideRoom(rect(201, 350, 100, 50), room), false)
  assert.equal(isInsideRoom(rect(201, 350, 100, 50), room, 1), true)
})

test('backWall·distanceToWalls: 뒤쪽 벽과 네 벽까지의 거리를 알려 줘요', () => {
  const bed = { xCm: 185, yCm: 0, widthCm: 115, depthCm: 205, rotation: /** @type {Rotation} */ (0) }
  assert.deepEqual(backWall(bed, room), { wall: 'top', gapCm: 0 })
  assert.deepEqual(backWall({ ...bed, rotation: 180 }, room, 200), { wall: 'bottom', gapCm: 195 })
  assert.equal(backWall({ ...bed, rotation: 180 }, room), null)
  assert.deepEqual(backWall({ ...bed, xCm: 30, rotation: 90 }, room, 40), { wall: 'left', gapCm: 30 })
  assert.deepEqual(distanceToWalls(footprint(bed), room), { top: 0, bottom: 195, left: 185, right: 0 })
})

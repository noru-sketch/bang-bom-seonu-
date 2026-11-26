// 좌표와 도형 계산의 기초. 모든 계산 모듈과 2D·3D 화면이 이 약속을 같이 쓴다.
//
// 약속 (docs/ARCHITECTURE.md 2장):
// - 방 안쪽 왼쪽 위가 (0, 0). x는 오른쪽, y는 아래쪽으로 커진다. 단위는 cm.
// - 가구의 widthCm·depthCm은 회전 0일 때의 크기다. 회전 90·270이면 바닥 차지 크기가 서로 바뀐다.
// - 가구의 (xCm, yCm)은 회전을 반영한 바닥 차지 영역(직사각형)의 왼쪽 위다.
// - 정면 방향: 회전 0은 아래(+y), 90은 오른쪽(+x), 180은 위(-y), 270은 왼쪽(-x).
//   정면은 사람이 쓰는 쪽이다(책상은 의자 쪽, 옷장·서랍장은 문 쪽, 침대는 발치. 침대 머리는 뒤쪽).

/** @import { FurnitureItem, Room, Opening, Rect, Rotation } from '../types/schema.ts' */

/** 겹침으로 판정하는 최소 길이(cm). 맞닿기만 한 배치는 겹침이 아니다. */
export const OVERLAP_TOLERANCE_CM = 1

/**
 * 회전을 반영한 바닥 차지 크기.
 * @param {Pick<FurnitureItem, 'widthCm' | 'depthCm' | 'rotation'>} item
 * @returns {{ widthCm: number, depthCm: number }}
 */
export function footprintSize(item) {
  const turned = item.rotation === 90 || item.rotation === 270
  return turned
    ? { widthCm: item.depthCm, depthCm: item.widthCm }
    : { widthCm: item.widthCm, depthCm: item.depthCm }
}

/**
 * 회전을 반영한 바닥 차지 영역.
 * @param {Pick<FurnitureItem, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'rotation'>} item
 * @returns {Rect}
 */
export function footprint(item) {
  const size = footprintSize(item)
  return { xCm: item.xCm, yCm: item.yCm, widthCm: size.widthCm, depthCm: size.depthCm }
}

/**
 * 두 직사각형이 겹친 가로·세로 길이. 겹치지 않는 방향은 0.
 * @param {Rect} a
 * @param {Rect} b
 * @returns {{ xCm: number, yCm: number }}
 */
export function overlapCm(a, b) {
  const x = Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm) - Math.max(a.xCm, b.xCm)
  const y = Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm) - Math.max(a.yCm, b.yCm)
  return { xCm: Math.max(0, x), yCm: Math.max(0, y) }
}

/**
 * 두 직사각형이 가로·세로 모두 toleranceCm 이상 겹치면 true.
 * @param {Rect} a
 * @param {Rect} b
 * @param {number} [toleranceCm]
 */
export function rectsOverlap(a, b, toleranceCm = OVERLAP_TOLERANCE_CM) {
  const o = overlapCm(a, b)
  return o.xCm >= toleranceCm && o.yCm >= toleranceCm
}

/**
 * 직사각형이 방 안에 다 들어가면 true.
 * @param {Rect} rect
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @param {number} [toleranceCm] 이만큼까지는 벗어나도 안으로 본다
 */
export function isInsideRoom(rect, room, toleranceCm = 0) {
  return (
    rect.xCm >= -toleranceCm &&
    rect.yCm >= -toleranceCm &&
    rect.xCm + rect.widthCm <= room.widthCm + toleranceCm &&
    rect.yCm + rect.depthCm <= room.depthCm + toleranceCm
  )
}

/**
 * 직사각형이 방 밖으로 나가지 않도록 왼쪽 위 좌표를 고친다. 방보다 크면 (0, 0)에 붙인다.
 * @param {Rect} rect
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @returns {{ xCm: number, yCm: number }}
 */
export function clampToRoom(rect, room) {
  const maxX = Math.max(0, room.widthCm - rect.widthCm)
  const maxY = Math.max(0, room.depthCm - rect.depthCm)
  return {
    xCm: Math.min(Math.max(0, rect.xCm), maxX),
    yCm: Math.min(Math.max(0, rect.yCm), maxY),
  }
}

/**
 * 정면이 향하는 방향(단위 벡터).
 * @param {Rotation} rotation
 * @returns {{ dx: -1 | 0 | 1, dy: -1 | 0 | 1 }}
 */
export function frontDirection(rotation) {
  if (rotation === 90) return { dx: 1, dy: 0 }
  if (rotation === 180) return { dx: 0, dy: -1 }
  if (rotation === 270) return { dx: -1, dy: 0 }
  return { dx: 0, dy: 1 }
}

/**
 * 가구 정면 앞의 사용 공간(직사각형). 깊이가 0 이하면 null.
 * @param {Pick<FurnitureItem, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'rotation' | 'clearanceFrontCm'>} item
 * @param {number} [depthCm] 생략하면 item.clearanceFrontCm
 * @returns {Rect | null}
 */
export function frontZone(item, depthCm = item.clearanceFrontCm) {
  if (!(depthCm > 0)) return null
  const body = footprint(item)
  const { dx, dy } = frontDirection(item.rotation)
  if (dy === 1) return { xCm: body.xCm, yCm: body.yCm + body.depthCm, widthCm: body.widthCm, depthCm }
  if (dy === -1) return { xCm: body.xCm, yCm: body.yCm - depthCm, widthCm: body.widthCm, depthCm }
  if (dx === 1) return { xCm: body.xCm + body.widthCm, yCm: body.yCm, widthCm: depthCm, depthCm: body.depthCm }
  return { xCm: body.xCm - depthCm, yCm: body.yCm, widthCm: depthCm, depthCm: body.depthCm }
}

/**
 * 가구 뒤쪽(정면의 반대쪽) 변이 닿아 있는 벽. 침대 머리 위치를 볼 때 쓴다. 벽에서 maxGapCm 안이면 닿은 것으로 본다.
 * @param {Pick<FurnitureItem, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'rotation'>} item
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @param {number} [maxGapCm]
 * @returns {{ wall: 'top' | 'bottom' | 'left' | 'right', gapCm: number } | null}
 */
export function backWall(item, room, maxGapCm = 0) {
  const body = footprint(item)
  const { dx, dy } = frontDirection(item.rotation)
  /** @type {{ wall: 'top' | 'bottom' | 'left' | 'right', gapCm: number }} */
  let back
  if (dy === 1) back = { wall: 'top', gapCm: body.yCm }
  else if (dy === -1) back = { wall: 'bottom', gapCm: room.depthCm - (body.yCm + body.depthCm) }
  else if (dx === 1) back = { wall: 'left', gapCm: body.xCm }
  else back = { wall: 'right', gapCm: room.widthCm - (body.xCm + body.widthCm) }
  return back.gapCm <= maxGapCm ? back : null
}

/**
 * 문·창문이 벽에서 차지하는 구간. 위·아래 벽은 x 범위, 왼·오른쪽 벽은 y 범위다.
 * @param {Pick<Opening, 'wall' | 'offsetCm' | 'widthCm'>} opening
 * @returns {{ axis: 'x' | 'y', startCm: number, endCm: number }}
 */
export function openingSpan(opening) {
  const axis = opening.wall === 'top' || opening.wall === 'bottom' ? 'x' : 'y'
  return { axis, startCm: opening.offsetCm, endCm: opening.offsetCm + opening.widthCm }
}

/**
 * 문·창문 앞에서 방 안쪽으로 depthCm만큼 들어온 직사각형.
 * @param {Pick<Opening, 'wall' | 'offsetCm' | 'widthCm'>} opening
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @param {number} depthCm
 * @returns {Rect}
 */
export function openingFrontZone(opening, room, depthCm) {
  if (opening.wall === 'top') return { xCm: opening.offsetCm, yCm: 0, widthCm: opening.widthCm, depthCm }
  if (opening.wall === 'bottom') {
    return { xCm: opening.offsetCm, yCm: room.depthCm - depthCm, widthCm: opening.widthCm, depthCm }
  }
  if (opening.wall === 'left') return { xCm: 0, yCm: opening.offsetCm, widthCm: depthCm, depthCm: opening.widthCm }
  return { xCm: room.widthCm - depthCm, yCm: opening.offsetCm, widthCm: depthCm, depthCm: opening.widthCm }
}

/**
 * 안쪽으로 열리는 문이 쓸고 지나가는 공간. SCHEMA에 경첩 방향이 없어서 문 폭 × 문 폭 정사각형으로 본다.
 * 창문이거나 바깥으로 열리는 문이면 null.
 * @param {Opening} opening
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @returns {Rect | null}
 */
export function doorSwingZone(opening, room) {
  if (opening.type !== 'door' || !opening.swingInward) return null
  return openingFrontZone(opening, room, opening.widthCm)
}

/**
 * 나란히 놓인 두 직사각형 사이의 틈. 한 방향으로 서로 마주 볼 때(다른 방향의 범위가 겹칠 때)만 값을 준다.
 * @param {Rect} a
 * @param {Rect} b
 * @returns {{ axis: 'x' | 'y', gapCm: number, facingCm: number } | null} facingCm은 마주 보는 길이
 */
export function gapBetween(a, b) {
  const o = overlapCm(a, b)
  if (o.yCm > 0 && o.xCm === 0) {
    const gap = Math.max(a.xCm, b.xCm) - Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm)
    return { axis: 'x', gapCm: Math.max(0, gap), facingCm: o.yCm }
  }
  if (o.xCm > 0 && o.yCm === 0) {
    const gap = Math.max(a.yCm, b.yCm) - Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm)
    return { axis: 'y', gapCm: Math.max(0, gap), facingCm: o.xCm }
  }
  return null
}

/**
 * 직사각형에서 네 벽까지의 거리.
 * @param {Rect} rect
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @returns {{ top: number, bottom: number, left: number, right: number }}
 */
export function distanceToWalls(rect, room) {
  return {
    top: rect.yCm,
    bottom: room.depthCm - (rect.yCm + rect.depthCm),
    left: rect.xCm,
    right: room.widthCm - (rect.xCm + rect.widthCm),
  }
}

/**
 * 가운데를 그대로 두고 회전했을 때의 새 위치(cm 정수).
 * @param {Pick<FurnitureItem, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'rotation'>} item
 * @param {Rotation} nextRotation
 * @returns {{ xCm: number, yCm: number, rotation: Rotation }}
 */
export function rotateInPlace(item, nextRotation) {
  const before = footprint(item)
  const after = footprintSize({ widthCm: item.widthCm, depthCm: item.depthCm, rotation: nextRotation })
  const centerX = before.xCm + before.widthCm / 2
  const centerY = before.yCm + before.depthCm / 2
  return {
    xCm: Math.round(centerX - after.widthCm / 2),
    yCm: Math.round(centerY - after.depthCm / 2),
    rotation: nextRotation,
  }
}

/**
 * 다음 회전 값(반시계 방향으로 90도).
 * @param {Rotation} rotation
 * @returns {Rotation}
 */
export function nextRotation(rotation) {
  if (rotation === 0) return 90
  if (rotation === 90) return 180
  if (rotation === 180) return 270
  return 0
}

/**
 * 3D 장면용 좌표(MODEL_SPEC B: 1 = 1m, 방 바닥 가운데가 원점, +Y가 위, 회전은 Y축 라디안).
 * @param {Pick<FurnitureItem, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'rotation'>} item
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @returns {{ x: number, z: number, rotation_y: number }}
 */
export function toModelPlacement(item, room) {
  const body = footprint(item)
  return {
    x: (body.xCm + body.widthCm / 2 - room.widthCm / 2) / 100,
    z: (body.yCm + body.depthCm / 2 - room.depthCm / 2) / 100,
    rotation_y: (item.rotation * Math.PI) / 180,
  }
}

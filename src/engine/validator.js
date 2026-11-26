// 배치 검사기. 3단계 피드백(확실한 문제 / 개선 제안 / 좋은 점)을 만든다. 숫자 평가는 만들지 않는다.
//
// - 1단계(errors): 코드가 확실하게 판정할 수 있는 물리 문제만 넣는다. 애매하면 넣지 않는다.
// - 2단계(tips): 인테리어 관습과 아이 안전 참고 체크. 벽이나 가구에 딱 붙인 배치(0cm)는 아무 말도 하지 않는다.
// - strengths: 실제로 확인한 사실만. 문제나 제안이 걸린 가구는 칭찬하지 않는다.
// 좌표 계산은 전부 geometry.js의 도우미를 쓴다.

/** @import { Room, FurnitureItem, Opening, Rect, Lifestyle, ValidationResult, ValidationError, ValidationTip, MatZone } from '../types/schema.ts' */

import {
  footprint,
  overlapCm,
  rectsOverlap,
  isInsideRoom,
  frontZone,
  frontDirection,
  backWall,
  openingSpan,
  openingFrontZone,
  doorSwingZone,
  gapBetween,
  distanceToWalls,
} from './geometry.js'

/** 검사에 쓰는 기준값(cm). 통로·사용 공간 값은 법적 기준이 아니라 참고값이다. */
export const REFERENCE = Object.freeze({
  /** 통로 폭 참고값 */
  passageCm: 60,
  /** 이보다 좁으면 사람이 지나갈 수 없다고 본다(접근 불가 판정) */
  minPassageCm: 30,
  /** 서랍·옷장 문 앞 참고값 */
  drawerFrontCm: 50,
  /** 책상·식탁 의자 공간 참고값 */
  chairFrontCm: 60,
  deadSpaceMinCm: 5,
  deadSpaceMaxCm: 50,
  /** 마주 보는 길이가 이보다 짧으면 틈으로 보지 않는다 */
  facingMinCm: 20,
  /** 맞닿았다고 보는 최대 틈 */
  touchCm: 1,
  windowFrontCm: 20,
  bedHeadWindowCm: 40,
  /** 시선을 가리는 가구, 넘어질 위험을 보는 가구의 높이 */
  tallFurnitureCm: 120,
  deskWindowCm: 60,
  childTipRiskCm: 60,
  childClimbMinCm: 30,
  childClimbMaxCm: 80,
  childNarrowCm: 70,
  matZoneMinCm: 120,
  /** 통로 탐색 격자 */
  gridCm: 5,
})

/**
 * @typedef {{ item: FurnitureItem, body: Rect }} Entry
 * @typedef {{ walkerCm: number, xs: number[], ys: number[], reached: Uint8Array }} Access
 */

/**
 * 방의 가구 배치를 검사한다.
 * @param {Room} room
 * @param {{ lifestyle?: Lifestyle }} [options]
 * @returns {ValidationResult}
 */
export function validateRoom(room, options) {
  const family = options?.lifestyle === 'family_child'
  /** @type {Entry[]} */
  const entries = room.furniture.map((item) => ({ item, body: footprint(item) }))
  // 매트는 바닥에 깔리는 것이라 겹침·막힘에서 뺀다
  const solid = entries.filter((e) => e.item.category !== 'mat')
  // 의자는 움직이는 가구라 통로·틈·사용 공간 판정에서 뺀다
  const blockers = solid.filter((e) => e.item.category !== 'chair')
  const entrance = room.openings.find((o) => o.type === 'door') ?? null
  const windows = room.openings.filter((o) => o.type === 'window')

  /** @type {ValidationError[]} */
  const errors = []
  /** @type {ValidationTip[]} */
  const tips = []

  checkOverlap(solid, errors)
  checkOutOfBounds(entries, room, errors)
  checkDoorBlocked(solid, room, errors)
  const clearanceIds = checkClearance(entries, blockers, solid, errors)
  checkWindowBlocked(solid, windows, room, errors)
  const passage = checkPassage(blockers, room, entrance, clearanceIds, errors, tips)

  checkDeadSpace(blockers, solid, tips)
  checkBedUnderWindow(solid, windows, room, tips)
  const sightlineChecked = checkSightline(solid, entrance, room, tips)
  checkBedDeskAdjacent(solid, tips)

  /** @type {MatZone | null} */
  let matZone = null
  if (family) {
    checkChildSafety(entries, solid, blockers, windows, room, tips)
    matZone = findMatZone(solid, room)
  }

  const strengths = collectStrengths({ entries, solid, windows, room, errors, tips, passage, sightlineChecked })
  return { errors, tips, strengths, matZone }
}

// ── 글 도우미 ───────────────────────────────────────────────────────────

/**
 * 받침에 맞는 조사를 붙인다. 한글로 끝나지 않으면 받침 없는 쪽을 쓴다.
 * @param {string} word
 * @param {string} withFinal 받침이 있을 때 (이, 은, 과, 을)
 * @param {string} withoutFinal 받침이 없을 때 (가, 는, 와, 를)
 */
function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1)
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
  return word + (hasFinal ? withFinal : withoutFinal)
}

/** @param {number} value */
function cm(value) {
  return `${Math.round(value)}cm`
}

/** @param {Entry[]} list */
function names(list) {
  return list.map((e) => e.item.name).join(', ')
}

/** @param {Rect} a @param {Rect} b 두 직사각형 사이의 가장 가까운 거리 */
function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.xCm, b.xCm) - Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm))
  const dy = Math.max(0, Math.max(a.yCm, b.yCm) - Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm))
  return Math.hypot(dx, dy)
}

// ── 1단계: 확실한 문제 ──────────────────────────────────────────────────

/** @param {Entry[]} solid @param {ValidationError[]} errors */
function checkOverlap(solid, errors) {
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]
      const b = solid[j]
      if (isChairUnderTable(a.item, b.item) || isChairUnderTable(b.item, a.item)) continue
      if (!rectsOverlap(a.body, b.body)) continue
      const o = overlapCm(a.body, b.body)
      errors.push({
        code: 'OVERLAP',
        severity: 'error',
        furnitureIds: [a.item.id, b.item.id],
        title: `${josa(a.item.name, '과', '와')} ${josa(b.item.name, '이', '가')} 겹쳐요`,
        message: `가로 ${cm(o.xCm)}, 세로 ${cm(o.yCm)}만큼 겹쳐 있어요. 둘 중 하나를 옮겨 주세요.`,
      })
    }
  }
}

/** 의자는 책상·테이블 밑으로 밀어 넣을 수 있다. @param {FurnitureItem} chair @param {FurnitureItem} other */
function isChairUnderTable(chair, other) {
  return chair.category === 'chair' && (other.category === 'desk' || other.category === 'table')
}

/** @param {Entry[]} entries @param {Room} room @param {ValidationError[]} errors */
function checkOutOfBounds(entries, room, errors) {
  for (const e of entries) {
    if (isInsideRoom(e.body, room)) continue
    const d = distanceToWalls(e.body, room)
    const outCm = Math.max(-d.top, -d.bottom, -d.left, -d.right)
    errors.push({
      code: 'OUT_OF_BOUNDS',
      severity: 'error',
      furnitureIds: [e.item.id],
      title: `${josa(e.item.name, '이', '가')} 방 밖으로 나갔어요`,
      message: `벽 밖으로 ${cm(outCm)} 나가 있어요. 방 안쪽으로 옮겨 주세요.`,
    })
  }
}

/** @param {Entry[]} solid @param {Room} room @param {ValidationError[]} errors */
function checkDoorBlocked(solid, room, errors) {
  for (const opening of room.openings) {
    const zone = doorSwingZone(opening, room)
    if (!zone) continue
    for (const e of solid) {
      if (!rectsOverlap(e.body, zone)) continue
      const o = overlapCm(e.body, zone)
      errors.push({
        code: 'DOOR_BLOCKED',
        severity: 'error',
        furnitureIds: [e.item.id],
        title: `${josa(e.item.name, '이', '가')} 문 열리는 자리를 막아요`,
        message: `문이 열리는 공간(폭 ${cm(opening.widthCm)})에 가로 ${cm(o.xCm)}, 세로 ${cm(o.yCm)}만큼 들어와 있어요. 문이 다 열리지 않아요.`,
      })
    }
  }
}

/**
 * 가구 정면에서 방해물(다른 가구)까지 비어 있는 거리.
 * @param {Entry} e @param {Rect} other
 */
function frontFreeCm(e, other) {
  const { dx, dy } = frontDirection(e.item.rotation)
  if (dy === 1) return other.yCm - (e.body.yCm + e.body.depthCm)
  if (dy === -1) return e.body.yCm - (other.yCm + other.depthCm)
  if (dx === 1) return other.xCm - (e.body.xCm + e.body.widthCm)
  return e.body.xCm - (other.xCm + other.widthCm)
}

/**
 * 정면 사용 공간에서 방해물이 하나도 없이 남은 가장 넓은 폭(가구 정면 변을 따라 잰다).
 * @param {Entry} e @param {Rect} zone @param {Entry[]} inFront
 */
function widestFreeCm(e, zone, inFront) {
  const alongX = frontDirection(e.item.rotation).dy !== 0
  const zoneStart = alongX ? zone.xCm : zone.yCm
  const zoneEnd = zoneStart + (alongX ? zone.widthCm : zone.depthCm)
  const spans = inFront
    .map((b) => {
      const start = alongX ? b.body.xCm : b.body.yCm
      return [start, start + (alongX ? b.body.widthCm : b.body.depthCm)]
    })
    .sort((p, q) => p[0] - q[0])
  let widest = 0
  let cursor = zoneStart
  for (const [start, end] of spans) {
    if (start > cursor) widest = Math.max(widest, Math.min(start, zoneEnd) - cursor)
    cursor = Math.max(cursor, end)
  }
  return Math.max(widest, zoneEnd - cursor, 0)
}

/**
 * 정면 사용 공간(서랍·옷장 문, 의자 자리)에 다른 가구가 들어와 있는지 본다.
 * 벽은 문제로 보지 않는다. 정면이 벽에 가깝거나 딱 붙어도 아무 말도 하지 않는다.
 * @param {Entry[]} entries @param {Entry[]} blockers @param {Entry[]} solid @param {ValidationError[]} errors
 * @returns {Set<string>} 이 문제가 걸린 가구 id
 */
function checkClearance(entries, blockers, solid, errors) {
  /** @type {Set<string>} */
  const flagged = new Set()
  // 책상·테이블에 앉는 자리(밑이나 정면 공간)에 있는 의자는 쓰는 중인 의자라 막힘으로 보지 않는다.
  // 그 밖의 자리에 놓인 의자는 옷장·서랍장 앞을 막는 가구로 본다.
  const seats = solid.filter((s) => s.item.category === 'desk' || s.item.category === 'table')
  const strayChairs = solid.filter((c) => {
    if (c.item.category !== 'chair') return false
    return !seats.some((s) => {
      if (rectsOverlap(c.body, s.body)) return true
      const seatZone = frontZone(s.item, s.item.clearanceFrontCm > 0 ? s.item.clearanceFrontCm : REFERENCE.chairFrontCm)
      return seatZone !== null && rectsOverlap(c.body, seatZone)
    })
  })
  for (const e of entries) {
    if (e.item.category === 'mat') continue
    const need = e.item.clearanceFrontCm
    const zone = frontZone(e.item)
    if (!zone) continue
    const isSeat = e.item.category === 'desk' || e.item.category === 'table'
    const candidates = isSeat ? blockers : [...blockers, ...strayChairs]
    const inFront = candidates.filter((b) => b !== e && rectsOverlap(zone, b.body))
    if (inFront.length === 0) continue

    // 책상·테이블은 정면 한쪽만 가려져도 의자 자리(폭 60cm 참고값)가 남으면 쓸 수 있다
    let freeWidthCm = 0
    if (isSeat) {
      freeWidthCm = widestFreeCm(e, zone, inFront)
      const frontWidthCm = frontDirection(e.item.rotation).dy !== 0 ? e.body.widthCm : e.body.depthCm
      if (freeWidthCm >= Math.min(REFERENCE.chairFrontCm, frontWidthCm)) continue
    }

    const who = josa(names(inFront), '이', '가')
    const free = Math.max(0, Math.min(...inFront.map((b) => frontFreeCm(e, b.body))))
    const what =
      isSeat && freeWidthCm > 0
        ? `앞에 ${who} 있어서 의자 놓을 자리가 폭 ${cm(freeWidthCm)}만 남아요.`
        : `앞에 ${who} 있어서 ${cm(free)}만 비어 있어요.`
    const use = isSeat ? '의자를 빼고 앉을' : '문이나 서랍을 열고 쓸'
    flagged.add(e.item.id)
    errors.push({
      code: 'CLEARANCE_BLOCKED',
      severity: 'error',
      furnitureIds: [e.item.id, ...inFront.map((b) => b.item.id)],
      title: isSeat ? `${e.item.name} 앞에 의자 놓을 자리가 부족해요` : `${e.item.name} 앞 공간이 막혔어요`,
      message: `${what} ${use} 공간으로 ${cm(need)}가 필요해요. ${cm(need)}는 참고값이에요.`,
    })
  }
  return flagged
}

/** @param {Entry[]} solid @param {Opening[]} windows @param {Room} room @param {ValidationError[]} errors */
function checkWindowBlocked(solid, windows, room, errors) {
  for (const win of windows) {
    const zone = openingFrontZone(win, room, REFERENCE.windowFrontCm)
    const span = openingSpan(win)
    // 창턱보다 높고 창 앞 20cm 안에서 창 구간에 걸친 가구를 모아, 이어 붙인 구간이 창 전체를 덮는지 본다
    const covering = solid
      .filter((e) => e.item.heightCm > win.sillHeightCm && rectsOverlap(e.body, zone))
      .map((e) => {
        const start = span.axis === 'x' ? e.body.xCm : e.body.yCm
        return { e, start, end: start + (span.axis === 'x' ? e.body.widthCm : e.body.depthCm) }
      })
      .filter((c) => c.end > span.startCm && c.start < span.endCm)
      .sort((p, q) => p.start - q.start)
    let cursor = span.startCm
    for (const c of covering) {
      if (c.start > cursor) break
      cursor = Math.max(cursor, c.end)
    }
    if (covering.length === 0 || cursor < span.endCm) continue
    const list = covering.map((c) => c.e)
    const about = `창문(폭 ${cm(win.widthCm)}, 아래 높이 ${cm(win.sillHeightCm)}) 앞 ${cm(REFERENCE.windowFrontCm)} 안에서`
    const only = list.length === 1 ? list[0] : null
    errors.push({
      code: 'WINDOW_BLOCKED',
      severity: 'error',
      furnitureIds: list.map((e) => e.item.id),
      title: only ? `${josa(only.item.name, '이', '가')} 창문을 다 가려요` : `${josa(names(list), '이', '가')} 함께 창문을 다 가려요`,
      message: only
        ? `높이 ${cm(only.item.heightCm)}인 ${josa(only.item.name, '이', '가')} ${about} 창 전체를 막고 있어요. 창문을 열고 닫기 어려워요.`
        : `창문 아래 높이보다 키가 큰 ${josa(names(list), '이', '가')} ${about} 나란히 창 전체를 막고 있어요. 창문을 열고 닫기 어려워요.`,
    })
  }
}

// ── 통로 탐색 (현관에서 걸어서 닿는지) ──────────────────────────────────

/**
 * 한 축에서 걷는 사람(정사각형)의 왼쪽 위가 설 수 있는 좌표 목록.
 * 5cm 격자에 가구 모서리 좌표를 더해서, 딱 맞는 통로를 놓치지 않는다.
 * @param {number} maxCm @param {number} walkerCm @param {Entry[]} obstacles @param {'x' | 'y'} axis
 */
function axisCoords(maxCm, walkerCm, obstacles, axis) {
  /** @type {number[]} */
  const values = []
  for (let v = 0; v < maxCm; v += REFERENCE.gridCm) values.push(v)
  values.push(maxCm)
  for (const o of obstacles) {
    const start = axis === 'x' ? o.body.xCm : o.body.yCm
    const end = start + (axis === 'x' ? o.body.widthCm : o.body.depthCm)
    if (end > 0 && end < maxCm) values.push(end)
    if (start - walkerCm > 0 && start - walkerCm < maxCm) values.push(start - walkerCm)
  }
  values.sort((a, b) => a - b)
  /** @type {number[]} */
  const unique = []
  for (const v of values) if (unique.length === 0 || v !== unique[unique.length - 1]) unique.push(v)
  return unique
}

/**
 * 현관 바로 안쪽에서 시작해 폭 walkerCm인 사람이 갈 수 있는 곳을 채운다.
 * 방이 너무 작거나 현관 안쪽에 설 자리가 없으면 null.
 * @param {Room} room @param {Entry[]} obstacles @param {Opening} door @param {number} walkerCm
 * @returns {Access | null}
 */
function floodFill(room, obstacles, door, walkerCm) {
  const maxX = room.widthCm - walkerCm
  const maxY = room.depthCm - walkerCm
  if (maxX < 0 || maxY < 0) return null
  const xs = axisCoords(maxX, walkerCm, obstacles, 'x')
  const ys = axisCoords(maxY, walkerCm, obstacles, 'y')
  const nx = xs.length
  const ny = ys.length
  const blocked = new Uint8Array(nx * ny)
  for (const o of obstacles) {
    const b = o.body
    let i0 = 0
    while (i0 < nx && xs[i0] <= b.xCm - walkerCm) i0++
    let i1 = i0
    while (i1 < nx && xs[i1] < b.xCm + b.widthCm) i1++
    let j0 = 0
    while (j0 < ny && ys[j0] <= b.yCm - walkerCm) j0++
    let j1 = j0
    while (j1 < ny && ys[j1] < b.yCm + b.depthCm) j1++
    for (let j = j0; j < j1; j++) blocked.fill(1, j * nx + i0, j * nx + i1)
  }

  const reached = new Uint8Array(nx * ny)
  const queue = new Int32Array(nx * ny)
  let tail = 0
  // 시작: 문이 있는 벽에 붙어 서고, 문 폭 안에 들어오는 자리
  const span = openingSpan(door)
  const needCm = Math.min(walkerCm, door.widthCm)
  const along = span.axis === 'x' ? xs : ys
  for (let k = 0; k < along.length; k++) {
    const inDoor = Math.min(along[k] + walkerCm, span.endCm) - Math.max(along[k], span.startCm)
    if (inDoor < needCm) continue
    let index
    if (door.wall === 'top') index = k
    else if (door.wall === 'bottom') index = (ny - 1) * nx + k
    else if (door.wall === 'left') index = k * nx
    else index = k * nx + nx - 1
    if (blocked[index] || reached[index]) continue
    reached[index] = 1
    queue[tail++] = index
  }
  if (tail === 0) return null

  for (let head = 0; head < tail; head++) {
    const index = queue[head]
    const i = index % nx
    if (i > 0 && !blocked[index - 1] && !reached[index - 1]) {
      reached[index - 1] = 1
      queue[tail++] = index - 1
    }
    if (i < nx - 1 && !blocked[index + 1] && !reached[index + 1]) {
      reached[index + 1] = 1
      queue[tail++] = index + 1
    }
    if (index >= nx && !blocked[index - nx] && !reached[index - nx]) {
      reached[index - nx] = 1
      queue[tail++] = index - nx
    }
    if (index + nx < reached.length && !blocked[index + nx] && !reached[index + nx]) {
      reached[index + nx] = 1
      queue[tail++] = index + nx
    }
  }
  return { walkerCm, xs, ys, reached }
}

/** 채워진 자리 중 하나라도 이 직사각형과 겹치면 true. @param {Access} access @param {Rect} rect */
function touches(access, rect) {
  const { xs, ys, reached, walkerCm } = access
  const nx = xs.length
  for (let j = 0; j < ys.length; j++) {
    if (ys[j] + walkerCm <= rect.yCm) continue
    if (ys[j] >= rect.yCm + rect.depthCm) break
    for (let i = 0; i < nx; i++) {
      if (xs[i] + walkerCm <= rect.xCm) continue
      if (xs[i] >= rect.xCm + rect.widthCm) break
      if (reached[j * nx + i]) return true
    }
  }
  return false
}

/** 네 방향 */
const ALL_DIRECTIONS = Object.freeze([
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
])

/**
 * 가구의 한 변에서 그 변 폭 그대로 앞으로 뻗은 빈 띠. 처음 만나는 가구나 벽에서 끝난다. 바로 막혀 있으면 null.
 * @param {Entry} e @param {{ dx: number, dy: number }} dir @param {Entry[]} obstacles @param {Room} room
 * @returns {Rect | null}
 */
function freeLane(e, dir, obstacles, room) {
  const b = e.body
  if (dir.dy !== 0) {
    const forward = dir.dy === 1
    let edge = forward ? room.depthCm : 0
    const from = forward ? b.yCm + b.depthCm : b.yCm
    for (const o of obstacles) {
      if (o === e || o.body.xCm >= b.xCm + b.widthCm || o.body.xCm + o.body.widthCm <= b.xCm) continue
      if (forward && o.body.yCm + o.body.depthCm > from) edge = Math.min(edge, Math.max(o.body.yCm, from))
      if (!forward && o.body.yCm < from) edge = Math.max(edge, Math.min(o.body.yCm + o.body.depthCm, from))
    }
    const depthCm = forward ? edge - from : from - edge
    return depthCm > 0 ? { xCm: b.xCm, yCm: forward ? from : edge, widthCm: b.widthCm, depthCm } : null
  }
  const forward = dir.dx === 1
  let edge = forward ? room.widthCm : 0
  const from = forward ? b.xCm + b.widthCm : b.xCm
  for (const o of obstacles) {
    if (o === e || o.body.yCm >= b.yCm + b.depthCm || o.body.yCm + o.body.depthCm <= b.yCm) continue
    if (forward && o.body.xCm + o.body.widthCm > from) edge = Math.min(edge, Math.max(o.body.xCm, from))
    if (!forward && o.body.xCm < from) edge = Math.max(edge, Math.min(o.body.xCm + o.body.widthCm, from))
  }
  const widthCm = forward ? edge - from : from - edge
  return widthCm > 0 ? { xCm: forward ? from : edge, yCm: b.yCm, widthCm, depthCm: b.depthCm } : null
}

/**
 * 가구에 닿았는지: 정면 사용 공간이 방 안에 다 들어오는 가구는 정면, 그 밖의 가구는 아무 쪽이나.
 * 밀착 예외: 걷는 사람보다 폭이 좁은 가구(협탁, 틈새 선반)를 벽이나 더 깊은 가구 사이에 딱 붙이면
 * 사람이 그 앞 오목한 자리에 들어설 수 없다. 이때는 가구 앞으로 가구 폭만큼 뻗은 빈 띠에 닿으면 닿은 것으로 본다.
 * @param {Access | null} access @param {Entry} e @param {Entry[]} obstacles @param {Room} room
 */
function canReach(access, e, obstacles, room) {
  if (!access) return false
  const b = e.body
  // 정면 사용 공간이 방 밖으로 나가면(정면이 벽 쪽) 벽 탓이라 정면을 따지지 않고 아무 쪽이나 닿으면 된다
  const zone = frontZone(e.item)
  const front = zone && isInsideRoom(zone, room) ? frontZone(e.item, 1) : null
  if (touches(access, front ?? { xCm: b.xCm - 1, yCm: b.yCm - 1, widthCm: b.widthCm + 2, depthCm: b.depthCm + 2 })) return true
  const directions = front ? [frontDirection(e.item.rotation)] : ALL_DIRECTIONS
  for (const dir of directions) {
    const sideCm = dir.dy !== 0 ? b.widthCm : b.depthCm
    if (sideCm >= access.walkerCm) continue
    const lane = freeLane(e, dir, obstacles, room)
    if (lane && touches(access, lane)) return true
  }
  return false
}

/**
 * 현관에서 각 가구까지 길이 있는지 본다. 60cm(참고값)로 못 가면 팁, 30cm로도 못 가면 문제.
 * @param {Entry[]} blockers @param {Room} room @param {Opening | null} entrance
 * @param {Set<string>} clearanceIds 정면 막힘이 이미 걸린 가구(같은 원인을 두 번 말하지 않는다)
 * @param {ValidationError[]} errors @param {ValidationTip[]} tips
 * @returns {{ checked: boolean, allWide: boolean }}
 */
function checkPassage(blockers, room, entrance, clearanceIds, errors, tips) {
  if (!entrance || blockers.length === 0) return { checked: false, allWide: false }
  const targets = blockers.filter((e) => !clearanceIds.has(e.item.id) && isInsideRoom(e.body, room))
  const wide = floodFill(room, blockers, entrance, REFERENCE.passageCm)
  const notWide = targets.filter((e) => !canReach(wide, e, blockers, room))
  if (notWide.length === 0) return { checked: true, allWide: targets.length === blockers.length }

  const narrow = floodFill(room, blockers, entrance, REFERENCE.minPassageCm)
  if (!narrow) {
    // 현관 안쪽에 30cm 자리도 없다. 안으로 열리는 문이면 문 막힘으로 이미 알렸다.
    const zone = openingFrontZone(entrance, room, REFERENCE.minPassageCm)
    const atDoor = blockers.filter((e) => rectsOverlap(e.body, zone))
    if (atDoor.length > 0 && !doorSwingZone(entrance, room)) {
      errors.push({
        code: 'NO_ACCESS',
        severity: 'error',
        furnitureIds: atDoor.map((e) => e.item.id),
        title: '현관 바로 안쪽이 막혀 있어요',
        message: `문 바로 앞 ${cm(REFERENCE.minPassageCm)} 안에 ${josa(names(atDoor), '이', '가')} 있어서 방으로 들어올 수 없어요.`,
      })
    }
    return { checked: false, allWide: false }
  }

  /** @type {Entry[]} */
  const squeezed = []
  for (const e of notWide) {
    if (canReach(narrow, e, blockers, room)) {
      squeezed.push(e)
      continue
    }
    const side = e.item.clearanceFrontCm > 0 ? ' 앞' : ''
    errors.push({
      code: 'NO_ACCESS',
      severity: 'error',
      furnitureIds: [e.item.id],
      title: `${e.item.name}${side}까지 갈 길이 없어요`,
      message: `현관에서 ${e.item.name}${side}까지 폭 ${cm(REFERENCE.minPassageCm)}인 길도 이어지지 않아요. 주변 가구를 옮겨 길을 열어 주세요.`,
    })
  }
  if (squeezed.length > 0) {
    // 실제로 지나갈 수 있는 폭을 5cm 단위로 잰다
    /** @type {Map<string, number>} */
    const widest = new Map(squeezed.map((e) => [e.item.id, REFERENCE.minPassageCm]))
    for (let w = REFERENCE.minPassageCm + 5; w < REFERENCE.passageCm; w += 5) {
      const access = floodFill(room, blockers, entrance, w)
      let any = false
      for (const e of squeezed) {
        if (widest.get(e.item.id) === w - 5 && canReach(access, e, blockers, room)) {
          widest.set(e.item.id, w)
          any = true
        }
      }
      if (!any) break
    }
    const detail = squeezed.map((e) => `${e.item.name}(약 ${cm(widest.get(e.item.id) ?? REFERENCE.minPassageCm)})`).join(', ')
    tips.push({
      code: 'NARROW_PASSAGE',
      severity: 'tip',
      category: 'interior',
      furnitureIds: squeezed.map((e) => e.item.id),
      title: '가는 길이 좁은 가구가 있어요',
      message: `현관에서 가는 길의 폭이 ${cm(REFERENCE.passageCm)}보다 좁아요: ${detail}. 60cm는 참고값이라 꼭 지켜야 하는 것은 아니에요.`,
      isReferenceValue: true,
    })
  }
  return { checked: true, allWide: false }
}

// ── 2단계: 개선 제안 ────────────────────────────────────────────────────

/** 두 직사각형 사이의 빈 띠. @param {Rect} a @param {Rect} b @param {'x' | 'y'} axis @returns {Rect} */
function gapRect(a, b, axis) {
  const x0 = axis === 'x' ? Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm) : Math.max(a.xCm, b.xCm)
  const x1 = axis === 'x' ? Math.max(a.xCm, b.xCm) : Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm)
  const y0 = axis === 'y' ? Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm) : Math.max(a.yCm, b.yCm)
  const y1 = axis === 'y' ? Math.max(a.yCm, b.yCm) : Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm)
  return { xCm: x0, yCm: y0, widthCm: x1 - x0, depthCm: y1 - y0 }
}

/** 이 틈이 가구 정면의 사용 공간 쪽이면 true(쓰는 자리라 애매한 틈이 아니다). @param {Entry} e @param {Rect} gap */
function isUseSide(e, gap) {
  const zone = frontZone(e.item)
  return zone !== null && rectsOverlap(zone, gap)
}

/** @param {Entry[]} blockers @param {Entry[]} solid @param {ValidationTip[]} tips */
function checkDeadSpace(blockers, solid, tips) {
  for (let i = 0; i < blockers.length; i++) {
    for (let j = i + 1; j < blockers.length; j++) {
      const a = blockers[i]
      const b = blockers[j]
      const g = gapBetween(a.body, b.body)
      if (!g || g.facingCm < REFERENCE.facingMinCm) continue
      if (g.gapCm < REFERENCE.deadSpaceMinCm || g.gapCm > REFERENCE.deadSpaceMaxCm) continue
      const gap = gapRect(a.body, b.body, g.axis)
      // 사이에 다른 가구가 들어가 있으면 빈 틈이 아니다
      if (solid.some((o) => o !== a && o !== b && rectsOverlap(o.body, gap))) continue
      // 서랍·옷장 문·의자 자리처럼 쓰는 공간은 틈으로 보지 않는다(막혔으면 1단계에서 알린다)
      if (isUseSide(a, gap) || isUseSide(b, gap)) continue
      tips.push({
        code: 'DEAD_SPACE_GAP',
        severity: 'tip',
        category: 'interior',
        furnitureIds: [a.item.id, b.item.id],
        title: `${josa(a.item.name, '과', '와')} ${b.item.name} 사이에 ${cm(g.gapCm)} 틈이 있어요`,
        message: `${cm(g.gapCm)} 틈은 쓰기 애매해요. 두 가구를 딱 붙이거나, 폭 ${cm(g.gapCm)} 안쪽의 좁은 선반을 넣어 보세요.`,
        isReferenceValue: false,
      })
    }
  }
}

/** @param {Entry[]} solid @param {Opening[]} windows @param {Room} room @param {ValidationTip[]} tips */
function checkBedUnderWindow(solid, windows, room, tips) {
  for (const e of solid) {
    if (e.item.category !== 'bed') continue
    const back = backWall(e.item, room, REFERENCE.bedHeadWindowCm)
    if (!back || back.gapCm < 0) continue
    const horizontal = back.wall === 'top' || back.wall === 'bottom'
    const start = horizontal ? e.body.xCm : e.body.yCm
    const end = start + (horizontal ? e.body.widthCm : e.body.depthCm)
    const hit = windows.find((w) => {
      if (w.wall !== back.wall) return false
      const span = openingSpan(w)
      return Math.min(end, span.endCm) - Math.max(start, span.startCm) >= 1
    })
    if (!hit) continue
    const where = back.gapCm <= 0 ? '창문 벽에 붙어' : `창문 벽에서 ${cm(back.gapCm)} 떨어져`
    tips.push({
      code: 'BED_UNDER_WINDOW',
      severity: 'tip',
      category: 'interior',
      furnitureIds: [e.item.id],
      title: `${e.item.name} 머리가 창문 아래에 있어요`,
      message: `침대 머리가 ${where} 있어요. 겨울에 찬 바람이나 결로가 닿을 수 있으니, 머리를 창문 없는 벽 쪽으로 돌려 보세요. ${cm(REFERENCE.bedHeadWindowCm)}는 참고값이에요.`,
      isReferenceValue: true,
    })
  }
}

/**
 * 현관문에서 곧게 들어온 띠(문 폭)에 침대가 먼저 보이는지 본다.
 * @param {Entry[]} solid @param {Opening | null} entrance @param {Room} room @param {ValidationTip[]} tips
 * @returns {boolean} 검사를 했으면 true
 */
function checkSightline(solid, entrance, room, tips) {
  if (!entrance) return false
  const horizontal = entrance.wall === 'top' || entrance.wall === 'bottom'
  const band = openingFrontZone(entrance, room, horizontal ? room.depthCm : room.widthCm)
  /** 문에서 가구까지 거리 @param {Rect} r */
  const fromDoor = (r) => {
    if (entrance.wall === 'top') return r.yCm
    if (entrance.wall === 'bottom') return room.depthCm - (r.yCm + r.depthCm)
    if (entrance.wall === 'left') return r.xCm
    return room.widthCm - (r.xCm + r.widthCm)
  }
  /** 띠 안에서 가로지르는 방향으로 차지하는 구간 @param {Rect} r @returns {[number, number]} */
  const across = (r) => {
    const s = horizontal ? r.xCm : r.yCm
    const e = s + (horizontal ? r.widthCm : r.depthCm)
    const bs = horizontal ? band.xCm : band.yCm
    const be = bs + (horizontal ? band.widthCm : band.depthCm)
    return [Math.max(s, bs), Math.min(e, be)]
  }
  const inBand = solid.filter((e) => rectsOverlap(e.body, band))
  for (const bed of inBand) {
    if (bed.item.category !== 'bed') continue
    const [bedStart, bedEnd] = across(bed.body)
    const distance = fromDoor(bed.body)
    // 침대보다 문 쪽에 있는 키 큰 가구가 가리는 구간을 뺀다
    const covers = inBand
      .filter((o) => o !== bed && o.item.heightCm >= REFERENCE.tallFurnitureCm && fromDoor(o.body) < distance)
      .map((o) => across(o.body))
      .sort((p, q) => p[0] - q[0])
    let visible = 0
    let cursor = bedStart
    for (const [s, e] of covers) {
      if (s > cursor) visible += Math.min(s, bedEnd) - cursor
      cursor = Math.max(cursor, e)
      if (cursor >= bedEnd) break
    }
    if (cursor < bedEnd) visible += bedEnd - cursor
    if (visible < REFERENCE.facingMinCm) continue
    tips.push({
      code: 'DOOR_BED_SIGHTLINE',
      severity: 'tip',
      category: 'interior',
      furnitureIds: [bed.item.id],
      title: `문을 열면 ${josa(bed.item.name, '이', '가')} 바로 보여요`,
      message: `문에서 ${cm(Math.max(0, distance))} 앞에 침대가 ${cm(visible)} 폭으로 정면에 보여요. 사이에 옷장이나 가림막, 커튼을 두면 시선을 가릴 수 있어요.`,
      isReferenceValue: false,
    })
  }
  return true
}

/** @param {Entry[]} solid @param {ValidationTip[]} tips */
function checkBedDeskAdjacent(solid, tips) {
  for (const bed of solid) {
    if (bed.item.category !== 'bed') continue
    for (const desk of solid) {
      if (desk.item.category !== 'desk') continue
      const g = gapBetween(bed.body, desk.body)
      if (!g || g.gapCm > REFERENCE.touchCm || g.facingCm < REFERENCE.facingMinCm) continue
      tips.push({
        code: 'BED_DESK_ADJACENT',
        severity: 'tip',
        category: 'interior',
        furnitureIds: [bed.item.id, desk.item.id],
        title: `${josa(bed.item.name, '과', '와')} ${josa(desk.item.name, '이', '가')} 맞닿아 있어요`,
        message: `자는 곳과 일하는 곳이 ${cm(g.facingCm)} 길이로 붙어 있어요. 사이에 수납장이나 가림막을 두면 두 공간이 나뉘어 보여요.`,
        isReferenceValue: false,
      })
    }
  }
}

// ── 아이 안전 참고 체크 (영유아 가족일 때만) ────────────────────────────

/**
 * @param {Entry[]} entries @param {Entry[]} solid @param {Entry[]} blockers
 * @param {Opening[]} windows @param {Room} room @param {ValidationTip[]} tips
 */
function checkChildSafety(entries, solid, blockers, windows, room, tips) {
  const note = '참고용 안전 체크예요.'
  const playSpots = entries.filter((e) => e.item.category === 'bed' || e.item.category === 'mat')
  for (const e of solid) {
    if (e.item.heightCm < REFERENCE.tallFurnitureCm) continue
    let nearest = null
    let best = Infinity
    for (const spot of playSpots) {
      if (spot === e) continue
      const d = rectDistance(e.body, spot.body)
      if (d <= REFERENCE.childTipRiskCm && d < best) {
        best = d
        nearest = spot
      }
    }
    if (!nearest) continue
    tips.push({
      code: 'CHILD_TIP_RISK',
      severity: 'tip',
      category: 'child_safety',
      furnitureIds: [e.item.id, nearest.item.id],
      title: `${josa(e.item.name, '을', '를')} 벽에 고정해 주세요`,
      message: `높이 ${cm(e.item.heightCm)}인 ${josa(e.item.name, '이', '가')} ${nearest.item.name}에서 ${cm(best)} 거리에 있어요. 넘어지지 않게 벽에 고정하는 것을 권해요. ${note}`,
      isReferenceValue: true,
    })
  }

  for (const win of windows) {
    const zone = openingFrontZone(win, room, REFERENCE.windowFrontCm)
    for (const e of solid) {
      const h = e.item.heightCm
      if (h < REFERENCE.childClimbMinCm || h > REFERENCE.childClimbMaxCm || !rectsOverlap(e.body, zone)) continue
      tips.push({
        code: 'CHILD_WINDOW_CLIMB',
        severity: 'tip',
        category: 'child_safety',
        furnitureIds: [e.item.id],
        title: `창문 앞 ${josa(e.item.name, '을', '를')} 밟고 올라갈 수 있어요`,
        message: `높이 ${cm(h)}인 ${josa(e.item.name, '이', '가')} 창문 앞 ${cm(REFERENCE.windowFrontCm)} 안에 있어요. 창문 안전 잠금장치를 달아 주세요. ${note}`,
        isReferenceValue: true,
      })
    }
  }

  for (const e of solid) {
    if (!e.item.hasSharpCorner) continue
    let nearest = null
    let best = Infinity
    for (const o of blockers) {
      if (o === e) continue
      const g = gapBetween(e.body, o.body)
      if (!g || g.facingCm < REFERENCE.facingMinCm) continue
      if (g.gapCm < REFERENCE.deadSpaceMinCm || g.gapCm >= REFERENCE.childNarrowCm || g.gapCm >= best) continue
      best = g.gapCm
      nearest = o
    }
    if (!nearest) continue
    tips.push({
      code: 'CHILD_SHARP_CORNER',
      severity: 'tip',
      category: 'child_safety',
      furnitureIds: [e.item.id, nearest.item.id],
      title: `좁은 길 옆 ${e.item.name} 모서리를 조심해 주세요`,
      message: `${josa(e.item.name, '과', '와')} ${nearest.item.name} 사이가 ${cm(best)}로 좁아요(${cm(REFERENCE.childNarrowCm)} 미만). 모서리 보호대를 붙이는 것을 권해요. ${note}`,
      isReferenceValue: true,
    })
  }
}

/**
 * 놀이 매트를 깔 수 있는 가장 넓은 빈 바닥(10cm 격자, 가로·세로 모두 120cm 이상). 없으면 null.
 * 매트가 아닌 가구와 문 열리는 자리는 뺀다.
 * @param {Entry[]} solid @param {Room} room
 * @returns {MatZone | null}
 */
function findMatZone(solid, room) {
  const cell = 10
  const cols = Math.floor(room.widthCm / cell)
  const rows = Math.floor(room.depthCm / cell)
  const minCells = REFERENCE.matZoneMinCm / cell
  if (cols < minCells || rows < minCells) return null
  const filled = new Uint8Array(cols * rows)
  /** @type {Rect[]} */
  const taken = solid.map((e) => e.body)
  for (const opening of room.openings) {
    const zone = doorSwingZone(opening, room)
    if (zone) taken.push(zone)
  }
  for (const r of taken) {
    const c0 = Math.max(0, Math.floor(r.xCm / cell))
    const c1 = Math.min(cols, Math.ceil((r.xCm + r.widthCm) / cell))
    const r0 = Math.max(0, Math.floor(r.yCm / cell))
    const r1 = Math.min(rows, Math.ceil((r.yCm + r.depthCm) / cell))
    for (let row = r0; row < r1; row++) if (c1 > c0) filled.fill(1, row * cols + c0, row * cols + c1)
  }

  // 줄마다 위로 이어진 빈칸 높이를 쌓고, 스택으로 가장 넓은 직사각형을 찾는다
  const heights = new Int32Array(cols + 1)
  const stack = new Int32Array(cols + 1)
  let bestArea = 0
  /** @type {MatZone | null} */
  let best = null
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) heights[c] = filled[row * cols + c] ? 0 : heights[c] + 1
    heights[cols] = 0
    let top = 0
    for (let c = 0; c <= cols; c++) {
      while (top > 0 && heights[stack[top - 1]] >= heights[c]) {
        const h = heights[stack[--top]]
        const left = top > 0 ? stack[top - 1] + 1 : 0
        const w = c - left
        if (h >= minCells && w >= minCells && w * h > bestArea) {
          bestArea = w * h
          best = { xCm: left * cell, yCm: (row - h + 1) * cell, widthCm: w * cell, depthCm: h * cell }
        }
      }
      stack[top++] = c
    }
  }
  return best
}

// ── 좋은 점 ─────────────────────────────────────────────────────────────

/**
 * 실제로 확인한 사실만 문장으로 만든다. 문제나 제안이 걸린 가구는 칭찬하지 않는다.
 * @param {{ entries: Entry[], solid: Entry[], windows: Opening[], room: Room, errors: ValidationError[], tips: ValidationTip[], passage: { checked: boolean, allWide: boolean }, sightlineChecked: boolean }} input
 * @returns {string[]}
 */
function collectStrengths({ entries, solid, windows, room, errors, tips, passage, sightlineChecked }) {
  /** @type {string[]} */
  const strengths = []
  if (entries.length === 0) return strengths
  /** @type {Set<string>} */
  const flagged = new Set()
  for (const issue of errors) for (const id of issue.furnitureIds) flagged.add(id)
  for (const issue of tips) for (const id of issue.furnitureIds) flagged.add(id)
  /** @param {Entry} e */
  const clean = (e) => !flagged.has(e.item.id)

  if (errors.length === 0) strengths.push('겹치거나 막힌 곳 없이 모든 가구를 쓸 수 있어요.')
  if (errors.length === 0 && passage.checked && passage.allWide) {
    strengths.push(`현관에서 모든 가구까지 폭 ${cm(REFERENCE.passageCm)}(참고값) 이상의 길이 이어져요.`)
  }

  const windowDesk = solid.find(
    (e) =>
      e.item.category === 'desk' &&
      clean(e) &&
      windows.some((w) => rectsOverlap(e.body, openingFrontZone(w, room, REFERENCE.deskWindowCm))),
  )
  if (windowDesk) strengths.push(`${josa(windowDesk.item.name, '이', '가')} 창가에 있어 낮에 밝게 쓸 수 있어요.`)

  const beds = solid.filter((e) => e.item.category === 'bed')
  if (sightlineChecked && beds.length > 0 && beds.every(clean)) {
    strengths.push('문을 열었을 때 침대가 바로 보이지 않아 아늑해요.')
  }

  const large = solid.filter((e) => ['bed', 'wardrobe', 'bookshelf', 'sofa', 'drawer'].includes(e.item.category))
  const againstWall = large.every((e) => {
    const d = distanceToWalls(e.body, room)
    return clean(e) && Math.min(d.top, d.bottom, d.left, d.right) === 0
  })
  if (large.length > 0 && againstWall) strengths.push('큰 가구가 모두 벽에 붙어 있어 가운데 바닥이 넓어요.')

  return strengths
}

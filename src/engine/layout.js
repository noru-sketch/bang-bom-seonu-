// 자동 배치 엔진. 테마 배치안 5종과 "새 가구 하나 놓기"를 만든다.
//
// 원칙 (SPEC 1장 8번): 구역 나누기 → 침대 먼저 → 시선과 동선 분리.
// - 항상 같은 결과가 나온다(무작위·시계 사용 없음).
// - 내보내는 배치는 겹침·이탈·문 막힘·정면 막힘·창문 가림·접근 불가가 없다. 못 놓는 가구는 unplacedIds로 간다.
// - 후보를 고르는 내부 비교값은 이 파일 밖으로 나가지 않는다(점수 필드 없음).

/** @import { Room, FurnitureItem, LayoutVariant, Placement, Rotation, Rect, Opening, Lifestyle, ThemeKey } from '../types/schema.ts' */

import {
  footprint,
  footprintSize,
  rectsOverlap,
  overlapCm,
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
import { THEMES } from '../data/labels.js'

/** @typedef {{ item: FurnitureItem, xCm: number, yCm: number, rotation: Rotation, rect: Rect, front: Rect | null }} Spot */
/** @typedef {ThemeKey | 'plain'} Mode */
/**
 * @typedef {object} Ctx
 * @property {Room} room
 * @property {Lifestyle} lifestyle
 * @property {Opening | null} entrance 현관(첫 번째 문)
 * @property {Rect[]} swings 안쪽으로 열리는 문이 쓰는 공간
 * @property {Opening[]} windows
 * @property {Rect | null} doorStrip 현관에서 방 끝까지 곧게 뻗은 띠(시선·직선 동선)
 * @property {number} cols 통로 격자 가로 칸 수
 * @property {number} rows 통로 격자 세로 칸 수
 * @property {number[]} startCells 현관 바로 안쪽의 출발 칸
 * @property {{ xCm: number, yCm: number }} farCorner 현관에서 가장 먼 구석
 * @property {string | null} dividerId 구역을 나누는 수납 가구(분리형에서만)
 * @property {string | null} storageWall 수납을 모으는 벽(수납형에서만)
 */

/** @type {Rotation[]} */
const ROTATIONS = [0, 90, 180, 270]
/** 통로 격자 한 칸(cm) */
const CELL = 5
/** 사람이 지나가는 폭(cm, 참고값) */
const WALK_CM = 60
const WALK = WALK_CM / CELL
/** 벽을 따라 후보를 만드는 간격(cm) */
const STEP = 10
/** 의자를 책상 밑으로 밀어 넣어도 되는 깊이(cm). 이보다 깊이 겹치면 겹침으로 본다 */
const TUCK_CM = 20
/** 창문 앞으로 보는 거리(cm) */
const WINDOW_NEAR_CM = 20

/** @param {FurnitureItem} item */
const isMat = (item) => item.category === 'mat'
/** @param {FurnitureItem} item */
const isChair = (item) => item.category === 'chair'
/** @param {FurnitureItem} item */
const isSeatHost = (item) => item.category === 'desk' || item.category === 'table'
/** @param {FurnitureItem} item */
const isStorage = (item) =>
  item.category === 'wardrobe' || item.category === 'bookshelf' || item.category === 'drawer'
/** 벽에 등을 대야 하는 큰 가구 @param {FurnitureItem} item */
const isLarge = (item) => !isMat(item) && !isChair(item) && item.category !== 'table'

/**
 * @param {FurnitureItem} item
 * @param {number} xCm
 * @param {number} yCm
 * @param {Rotation} rotation
 * @returns {Spot}
 */
function makeSpot(item, xCm, yCm, rotation) {
  const moved = { ...item, xCm, yCm, rotation }
  return { item, xCm, yCm, rotation, rect: footprint(moved), front: frontZone(moved) }
}

/** @param {Rect} rect */
const centerOf = (rect) => ({ xCm: rect.xCm + rect.widthCm / 2, yCm: rect.yCm + rect.depthCm / 2 })

/**
 * @param {{ xCm: number, yCm: number }} a
 * @param {{ xCm: number, yCm: number }} b
 */
const distance = (a, b) => Math.hypot(a.xCm - b.xCm, a.yCm - b.yCm)

/**
 * 두 직사각형 사이의 가장 가까운 거리(겹치면 0).
 * @param {Rect} a
 * @param {Rect} b
 */
function rectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.xCm, b.xCm) - Math.min(a.xCm + a.widthCm, b.xCm + b.widthCm))
  const dy = Math.max(0, Math.max(a.yCm, b.yCm) - Math.min(a.yCm + a.depthCm, b.yCm + b.depthCm))
  return Math.hypot(dx, dy)
}

/**
 * @param {Room} room
 * @param {Lifestyle} lifestyle
 * @returns {Ctx}
 */
function makeCtx(room, lifestyle) {
  const entrance = room.openings.find((opening) => opening.type === 'door') ?? null
  /** @type {Rect[]} */
  const swings = []
  for (const opening of room.openings) {
    const zone = doorSwingZone(opening, room)
    if (zone) swings.push(zone)
  }
  const windows = room.openings.filter((opening) => opening.type === 'window')
  const cols = Math.floor(room.widthCm / CELL)
  const rows = Math.floor(room.depthCm / CELL)
  /** @type {number[]} */
  const startCells = []
  /** @type {Rect | null} */
  let doorStrip = null
  let farCorner = { xCm: 0, yCm: 0 }
  if (entrance) {
    const horizontal = entrance.wall === 'top' || entrance.wall === 'bottom'
    doorStrip = openingFrontZone(entrance, room, horizontal ? room.depthCm : room.widthCm)
    const doorZone = openingFrontZone(entrance, room, WALK_CM)
    const needAlong = Math.max(CELL, Math.min(WALK_CM, entrance.widthCm) - CELL)
    const needDeep = WALK_CM - CELL
    const pw = cols - WALK + 1
    const ph = rows - WALK + 1
    for (let j = 0; j < ph; j += 1) {
      for (let i = 0; i < pw; i += 1) {
        const o = overlapCm({ xCm: i * CELL, yCm: j * CELL, widthCm: WALK_CM, depthCm: WALK_CM }, doorZone)
        const along = horizontal ? o.xCm : o.yCm
        const deep = horizontal ? o.yCm : o.xCm
        if (along >= needAlong && deep >= needDeep) startCells.push(j * pw + i)
      }
    }
    const doorCenter = centerOf(openingFrontZone(entrance, room, 1))
    let best = -1
    for (const corner of [
      { xCm: 0, yCm: 0 },
      { xCm: room.widthCm, yCm: 0 },
      { xCm: 0, yCm: room.depthCm },
      { xCm: room.widthCm, yCm: room.depthCm },
    ]) {
      const d = distance(corner, doorCenter)
      if (d > best) {
        best = d
        farCorner = corner
      }
    }
  }
  return {
    room, lifestyle, entrance, swings, windows, doorStrip, cols, rows, startCells, farCorner,
    dividerId: null, storageWall: null,
  }
}

// ── 지켜야 하는 조건 ────────────────────────────────────────────────────

/**
 * 정면 공간 안에 있어도 되는 가구인지. 매트는 언제나, 의자는 책상·테이블 앞에서만 된다.
 * @param {FurnitureItem} owner 정면 공간의 주인
 * @param {FurnitureItem} intruder
 */
function mayStandInFront(owner, intruder) {
  if (isMat(intruder)) return true
  return isChair(intruder) && isSeatHost(owner)
}

/**
 * 창문 하단보다 높은 가구들이 창문 앞 20cm 안에서 창을 전부 가리는지. 후보가 그 가림에 끼어 있을 때만 true.
 * @param {Spot} spot
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 */
function coversWindow(spot, placed, ctx) {
  for (const win of ctx.windows) {
    if (!(spot.item.heightCm > win.sillHeightCm)) continue
    const band = openingFrontZone(win, ctx.room, WINDOW_NEAR_CM)
    const mine = overlapCm(spot.rect, band)
    if (!(mine.xCm > 0 && mine.yCm > 0)) continue
    const span = openingSpan(win)
    /** @type {[number, number][]} */
    const pieces = []
    for (const other of [spot, ...placed]) {
      if (isMat(other.item) || !(other.item.heightCm > win.sillHeightCm)) continue
      const o = overlapCm(other.rect, band)
      if (!(o.xCm > 0 && o.yCm > 0)) continue
      pieces.push(
        span.axis === 'x'
          ? [other.rect.xCm, other.rect.xCm + other.rect.widthCm]
          : [other.rect.yCm, other.rect.yCm + other.rect.depthCm],
      )
    }
    pieces.sort((a, b) => a[0] - b[0])
    let covered = span.startCm
    for (const [from, to] of pieces) {
      if (from > covered) break
      covered = Math.max(covered, to)
    }
    if (covered >= span.endCm) return true
  }
  return false
}

/**
 * 통로 탐색을 뺀 조건: 방 안, 겹침 없음, 문 여는 공간 비움, 정면 공간 확보, 창문 가림 없음.
 * @param {Spot} spot
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 */
function fitsHard(spot, placed, ctx) {
  if (!isInsideRoom(spot.rect, ctx.room)) return false
  if (isMat(spot.item)) return true
  for (const swing of ctx.swings) {
    if (rectsOverlap(spot.rect, swing)) return false
  }
  if (spot.front && !isInsideRoom(spot.front, ctx.room)) return false
  for (const other of placed) {
    if (isMat(other.item)) continue
    if (rectsOverlap(spot.rect, other.rect)) {
      // 의자는 책상 밑으로 조금만 들어갈 수 있다. 책상 위에 통째로 올라가는 자리는 겹침이다
      const pair = (isChair(spot.item) && isSeatHost(other.item)) || (isChair(other.item) && isSeatHost(spot.item))
      const o = overlapCm(spot.rect, other.rect)
      if (!pair || Math.min(o.xCm, o.yCm) > TUCK_CM) return false
      // 밀어 넣는 쪽은 책상 앞쪽뿐이다. 책상 옆구리나 뒤에 걸친 자리는 겹침으로 본다
      const seat = isChair(spot.item) ? spot : other
      const host = seat === spot ? other : spot
      if (host.front && !rectsOverlap(seat.rect, host.front)) return false
    }
    if (spot.front && rectsOverlap(spot.front, other.rect) && !mayStandInFront(spot.item, other.item)) return false
    if (other.front && rectsOverlap(other.front, spot.rect) && !mayStandInFront(other.item, spot.item)) return false
  }
  return !coversWindow(spot, placed, ctx)
}

/**
 * 현관에서 걸어서 닿지 못하는 가구의 id. 60cm 정사각형이 5cm 칸으로 움직인다고 보고 넉넉하게(보수적으로) 잰다.
 * 매트는 통로를 막지 않고, 의자와 매트는 닿아야 하는 대상이 아니다. 문이 없으면 검사하지 않는다.
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @returns {Set<string>}
 */
function unreachableIds(placed, ctx) {
  /** @type {Set<string>} */
  const out = new Set()
  if (!ctx.entrance) return out
  const targets = placed.filter((spot) => !isMat(spot.item) && !isChair(spot.item))
  if (targets.length === 0) return out
  const { cols, rows } = ctx
  const pw = cols - WALK + 1
  const ph = rows - WALK + 1
  if (pw <= 0 || ph <= 0) {
    for (const spot of targets) out.add(spot.item.id)
    return out
  }
  // 막힌 칸의 누적 합(어느 60cm 정사각형이 비었는지 바로 알 수 있다)
  const stride = cols + 1
  const blocked = new Uint8Array(cols * rows)
  for (const spot of placed) {
    // 의자는 밀어 넣거나 옮길 수 있어서 길을 막는 것으로 보지 않는다(검사기와 같은 기준)
    if (isMat(spot.item) || isChair(spot.item)) continue
    const r = spot.rect
    const i0 = Math.max(0, Math.floor(r.xCm / CELL))
    const i1 = Math.min(cols, Math.ceil((r.xCm + r.widthCm) / CELL))
    const j0 = Math.max(0, Math.floor(r.yCm / CELL))
    const j1 = Math.min(rows, Math.ceil((r.yCm + r.depthCm) / CELL))
    for (let j = j0; j < j1; j += 1) blocked.fill(1, j * cols + i0, j * cols + i1)
  }
  const sum = new Int32Array(stride * (rows + 1))
  for (let j = 0; j < rows; j += 1) {
    let run = 0
    for (let i = 0; i < cols; i += 1) {
      run += blocked[j * cols + i]
      sum[(j + 1) * stride + i + 1] = sum[j * stride + i + 1] + run
    }
  }
  /** @param {number} i @param {number} j */
  const free = (i, j) =>
    sum[(j + WALK) * stride + i + WALK] - sum[j * stride + i + WALK] - sum[(j + WALK) * stride + i] + sum[j * stride + i] === 0

  const reached = new Uint8Array(pw * ph)
  const queue = new Int32Array(pw * ph)
  let head = 0
  let tail = 0
  for (const cell of ctx.startCells) {
    const i = cell % pw
    const j = (cell - i) / pw
    if (free(i, j)) {
      reached[cell] = 1
      queue[tail] = cell
      tail += 1
    }
  }
  while (head < tail) {
    const cell = queue[head]
    head += 1
    const i = cell % pw
    const j = (cell - i) / pw
    if (i > 0 && !reached[cell - 1] && free(i - 1, j)) {
      reached[cell - 1] = 1
      queue[tail] = cell - 1
      tail += 1
    }
    if (i < pw - 1 && !reached[cell + 1] && free(i + 1, j)) {
      reached[cell + 1] = 1
      queue[tail] = cell + 1
      tail += 1
    }
    if (j > 0 && !reached[cell - pw] && free(i, j - 1)) {
      reached[cell - pw] = 1
      queue[tail] = cell - pw
      tail += 1
    }
    if (j < ph - 1 && !reached[cell + pw] && free(i, j + 1)) {
      reached[cell + pw] = 1
      queue[tail] = cell + pw
      tail += 1
    }
  }
  for (const spot of targets) {
    // 정면 공간이 있으면 그 공간에, 없으면 가구 둘레 어디든 닿으면 된다
    const zone = spot.front ?? spot.rect
    const i0 = Math.max(0, Math.floor((zone.xCm - CELL - WALK_CM) / CELL) + 1)
    const i1 = Math.min(pw - 1, Math.ceil((zone.xCm + zone.widthCm + CELL) / CELL) - 1)
    const j0 = Math.max(0, Math.floor((zone.yCm - CELL - WALK_CM) / CELL) + 1)
    const j1 = Math.min(ph - 1, Math.ceil((zone.yCm + zone.depthCm + CELL) / CELL) - 1)
    let found = false
    for (let j = j0; j <= j1 && !found; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        if (reached[j * pw + i]) {
          found = true
          break
        }
      }
    }
    if (!found) out.add(spot.item.id)
  }
  return out
}

/**
 * 후보를 놓아도 모든 가구에 닿을 수 있는지. tolerated는 처음부터 닿지 못하던 가구(고정 가구 등).
 * @param {Spot} spot
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @param {Set<string>} tolerated
 */
function keepsAccess(spot, placed, ctx, tolerated) {
  if (isMat(spot.item)) return true
  for (const id of unreachableIds([...placed, spot], ctx)) {
    if (!tolerated.has(id)) return false
  }
  return true
}

// ── 빈 바닥 찾기 ────────────────────────────────────────────────────────

/**
 * 가장 넓은 빈 직사각형(10cm 칸 기준).
 * @param {Rect[]} rects 막힌 곳
 * @param {Room} room
 * @returns {Rect}
 */
function largestFreeRect(rects, room) {
  const cell = 10
  const cols = Math.floor(room.widthCm / cell)
  const rows = Math.floor(room.depthCm / cell)
  /** @type {Rect} */
  let best = { xCm: 0, yCm: 0, widthCm: 0, depthCm: 0 }
  if (cols <= 0 || rows <= 0) return best
  const blocked = new Uint8Array(cols * rows)
  for (const r of rects) {
    const i0 = Math.max(0, Math.floor(r.xCm / cell))
    const i1 = Math.min(cols, Math.ceil((r.xCm + r.widthCm) / cell))
    const j0 = Math.max(0, Math.floor(r.yCm / cell))
    const j1 = Math.min(rows, Math.ceil((r.yCm + r.depthCm) / cell))
    for (let j = j0; j < j1; j += 1) blocked.fill(1, j * cols + i0, j * cols + i1)
  }
  const heights = new Int32Array(cols + 1)
  const stack = new Int32Array(cols + 1)
  let bestArea = 0
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) heights[i] = blocked[j * cols + i] ? 0 : heights[i] + 1
    let top = 0
    for (let i = 0; i <= cols; i += 1) {
      const h = i < cols ? heights[i] : 0
      while (top > 0 && heights[stack[top - 1]] >= h) {
        const height = heights[stack[top - 1]]
        top -= 1
        const left = top > 0 ? stack[top - 1] + 1 : 0
        const area = height * (i - left)
        if (area > bestArea) {
          bestArea = area
          best = { xCm: left * cell, yCm: (j - height + 1) * cell, widthCm: (i - left) * cell, depthCm: height * cell }
        }
      }
      stack[top] = i
      top += 1
    }
  }
  return best
}

// ── 후보 만들기 ─────────────────────────────────────────────────────────

/**
 * 놓아 볼 자리: 네 방향 × (벽에 붙인 자리 10cm 간격 + 이미 놓인 가구와 그 정면 공간에 맞닿은 자리).
 * @param {FurnitureItem} item
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @param {boolean} [interior] 방 안쪽 격자도 넣을지
 * @returns {Spot[]}
 */
function candidates(item, placed, ctx, interior = false) {
  const { room } = ctx
  /** @type {Spot[]} */
  const out = []
  /** @type {Set<number>} */
  const seen = new Set()
  // 큰 방(600cm 초과)에서는 후보 간격을 넓혀 계산 시간을 줄인다. 작은 방은 그대로 10cm
  const step = Math.max(STEP, Math.ceil(Math.max(room.widthCm, room.depthCm) / 600) * STEP)
  for (const rotation of ROTATIONS) {
    const size = footprintSize({ widthCm: item.widthCm, depthCm: item.depthCm, rotation })
    const w = size.widthCm
    const d = size.depthCm
    const maxX = room.widthCm - w
    const maxY = room.depthCm - d
    if (maxX < 0 || maxY < 0) continue
    /** @param {number} rawX @param {number} rawY */
    const add = (rawX, rawY) => {
      const x = Math.round(rawX)
      const y = Math.round(rawY)
      if (x < 0 || y < 0 || x > maxX || y > maxY) return
      const key = (x * 8192 + y) * 4 + rotation / 90
      if (seen.has(key)) return
      seen.add(key)
      out.push(makeSpot(item, x, y, rotation))
    }
    for (let x = 0; x < maxX; x += step) {
      add(x, 0)
      add(x, maxY)
    }
    add(maxX, 0)
    add(maxX, maxY)
    for (let y = 0; y < maxY; y += step) {
      add(0, y)
      add(maxX, y)
    }
    for (const other of placed) {
      if (isMat(other.item)) continue
      for (const r of [other.rect, other.front]) {
        if (!r) continue
        for (const x of [r.xCm + r.widthCm, r.xCm - w]) {
          for (const y of [r.yCm, r.yCm + r.depthCm - d, 0, maxY]) add(x, y)
        }
        for (const y of [r.yCm + r.depthCm, r.yCm - d]) {
          for (const x of [r.xCm, r.xCm + r.widthCm - w, 0, maxX]) add(x, y)
        }
      }
    }
    if (interior) {
      for (let y = step; y < maxY; y += step) {
        for (let x = step; x < maxX; x += step) add(x, y)
      }
    }
  }
  return out
}

// ── 후보 고르기 (내부 비교값. 작을수록 좋다. 밖으로 내보내지 않는다) ────

/**
 * 창문까지의 가장 가까운 거리. 창문이 없으면 0.
 * @param {Rect} rect
 * @param {Ctx} ctx
 */
function windowDistance(rect, ctx) {
  let best = Infinity
  for (const win of ctx.windows) best = Math.min(best, rectDistance(rect, openingFrontZone(win, ctx.room, 1)))
  return Number.isFinite(best) ? best : 0
}

/**
 * 인테리어 원칙을 반영한 비교값.
 * @param {Spot} spot
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @param {Mode} mode
 * @returns {number}
 */
function weigh(spot, placed, ctx, mode) {
  const { room } = ctx
  const item = spot.item
  const isDivider = ctx.dividerId === item.id
  const back = backWall({ ...item, xCm: spot.xCm, yCm: spot.yCm, rotation: spot.rotation }, room, 0)
  let cost = 0

  // 큰 가구는 벽에 등을 댄다
  if (isLarge(item) && !isDivider && !back) cost += item.category === 'bed' ? 1000 : 400

  // 벽에 딱 붙으면 좋고, 벽과 어정쩡하게 뜨면 나쁘다
  const walls = distanceToWalls(spot.rect, room)
  for (const gap of [walls.top, walls.bottom, walls.left, walls.right]) {
    if (gap === 0) cost -= 30
    else if (gap < 50) cost += 40
  }

  // 책상 앞 가운데에 못 놓은 의자는 책상·테이블 가까이에 둔다
  if (isChair(item)) {
    let near = Infinity
    for (const other of placed) {
      if (!isSeatHost(other.item)) continue
      near = Math.min(near, rectDistance(spot.rect, other.front ?? other.rect))
    }
    if (Number.isFinite(near)) cost += near * 3
  }

  // 이웃 가구와는 딱 붙이거나(0cm) 지나다닐 만큼(60cm 이상) 띄운다
  if (!isChair(item)) {
    for (const other of placed) {
      if (isMat(other.item) || isChair(other.item)) continue
      const gap = gapBetween(spot.rect, other.rect)
      if (!gap || gap.facingCm < 20) continue
      const bedAndDesk =
        (item.category === 'bed' && other.item.category === 'desk') ||
        (item.category === 'desk' && other.item.category === 'bed')
      if (gap.gapCm === 0) cost += bedAndDesk ? 150 : -25
      else if (gap.gapCm < WALK_CM) cost += 200
      if (ctx.lifestyle === 'family_child' && gap.gapCm < WALK_CM) {
        const tallByBed =
          (item.category === 'bed' && other.item.heightCm >= 120) ||
          (other.item.category === 'bed' && item.heightCm >= 120)
        if (tallByBed) cost += 120
      }
    }
  }

  // 창문보다 높은 가구는 창문 앞을 피한다
  for (const win of ctx.windows) {
    if (!(item.heightCm > win.sillHeightCm)) continue
    const o = overlapCm(spot.rect, openingFrontZone(win, room, WINDOW_NEAR_CM))
    if (o.xCm > 0 && o.yCm > 0) cost += 150 + (win.wall === 'top' || win.wall === 'bottom' ? o.xCm : o.yCm)
  }

  // 현관에서 곧게 들어오는 길은 비워 둔다
  if (ctx.doorStrip && ctx.entrance && !isChair(item)) {
    const near = openingFrontZone(ctx.entrance, room, 150)
    if (rectsOverlap(spot.rect, near)) cost += 120
    if (mode === 'compact' && rectsOverlap(spot.rect, ctx.doorStrip)) cost += 300
  }

  if (item.category === 'bed') {
    // 머리맡이 창문 아래면 외풍이 든다
    if (back) {
      for (const win of ctx.windows) {
        if (win.wall !== back.wall) continue
        const span = openingSpan(win)
        const from = span.axis === 'x' ? spot.rect.xCm : spot.rect.yCm
        const to = from + (span.axis === 'x' ? spot.rect.widthCm : spot.rect.depthCm)
        if (Math.min(to, span.endCm) - Math.max(from, span.startCm) >= 20) cost += 250
      }
    }
    // 현관에서 침대가 곧바로 보이지 않게 한다
    if (ctx.doorStrip && rectsOverlap(spot.rect, ctx.doorStrip)) cost += 250
  }

  // ── 테마마다 다른 기준 ──
  if (mode === 'open_space') {
    const rects = [spot.rect, ...ctx.swings]
    for (const other of placed) if (!isMat(other.item)) rects.push(other.rect)
    const open = largestFreeRect(rects, room)
    cost -= (open.widthCm * open.depthCm) / 40
  } else if (mode === 'compact') {
    cost += distance(centerOf(spot.rect), ctx.farCorner) * 1.2
  } else if (mode === 'window_desk') {
    if (item.category === 'desk') {
      cost += windowDistance(spot.rect, ctx) * 4
      // 창을 등지거나 마주 보지 않고 옆에서 빛을 받는다
      const facesAlongWindow = ctx.windows.some((win) => {
        const horizontal = win.wall === 'top' || win.wall === 'bottom'
        const dir = frontDirection(spot.rotation)
        return horizontal ? dir.dx !== 0 : dir.dy !== 0
      })
      if (facesAlongWindow) cost -= 80
    } else if (item.category === 'bed') {
      cost -= windowDistance(spot.rect, ctx) * 0.3
    }
  } else if (mode === 'max_storage') {
    if (isStorage(item)) {
      if (ctx.storageWall === null) {
        // 첫 수납 가구는 문에서 먼 벽 구석에서 시작한다
        cost += distance(centerOf(spot.rect), ctx.farCorner) * 0.3
      } else {
        const sameWall = back !== null && back.wall === ctx.storageWall
        const flush = placed.some((other) => {
          if (!isStorage(other.item)) return false
          const gap = gapBetween(spot.rect, other.rect)
          return gap !== null && gap.gapCm === 0 && gap.facingCm >= 20
        })
        if (!sameWall) cost += 500
        else if (!flush) cost += 200
      }
    }
  } else if (mode === 'zone_split') {
    const bed = placed.find((other) => other.item.category === 'bed')
    if (item.category === 'bed' && ctx.entrance) {
      // 잠자는 곳은 문에서 먼 쪽에 둔다
      cost -= distance(centerOf(spot.rect), centerOf(openingFrontZone(ctx.entrance, room, 1))) * 0.4
    } else if (isDivider && bed) {
      // 수납 가구가 침대 옆에 등을 대고 서서 구역을 나눈다
      const gap = gapBetween(spot.rect, bed.rect)
      const touching = gap !== null && gap.gapCm === 0 && gap.facingCm >= 30
      if (!touching) cost += 600
      else {
        cost -= gap.facingCm
        const dir = frontDirection(spot.rotation)
        const mine = centerOf(spot.rect)
        const theirs = centerOf(bed.rect)
        const awayFromBed =
          gap.axis === 'x' ? Math.sign(mine.xCm - theirs.xCm) === dir.dx : Math.sign(mine.yCm - theirs.yCm) === dir.dy
        if (!awayFromBed) cost += 300
      }
    } else if (item.category === 'desk' && bed) {
      // 일하는 곳은 침대에서 멀리 둔다
      cost -= rectDistance(spot.rect, bed.rect) * 1.5
    }
  }
  return cost
}

/**
 * 조건을 지키는 후보 가운데 가장 나은 자리. 없으면 null.
 * @param {FurnitureItem} item
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @param {Mode} mode
 * @param {Set<string>} tolerated
 * @param {((spot: Spot) => boolean) | null} [skip] 피해야 하는 자리(다른 배치안과 겹치지 않게)
 * @param {boolean} [interior]
 * @returns {Spot | null}
 */
function bestSpot(item, placed, ctx, mode, tolerated, skip = null, interior = false) {
  /** @type {{ spot: Spot, cost: number }[]} */
  const ranked = []
  for (const spot of candidates(item, placed, ctx, interior)) {
    if (skip && skip(spot)) continue
    if (!fitsHard(spot, placed, ctx)) continue
    ranked.push({ spot, cost: weigh(spot, placed, ctx, mode) })
  }
  ranked.sort(
    (a, b) =>
      a.cost - b.cost || a.spot.yCm - b.spot.yCm || a.spot.xCm - b.spot.xCm || a.spot.rotation - b.spot.rotation,
  )
  for (const entry of ranked) {
    if (keepsAccess(entry.spot, placed, ctx, tolerated)) return entry.spot
  }
  return null
}

/**
 * 의자 자리: 아직 의자가 없는 책상·테이블의 정면 가운데에, 책상을 바라보게 놓는다.
 * @param {FurnitureItem} chair
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @param {Set<string>} tolerated
 * @returns {Spot | null}
 */
function chairSpot(chair, placed, ctx, tolerated) {
  for (const host of placed) {
    if (!isSeatHost(host.item)) continue
    const zone = host.front ?? frontZone({ ...host.item, xCm: host.xCm, yCm: host.yCm, rotation: host.rotation }, WALK_CM)
    if (!zone) continue
    const taken = placed.some((other) => isChair(other.item) && rectsOverlap(other.rect, zone))
    if (taken) continue
    const rotation = /** @type {Rotation} */ ((host.rotation + 180) % 360)
    const size = footprintSize({ widthCm: chair.widthCm, depthCm: chair.depthCm, rotation })
    const dir = frontDirection(host.rotation)
    const r = host.rect
    // 가운데가 막혀 있으면 책상 앞의 양 끝도 본다
    const alongX = dir.dy !== 0
    const slack = alongX ? r.widthCm - size.widthCm : r.depthCm - size.depthCm
    for (const shift of slack > 0 ? [slack / 2, 0, slack] : [slack / 2]) {
      let x = Math.round(r.xCm + (alongX ? shift : 0))
      let y = Math.round(r.yCm + (alongX ? 0 : shift))
      if (dir.dy === 1) y = r.yCm + r.depthCm
      else if (dir.dy === -1) y = r.yCm - size.depthCm
      else if (dir.dx === 1) x = r.xCm + r.widthCm
      else x = r.xCm - size.widthCm
      const spot = makeSpot(chair, x, y, rotation)
      if (fitsHard(spot, placed, ctx) && keepsAccess(spot, placed, ctx, tolerated)) return spot
    }
  }
  return null
}

/**
 * 매트 자리: 가장 넓은 빈 바닥의 가운데. 매트는 겹침·막힘 판정에서 빠지므로 방 안에만 있으면 된다.
 * @param {FurnitureItem} mat
 * @param {Spot[]} placed
 * @param {Ctx} ctx
 * @returns {Spot | null}
 */
function matSpot(mat, placed, ctx) {
  const rects = [...ctx.swings]
  for (const other of placed) rects.push(other.rect)
  const open = largestFreeRect(rects, ctx.room)
  const middle = centerOf(open)
  /** @type {Spot | null} */
  let fallback = null
  for (const rotation of /** @type {Rotation[]} */ ([0, 90])) {
    const size = footprintSize({ widthCm: mat.widthCm, depthCm: mat.depthCm, rotation })
    const maxX = ctx.room.widthCm - size.widthCm
    const maxY = ctx.room.depthCm - size.depthCm
    if (maxX < 0 || maxY < 0) continue
    const x = Math.min(Math.max(0, Math.round(middle.xCm - size.widthCm / 2)), maxX)
    const y = Math.min(Math.max(0, Math.round(middle.yCm - size.depthCm / 2)), maxY)
    const spot = makeSpot(mat, x, y, rotation)
    if (size.widthCm <= open.widthCm && size.depthCm <= open.depthCm) return spot
    fallback ??= spot
  }
  return fallback
}

// ── 테마 배치안 ─────────────────────────────────────────────────────────

/** @type {Record<string, number>} */
const BASE_RANK = { bed: 0, wardrobe: 1, sofa: 2, desk: 3, table: 4, bookshelf: 5, drawer: 6, tv_stand: 7, other: 8, chair: 9, mat: 10 }

/**
 * 테마마다 가구를 놓는 순서. 기본은 침대 먼저, 큰 가구 먼저, 의자와 매트는 마지막.
 * @param {FurnitureItem[]} items
 * @param {Mode} mode
 * @param {string | null} dividerId
 * @returns {FurnitureItem[]}
 */
function placementOrder(items, mode, dividerId) {
  /** @param {FurnitureItem} item */
  const rank = (item) => {
    const base = BASE_RANK[item.category] ?? 8
    if (mode === 'window_desk' && item.category === 'desk') return -1
    if (mode === 'max_storage' && isStorage(item)) return -1
    if (mode === 'zone_split' && item.id === dividerId) return 0.5
    if (mode === 'zone_split' && item.category === 'desk') return 0.7
    return base
  }
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.item.widthCm * b.item.depthCm - a.item.widthCm * a.item.depthCm ||
        a.index - b.index,
    )
    .map((entry) => entry.item)
}

/**
 * 테마 하나의 배치를 만든다.
 * @param {Room} room
 * @param {Lifestyle} lifestyle
 * @param {ThemeKey} themeKey
 * @param {Placement[]} avoid 기준 가구가 피해야 하는 자리(앞서 만든 배치안의 자리)
 * @returns {{ placements: Placement[], unplacedIds: string[], anchorId: string | null }}
 */
function buildTheme(room, lifestyle, themeKey, avoid) {
  const ctx = makeCtx(room, lifestyle)
  /** @type {Spot[]} */
  const placed = []
  // 사용자가 손으로 옮겨 고정한 가구는 그 자리에 둔다
  for (const item of room.furniture) {
    if (item.locked) placed.push(makeSpot(item, item.xCm, item.yCm, item.rotation))
  }
  const tolerated = unreachableIds(placed, ctx)
  const movable = room.furniture.filter((item) => !item.locked)
  if (themeKey === 'zone_split') {
    const pick =
      movable.find((item) => item.category === 'bookshelf') ??
      movable.find((item) => item.category === 'drawer') ??
      movable.find((item) => item.category === 'wardrobe')
    ctx.dividerId = pick ? pick.id : null
  }
  const order = placementOrder(movable, themeKey, ctx.dividerId)
  const anchor = order.find((item) => !isChair(item) && !isMat(item)) ?? null
  /** @type {string[]} */
  const unplacedIds = []
  /** @type {FurnitureItem[]} */
  const mats = []
  for (const item of order) {
    if (isMat(item)) {
      mats.push(item)
      continue
    }
    /** @type {Spot | null} */
    let spot = null
    if (isChair(item)) spot = chairSpot(item, placed, ctx, tolerated)
    if (!spot) {
      const skip =
        anchor && item.id === anchor.id && avoid.length > 0
          ? /** @param {Spot} candidate */ (candidate) =>
              avoid.some(
                (taken) =>
                  taken.rotation === candidate.rotation &&
                  Math.abs(taken.xCm - candidate.xCm) < 50 &&
                  Math.abs(taken.yCm - candidate.yCm) < 50,
              )
          : null
      spot = bestSpot(item, placed, ctx, themeKey, tolerated, skip)
    }
    if (!spot) {
      unplacedIds.push(item.id)
      continue
    }
    placed.push(spot)
    if (themeKey === 'max_storage' && isStorage(item) && ctx.storageWall === null) {
      const back = backWall({ ...item, xCm: spot.xCm, yCm: spot.yCm, rotation: spot.rotation }, room, 0)
      ctx.storageWall = back ? back.wall : ''
    }
  }
  for (const mat of mats) {
    const spot = matSpot(mat, placed, ctx)
    if (spot) placed.push(spot)
    else unplacedIds.push(mat.id)
  }
  /** @type {Map<string, Spot>} */
  const byId = new Map(placed.map((spot) => [spot.item.id, spot]))
  /** @type {Placement[]} */
  const placements = []
  for (const item of room.furniture) {
    const spot = byId.get(item.id)
    if (spot) placements.push({ furnitureId: item.id, xCm: spot.xCm, yCm: spot.yCm, rotation: spot.rotation })
  }
  const unplacedSet = new Set(unplacedIds)
  return {
    placements,
    unplacedIds: room.furniture.filter((item) => unplacedSet.has(item.id)).map((item) => item.id),
    anchorId: anchor ? anchor.id : null,
  }
}

/**
 * 두 배치가 사실상 같은지(같은 가구가 같은 방향으로 5cm 안에 있음).
 * @param {{ placements: Placement[], unplacedIds: string[] }} a
 * @param {{ placements: Placement[], unplacedIds: string[] }} b
 */
function sameLayout(a, b) {
  if (a.placements.length !== b.placements.length) return false
  const other = new Map(b.placements.map((placement) => [placement.furnitureId, placement]))
  for (const placement of a.placements) {
    const match = other.get(placement.furnitureId)
    if (!match || match.rotation !== placement.rotation) return false
    if (Math.abs(match.xCm - placement.xCm) > 5 || Math.abs(match.yCm - placement.yCm) > 5) return false
  }
  return true
}

/**
 * 테마 배치안. 최대 5개, themeKey가 서로 다르고 배치도 서로 달라야 한다. id·title·summary는 labels.js THEMES 값.
 * @param {Room} room
 * @param {{ lifestyle?: Lifestyle }} [options]
 * @returns {LayoutVariant[]}
 */
export function generateVariants(room, options) {
  if (!room || !Array.isArray(room.furniture) || room.furniture.length === 0) return []
  const lifestyle = options?.lifestyle ?? 'single'
  // 방에 없는 것을 이름으로 내세우는 테마는 만들지 않는다
  const hasBed = room.furniture.some((item) => item.category === 'bed')
  const hasDesk = room.furniture.some(isSeatHost)
  const storageCount = room.furniture.filter(isStorage).length
  const hasWindow = (room.openings ?? []).some((opening) => opening.type === 'window')
  /** @type {Record<ThemeKey, boolean>} */
  const fits = {
    open_space: true,
    zone_split: hasBed && (storageCount > 0 || hasDesk),
    window_desk: hasDesk && hasWindow,
    max_storage: storageCount >= 2,
    compact: true,
  }
  /** @type {LayoutVariant[]} */
  const variants = []
  for (const theme of THEMES) {
    if (!fits[theme.themeKey]) continue
    /** @type {Placement[]} */
    const avoid = []
    /** @type {{ placements: Placement[], unplacedIds: string[] } | null} */
    let chosen = null
    // 앞선 배치안과 같으면 기준 가구의 자리를 바꿔서 다시 만든다
    for (let attempt = 0; attempt < 4 && !chosen; attempt += 1) {
      const built = buildTheme(room, lifestyle, theme.themeKey, avoid)
      if (built.placements.length === 0) break
      if (!variants.some((earlier) => sameLayout(earlier, built))) {
        // 다시 만든 안이 가구를 더 못 놓으면 쓰지 않는다
        const fewest = variants.reduce((min, earlier) => Math.min(min, earlier.unplacedIds.length), Infinity)
        if (attempt === 0 || built.unplacedIds.length <= fewest) chosen = built
      }
      if (chosen || built.anchorId === null) break
      const before = avoid.length
      for (const source of [built, ...variants]) {
        const taken = source.placements.find((placement) => placement.furnitureId === built.anchorId)
        if (taken && !avoid.includes(taken)) avoid.push(taken)
      }
      if (avoid.length === before) break
    }
    if (chosen) {
      variants.push({
        id: theme.id,
        themeKey: theme.themeKey,
        title: theme.title,
        summary: theme.summary,
        placements: chosen.placements,
        unplacedIds: chosen.unplacedIds,
      })
    }
  }
  // 가구를 다 놓은 안이 하나라도 있으면 못 놓은 안은 내놓지 않는다. 하나도 없으면 가장 많이 놓은 안만 남긴다
  const fewestLeft = variants.reduce((min, variant) => Math.min(min, variant.unplacedIds.length), Infinity)
  return variants.filter((variant) => variant.unplacedIds.length === fewestLeft)
}

/**
 * 이미 놓인 가구는 그대로 두고 새 가구 하나가 들어갈 빈 자리를 찾는다. 없으면 null.
 * 의자는 의자가 없는 책상·테이블 앞을 먼저 보고, 그다음 벽에 붙는 자리, 마지막으로 방 안쪽을 본다.
 * @param {Room} room
 * @param {FurnitureItem} item
 * @returns {{ xCm: number, yCm: number, rotation: Rotation } | null}
 */
export function placeNewFurniture(room, item) {
  if (!room || !item) return null
  const ctx = makeCtx(room, 'single')
  const placed = room.furniture
    .filter((other) => other.id !== item.id)
    .map((other) => makeSpot(other, other.xCm, other.yCm, other.rotation))
  const tolerated = unreachableIds(placed, ctx)
  /** @type {Spot | null} */
  let spot = null
  if (isMat(item)) spot = matSpot(item, placed, ctx)
  else {
    if (isChair(item)) spot = chairSpot(item, placed, ctx, tolerated)
    spot ??= bestSpot(item, placed, ctx, 'plain', tolerated)
    spot ??= bestSpot(item, placed, ctx, 'plain', tolerated, null, true)
  }
  return spot ? { xCm: spot.xCm, yCm: spot.yCm, rotation: spot.rotation } : null
}

/**
 * 배치안의 좌표를 가구 배열에 적용한 새 배열. placements에 없는 가구는 그대로 둔다.
 * @param {FurnitureItem[]} furniture
 * @param {Placement[]} placements
 * @returns {FurnitureItem[]}
 */
export function applyPlacements(furniture, placements) {
  /** @type {Map<string, Placement>} */
  const byId = new Map()
  for (const placement of placements ?? []) byId.set(placement.furnitureId, placement)
  return furniture.map((item) => {
    const placement = byId.get(item.id)
    if (!placement) return item
    return { ...item, xCm: placement.xCm, yCm: placement.yCm, rotation: placement.rotation }
  })
}

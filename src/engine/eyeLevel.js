// 눈높이 보기(3D에서 방 안에 서서 보기)에 쓰는 계산. 브라우저·three.js에 기대지 않는 순수 계산이다.
//
// - 좌표 약속은 docs/ARCHITECTURE.md 2장과 geometry.js 그대로다(cm, 방 안쪽 왼쪽 위가 원점, x는 오른쪽, y는 아래쪽).
// - 보는 방향(yaw, 도)은 가구 회전과 같은 약속이다: 0은 아래(+y), 90은 오른쪽(+x), 180은 위(-y), 270은 왼쪽(-x).
// - 여기서 만드는 것은 위치와 높이뿐이다. 점수·등급·순위는 만들지 않는다.

/** @import { FurnitureItem, Rect, Room } from '../types/schema.ts' */

import { footprint } from './geometry.js'

/**
 * 눈높이 보기 참고값. 법적·안전 기준이 아니라 화면에 쓰려고 정한 어림값이다.
 *
 * 빨간 점을 찍는 높이대(가구 윗면 높이 40~110cm)를 정한 근거:
 * - 아래 40cm: 앉아서 놀거나 붙잡고 일어서는 돌 전후 아이의 얼굴 높이가 40cm 안팎이다(TV장 45cm, 협탁 50cm가 들어온다).
 * - 위 110cm: 아이 눈높이 90cm에 눈에서 정수리까지 약 10cm, 까치발·뛰는 여유 약 10cm를 더했다(만 5세 안팎의 키).
 * - validator.js REFERENCE.tallFurnitureCm(120cm)보다 낮게 잡았다. 키 큰 가구는 "넘어짐" 팁에서 따로 다룬다.
 */
export const EYE_REFERENCE = Object.freeze({
  /** 아이 눈높이 */
  childEyeCm: 90,
  /** 어른 눈높이 */
  adultEyeCm: 160,
  /** 설 수 있는 자리: 벽과 가구에서 이만큼 떨어져야 한다(어깨 폭의 절반쯤) */
  standMarginCm: 20,
  /** 이보다 낮은 것(매트 등)은 밟고 설 수 있다 */
  walkOverCm: 10,
  /** 처음 서는 자리: 문에서 방 안쪽으로 들어오는 한 걸음 */
  entryStepCm: 70,
  /** 처음 볼 때 방 가운데 쪽 좌우 이 각도(도) 안에 가구가 하나도 없으면 가구가 모인 쪽을 본다 */
  entryViewHalfDeg: 30,
  /** 가구가 모인 쪽을 잴 때 이보다 가까운 가구는 뺀다 (발밑의 가구만 쳐다보게 되지 않게) */
  entryNearCm: 100,
  /** 빨간 점을 찍는 가구 윗면 높이대 (위 설명 참고) */
  cornerMinCm: 40,
  cornerMaxCm: 110,
  /** 벽이나 더 높은 가구에서 이 안에 붙은 꼭짓점은 튀어나오지 않은 것으로 본다 */
  cornerWallCm: 5,
  /** 자리와 길을 찾는 격자 */
  gridCm: 5,
})

/**
 * @typedef {{ xCm: number, yCm: number }} Spot 방 안의 한 점(cm)
 * @typedef {Pick<Room, 'widthCm' | 'depthCm' | 'furniture'>} StandRoom
 * @typedef {{ furnitureId: string, xCm: number, yCm: number, heightCm: number }} CornerMarker
 */

/**
 * 보기 방식의 눈높이(cm). 둘러보기(off)는 null.
 * @param {'off' | 'child' | 'adult'} mode
 * @returns {number | null}
 */
export function eyeHeightCm(mode) {
  if (mode === 'child') return EYE_REFERENCE.childEyeCm
  if (mode === 'adult') return EYE_REFERENCE.adultEyeCm
  return null
}

/**
 * 밟고 설 수 있는 것(매트, 높이 10cm 미만)인지.
 * @param {Pick<FurnitureItem, 'category' | 'heightCm'>} item
 */
function isWalkOver(item) {
  return item.category === 'mat' || item.heightCm < EYE_REFERENCE.walkOverCm
}

/**
 * 서 있을 수 없는 가구의 바닥 차지 영역들. 매트처럼 밟을 수 있는 것은 뺀다.
 * @param {Pick<Room, 'furniture'>} room
 * @returns {Rect[]}
 */
export function standObstacles(room) {
  return room.furniture.filter((item) => !isWalkOver(item)).map((item) => footprint(item))
}

/**
 * 점에서 직사각형까지의 거리(cm). 안에 있으면 0.
 * @param {Rect} rect
 * @param {number} x
 * @param {number} y
 */
function distanceToRect(rect, x, y) {
  const dx = Math.max(rect.xCm - x, 0, x - (rect.xCm + rect.widthCm))
  const dy = Math.max(rect.yCm - y, 0, y - (rect.yCm + rect.depthCm))
  return Math.hypot(dx, dy)
}

/**
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @param {Rect[]} obstacles
 * @param {number} x
 * @param {number} y
 * @param {number} marginCm
 */
function isFree(room, obstacles, x, y, marginCm) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (x < marginCm || y < marginCm || x > room.widthCm - marginCm || y > room.depthCm - marginCm) return false
  for (const rect of obstacles) {
    if (distanceToRect(rect, x, y) < marginCm) return false
  }
  return true
}

/**
 * 그 자리에 설 수 있는지: 방 안쪽이고 벽과 가구에서 20cm 이상 떨어져 있어야 한다.
 * @param {StandRoom} room
 * @param {number} xCm
 * @param {number} yCm
 */
export function canStandAt(room, xCm, yCm) {
  return isFree(room, standObstacles(room), xCm, yCm, EYE_REFERENCE.standMarginCm)
}

/**
 * 한 축에서 살펴볼 좌표들: 5cm 격자 + 누른 곳 + 가구에서 딱 20cm 떨어진 줄.
 * @param {number} minCm
 * @param {number} maxCm
 * @param {number} nearCm
 * @param {number[]} extra
 * @returns {number[]}
 */
function candidateLines(minCm, maxCm, nearCm, extra) {
  const lo = Math.ceil(minCm)
  const hi = Math.floor(maxCm)
  if (hi < lo) return []
  /** @type {Set<number>} */
  const values = new Set([hi, Math.min(hi, Math.max(lo, nearCm))])
  for (let v = lo; v <= hi; v += EYE_REFERENCE.gridCm) values.add(v)
  for (const v of extra) {
    if (v >= lo && v <= hi) values.add(v)
  }
  return [...values].sort((a, b) => a - b)
}

/**
 * 누른 곳에서 가장 가까운 설 수 있는 자리(정수 cm). 누른 곳에 설 수 있으면 그 자리 그대로다.
 * 방 밖이나 가구 안을 눌러도 가장 가까운 자리를 찾는다. 설 곳이 하나도 없으면 null.
 * @param {StandRoom} room
 * @param {number} xCm
 * @param {number} yCm
 * @returns {Spot | null}
 */
export function nearestStandSpot(room, xCm, yCm) {
  if (!Number.isFinite(xCm) || !Number.isFinite(yCm)) return null
  const obstacles = standObstacles(room)
  const margin = EYE_REFERENCE.standMarginCm
  const x = Math.round(xCm)
  const y = Math.round(yCm)
  if (isFree(room, obstacles, x, y, margin)) return { xCm: x, yCm: y }

  const xs = candidateLines(
    margin,
    room.widthCm - margin,
    x,
    obstacles.flatMap((r) => [Math.floor(r.xCm - margin), Math.ceil(r.xCm + r.widthCm + margin)]),
  )
  const ys = candidateLines(
    margin,
    room.depthCm - margin,
    y,
    obstacles.flatMap((r) => [Math.floor(r.yCm - margin), Math.ceil(r.yCm + r.depthCm + margin)]),
  )
  /** @type {Spot | null} */
  let best = null
  let bestSq = Infinity
  for (const cy of ys) {
    const dySq = (cy - yCm) ** 2
    if (dySq >= bestSq) continue
    for (const cx of xs) {
      const distSq = dySq + (cx - xCm) ** 2
      if (distSq >= bestSq || !isFree(room, obstacles, cx, cy, margin)) continue
      bestSq = distSq
      best = { xCm: cx, yCm: cy }
    }
  }
  return best
}

/**
 * from에서 to를 바라보는 방향(도, 0 이상 360 미만).
 * @param {Spot} from
 * @param {Spot} to
 */
export function yawTowardDeg(from, to) {
  const deg = (Math.atan2(to.xCm - from.xCm, to.yCm - from.yCm) * 180) / Math.PI
  return (deg + 360) % 360
}

/**
 * 처음 보는 방향(도). 방 가운데를 바라본다. 가운데에 서 있어서 바라볼 가운데가 없으면 평면도의 위쪽 벽(180도)을 본다.
 * 다만 그쪽 화면 안(좌우 30도)에 가구가 하나도 없으면, 빈 벽만 보이지 않게 가구가 모인 쪽(바닥 차지 넓이로 잰 무게중심)을 본다.
 * @param {StandRoom} room
 * @param {Spot} spot
 * @param {Spot} center
 */
function entryYawDeg(room, spot, center) {
  /** @param {Spot} p */
  const apart = (p) => Math.hypot(p.xCm - spot.xCm, p.yCm - spot.yCm)
  const toCenter = apart(center) >= 10 ? yawTowardDeg(spot, center) : 180
  const bodies = standObstacles(room).map((r) => ({
    xCm: r.xCm + r.widthCm / 2,
    yCm: r.yCm + r.depthCm / 2,
    area: r.widthCm * r.depthCm,
  }))
  /** 방 가운데 쪽에서 벗어난 각도 @param {number} deg */
  const off = (deg) => Math.abs(((deg - toCenter + 540) % 360) - 180)
  const inView = bodies.some((b) => apart(b) >= 10 && off(yawTowardDeg(spot, b)) <= EYE_REFERENCE.entryViewHalfDeg)
  if (inView) return toCenter
  const far = bodies.filter((b) => apart(b) >= EYE_REFERENCE.entryNearCm)
  const area = far.reduce((sum, b) => sum + b.area, 0)
  if (area <= 0) return toCenter
  const mass = {
    xCm: far.reduce((sum, b) => sum + b.xCm * b.area, 0) / area,
    yCm: far.reduce((sum, b) => sum + b.yCm * b.area, 0) / area,
  }
  return apart(mass) >= 10 ? yawTowardDeg(spot, mass) : toCenter
}

/**
 * 처음 서는 자리와 보는 방향. 첫 번째 문(현관)에서 방 안쪽으로 한 걸음 들어온 곳이고,
 * 문이 없으면 방 가운데다. 그 자리가 막혀 있으면 가장 가까운 설 수 있는 자리로 옮긴다.
 * 방 가운데를 바라보고, 그쪽에 가구가 하나도 안 보이면 가구가 모인 쪽을 바라본다(entryYawDeg).
 * @param {Pick<Room, 'widthCm' | 'depthCm' | 'furniture' | 'openings'>} room
 * @returns {{ xCm: number, yCm: number, yawDeg: number }}
 */
export function initialStandSpot(room) {
  const center = { xCm: room.widthCm / 2, yCm: room.depthCm / 2 }
  const entry = room.openings.find((opening) => opening.type === 'door')
  let wanted = center
  if (entry) {
    const middle = entry.offsetCm + entry.widthCm / 2
    const step = EYE_REFERENCE.entryStepCm
    if (entry.wall === 'top') wanted = { xCm: middle, yCm: step }
    else if (entry.wall === 'bottom') wanted = { xCm: middle, yCm: room.depthCm - step }
    else if (entry.wall === 'left') wanted = { xCm: step, yCm: middle }
    else wanted = { xCm: room.widthCm - step, yCm: middle }
  }
  const spot = nearestStandSpot(room, wanted.xCm, wanted.yCm) ?? { xCm: Math.round(center.xCm), yCm: Math.round(center.yCm) }
  return { xCm: spot.xCm, yCm: spot.yCm, yawDeg: Math.round(entryYawDeg(room, spot, center)) % 360 }
}

/**
 * 두 점을 잇는 곧은 길이 벽·가구에서 marginCm 이상 떨어져 있는지(4cm마다 살핀다).
 * @param {Pick<Room, 'widthCm' | 'depthCm'>} room
 * @param {Rect[]} obstacles
 * @param {Spot} a
 * @param {Spot} b
 * @param {number} marginCm
 */
function segmentClear(room, obstacles, a, b, marginCm) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.xCm - a.xCm, b.yCm - a.yCm) / 4))
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    if (!isFree(room, obstacles, a.xCm + (b.xCm - a.xCm) * t, a.yCm + (b.yCm - a.yCm) * t, marginCm)) return false
  }
  return true
}

/** 격자에서 옮겨 갈 수 있는 여덟 방향 (곧은 방향 먼저) */
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * from에서 to까지 가구를 피해 걸어가는 길. points는 차례로 지나갈 점들이고(from은 빼고 to로 끝난다),
 * 곧장 갈 수 있으면 to 하나다. 가구로 완전히 막혀 걸어서 갈 수 없으면 reachable이 false이고 points는 to 하나다.
 * @param {StandRoom} room
 * @param {Spot} from
 * @param {Spot} to 설 수 있는 자리 (nearestStandSpot의 결과)
 * @returns {{ points: Spot[], reachable: boolean }}
 */
export function walkPath(room, from, to) {
  const obstacles = standObstacles(room)
  const margin = EYE_REFERENCE.standMarginCm
  const grid = EYE_REFERENCE.gridCm
  // 격자 사이를 잇는 선이 둥근 모서리를 살짝 스치는 것은 봐준다
  const loose = margin - 2
  /** @param {Spot} a @param {Spot} b */
  const clear = (a, b) => segmentClear(room, obstacles, a, b, loose)
  if (clear(from, to)) return { points: [to], reachable: true }

  const blocked = { points: [to], reachable: false }
  const cols = Math.floor((room.widthCm - margin * 2) / grid) + 1
  const rows = Math.floor((room.depthCm - margin * 2) / grid) + 1
  if (cols < 1 || rows < 1) return blocked
  const free = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      free[r * cols + c] = isFree(room, obstacles, margin + c * grid, margin + r * grid, margin) ? 1 : 0
    }
  }
  /** 그 점에서 가장 가까운 빈 칸. 없으면 -1 @param {Spot} p */
  const cellNear = (p) => {
    let found = -1
    let foundSq = Infinity
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!free[r * cols + c]) continue
        const distSq = (margin + c * grid - p.xCm) ** 2 + (margin + r * grid - p.yCm) ** 2
        if (distSq < foundSq) {
          foundSq = distSq
          found = r * cols + c
        }
      }
    }
    return found
  }
  const start = cellNear(from)
  const goal = cellNear(to)
  if (start < 0 || goal < 0) return blocked

  // 너비 우선 탐색. prev에는 바로 앞 칸을 적는다(-1은 아직 안 간 칸)
  const prev = new Int32Array(cols * rows).fill(-1)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  prev[start] = start
  queue[tail++] = start
  while (head < tail && prev[goal] < 0) {
    const current = queue[head++]
    const cx = current % cols
    const cy = (current - cx) / cols
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const next = ny * cols + nx
      if (!free[next] || prev[next] >= 0) continue
      // 대각선으로 갈 때 가구 모서리를 가로지르지 않게 한다
      if (dx !== 0 && dy !== 0 && (!free[cy * cols + nx] || !free[ny * cols + cx])) continue
      prev[next] = current
      queue[tail++] = next
    }
  }
  if (prev[goal] < 0) return blocked

  /** @type {Spot[]} */
  const trail = [to]
  for (let cell = goal; ; cell = prev[cell]) {
    const cx = cell % cols
    trail.push({ xCm: margin + cx * grid, yCm: margin + ((cell - cx) / cols) * grid })
    if (cell === start) break
  }
  trail.reverse()

  // 줄 당기기: 곧장 보이는 가장 먼 점으로 건너뛰어 꺾이는 곳만 남긴다
  /** @type {Spot[]} */
  const points = []
  let anchor = from
  let index = 0
  while (index < trail.length) {
    let far = trail.length - 1
    while (far > index && !clear(anchor, trail[far])) far -= 1
    points.push(trail[far])
    anchor = trail[far]
    index = far + 1
  }
  return { points, reachable: true }
}

/**
 * 아이 눈높이에서 빨간 점으로 표시할 "부딪히기 쉬운 모서리".
 * 뾰족한 모서리가 있는 가구(hasSharpCorner) 가운데 윗면 높이가 40~110cm인 것의 윗면 꼭짓점이다.
 * 벽에서 5cm 안에 붙은 꼭짓점과, 같거나 더 높은 가구에 맞닿아 가려진 꼭짓점은 뺀다(의자는 가린 것으로 보지 않는다).
 * 참고용 표시이며 법적·안전 기준이 아니다.
 * @param {StandRoom} room
 * @returns {CornerMarker[]}
 */
export function sharpCornerMarkers(room) {
  const { cornerMinCm, cornerMaxCm, cornerWallCm } = EYE_REFERENCE
  const bodies = room.furniture.filter((item) => item.category !== 'mat').map((item) => ({ item, body: footprint(item) }))
  /** @type {CornerMarker[]} */
  const markers = []
  for (const { item, body } of bodies) {
    if (!item.hasSharpCorner || item.heightCm < cornerMinCm || item.heightCm > cornerMaxCm) continue
    const right = body.xCm + body.widthCm
    const bottom = body.yCm + body.depthCm
    const corners = [
      [body.xCm, body.yCm],
      [right, body.yCm],
      [body.xCm, bottom],
      [right, bottom],
    ]
    for (const [x, y] of corners) {
      const atWall = x <= cornerWallCm || y <= cornerWallCm || x >= room.widthCm - cornerWallCm || y >= room.depthCm - cornerWallCm
      if (atWall) continue
      const covered = bodies.some(
        (other) =>
          other.item !== item &&
          other.item.category !== 'chair' &&
          other.item.heightCm >= item.heightCm &&
          distanceToRect(other.body, x, y) <= cornerWallCm,
      )
      if (covered) continue
      markers.push({ furnitureId: item.id, xCm: x, yCm: y, heightCm: item.heightCm })
    }
  }
  return markers
}

// 2D 평면도 편집기가 쓰는 순수 계산: 자석 붙이기, 크기 조절, 벽 조각, 문·창문 모양, 이름표 줄이기.
// 좌표 약속과 기본 도형 계산은 src/engine/geometry.js 것을 그대로 쓴다.
import { clampToRoom, footprint, footprintSize } from '../engine/geometry.js'
import type { FurnitureItem, Opening, Rect, Room } from '../types/schema.ts'

/** 이 거리(cm) 안으로 들어오면 벽이나 다른 가구의 변에 딱 붙는다 */
export const SNAP_CM = 6
/** 가구 한 변의 최소 길이(cm) */
export const MIN_SIZE_CM = 20

type RoomSize = Pick<Room, 'widthCm' | 'depthCm'>
type RoomForSnap = Pick<Room, 'widthCm' | 'depthCm' | 'furniture'>

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** 붙일 수 있는 선 모으기: 네 벽 + 가까이 있는 다른 가구의 변 */
export function collectSnapLines(room: RoomForSnap, moving: FurnitureItem, rect: Rect): { x: number[]; y: number[] } {
  const x = [0, room.widthCm]
  const y = [0, room.depthCm]
  for (const other of room.furniture) {
    if (other.id === moving.id) continue
    // 매트는 바닥에 깔리는 것이라 다른 가구가 매트 가장자리에 걸리지 않게 한다
    if (other.category === 'mat' && moving.category !== 'mat') continue
    const o = footprint(other)
    const nearInY = o.yCm - SNAP_CM < rect.yCm + rect.depthCm && o.yCm + o.depthCm + SNAP_CM > rect.yCm
    const nearInX = o.xCm - SNAP_CM < rect.xCm + rect.widthCm && o.xCm + o.widthCm + SNAP_CM > rect.xCm
    if (nearInY) x.push(o.xCm, o.xCm + o.widthCm)
    if (nearInX) y.push(o.yCm, o.yCm + o.depthCm)
  }
  return { x, y }
}

/** 내 변(edges)에서 가장 가까운 선까지의 이동량. 붙을 선이 없으면 delta 0, line null */
export function nearestSnap(edges: number[], lines: number[]): { delta: number; line: number | null } {
  let best = SNAP_CM + 0.0001
  let delta = 0
  let line: number | null = null
  for (const edge of edges) {
    for (const candidate of lines) {
      const distance = Math.abs(candidate - edge)
      if (distance < best) {
        best = distance
        delta = candidate - edge
        line = candidate
      }
    }
  }
  return { delta, line }
}

export interface SnapGuides {
  x: number | null
  y: number | null
}

/** 벽에 붙은 것은 벽 선과 겹쳐 보이므로 안내선을 그리지 않는다 */
function guideOf(line: number | null, edges: number[], max: number): number | null {
  if (line === null || line <= 0 || line >= max) return null
  return edges.includes(line) ? line : null
}

/** 끌어서 옮길 때: 원하는 왼쪽 위 좌표를 자석처럼 붙이고 방 안으로 맞춘다 (cm 정수) */
export function snapMove(
  room: RoomForSnap,
  item: FurnitureItem,
  wantX: number,
  wantY: number,
): { xCm: number; yCm: number; guides: SnapGuides } {
  const size = footprintSize(item)
  const rect: Rect = { xCm: wantX, yCm: wantY, widthCm: size.widthCm, depthCm: size.depthCm }
  const lines = collectSnapLines(room, item, rect)
  const sx = nearestSnap([wantX, wantX + size.widthCm], lines.x)
  const sy = nearestSnap([wantY, wantY + size.depthCm], lines.y)
  const clamped = clampToRoom({ ...rect, xCm: wantX + sx.delta, yCm: wantY + sy.delta }, room)
  const xCm = Math.round(clamped.xCm)
  const yCm = Math.round(clamped.yCm)
  return {
    xCm,
    yCm,
    guides: {
      x: guideOf(sx.line, [xCm, xCm + size.widthCm], room.widthCm),
      y: guideOf(sy.line, [yCm, yCm + size.depthCm], room.depthCm),
    },
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

/**
 * 손잡이를 끌어 크기를 바꿀 때의 새 바닥 차지 영역.
 * hx·hy는 움직이는 변(-1 왼쪽/위, 1 오른쪽/아래, 0 그대로). 반대쪽 변은 start 그대로 둔다.
 * 최소 20cm, 방 안, cm 정수.
 */
export function resizeRect(
  room: RoomForSnap,
  item: FurnitureItem,
  start: Rect,
  hx: -1 | 0 | 1,
  hy: -1 | 0 | 1,
  pointerX: number,
  pointerY: number,
): { rect: Rect; guides: SnapGuides } {
  let left = start.xCm
  let right = start.xCm + start.widthCm
  let top = start.yCm
  let bottom = start.yCm + start.depthCm
  const lines = collectSnapLines(room, item, start)
  const guides: SnapGuides = { x: null, y: null }
  if (hx !== 0) {
    const snap = nearestSnap([pointerX], lines.x)
    const edge = Math.round(pointerX + snap.delta)
    if (hx === -1) left = clamp(edge, 0, right - MIN_SIZE_CM)
    else right = clamp(edge, left + MIN_SIZE_CM, room.widthCm)
    guides.x = guideOf(snap.line, [hx === -1 ? left : right], room.widthCm)
  }
  if (hy !== 0) {
    const snap = nearestSnap([pointerY], lines.y)
    const edge = Math.round(pointerY + snap.delta)
    if (hy === -1) top = clamp(edge, 0, bottom - MIN_SIZE_CM)
    else bottom = clamp(edge, top + MIN_SIZE_CM, room.depthCm)
    guides.y = guideOf(snap.line, [hy === -1 ? top : bottom], room.depthCm)
  }
  return { rect: { xCm: left, yCm: top, widthCm: right - left, depthCm: bottom - top }, guides }
}

/** 직사각형에서 방 안에 있는 부분만. 없으면 null */
export function clipToRoom(rect: Rect, room: RoomSize): Rect | null {
  const left = Math.max(0, rect.xCm)
  const top = Math.max(0, rect.yCm)
  const right = Math.min(room.widthCm, rect.xCm + rect.widthCm)
  const bottom = Math.min(room.depthCm, rect.yCm + rect.depthCm)
  if (right - left <= 0 || bottom - top <= 0) return null
  return { xCm: left, yCm: top, widthCm: right - left, depthCm: bottom - top }
}

/** 벽 띠를 문 자리만 비우고 조각으로 나눈다. thickness는 벽 두께(cm). 벽은 방 바깥쪽으로 그린다 */
export function wallBoxes(room: Pick<Room, 'widthCm' | 'depthCm' | 'openings'>, thickness: number): Box[] {
  const boxes: Box[] = []
  const walls = ['top', 'bottom', 'left', 'right'] as const
  for (const wall of walls) {
    const horizontal = wall === 'top' || wall === 'bottom'
    const length = horizontal ? room.widthCm : room.depthCm
    // 모서리는 위·아래 벽이 덮는다
    const from = horizontal ? -thickness : 0
    const to = horizontal ? length + thickness : length
    const gaps = room.openings
      .filter((opening) => opening.type === 'door' && opening.wall === wall)
      .map((opening) => [clamp(opening.offsetCm, 0, length), clamp(opening.offsetCm + opening.widthCm, 0, length)])
      .filter(([start, end]) => end > start)
      .sort((a, b) => a[0] - b[0])
    let cursor = from
    const pieces: [number, number][] = []
    for (const [start, end] of gaps) {
      if (start > cursor) pieces.push([cursor, start])
      cursor = Math.max(cursor, end)
    }
    if (to > cursor) pieces.push([cursor, to])
    for (const [start, end] of pieces) {
      if (wall === 'top') boxes.push({ x: start, y: -thickness, width: end - start, height: thickness })
      else if (wall === 'bottom') boxes.push({ x: start, y: room.depthCm, width: end - start, height: thickness })
      else if (wall === 'left') boxes.push({ x: -thickness, y: start, width: thickness, height: end - start })
      else boxes.push({ x: room.widthCm, y: start, width: thickness, height: end - start })
    }
  }
  return boxes
}

export interface OpeningShape {
  /** 벽 띠 위에서 문·창문이 차지하는 자리 */
  band: Box
  /** 경첩(문·창문의 시작 끝, 벽 안쪽 선 위) */
  hinge: Point
  /** 닫혔을 때 문 끝 */
  closedEnd: Point
  /** 90도 열렸을 때 문 끝 */
  openEnd: Point
  radius: number
  /** SVG 원호 방향 */
  sweep: 0 | 1
  horizontal: boolean
}

/**
 * 문·창문을 그릴 좌표. 경첩은 offset 쪽 끝에 둔다.
 * 안쪽으로 열리는 문은 문 폭만큼의 4분원, 바깥으로 열리는 문은 outwardMaxCm까지만 그린다.
 */
export function openingShape(opening: Opening, room: RoomSize, thickness: number, outwardMaxCm: number): OpeningShape {
  const horizontal = opening.wall === 'top' || opening.wall === 'bottom'
  const o = opening.offsetCm
  const w = opening.widthCm
  let hinge: Point
  let inward: Point
  let band: Box
  if (opening.wall === 'top') {
    hinge = { x: o, y: 0 }
    inward = { x: 0, y: 1 }
    band = { x: o, y: -thickness, width: w, height: thickness }
  } else if (opening.wall === 'bottom') {
    hinge = { x: o, y: room.depthCm }
    inward = { x: 0, y: -1 }
    band = { x: o, y: room.depthCm, width: w, height: thickness }
  } else if (opening.wall === 'left') {
    hinge = { x: 0, y: o }
    inward = { x: 1, y: 0 }
    band = { x: -thickness, y: o, width: thickness, height: w }
  } else {
    hinge = { x: room.widthCm, y: o }
    inward = { x: -1, y: 0 }
    band = { x: room.widthCm, y: o, width: thickness, height: w }
  }
  const along: Point = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 }
  const sign = opening.swingInward ? 1 : -1
  const radius = opening.swingInward ? w : Math.min(w, Math.max(0, outwardMaxCm))
  const swing: Point = { x: inward.x * sign, y: inward.y * sign }
  const cross = along.x * swing.y - along.y * swing.x
  return {
    band,
    hinge,
    closedEnd: { x: hinge.x + along.x * radius, y: hinge.y + along.y * radius },
    openEnd: { x: hinge.x + swing.x * radius, y: hinge.y + swing.y * radius },
    radius,
    sweep: cross > 0 ? 1 : 0,
    horizontal,
  }
}

/** 이름을 주어진 폭(px)에 맞게 줄인다. 두 글자도 못 넣으면 null (그리지 않는다) */
export function fitLabel(name: string, availablePx: number, fontPx: number): string | null {
  const chars = Array.from(name.trim())
  if (chars.length === 0) return null
  const widthOf = (ch: string): number => ((ch.codePointAt(0) ?? 0) > 0x2e7f ? fontPx : fontPx * 0.62)
  let total = 0
  for (const ch of chars) total += widthOf(ch)
  if (total <= availablePx) return chars.join('')
  let used = fontPx // 말줄임표 자리
  let count = 0
  for (const ch of chars) {
    if (used + widthOf(ch) > availablePx) break
    used += widthOf(ch)
    count += 1
  }
  if (count < 2) return null
  return `${chars.slice(0, count).join('')}…`
}

export interface LabelLayout {
  /** 한 줄 또는 두 줄 */
  lines: string[]
  /** 세로로 긴 가구라 글자를 눕혀 쓴다 */
  vertical: boolean
  fontPx: number
}

/** 글자 폭 어림: 한글·한자는 글자 크기만큼, 영문·숫자·빈칸은 0.62배 */
function textWidthPx(text: string, fontPx: number): number {
  let total = 0
  for (const ch of text) total += (ch.codePointAt(0) ?? 0) > 0x2e7f ? fontPx : fontPx * 0.62
  return total
}

/** 빈칸에서 두 줄로 나누는 방법들. 두 줄의 폭이 비슷한 것부터 */
function splitInTwo(text: string, fontPx: number): string[][] {
  const words = text.split(' ').filter((word) => word !== '')
  const ways: string[][] = []
  for (let cut = 1; cut < words.length; cut += 1) ways.push([words.slice(0, cut).join(' '), words.slice(cut).join(' ')])
  const widest = (lines: string[]): number => Math.max(...lines.map((line) => textWidthPx(line, fontPx)))
  return ways.sort((a, b) => widest(a) - widest(b))
}

/**
 * 좁은 화면(휴대폰)의 가구 이름표. "800…"처럼 뜻 없이 잘라 쓰지 않는다.
 * 온전한 이름 한 줄 → 눕혀서 한 줄 → 두 줄 → 조금 작은 글자 → 짧은 이름(가구 종류) 순서로 가구 안에 들어가는 것을 고른다.
 * 아무것도 들어가지 않으면 null (이름표를 그리지 않는다. 가구를 누르면 이름을 볼 수 있다).
 */
export function layoutLabel(name: string, shortName: string, widthPx: number, heightPx: number): LabelLayout | null {
  const full = name.trim()
  const texts = full === '' ? [] : [full]
  const short = shortName.trim()
  if (short !== '' && short !== full) texts.push(short)
  const pad = 2
  for (const text of texts) {
    for (const fontPx of [11, 10]) {
      const lineHeight = fontPx * 1.2
      for (const lines of [[text], ...splitInTwo(text, fontPx)]) {
        const across = Math.max(...lines.map((line) => textWidthPx(line, fontPx)))
        const tall = lines.length * lineHeight
        if (across <= widthPx - pad * 2 && tall <= heightPx - pad * 2) return { lines, vertical: false, fontPx }
        if (heightPx > widthPx && across <= heightPx - pad * 2 && tall <= widthPx - pad * 2) return { lines, vertical: true, fontPx }
      }
    }
  }
  return null
}

/** 색이 어두운지 (어두운 가구 위에는 밝은 글자를 쓴다) */
export function isDarkColor(color: string): boolean {
  const hex = color.trim().replace('#', '')
  const full = hex.length === 3 ? hex.replace(/./g, (ch) => ch + ch) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

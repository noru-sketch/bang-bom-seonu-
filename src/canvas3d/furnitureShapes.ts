// 가구 한 개를 상자 여러 개로 나타내는 모양 계산. three.js를 쓰지 않는 순수 계산이다.
//
// 가구 기준 좌표(단위 m): 가운데 바닥이 원점, x는 가로(widthCm), y는 위, z는 깊이(depthCm).
// 정면은 +z, 뒤쪽은 -z. 회전 0일 때 평면도의 아래(+y)가 3D의 +z라서 2D 정면 약속과 같다.

import type { FurnitureItem } from '../types/schema.ts'

/** 색 변형: main=가구 색 그대로, dark=조금 어둡게(다리·손잡이), light=많이 밝게(매트리스·베개), soft=살짝 밝게(쿠션), line=많이 어둡게(문짝 사이 선) */
export type PartTone = 'main' | 'dark' | 'light' | 'soft' | 'line'

export interface BoxPart {
  /** 상자 가운데 위치 (m) */
  x: number
  y: number
  z: number
  /** 상자 크기 (m): w=가로, h=높이, d=깊이 */
  w: number
  h: number
  d: number
  tone: PartTone
}

type ShapeInput = Pick<FurnitureItem, 'category' | 'widthCm' | 'depthCm' | 'heightCm'>

const MIN = 0.005

/** 바닥에서 y0부터 y1까지 차는 상자 */
function box(tone: PartTone, x: number, z: number, y0: number, y1: number, w: number, d: number): BoxPart {
  const h = Math.max(MIN, y1 - y0)
  return { x, y: y0 + h / 2, z, w: Math.max(MIN, w), h, d: Math.max(MIN, d), tone }
}

/** 네 귀퉁이 다리 */
function legs(W: number, D: number, top: number, size: number, inset: number): BoxPart[] {
  const s = Math.min(size, W / 3, D / 3)
  const lx = Math.max(0, W / 2 - inset - s / 2)
  const lz = Math.max(0, D / 2 - inset - s / 2)
  return [
    box('dark', -lx, -lz, 0, top, s, s),
    box('dark', lx, -lz, 0, top, s, s),
    box('dark', -lx, lz, 0, top, s, s),
    box('dark', lx, lz, 0, top, s, s),
  ]
}

function bed(W: number, D: number, H: number): BoxPart[] {
  // 높이가 낮게 적힌 침대(매트리스 윗면 기준)는 머리판을 그 위로 올려 그린다
  const mattressTop = H > 0.7 ? 0.5 : H
  const headTop = H > 0.7 ? H : H + 0.4
  const head = Math.min(0.06, D / 6)
  const baseTop = mattressTop * 0.55
  const bodyD = D - head
  const bodyZ = head / 2
  const parts = [
    box('main', 0, bodyZ, 0, baseTop, W, bodyD),
    box('light', 0, bodyZ, baseTop, mattressTop, W - 0.04, bodyD - 0.04),
    // 머리판은 뒤쪽(-z)
    box('dark', 0, -D / 2 + head / 2, 0, headTop, W, head),
  ]
  const pillowD = Math.min(0.36, bodyD / 4)
  const pillowZ = -D / 2 + head + 0.06 + pillowD / 2
  if (W >= 1.3) {
    const pw = W / 2 - 0.12
    parts.push(box('light', -W / 4, pillowZ, mattressTop, mattressTop + 0.09, pw, pillowD))
    parts.push(box('light', W / 4, pillowZ, mattressTop, mattressTop + 0.09, pw, pillowD))
  } else {
    parts.push(box('light', 0, pillowZ, mattressTop, mattressTop + 0.09, Math.min(0.6, W - 0.2), pillowD))
  }
  return parts
}

function tableLike(W: number, D: number, H: number, withBackPanel: boolean): BoxPart[] {
  const top = Math.min(0.04, H / 3)
  const parts = [box('main', 0, 0, H - top, H, W, D), ...legs(W, D, H - top, 0.05, 0.03)]
  if (withBackPanel) {
    // 책상 가림판은 뒤쪽(-z). 의자는 정면(+z)에 놓인다
    const panelH = Math.min(0.3, (H - top) * 0.5)
    parts.push(box('dark', 0, -D / 2 + 0.05, H - top - panelH, H - top, W - 0.2, 0.018))
  }
  return parts
}

function chair(W: number, D: number, H: number): BoxPart[] {
  const seatTop = Math.min(0.46, H * 0.55)
  const seat = 0.06
  const w = W * 0.9
  const d = D * 0.9
  return [
    ...legs(w, d, seatTop - seat, 0.04, 0.02),
    box('main', 0, 0, seatTop - seat, seatTop, w, d),
    // 등받이는 뒤쪽(-z)
    box('main', 0, -d / 2 + 0.025, seatTop, H, w, 0.05),
  ]
}

function sofa(W: number, D: number, H: number): BoxPart[] {
  const seatTop = Math.min(0.42, H * 0.55)
  const back = Math.min(0.22, D * 0.28)
  const arm = Math.min(0.14, W * 0.12)
  const armTop = Math.min(H, seatTop + 0.18)
  const seatD = D - back
  const seatZ = back / 2
  return [
    box('dark', 0, 0, 0, seatTop * 0.45, W, D),
    box('soft', 0, seatZ, seatTop * 0.45, seatTop, W - arm * 2, seatD),
    // 등받이는 뒤쪽(-z)
    box('main', 0, -D / 2 + back / 2, seatTop * 0.45, H, W, back),
    box('main', -W / 2 + arm / 2, seatZ, seatTop * 0.45, armTop, arm, seatD),
    box('main', W / 2 - arm / 2, seatZ, seatTop * 0.45, armTop, arm, seatD),
  ]
}

/** 몸통 + 정면(+z)에 얇은 문짝·서랍 앞판. 판 사이 틈으로 어두운 몸통이 선처럼 보인다 */
function cabinet(W: number, D: number, H: number, columns: number, rows: number, handles: boolean): BoxPart[] {
  const front = 0.018
  const gap = 0.008
  const foot = Math.min(0.06, H * 0.1)
  // 손잡이가 바닥 차지 크기 밖으로 나가지 않게 앞판을 손잡이 두께만큼 안으로 들인다
  const knob = handles ? 0.012 : 0
  const frontZ = D / 2 - knob - front / 2
  const knobZ = D / 2 - knob / 2
  const backing = 0.004
  const parts = [
    box('main', 0, -(front + knob) / 2, 0, H, W, D - front - knob),
    // 앞판 바로 뒤의 어두운 판: 앞판 사이 틈으로 선처럼 보인다
    box('line', 0, frontZ - front / 2 - backing / 2 + 0.003, foot, H, W - 0.004, backing),
  ]
  const cellW = (W - gap * (columns + 1)) / columns
  const cellH = (H - foot - gap * (rows + 1)) / rows
  if (cellW <= MIN || cellH <= MIN) return [box('main', 0, 0, 0, H, W, D)]
  for (let c = 0; c < columns; c += 1) {
    const cx = -W / 2 + gap + cellW / 2 + c * (cellW + gap)
    for (let r = 0; r < rows; r += 1) {
      const y0 = foot + gap + r * (cellH + gap)
      parts.push(box('main', cx, frontZ, y0, y0 + cellH, cellW, front))
      if (!handles) continue
      if (rows === 1) {
        // 문짝: 세로 손잡이를 문이 만나는 쪽에
        const side = columns === 1 ? 1 : c % 2 === 0 ? 1 : -1
        const hx = cx + side * (cellW / 2 - 0.04)
        const hy = Math.min(1.0, y0 + cellH / 2)
        parts.push(box('dark', hx, knobZ, hy - 0.07, hy + 0.07, 0.014, knob))
      } else {
        // 서랍: 가로 손잡이를 가운데에
        const hy = y0 + cellH * 0.7
        parts.push(box('dark', cx, knobZ, hy - 0.007, hy + 0.007, Math.min(0.14, cellW * 0.4), knob))
      }
    }
  }
  return parts
}

/** 앞이 뚫린 책장: 뒤판(-z) + 옆판 + 선반 */
function bookshelf(W: number, D: number, H: number): BoxPart[] {
  const t = Math.min(0.02, W / 8, D / 4)
  const parts = [
    box('dark', 0, -D / 2 + t / 2, 0, H, W, t),
    box('main', -W / 2 + t / 2, 0, 0, H, t, D),
    box('main', W / 2 - t / 2, 0, 0, H, t, D),
  ]
  const shelves = Math.max(2, Math.round(H / 0.36) + 1)
  for (let i = 0; i < shelves; i += 1) {
    const y0 = ((H - t) * i) / (shelves - 1)
    parts.push(box('main', 0, 0, y0, y0 + t, W - t * 2, D))
  }
  return parts
}

/**
 * 가구를 이루는 상자 목록(가구 기준 좌표, m).
 * 어떤 종류든 바닥 차지 크기(가로×깊이)는 넘지 않는다.
 */
export function furnitureParts(item: ShapeInput): BoxPart[] {
  const W = Math.max(0.05, item.widthCm / 100)
  const D = Math.max(0.05, item.depthCm / 100)
  const H = Math.max(0.01, item.heightCm / 100)
  // 너무 작은 가구는 모양을 나누지 않고 상자 하나로 그린다
  const tiny = W < 0.25 || D < 0.25 || H < 0.2
  if (item.category === 'mat') return [box('main', 0, 0, 0, Math.min(Math.max(H, 0.015), 0.05), W, D)]
  if (tiny) return [box('main', 0, 0, 0, H, W, D)]
  switch (item.category) {
    case 'bed':
      return bed(W, D, H)
    case 'desk':
      return tableLike(W, D, H, true)
    case 'table':
      return tableLike(W, D, H, false)
    case 'chair':
      return chair(W, D, H)
    case 'sofa':
      return sofa(W, D, H)
    case 'wardrobe':
      return cabinet(W, D, H, Math.max(1, Math.round(W / 0.5)), 1, true)
    case 'drawer':
      return cabinet(W, D, H, 1, Math.max(2, Math.round(H / 0.25)), true)
    case 'tv_stand':
      return cabinet(W, D, H, Math.max(2, Math.round(W / 0.6)), 1, false)
    case 'bookshelf':
      return bookshelf(W, D, H)
    default:
      return [box('main', 0, 0, 0, H, W, D)]
  }
}

/** 상자 목록 전체를 감싸는 크기(선택 표시용). 바닥 가운데 기준 */
export function partsBounds(parts: BoxPart[]): { w: number; h: number; d: number } {
  let w = 0
  let h = 0
  let d = 0
  for (const part of parts) {
    w = Math.max(w, (Math.abs(part.x) + part.w / 2) * 2)
    d = Math.max(d, (Math.abs(part.z) + part.d / 2) * 2)
    h = Math.max(h, part.y + part.h / 2)
  }
  return { w, h, d }
}

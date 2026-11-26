// 평면도 사진에서 AI가 읽어 온 집 구조(어림값)를 검사하고 방봄 집 보기가 쓰는 모양으로 바꾼다.
// AI는 사진을 읽기만 하고, 크기 제한·겹침 정리·방 이름·문 위치는 모두 여기서 코드로 정한다.

/** @typedef {'living' | 'bed' | 'kitchen' | 'bath' | 'hall' | 'dress'} HomeRoomType */
/** @typedef {{ id: string, type: HomeRoomType, x: number, z: number, w: number, d: number, open?: true, door?: { side: 'N' | 'E' | 'S' | 'W', t: number } }} HomeRoom */
/** @typedef {{ name: string, area: number, W: number, D: number, entry: { side: 'N' | 'E' | 'S' | 'W', t: number }, rooms: HomeRoom[], fromPhoto: true }} HomeLayout */

export const HOME_TYPES = /** @type {const} */ (['living', 'bed', 'kitchen', 'bath', 'hall', 'dress'])
const SIDES = ['N', 'E', 'S', 'W']
const OPEN_TYPES = new Set(['living', 'kitchen', 'hall'])
const ID_BASE = { living: 'liv', kitchen: 'kit', bath: 'bath', hall: 'hall', dress: 'dress' }
export const HOME_LIMITS = { minSideCm: 300, maxSideCm: 3000, minRoomCm: 100, maxRooms: 14, snapCm: 5 }

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
/** @param {number} v */
const snap = (v) => Math.round(v / HOME_LIMITS.snapCm) * HOME_LIMITS.snapCm
/** @param {number} v @param {number} a @param {number} b */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

/**
 * AI가 준 값(cm)을 검사해서 방봄 집 구조(m)로 바꾼다. 쓸 만한 방(거실이나 침실)이 하나도 없으면 null.
 * @param {unknown} raw  { widthCm, depthCm, entrySide, rooms: [{ type, xCm, yCm, widthCm, depthCm }] }
 * @returns {HomeLayout | null}
 */
export function sanitizeHome(raw) {
  if (!raw || typeof raw !== 'object') return null
  const r = /** @type {Record<string, unknown>} */ (raw)
  // 평면도 치수는 보통 mm로 적혀 있다. 집이 30m를 넘으면 mm로 읽은 것으로 보고 모든 값을 cm로 바꾼다
  const mm = num(r.widthCm) > HOME_LIMITS.maxSideCm || num(r.depthCm) > HOME_LIMITS.maxSideCm ? 10 : 1
  /** @param {unknown} v */
  const cm = (v) => num(v) / mm
  const W = snap(clamp(cm(r.widthCm), HOME_LIMITS.minSideCm, HOME_LIMITS.maxSideCm))
  const D = snap(clamp(cm(r.depthCm), HOME_LIMITS.minSideCm, HOME_LIMITS.maxSideCm))
  if (!Number.isFinite(W) || !Number.isFinite(D) || !Array.isArray(r.rooms)) return null

  /** @type {{ type: HomeRoomType, x: number, z: number, w: number, d: number }[]} */
  const rooms = []
  for (const item of r.rooms.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue
    const it = /** @type {Record<string, unknown>} */ (item)
    const type = /** @type {HomeRoomType} */ (it.type)
    if (!HOME_TYPES.includes(type)) continue
    const x = snap(clamp(cm(it.xCm), 0, W))
    const z = snap(clamp(cm(it.yCm), 0, D))
    const w = snap(Math.min(cm(it.widthCm), W - x))
    const d = snap(Math.min(cm(it.depthCm), D - z))
    if (![x, z, w, d].every(Number.isFinite) || w < HOME_LIMITS.minRoomCm || d < HOME_LIMITS.minRoomCm) continue
    // 이미 받은 방과 작은 쪽 넓이의 80% 넘게 겹치면 같은 방을 두 번 읽은 것으로 본다
    const dup = rooms.some((o) => {
      const ox = Math.max(0, Math.min(o.x + o.w, x + w) - Math.max(o.x, x))
      const oz = Math.max(0, Math.min(o.z + o.d, z + d) - Math.max(o.z, z))
      return ox * oz > 0.8 * Math.min(o.w * o.d, w * d)
    })
    if (!dup) rooms.push({ type, x, z, w, d })
    if (rooms.length >= HOME_LIMITS.maxRooms) break
  }
  if (!rooms.some((x) => x.type === 'living' || x.type === 'bed')) return null

  // 이름표는 집 보기(buildLayout)가 붙인다(큰 침실이 안방). 여기서는 겹치지 않는 id만 정한다
  /** @type {Record<string, number>} */
  const seen = {}
  const beds = rooms.filter((x) => x.type === 'bed').sort((a, b) => b.w * b.d - a.w * a.d)
  const out = rooms.map((x) => {
    let id
    if (x.type === 'bed') id = 'r' + (beds.indexOf(x) + 1)
    else {
      seen[x.type] = (seen[x.type] ?? 0) + 1
      id = ID_BASE[x.type] + (seen[x.type] > 1 ? seen[x.type] : '')
    }
    /** @type {HomeRoom} */
    const room = { id, type: x.type, x: x.x / 100, z: x.z / 100, w: x.w / 100, d: x.d / 100 }
    if (OPEN_TYPES.has(x.type)) room.open = true
    else {
      // 닫힌 방의 문은 집 가운데를 향한 벽의 가운데에 둔다
      const dx = W / 2 - (x.x + x.w / 2), dz = D / 2 - (x.z + x.d / 2)
      room.door = { side: Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N', t: 0.5 }
    }
    return room
  })
  const entrySide = SIDES.includes(String(r.entrySide)) ? /** @type {'N' | 'E' | 'S' | 'W'} */ (r.entrySide) : 'N'
  return { name: '사진에서 읽은 구조', area: Math.round((W * D) / 10000), W: W / 100, D: D / 100, entry: { side: entrySide, t: 0.5 }, rooms: out, fromPhoto: true }
}

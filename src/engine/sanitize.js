// 믿을 수 없는 자료(서버에서는 AI 답, 브라우저에서는 서버 답)를 스키마 모양과 범위에 맞게 고친다.
// 못 쓰는 자료면 null을 돌려준다. 좌표·점수 같은 값은 여기서 버린다.

/** @import { AdviceResponse, FurnitureItem, FurnitureCategory, FurnitureMaterial, FloorMaterial, Opening, OpeningType, RoomStyle, Wall } from '../types/schema.ts' */

/** @type {FurnitureCategory[]} */
export const FURNITURE_CATEGORIES = ['bed', 'desk', 'chair', 'wardrobe', 'bookshelf', 'drawer', 'sofa', 'table', 'tv_stand', 'mat', 'other']
/** @type {FurnitureMaterial[]} */
export const FURNITURE_MATERIALS = ['wood', 'fabric', 'metal', 'white_matte', 'glass']
/** @type {FloorMaterial[]} */
export const FLOOR_MATERIALS = ['oak_wood', 'walnut_wood', 'tile_gray', 'linoleum_light']
/** @type {Wall[]} */
const WALLS = ['top', 'bottom', 'left', 'right']

export const SIZE_MIN_CM = 20
export const SIZE_MAX_CM = 1000
export const ROOM_MIN_CM = 150
export const ROOM_MAX_CM = 2000
const MAX_ITEMS = 12
const MAX_LINES = 6
const MAX_OPENINGS = 8
const MAX_PRICE_KRW = 100000000

// 점수·등급처럼 보이는 표현 (절대 규칙 2: 점수를 내보내지 않는다)
// "3점 세트" 같은 상품 말과 cm·원 같은 단위는 걸리지 않게 한다.
const SCORE_PATTERN =
  /점수|등급|만점|평점|별점|순위|랭킹|랭크|\d+\s*(?:위|등)(?![치쪽급분신])|\d+\s*점(?!\s*(?:검|선|세트|조명|식탁|소파))|\d+\s*(?:%|％|퍼센트|프로(?!그))|[A-FS][+-]?\s*(?:급|학점|랭크)|별\s*\d|[★☆]|\d+(?:\.\d+)?\s*\/\s*(?:5|10|100)(?!\d)|score|grade|rating|rank/i
// 좌표는 코드가 정한다. AI 글에 좌표가 나오면 그 줄을 뺀다.
const COORD_PATTERN = /좌표|[xy]\s*[=:]\s*\d/i

/** 점수·등급·좌표처럼 보이는 글인지 @param {string} text */
const looksScored = (text) => SCORE_PATTERN.test(text) || COORD_PATTERN.test(text)

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 글자를 다듬는다: 제어 문자를 빼고, 공백을 정리하고, 길이를 자른다. 글자가 아니거나 비면 ''.
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  // 이모지 가운데에서 잘리면 반쪽 글자가 남으므로 지운다
  return text.length > maxLength ? text.slice(0, maxLength).replace(/[\uD800-\uDBFF]$/, '').trim() : text
}

/**
 * 숫자로 바꿔 범위 안으로 맞춘 정수. 숫자가 아니면 null.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
export function clampInt(value, min, max) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return null
  return Math.min(max, Math.max(min, Math.round(number)))
}

/**
 * #RRGGBB 색. 아니면 null.
 * @param {unknown} value
 * @returns {string | null}
 */
export function cleanColor(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toUpperCase() : null
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @returns {T | null}
 */
function pickEnum(value, allowed) {
  return /** @type {T | null} */ (typeof value === 'string' && allowed.includes(/** @type {T} */ (value)) ? value : null)
}

/**
 * 글 목록을 다듬는다. 점수처럼 보이는 줄과 빈 줄은 뺀다.
 * @param {unknown} value
 * @param {number} maxCount
 * @param {number} maxLength
 * @returns {string[]}
 */
function cleanLines(value, maxCount, maxLength) {
  if (!Array.isArray(value)) return []
  /** @type {string[]} */
  const lines = []
  for (const entry of value) {
    const text = cleanText(entry, maxLength)
    if (text && !looksScored(text) && !lines.includes(text)) lines.push(text)
    if (lines.length >= maxCount) break
  }
  return lines
}

/**
 * 해설 답. 요약이 없거나 점수 표현이 들어 있으면 null.
 * @param {unknown} raw
 * @returns {Omit<AdviceResponse, 'isFallback'> | null}
 */
export function sanitizeAdvice(raw) {
  if (!isRecord(raw)) return null
  // 요약에서 점수처럼 보이는 문장만 빼고, 남는 문장이 없으면 못 쓰는 답으로 본다
  const summary = (cleanText(raw.summary, 400).match(/[^.!?]+[.!?]*/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !looksScored(sentence))
    .join(' ')
  if (!summary) return null
  return {
    summary,
    highlights: cleanLines(raw.highlights, MAX_LINES, 200),
    improvements: cleanLines(raw.improvements, MAX_LINES, 200),
  }
}

/**
 * 가구 한 줄. 이름도 분류도 없으면 null. 좌표·회전·id는 받지 않는다(코드가 정한다).
 * @param {unknown} raw
 * @returns {Partial<FurnitureItem> | null}
 */
function sanitizeFurnitureItem(raw) {
  if (!isRecord(raw)) return null
  const name = cleanText(raw.name, 40)
  const category = pickEnum(raw.category, FURNITURE_CATEGORIES)
  if (!name && !category) return null

  /** @type {Partial<FurnitureItem>} */
  const item = { category: category ?? 'other' }
  if (name) item.name = name

  const widthCm = clampInt(raw.widthCm, SIZE_MIN_CM, SIZE_MAX_CM)
  const depthCm = clampInt(raw.depthCm, SIZE_MIN_CM, SIZE_MAX_CM)
  const heightCm = clampInt(raw.heightCm, 1, 300)
  if (widthCm !== null) item.widthCm = widthCm
  if (depthCm !== null) item.depthCm = depthCm
  if (heightCm !== null) item.heightCm = heightCm

  const color = cleanColor(raw.color)
  if (color) item.color = color
  const material = pickEnum(raw.material, FURNITURE_MATERIALS)
  if (material) item.material = material

  const clearanceFrontCm = clampInt(raw.clearanceFrontCm, 0, 200)
  if (clearanceFrontCm !== null) item.clearanceFrontCm = clearanceFrontCm
  if (typeof raw.hasSharpCorner === 'boolean') item.hasSharpCorner = raw.hasSharpCorner
  if (typeof raw.owned === 'boolean') item.owned = raw.owned

  // 가격은 price.estimatedKrw 또는 estimatedKrw(AI 답) 어느 쪽으로 와도 받는다. 추정값이라 source는 늘 estimated.
  const price = isRecord(raw.price) ? raw.price : null
  const estimatedKrw = clampInt(price ? price.estimatedKrw : raw.estimatedKrw, 0, MAX_PRICE_KRW)
  if (estimatedKrw !== null) item.price = { estimatedKrw, manualKrw: null, source: 'estimated' }
  return item
}

/**
 * 가구 목록. 배열(또는 { items: 배열 })이 아니면 null. 못 쓰는 줄은 빼고 최대 12개.
 * @param {unknown} raw
 * @returns {Partial<FurnitureItem>[] | null}
 */
export function sanitizeFurnitureItems(raw) {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.items) ? raw.items : null
  if (!list) return null
  /** @type {Partial<FurnitureItem>[]} */
  const items = []
  for (const entry of list) {
    const item = sanitizeFurnitureItem(entry)
    if (item) items.push(item)
    if (items.length >= MAX_ITEMS) break
  }
  return items
}

/**
 * 스타일. 색 세 가지가 모두 #RRGGBB가 아니면 null.
 * @param {unknown} raw
 * @returns {RoomStyle | null}
 */
export function sanitizeStyle(raw) {
  if (!isRecord(raw)) return null
  const wallColor = cleanColor(raw.wallColor)
  const floorColor = cleanColor(raw.floorColor)
  const accentColor = cleanColor(raw.accentColor)
  if (!wallColor || !floorColor || !accentColor) return null
  const id = cleanText(raw.id, 40).replace(/[^a-zA-Z0-9_-]/g, '')
  const name = cleanText(raw.name, 30)
  const description = cleanText(raw.description, 120)
  return {
    id: id || 'custom_ai',
    name: (looksScored(name) ? '' : name) || '맞춤 스타일',
    wallColor,
    floorColor,
    floorMaterial: pickEnum(raw.floorMaterial, FLOOR_MATERIALS) ?? 'oak_wood',
    accentColor,
    description: looksScored(description) ? '' : description,
  }
}

/**
 * 문·창문 한 개를 방 크기에 맞게 고친다.
 * @param {unknown} raw
 * @param {number} index
 * @param {number} widthCm 방 가로
 * @param {number} depthCm 방 세로
 * @returns {Opening | null}
 */
function sanitizeOpening(raw, index, widthCm, depthCm) {
  if (!isRecord(raw)) return null
  const type = pickEnum(raw.type, /** @type {OpeningType[]} */ (['door', 'window']))
  const wall = pickEnum(raw.wall, WALLS)
  if (!type || !wall) return null
  const wallLength = wall === 'top' || wall === 'bottom' ? widthCm : depthCm
  const openingWidth = clampInt(raw.widthCm, 40, Math.min(400, wallLength)) ?? (type === 'door' ? 90 : Math.min(120, wallLength))
  const offsetCm = clampInt(raw.offsetCm, 0, wallLength - openingWidth) ?? 0
  const sill = clampInt(raw.sillHeightCm, 0, 200)
  return {
    id: `op_${type === 'door' ? 'door' : 'win'}_${index + 1}`,
    type,
    wall,
    offsetCm,
    widthCm: openingWidth,
    sillHeightCm: type === 'door' ? 0 : (sill ?? 90),
    swingInward: type === 'door' ? raw.swingInward !== false : false,
  }
}

/**
 * 평면도 읽기 결과. 가로·세로가 숫자가 아니면 null.
 * @param {unknown} raw
 * @returns {{ widthCm: number, depthCm: number, openings: Opening[] } | null}
 */
export function sanitizeFloorplan(raw) {
  if (!isRecord(raw)) return null
  const widthCm = clampInt(raw.widthCm, ROOM_MIN_CM, ROOM_MAX_CM)
  const depthCm = clampInt(raw.depthCm, ROOM_MIN_CM, ROOM_MAX_CM)
  if (widthCm === null || depthCm === null) return null
  /** @type {Opening[]} */
  const openings = []
  if (Array.isArray(raw.openings)) {
    for (const entry of raw.openings) {
      const opening = sanitizeOpening(entry, openings.length, widthCm, depthCm)
      if (opening) openings.push(opening)
      if (openings.length >= MAX_OPENINGS) break
    }
  }
  return { widthCm, depthCm, openings }
}

/**
 * 연출 이미지 답에서 그림 값만 꺼낸다. data URL, https 주소, 맨 Base64만 받는다.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function sanitizeImageRef(raw) {
  const value = isRecord(raw) ? raw.imageUrlOrBase64 : raw
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length < 8 || text.length > 8000000) return null
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) return text
  if (/^https:\/\/[^\s"'<>]+$/.test(text) && text.length <= 2000) return text
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return text
  return null
}

// AI가 실패했을 때 서버와 브라우저가 똑같이 쓰는 규칙 기반 기본 답. 모두 isFallback: true.
// 순수 계산만 한다: 네트워크, 시간, 무작위 값을 쓰지 않는다. 점수도 만들지 않는다.

/** @import { AdviceResponse, CatalogItem, FloorplanResponse, FurnitureItem, FurnitureResponse, Lifestyle, RenderPhotoResponse, Room, StyleResponse, ValidationResult } from '../types/schema.ts' */

import { CATALOG } from '../data/catalog.js'
import { STYLE_KEYWORDS, STYLE_PRESETS } from '../data/styles.js'
import { defaultOpenings } from '../data/exampleProject.js'
import { LIFESTYLE_LABELS, NOTICES } from '../data/labels.js'
import { SIZE_MAX_CM, SIZE_MIN_CM, cleanText } from './sanitize.js'

export const PYEONG_TO_M2 = 3.3058
const MAX_LINES = 6
const MAX_ITEMS = 12

/**
 * 목록에서 글자만 골라 다듬는다.
 * @param {unknown} list
 * @returns {string[]}
 */
function textLines(list) {
  if (!Array.isArray(list)) return []
  return list.map((entry) => cleanText(entry, 200)).filter(Boolean)
}

/**
 * 문제·제안 한 줄을 "제목: 설명" 문장으로 만든다.
 * @param {unknown} list
 * @returns {string[]}
 */
function issueLines(list) {
  if (!Array.isArray(list)) return []
  /** @type {string[]} */
  const lines = []
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue
    const title = cleanText(/** @type {{ title?: unknown }} */ (entry).title, 80)
    const message = cleanText(/** @type {{ message?: unknown }} */ (entry).message, 200)
    const line = title && message && title !== message ? `${title}: ${message}` : title || message
    if (line && !lines.includes(line)) lines.push(line)
  }
  return lines
}

/**
 * 코드가 판정한 결과(validationResult)만으로 만든 해설. 새로운 판단이나 점수를 더하지 않는다.
 * @param {{ room?: Room, validationResult: ValidationResult, lifestyle?: Lifestyle }} input
 * @returns {AdviceResponse}
 */
export function fallbackAdvice({ room, validationResult, lifestyle }) {
  const errors = issueLines(validationResult?.errors)
  const tips = issueLines(validationResult?.tips)
  const strengths = textLines(validationResult?.strengths)

  const roomName = cleanText(room?.name, 20) || '이 방'
  const life = lifestyle && LIFESTYLE_LABELS[lifestyle] ? ` (${LIFESTYLE_LABELS[lifestyle]} 기준)` : ''
  let summary
  if (errors.length > 0 && tips.length > 0) {
    summary = `${roomName}${life}에는 꼭 고쳐야 할 문제가 ${errors.length}개, 참고할 제안이 ${tips.length}개 있어요. 문제부터 먼저 고쳐 보세요.`
  } else if (errors.length > 0) {
    summary = `${roomName}${life}에는 꼭 고쳐야 할 문제가 ${errors.length}개 있어요. 아래 내용을 보고 가구를 옮겨 보세요.`
  } else if (tips.length > 0) {
    summary = `${roomName}${life}에는 확실한 문제가 없어요. 참고할 제안이 ${tips.length}개 있어요.`
  } else {
    summary = `${roomName}${life}에는 확실한 문제도, 따로 드릴 제안도 없어요.`
  }

  const highlights = strengths.slice(0, MAX_LINES)
  if (highlights.length === 0 && errors.length === 0) highlights.push('가구 겹침이나 문 막힘 같은 확실한 문제가 발견되지 않았어요.')

  return {
    summary,
    highlights,
    improvements: [...errors, ...tips].slice(0, MAX_LINES),
    isFallback: true,
  }
}

/**
 * 비교하기 쉽게 소문자로 바꾸고 공백을 없앤다.
 * @param {string} text
 * @returns {string}
 */
function squash(text) {
  return text.toLowerCase().replace(/\s+/g, '')
}

/**
 * 글 조각에 가장 잘 맞는 카탈로그 가구(가장 긴 낱말이 맞은 것). 없으면 null.
 * @param {string} segment
 * @returns {CatalogItem | null}
 */
function matchCatalog(segment) {
  const target = squash(segment)
  if (!target) return null
  /** @type {CatalogItem | null} */
  let best = null
  let bestLength = 0
  for (const item of CATALOG) {
    for (const word of [item.name, ...item.keywords]) {
      const key = squash(word)
      if (key && key.length > bestLength && target.includes(key)) {
        best = item
        bestLength = key.length
      }
    }
  }
  return best
}

/**
 * 치수 값을 cm로 바꾼다. 300 이상은 mm로 본다("1200 책상" = 120cm).
 * @param {number} value
 * @returns {number}
 */
function toCm(value) {
  const cm = value >= 300 ? value / 10 : value
  return Math.min(SIZE_MAX_CM, Math.max(SIZE_MIN_CM, Math.round(cm)))
}

/**
 * 글 조각에서 직접 적은 크기를 읽는다. "120x60", "120*60*72", "1200 책상", "폭 140cm".
 * @param {string} segment
 * @returns {{ widthCm?: number, depthCm?: number, heightCm?: number }}
 */
function parseSize(segment) {
  const pair = /(\d{2,4})\s*(?:cm|mm)?\s*[x×*]\s*(\d{2,4})(?:\s*(?:cm|mm)?\s*[x×*]\s*(\d{1,4}))?/i.exec(segment)
  if (pair) {
    /** @type {{ widthCm: number, depthCm: number, heightCm?: number }} */
    const size = { widthCm: toCm(Number(pair[1])), depthCm: toCm(Number(pair[2])) }
    if (pair[3]) size.heightCm = Math.min(300, Math.max(1, toCm(Number(pair[3]))))
    return size
  }
  // 숫자 하나만 있으면 가로로 본다. "2인", "3단", "2개" 같은 수는 두 자리 미만이라 걸리지 않는다.
  const single = /(?:^|[^\d])(\d{2,4})\s*(cm|mm)?(?![\d인단개칸])/i.exec(segment)
  if (single) {
    const value = Number(single[1])
    const unit = (single[2] ?? '').toLowerCase()
    const cm = unit === 'mm' ? value / 10 : unit === 'cm' ? value : value >= 300 ? value / 10 : value
    if (cm >= SIZE_MIN_CM && cm <= SIZE_MAX_CM) return { widthCm: Math.round(cm) }
  }
  return {}
}

/**
 * "의자 2개"의 개수. 없으면 1, 최대 4.
 * @param {string} segment
 * @returns {number}
 */
function parseCount(segment) {
  const match = /(\d{1,2})\s*개/.exec(segment)
  return match ? Math.min(4, Math.max(1, Number(match[1]))) : 1
}

/**
 * 카탈로그 한 줄과 직접 적은 크기로 가구 초안을 만든다.
 * @param {CatalogItem} base
 * @param {{ widthCm?: number, depthCm?: number, heightCm?: number }} size
 * @returns {Partial<FurnitureItem>}
 */
function draftFromCatalog(base, size) {
  const widthCm = size.widthCm ?? base.widthCm
  return {
    name: size.widthCm && size.widthCm !== base.widthCm ? `${base.name} (${widthCm}cm)` : base.name,
    category: base.category,
    widthCm,
    depthCm: size.depthCm ?? base.depthCm,
    heightCm: size.heightCm ?? base.heightCm,
    color: base.color,
    material: base.material,
    clearanceFrontCm: base.clearanceFrontCm,
    hasSharpCorner: base.hasSharpCorner,
    price: { estimatedKrw: base.estimatedKrw, manualKrw: null, source: 'estimated' },
  }
}

/**
 * 쉼표·줄바꿈, "침대랑 책상" 같은 이음말로 나눈 글을 카탈로그 낱말과 직접 적은 숫자로 읽는다.
 * 링크(url)는 절대 열지 않고, 글자 안에서 낱말만 찾는다.
 * @param {{ text?: string, url?: string }} input
 * @returns {FurnitureResponse}
 */
export function fallbackFurniture({ text, url }) {
  /** @type {Partial<FurnitureItem>[]} */
  const items = []
  const segments = typeof text === 'string' ? text.slice(0, 2000).split(/[,，、;\n\r/+·&]+|(?:이랑|랑|하고|그리고|및|와|과)\s+/) : []
  for (const raw of segments) {
    const segment = cleanText(raw, 60)
    if (!segment) continue
    const size = parseSize(segment)
    const base = matchCatalog(segment)
    /** @type {Partial<FurnitureItem>} */
    let draft
    if (base) {
      draft = draftFromCatalog(base, size)
    } else {
      // 카탈로그에 없는 가구는 '기타'로 두고 사용자가 치수를 고치게 한다.
      draft = {
        name: segment.slice(0, 30),
        category: 'other',
        widthCm: size.widthCm ?? 60,
        depthCm: size.depthCm ?? 40,
        heightCm: size.heightCm ?? 60,
        color: '#D9D4CB',
        material: 'wood',
        clearanceFrontCm: 0,
        hasSharpCorner: false,
        price: { estimatedKrw: 0, manualKrw: null, source: 'estimated' },
      }
    }
    for (let i = 0; i < parseCount(segment) && items.length < MAX_ITEMS; i += 1) items.push({ ...draft })
  }

  if (typeof url === 'string' && url.trim() && items.length < MAX_ITEMS) {
    let decoded = url.slice(0, 2000)
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      // 깨진 주소는 받은 글자 그대로 본다.
    }
    const base = matchCatalog(decoded.replace(/[-_+/=&?.]+/g, ' '))
    if (base) items.push(draftFromCatalog(base, {}))
  }

  return { items, note: NOTICES.fallback, isFallback: true }
}

/**
 * 분위기 글의 낱말과 가장 잘 맞는 프리셋. 맞는 게 없으면 첫 번째(기본) 프리셋.
 * @param {{ text?: string }} input
 * @returns {StyleResponse}
 */
export function fallbackStyle({ text }) {
  const target = squash(typeof text === 'string' ? text.slice(0, 500) : '')
  let best = STYLE_PRESETS[0]
  let bestHits = 0
  for (const preset of STYLE_PRESETS) {
    const words = [preset.name, ...(STYLE_KEYWORDS[preset.id] ?? [])]
    // 긴 낱말일수록 뜻이 분명하므로 맞은 낱말의 글자 수를 더해 비교한다(밖으로 내보내지 않는 내부 비교값).
    const hits = words.reduce((sum, word) => sum + (target.includes(squash(word)) ? squash(word).length : 0), 0)
    if (hits > bestHits) {
      best = preset
      bestHits = hits
    }
  }
  return { style: { ...best }, note: NOTICES.fallback, isFallback: true }
}

/**
 * 평수로 어림한 직사각형 방(가로:세로 = 3:4, 10cm 단위). 평수가 없으면 300 × 400.
 * @param {{ areaPyeong?: number }} input
 * @returns {FloorplanResponse}
 */
export function fallbackFloorplan({ areaPyeong }) {
  let widthCm = 300
  let depthCm = 400
  if (typeof areaPyeong === 'number' && Number.isFinite(areaPyeong) && areaPyeong > 0) {
    const areaM2 = Math.min(areaPyeong, 100) * PYEONG_TO_M2
    const round10 = (/** @type {number} */ meters) => Math.min(2000, Math.max(150, Math.round((meters * 100) / 10) * 10))
    widthCm = round10(Math.sqrt((areaM2 * 3) / 4))
    depthCm = round10(Math.sqrt((areaM2 * 4) / 3))
  }
  return { widthCm, depthCm, openings: defaultOpenings(widthCm), note: NOTICES.floorplan, isFallback: true }
}

/**
 * 연출 이미지를 만들 수 없을 때: 받은 그림을 그대로 돌려준다.
 * @param {{ snapshotBase64: string }} input
 * @returns {RenderPhotoResponse}
 */
export function fallbackRenderPhoto({ snapshotBase64 }) {
  return {
    imageUrlOrBase64: typeof snapshotBase64 === 'string' ? snapshotBase64 : '',
    disclaimer: NOTICES.aiImageDisclaimer,
    isFallback: true,
  }
}

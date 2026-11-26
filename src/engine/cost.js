// 비용 계산. 가격 우선순위(직접 입력 > 카탈로그·예상), 보유 가구 제외 합계, 쇼핑몰 검색 링크.
// 쇼핑몰 페이지를 가져오지 않는다. 검색 결과 주소(글자)만 만든다.

/** @import { FurnitureItem, CostSummary } from '../types/schema.ts' */

import { NOTICES } from '../data/labels.js'

/**
 * 금액을 0 이상의 정수(원)로 고친다. 숫자가 아니면 0.
 * @param {unknown} value
 * @returns {number}
 */
function toKrw(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

/**
 * 사용자가 직접 넣은 값이 있는지.
 * @param {Pick<FurnitureItem, 'price'>} item
 * @returns {boolean}
 */
function hasManualPrice(item) {
  const manual = item.price?.manualKrw
  return typeof manual === 'number' && Number.isFinite(manual)
}

/**
 * 실제로 쓰는 가격(원, 정수). 직접 넣은 값이 숫자면 그 값, 아니면 예상 가격.
 * @param {Pick<FurnitureItem, 'price'>} item
 * @returns {number}
 */
export function effectivePriceKrw(item) {
  if (hasManualPrice(item)) return toKrw(item.price.manualKrw)
  return toKrw(item.price?.estimatedKrw)
}

/**
 * 가격이 어디서 온 값인지 알려 주는 글자.
 * @param {Pick<FurnitureItem, 'price'>} item
 * @returns {string} '직접 입력' | '카탈로그 가격' | '시연용 예상 가격'
 */
export function priceSourceLabel(item) {
  if (hasManualPrice(item)) return '직접 입력'
  if (item.price?.source === 'catalog') return '카탈로그 가격'
  return NOTICES.price
}

/**
 * 예산 요약. 보유 가구(owned)는 합계에서 빼고, 뺀 금액은 따로 알려 준다.
 * @param {Pick<FurnitureItem, 'price' | 'owned'>[]} furniture
 * @param {number} budgetKrw
 * @returns {CostSummary}
 */
export function summarizeCost(furniture, budgetKrw) {
  let totalKrw = 0
  let ownedExcludedKrw = 0
  let buyCount = 0
  let ownedCount = 0
  for (const item of furniture ?? []) {
    const price = effectivePriceKrw(item)
    if (item.owned === true) {
      ownedExcludedKrw += price
      ownedCount += 1
    } else {
      totalKrw += price
      buyCount += 1
    }
  }
  const budget = toKrw(budgetKrw)
  const remainingKrw = budget - totalKrw
  return {
    totalKrw,
    ownedExcludedKrw,
    buyCount,
    ownedCount,
    budgetKrw: budget,
    remainingKrw,
    overBudget: remainingKrw < 0,
  }
}

/**
 * 가구 이름으로 쇼핑몰 검색 결과 주소를 만든다. 가져오지 않고 주소만 만든다.
 * @param {string} name
 * @returns {{ label: '오늘의집' | '네이버쇼핑' | '쿠팡', url: string }[]}
 */
export function shopSearchLinks(name) {
  // 짝이 맞지 않는 반쪽 글자(잘린 이모지)는 주소로 바꿀 수 없어서 먼저 뺀다
  const text = String(name ?? '').replace(/[\uD800-\uDFFF]/gu, '').trim()
  let query = ''
  try {
    query = encodeURIComponent(text)
  } catch {
    query = ''
  }
  return [
    { label: '오늘의집', url: `https://ohou.se/search/index?query=${query}` },
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${query}` },
    { label: '쿠팡', url: `https://www.coupang.com/np/search?q=${query}` },
  ]
}

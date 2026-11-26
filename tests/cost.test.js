// 비용 계산 테스트: 가격 우선순위, 보유 가구 제외, 예산 초과, 쇼핑몰 검색 링크.

/** @import { FurnitureItem, PriceSource } from '../src/types/schema.ts' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectivePriceKrw, priceSourceLabel, summarizeCost, shopSearchLinks } from '../src/engine/cost.js'
import { createExampleProject } from '../src/data/exampleProject.js'
import { NOTICES } from '../src/data/labels.js'

/**
 * @param {number} estimatedKrw
 * @param {number | null} manualKrw
 * @param {{ owned?: boolean, source?: PriceSource }} [extra]
 * @returns {Pick<FurnitureItem, 'price' | 'owned'>}
 */
function priced(estimatedKrw, manualKrw, extra = {}) {
  return { owned: extra.owned ?? false, price: { estimatedKrw, manualKrw, source: extra.source ?? 'estimated' } }
}

test('직접 넣은 가격이 있으면 그 값을 먼저 써요', () => {
  assert.equal(effectivePriceKrw(priced(120000, 99000)), 99000)
  assert.equal(effectivePriceKrw(priced(120000, 0)), 0, '0원도 직접 넣은 값이에요')
  assert.equal(effectivePriceKrw(priced(120000, null)), 120000)
})

test('가격은 언제나 0 이상의 정수예요', () => {
  assert.equal(effectivePriceKrw(priced(1234.6, null)), 1235)
  assert.equal(effectivePriceKrw(priced(-500, null)), 0)
  assert.equal(effectivePriceKrw(priced(Number.NaN, null)), 0)
})

test('가격 출처 글자는 직접 입력, 카탈로그 가격, 시연용 예상 가격 가운데 하나예요', () => {
  assert.equal(priceSourceLabel(priced(1000, 500)), '직접 입력')
  assert.equal(priceSourceLabel(priced(1000, 500, { source: 'catalog' })), '직접 입력')
  assert.equal(priceSourceLabel(priced(1000, null, { source: 'catalog' })), '카탈로그 가격')
  assert.equal(priceSourceLabel(priced(1000, null)), NOTICES.price)
  assert.equal(NOTICES.price, '시연용 예상 가격')
})

test('보유 가구는 합계에서 빼고 뺀 금액을 따로 알려 줘요', () => {
  const room = createExampleProject().rooms[0]
  const summary = summarizeCost(room.furniture, 1500000)
  // 침대 35만 + 책상 12만 + 옷장 18만 + 책장 9만 = 74만, 의자 8만은 보유
  assert.deepEqual(summary, {
    totalKrw: 740000,
    ownedExcludedKrw: 80000,
    buyCount: 4,
    ownedCount: 1,
    budgetKrw: 1500000,
    remainingKrw: 760000,
    overBudget: false,
  })
})

test('합계는 직접 넣은 가격을 반영하고 예산을 넘으면 알려 줘요', () => {
  const items = [priced(350000, 500000), priced(120000, null), priced(80000, 70000, { owned: true })]
  const summary = summarizeCost(items, 600000)
  assert.equal(summary.totalKrw, 620000)
  assert.equal(summary.ownedExcludedKrw, 70000)
  assert.equal(summary.remainingKrw, -20000)
  assert.equal(summary.overBudget, true)
})

test('남은 예산이 딱 0원이면 예산 초과가 아니에요', () => {
  const summary = summarizeCost([priced(100000, null)], 100000)
  assert.equal(summary.remainingKrw, 0)
  assert.equal(summary.overBudget, false)
})

test('가구가 없으면 합계는 0원이에요', () => {
  assert.deepEqual(summarizeCost([], 300000), {
    totalKrw: 0,
    ownedExcludedKrw: 0,
    buyCount: 0,
    ownedCount: 0,
    budgetKrw: 300000,
    remainingKrw: 300000,
    overBudget: false,
  })
})

test('비용 요약의 숫자는 모두 정수예요', () => {
  const summary = summarizeCost([priced(1000.4, null), priced(2000.5, null, { owned: true })], 5000.7)
  const numbers = [
    summary.totalKrw,
    summary.ownedExcludedKrw,
    summary.buyCount,
    summary.ownedCount,
    summary.budgetKrw,
    summary.remainingKrw,
  ]
  for (const value of numbers) assert.ok(Number.isInteger(value))
})

test('쇼핑몰 검색 링크는 한글 이름을 주소용 글자로 바꿔서 만들어요', () => {
  const name = '슈퍼싱글 수납 침대'
  const encoded = encodeURIComponent(name)
  assert.deepEqual(shopSearchLinks(name), [
    { label: '오늘의집', url: `https://ohou.se/search/index?query=${encoded}` },
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${encoded}` },
    { label: '쿠팡', url: `https://www.coupang.com/np/search?q=${encoded}` },
  ])
  for (const link of shopSearchLinks(name)) {
    assert.equal(/[가-힣\s]/.test(link.url), false, '주소에 한글이나 빈칸이 그대로 있으면 안 돼요')
    assert.equal(new URL(link.url).protocol, 'https:')
  }
})

test('검색 링크는 특수 문자가 든 이름도 안전하게 바꿔요', () => {
  const [first] = shopSearchLinks('책상 & 의자 #1')
  assert.equal(first.url, 'https://ohou.se/search/index?query=%EC%B1%85%EC%83%81%20%26%20%EC%9D%98%EC%9E%90%20%231')
})

test('쇼핑몰 링크: 이모지가 잘린 이름이어도 오류 없이 주소를 만들어요', () => {
  const links = shopSearchLinks('가'.repeat(3) + '\uD83D')
  assert.equal(links.length, 3)
  for (const link of links) assert.ok(link.url.endsWith(encodeURIComponent('가가가')))
  assert.equal(shopSearchLinks(/** @type {any} */ (null)).length, 3)
})

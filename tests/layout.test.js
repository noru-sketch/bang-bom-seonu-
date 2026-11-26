// 배치 엔진 테스트. 지켜야 하는 조건은 엔진 코드를 빌리지 않고 geometry.js로 여기서 다시 검사한다.

/** @import { Room, FurnitureItem, Placement, Rect, FurnitureCategory } from '../src/types/schema.ts' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateVariants, placeNewFurniture, applyPlacements } from '../src/engine/layout.js'
import { createExampleProject, createRoom } from '../src/data/exampleProject.js'
import { THEMES } from '../src/data/labels.js'
import {
  footprint,
  frontZone,
  rectsOverlap,
  overlapCm,
  isInsideRoom,
  doorSwingZone,
  openingFrontZone,
  openingSpan,
} from '../src/engine/geometry.js'

/**
 * @param {string} id
 * @param {FurnitureCategory} category
 * @param {number} widthCm
 * @param {number} depthCm
 * @param {Partial<FurnitureItem>} [extra]
 * @returns {FurnitureItem}
 */
function makeItem(id, category, widthCm, depthCm, extra = {}) {
  return {
    id, name: id, category, widthCm, depthCm, heightCm: 70, xCm: 0, yCm: 0, rotation: 0,
    color: '#CCCCCC', material: 'wood', owned: false, clearanceFrontCm: 0, hasSharpCorner: false,
    price: { estimatedKrw: 10000, manualKrw: null, source: 'estimated' }, locked: false,
    ...extra,
  }
}

/**
 * 현관에서 60cm 정사각형으로 걸어서 닿지 못하는 가구 id (5cm 칸, 느리지만 단순한 방식).
 * @param {Room} room
 * @param {FurnitureItem[]} items
 * @returns {string[]}
 */
function unreachable(room, items) {
  const door = room.openings.find((opening) => opening.type === 'door')
  if (!door) return []
  const solids = items.filter((item) => item.category !== 'mat').map((item) => footprint(item))
  const cols = Math.floor(room.widthCm / 5) - 11
  const rows = Math.floor(room.depthCm / 5) - 11
  const targets = items.filter((item) => item.category !== 'mat' && item.category !== 'chair')
  if (cols <= 0 || rows <= 0) return targets.map((item) => item.id)
  /** @param {number} i @param {number} j @returns {Rect} */
  const walker = (i, j) => ({ xCm: i * 5, yCm: j * 5, widthCm: 60, depthCm: 60 })
  /** @param {number} i @param {number} j */
  const free = (i, j) =>
    solids.every((rect) => {
      const o = overlapCm(walker(i, j), rect)
      return !(o.xCm > 0 && o.yCm > 0)
    })
  const doorZone = openingFrontZone(door, room, 60)
  const seen = new Set()
  /** @type {[number, number][]} */
  const queue = []
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const o = overlapCm(walker(i, j), doorZone)
      if (o.xCm >= 50 && o.yCm >= 50 && free(i, j)) {
        seen.add(j * cols + i)
        queue.push([i, j])
      }
    }
  }
  /** @type {Rect[]} */
  const reached = []
  while (queue.length > 0) {
    const [i, j] = /** @type {[number, number]} */ (queue.shift())
    reached.push(walker(i, j))
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows || seen.has(nj * cols + ni) || !free(ni, nj)) continue
      seen.add(nj * cols + ni)
      queue.push([ni, nj])
    }
  }
  return targets
    .filter((item) => {
      const zone = frontZone(item) ?? footprint(item)
      const wide = { xCm: zone.xCm - 5, yCm: zone.yCm - 5, widthCm: zone.widthCm + 10, depthCm: zone.depthCm + 10 }
      return !reached.some((rect) => {
        const o = overlapCm(rect, wide)
        return o.xCm > 0 && o.yCm > 0
      })
    })
    .map((item) => item.id)
}

/**
 * 지켜야 하는 조건을 어긴 내용을 글자로 모은다. 빈 배열이면 문제가 없다.
 * @param {Room} room
 * @param {FurnitureItem[]} items 검사할 가구(자리를 얻은 것만)
 * @returns {string[]}
 */
function violations(room, items) {
  /** @type {string[]} */
  const found = []
  const solid = items.filter((item) => item.category !== 'mat')
  for (const item of items) {
    if (!isInsideRoom(footprint(item), room)) found.push(`방 밖: ${item.id}`)
  }
  for (let a = 0; a < solid.length; a += 1) {
    for (let b = a + 1; b < solid.length; b += 1) {
      const one = solid[a]
      const two = solid[b]
      const cats = [one.category, two.category]
      const tucked = cats.includes('chair') && (cats.includes('desk') || cats.includes('table'))
      if (!tucked && rectsOverlap(footprint(one), footprint(two))) found.push(`겹침: ${one.id} + ${two.id}`)
    }
  }
  for (const opening of room.openings) {
    const swing = doorSwingZone(opening, room)
    if (!swing) continue
    for (const item of solid) {
      if (rectsOverlap(footprint(item), swing)) found.push(`문 막힘: ${item.id}`)
    }
  }
  for (const item of solid) {
    const zone = frontZone(item)
    if (!zone) continue
    if (!isInsideRoom(zone, room)) found.push(`정면 공간이 방 밖: ${item.id}`)
    for (const other of solid) {
      if (other.id === item.id || other.category === 'chair') continue
      if (rectsOverlap(zone, footprint(other))) found.push(`정면 막힘: ${item.id} 앞에 ${other.id}`)
    }
  }
  for (const opening of room.openings) {
    if (opening.type !== 'window') continue
    const band = openingFrontZone(opening, room, 20)
    const span = openingSpan(opening)
    const pieces = solid
      .filter((item) => item.heightCm > opening.sillHeightCm)
      .map((item) => footprint(item))
      .filter((rect) => {
        const o = overlapCm(rect, band)
        return o.xCm > 0 && o.yCm > 0
      })
      .map((rect) => (span.axis === 'x' ? [rect.xCm, rect.xCm + rect.widthCm] : [rect.yCm, rect.yCm + rect.depthCm]))
      .sort((p, q) => p[0] - q[0])
    let covered = span.startCm
    for (const [from, to] of pieces) {
      if (from > covered) break
      covered = Math.max(covered, to)
    }
    if (covered >= span.endCm) found.push(`창문 가림: ${opening.id}`)
  }
  for (const id of unreachable(room, items)) found.push(`접근 불가: ${id}`)
  return found
}

/**
 * 배치안을 적용한 뒤 자리를 얻은 가구만 돌려준다.
 * @param {Room} room
 * @param {{ placements: Placement[] }} variant
 */
function placedItems(room, variant) {
  const ids = new Set(variant.placements.map((placement) => placement.furnitureId))
  return applyPlacements(room.furniture, variant.placements).filter((item) => ids.has(item.id))
}

/** @param {{ placements: Placement[] }} variant */
const signature = (variant) =>
  variant.placements
    .map((p) => `${p.furnitureId}:${p.xCm}:${p.yCm}:${p.rotation}`)
    .sort()
    .join('|')

test('예시 방은 서로 다른 테마 배치안 5개를 만들어요', () => {
  const room = createExampleProject().rooms[0]
  const variants = generateVariants(room, { lifestyle: 'single' })
  assert.equal(variants.length, 5)
  assert.equal(new Set(variants.map((variant) => variant.themeKey)).size, 5)
  assert.equal(new Set(variants.map((variant) => variant.id)).size, 5)
  assert.equal(new Set(variants.map(signature)).size, 5, '배치가 서로 달라야 해요')
  for (const variant of variants) {
    const theme = THEMES.find((entry) => entry.themeKey === variant.themeKey)
    assert.ok(theme)
    assert.equal(variant.id, theme.id)
    assert.equal(variant.title, theme.title)
    assert.equal(variant.summary, theme.summary)
  }
})

test('예시 방의 모든 배치안은 지켜야 하는 조건을 하나도 어기지 않아요', () => {
  const room = createExampleProject().rooms[0]
  for (const variant of generateVariants(room)) {
    assert.deepEqual(variant.unplacedIds, [], `${variant.themeKey}: 못 놓은 가구가 없어야 해요`)
    assert.equal(variant.placements.length, room.furniture.length)
    assert.deepEqual(violations(room, placedItems(room, variant)), [], variant.themeKey)
  }
})

test('예시 방의 의자는 책상 정면 공간 안에서 책상을 바라봐요', () => {
  const room = createExampleProject().rooms[0]
  for (const variant of generateVariants(room)) {
    const items = placedItems(room, variant)
    const desk = items.find((item) => item.category === 'desk')
    const chair = items.find((item) => item.category === 'chair')
    assert.ok(desk && chair)
    const zone = frontZone(desk)
    assert.ok(zone)
    assert.ok(rectsOverlap(footprint(chair), zone), variant.themeKey)
    assert.equal(chair.rotation, (desk.rotation + 180) % 360, variant.themeKey)
  }
})

test('배치안에는 점수 같은 내부 비교값이 들어 있지 않아요', () => {
  const room = createExampleProject().rooms[0]
  for (const variant of generateVariants(room)) {
    assert.deepEqual(Object.keys(variant).sort(), ['id', 'placements', 'summary', 'themeKey', 'title', 'unplacedIds'])
    for (const placement of variant.placements) {
      assert.deepEqual(Object.keys(placement).sort(), ['furnitureId', 'rotation', 'xCm', 'yCm'])
      assert.ok(Number.isInteger(placement.xCm) && Number.isInteger(placement.yCm))
    }
  }
})

test('같은 방을 넣으면 언제나 같은 배치안이 나오고 방 자료는 바뀌지 않아요', () => {
  const room = createExampleProject().rooms[0]
  const before = JSON.stringify(room)
  const first = generateVariants(room, { lifestyle: 'single' })
  const second = generateVariants(room, { lifestyle: 'single' })
  assert.deepEqual(first, second)
  assert.equal(JSON.stringify(room), before)
})

test('예시 방 배치안은 300ms 안에 만들어져요', () => {
  const room = createExampleProject().rooms[0]
  generateVariants(room)
  const started = performance.now()
  generateVariants(room)
  assert.ok(performance.now() - started < 300)
})

test('아주 작은 방에서는 조건을 어기는 대신 못 놓은 가구로 알려 줘요', () => {
  const room = createRoom({ widthCm: 150, depthCm: 150 })
  room.furniture = createExampleProject().rooms[0].furniture
  const variants = generateVariants(room)
  assert.ok(variants.length >= 1)
  for (const variant of variants) {
    assert.ok(variant.unplacedIds.includes('furn_bed_1'), '침대는 들어갈 수 없어요')
    const placedIds = variant.placements.map((placement) => placement.furnitureId)
    assert.equal(placedIds.length + variant.unplacedIds.length, room.furniture.length)
    assert.equal(placedIds.filter((id) => variant.unplacedIds.includes(id)).length, 0)
    assert.deepEqual(violations(room, placedItems(room, variant)), [], variant.themeKey)
  }
})

test('가구가 없으면 배치안도 없어요', () => {
  assert.deepEqual(generateVariants(createRoom({ widthCm: 300, depthCm: 400 })), [])
})

test('손으로 고정한 가구는 모든 배치안에서 그 자리에 있어요', () => {
  const room = createExampleProject().rooms[0]
  room.furniture = room.furniture.map((item) => (item.id === 'furn_bed_1' ? { ...item, locked: true } : item))
  const variants = generateVariants(room)
  assert.ok(variants.length >= 2)
  for (const variant of variants) {
    const bed = variant.placements.find((placement) => placement.furnitureId === 'furn_bed_1')
    assert.deepEqual(bed, { furnitureId: 'furn_bed_1', xCm: 185, yCm: 0, rotation: 0 })
    assert.deepEqual(violations(room, placedItems(room, variant)), [], variant.themeKey)
  }
})

test('매트는 방 안의 빈 바닥에 놓여요', () => {
  const room = createExampleProject().rooms[0]
  room.furniture = [...room.furniture, makeItem('furn_mat_1', 'mat', 120, 120, { heightCm: 2 })]
  for (const variant of generateVariants(room)) {
    const mat = placedItems(room, variant).find((item) => item.id === 'furn_mat_1')
    assert.ok(mat, variant.themeKey)
    assert.ok(isInsideRoom(footprint(mat), room))
  }
})

test('새 가구를 놓아도 기존 가구의 자리와 방향은 그대로예요', () => {
  const room = createExampleProject().rooms[0]
  const before = room.furniture.map((item) => ({ id: item.id, xCm: item.xCm, yCm: item.yCm, rotation: item.rotation }))
  const drawer = makeItem('furn_drawer_1', 'drawer', 80, 40, { clearanceFrontCm: 50 })
  const spot = placeNewFurniture(room, drawer)
  assert.ok(spot)
  assert.deepEqual(
    room.furniture.map((item) => ({ id: item.id, xCm: item.xCm, yCm: item.yCm, rotation: item.rotation })),
    before,
  )
  const placed = { ...drawer, ...spot }
  for (const other of room.furniture) {
    assert.equal(rectsOverlap(footprint(placed), footprint(other)), false, `${other.id}와 겹치면 안 돼요`)
  }
  // 예시 방의 처음 배치에 원래 있던 문제는 빼고, 새 가구 때문에 생긴 문제가 없는지만 본다
  assert.deepEqual(violations(room, [...room.furniture, placed]), violations(room, room.furniture))
  assert.deepEqual(violations(room, [placed]), [])
  assert.deepEqual(placeNewFurniture(room, drawer), spot, '같은 입력이면 같은 자리예요')
})

test('새 의자는 의자가 없는 책상 앞에 놓여요', () => {
  const room = createExampleProject().rooms[0]
  room.furniture = room.furniture.filter((item) => item.category !== 'chair')
  const chair = makeItem('furn_chair_9', 'chair', 50, 50)
  const spot = placeNewFurniture(room, chair)
  assert.deepEqual(spot, { xCm: 35, yCm: 60, rotation: 180 })
})

test('자리가 없는 꽉 찬 방에서는 null을 돌려줘요', () => {
  const room = createRoom({ widthCm: 200, depthCm: 200 })
  room.furniture = [makeItem('furn_other_1', 'other', 200, 200)]
  assert.equal(placeNewFurniture(room, makeItem('furn_drawer_1', 'drawer', 80, 40)), null)
  assert.equal(placeNewFurniture(room, makeItem('furn_big_1', 'wardrobe', 400, 60)), null)
})

test('배치안 적용은 새 배열을 만들고 자리가 없는 가구는 그대로 둬요', () => {
  const furniture = createExampleProject().rooms[0].furniture
  const copy = JSON.parse(JSON.stringify(furniture))
  const result = applyPlacements(furniture, [{ furnitureId: 'furn_desk_1', xCm: 100, yCm: 200, rotation: 90 }])
  assert.notEqual(result, furniture)
  assert.deepEqual(furniture, copy, '원래 배열은 바뀌지 않아요')
  const desk = result.find((item) => item.id === 'furn_desk_1')
  assert.ok(desk)
  assert.deepEqual([desk.xCm, desk.yCm, desk.rotation], [100, 200, 90])
  assert.equal(desk.name, '1200 책상')
  for (const item of furniture) {
    if (item.id !== 'furn_desk_1') assert.equal(result.find((entry) => entry.id === item.id), item)
  }
})

// ── 검토에서 나온 문제 다시 생기지 않게 하기 ──
import { CATALOG as REVIEW_CATALOG } from '../src/data/catalog.js'
import { createExampleProject as reviewExample, defaultOpenings as reviewOpenings } from '../src/data/exampleProject.js'
import { footprint as reviewFootprint, overlapCm as reviewOverlap } from '../src/engine/geometry.js'

/** @param {string} key @param {string} id */
function reviewPiece(key, id) {
  const seed = REVIEW_CATALOG.find((c) => c.key === key)
  assert.ok(seed)
  const base = reviewExample().rooms[0].furniture[0]
  return {
    ...base, id, name: seed.name, category: seed.category, widthCm: seed.widthCm, depthCm: seed.depthCm,
    heightCm: seed.heightCm, clearanceFrontCm: seed.clearanceFrontCm, xCm: 0, yCm: 0, rotation: /** @type {0} */ (0), locked: false,
  }
}

test('의자 추가: 두 번째 의자는 책상 위에 올라가지 않아요', () => {
  const room = reviewExample().rooms[0]
  const first = room.furniture.find((f) => f.category === 'chair')
  assert.ok(first)
  const chair = { ...first, id: 'furn_chair_2' }
  const spot = placeNewFurniture(room, chair)
  assert.ok(spot)
  const rect = reviewFootprint({ ...chair, ...spot })
  for (const other of room.furniture) {
    if (other.category !== 'desk' && other.category !== 'table') continue
    const o = reviewOverlap(rect, reviewFootprint(other))
    assert.ok(Math.min(o.xCm, o.yCm) <= 20, '의자가 책상 안으로 20cm 넘게 들어가면 안 돼요')
  }
})

test('테마: 방에 없는 가구를 내세우는 배치안은 만들지 않아요', () => {
  const base = reviewExample().rooms[0]
  const sofaOnly = { ...base, widthCm: 300, depthCm: 400, openings: reviewOpenings(300), furniture: [reviewPiece('sofa_2', 'furn_sofa_1')] }
  const keys = generateVariants(sofaOnly).map((v) => v.themeKey)
  assert.ok(keys.length >= 1)
  for (const key of ['zone_split', 'window_desk', 'max_storage']) assert.equal(keys.includes(/** @type {any} */ (key)), false, key)

  const noWindow = { ...base, openings: base.openings.filter((o) => o.type === 'door') }
  assert.equal(generateVariants(noWindow).some((v) => v.themeKey === 'window_desk'), false)
})

test('배치안: 가구를 다 놓은 안이 있으면 못 놓은 안은 내놓지 않아요', () => {
  const base = reviewExample().rooms[0]
  const room = {
    ...base, widthCm: 250, depthCm: 300,
    openings: [
      { id: 'op_door_1', type: /** @type {'door'} */ ('door'), wall: /** @type {'bottom'} */ ('bottom'), offsetCm: 20, widthCm: 90, sillHeightCm: 0, swingInward: true },
      { id: 'op_win_1', type: /** @type {'window'} */ ('window'), wall: /** @type {'top'} */ ('top'), offsetCm: 50, widthCm: 150, sillHeightCm: 90, swingInward: false },
    ],
    furniture: [reviewPiece('bed_single', 'furn_bed_1'), reviewPiece('desk_1200', 'furn_desk_1'), reviewPiece('chair_desk', 'furn_chair_1'), reviewPiece('wardrobe_800', 'furn_wardrobe_1')],
  }
  const variants = generateVariants(room)
  assert.ok(variants.length >= 1)
  const counts = new Set(variants.map((v) => v.unplacedIds.length))
  assert.equal(counts.size, 1, '못 놓은 가구 수가 서로 다른 안이 섞이면 안 돼요')
  assert.deepEqual(generateVariants(room), variants, '같은 방이면 같은 결과가 나와야 해요')
})

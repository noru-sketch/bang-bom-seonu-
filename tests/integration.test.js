// 통합 테스트: 예시 방 → 배치안 → 검사 → 기본 해설이 서로 맞물리는지 확인해요.
/** @import { FurnitureItem } from '../src/types/schema.ts' */
import test from 'node:test'
import assert from 'node:assert/strict'

import { createExampleProject } from '../src/data/exampleProject.js'
import { CATALOG } from '../src/data/catalog.js'
import { validateRoom } from '../src/engine/validator.js'
import { generateVariants, placeNewFurniture, applyPlacements } from '../src/engine/layout.js'
import { fallbackAdvice } from '../src/engine/fallback.js'

function exampleRoom() {
  const project = createExampleProject()
  const room = project.rooms.find((r) => r.id === project.activeRoomId) ?? project.rooms[0]
  assert.ok(room, '예시 방이 있어야 해요')
  return { project, room }
}

test('통합: 예시 방 자체에 확실한 문제가 0건이에요', () => {
  const { project, room } = exampleRoom()
  const result = validateRoom(room, { lifestyle: project.profile.lifestyle })
  assert.deepEqual(result.errors.map((e) => e.code), [])
})

test('통합: 예시 방은 서로 다른 배치안 5개를 내요', () => {
  const { project, room } = exampleRoom()
  const variants = generateVariants(room, { lifestyle: project.profile.lifestyle })
  assert.equal(variants.length, 5)
  assert.equal(new Set(variants.map((v) => v.themeKey)).size, 5)
  assert.equal(new Set(variants.map((v) => v.id)).size, 5)
  const shapes = variants.map((v) =>
    JSON.stringify([...v.placements].sort((a, b) => a.furnitureId.localeCompare(b.furnitureId))),
  )
  assert.equal(new Set(shapes).size, 5, '배치가 서로 달라야 해요')
  for (const v of variants) assert.equal('score' in v, false)
})

test('통합: 배치안을 적용하면 검사기에서 확실한 문제가 0건이에요', () => {
  const { project, room } = exampleRoom()
  const variants = generateVariants(room, { lifestyle: project.profile.lifestyle })
  for (const v of variants) {
    const next = { ...room, furniture: applyPlacements(room.furniture, v.placements) }
    const result = validateRoom(next, { lifestyle: project.profile.lifestyle })
    assert.deepEqual(
      result.errors.map((e) => `${e.code}:${e.furnitureIds.join(',')}`),
      [],
      `${v.themeKey} 배치안에 문제가 있어요`,
    )
  }
})

test('통합: 새 가구를 빈 자리에 놓아도 겹침 문제가 생기지 않아요', () => {
  const { project, room } = exampleRoom()
  const seed = CATALOG.find((c) => c.key === 'nightstand') ?? CATALOG[0]
  /** @type {FurnitureItem} */
  const item = {
    ...room.furniture[0],
    id: 'furn_new_test',
    name: seed.name,
    category: seed.category,
    widthCm: seed.widthCm,
    depthCm: seed.depthCm,
    heightCm: seed.heightCm,
    clearanceFrontCm: seed.clearanceFrontCm,
    xCm: 0,
    yCm: 0,
    rotation: 0,
    locked: false,
  }
  const spot = placeNewFurniture(room, item)
  assert.ok(spot, '예시 방에는 협탁 하나가 들어갈 자리가 있어야 해요')
  const next = { ...room, furniture: [...room.furniture, { ...item, ...spot }] }
  const before = validateRoom(room, { lifestyle: project.profile.lifestyle })
  const after = validateRoom(next, { lifestyle: project.profile.lifestyle })
  assert.equal(after.errors.filter((e) => e.code === 'OVERLAP').length, 0)
  assert.equal(after.errors.length, before.errors.length, '새 가구가 새 문제를 만들면 안 돼요')
})

test('통합: 기본 해설은 실제 검사 결과를 그대로 받아요', () => {
  const { project, room } = exampleRoom()
  const validationResult = validateRoom(room, { lifestyle: project.profile.lifestyle })
  const advice = fallbackAdvice({ room, validationResult, lifestyle: project.profile.lifestyle })
  assert.equal(advice.isFallback, true)
  assert.equal(typeof advice.summary, 'string')
  assert.ok(advice.summary.length > 0)
  assert.ok(Array.isArray(advice.highlights))
  assert.ok(Array.isArray(advice.improvements))
  assert.equal(/score|점수|등급/.test(JSON.stringify(advice)), false)

  // 문제가 있는 방(가구를 겹쳐 놓음)도 받아야 해요.
  const [a, b] = room.furniture
  const broken = { ...room, furniture: [a, { ...b, xCm: a.xCm, yCm: a.yCm }, ...room.furniture.slice(2)] }
  const brokenResult = validateRoom(broken, { lifestyle: project.profile.lifestyle })
  assert.ok(brokenResult.errors.length > 0)
  const brokenAdvice = fallbackAdvice({ room: broken, validationResult: brokenResult, lifestyle: project.profile.lifestyle })
  assert.equal(brokenAdvice.isFallback, true)
  assert.ok(brokenAdvice.improvements.length > 0)
})

// ── 여러 모양의 방에서도 배치안에 확실한 문제가 없어야 해요 ──
import { defaultOpenings as moreOpenings } from '../src/data/exampleProject.js'

/** @param {string} key @param {string} id @returns {FurnitureItem} */
function catalogPiece(key, id) {
  const seed = CATALOG.find((c) => c.key === key)
  assert.ok(seed)
  const base = exampleRoom().room.furniture[0]
  return {
    ...base, id, name: seed.name, category: seed.category, widthCm: seed.widthCm, depthCm: seed.depthCm,
    heightCm: seed.heightCm, clearanceFrontCm: seed.clearanceFrontCm, xCm: 0, yCm: 0, rotation: 0, locked: false,
  }
}

const door = (/** @type {'top'|'bottom'|'left'|'right'} */ wall, /** @type {number} */ offsetCm, /** @type {string} */ id) =>
  ({ id, type: /** @type {'door'} */ ('door'), wall, offsetCm, widthCm: 90, sillHeightCm: 0, swingInward: true })
const basic = () => [catalogPiece('bed_super_single', 'furn_bed_1'), catalogPiece('desk_1200', 'furn_desk_1'), catalogPiece('chair_desk', 'furn_chair_1'), catalogPiece('wardrobe_800', 'furn_wardrobe_1'), catalogPiece('bookshelf_800', 'furn_bookshelf_1')]

/** @type {{ name: string, widthCm: number, depthCm: number, openings: any[], furniture: FurnitureItem[], lifestyle: 'single' | 'family_child' }[]} */
const MORE_ROOMS = [
  { name: '작은 방', widthCm: 250, depthCm: 300, openings: moreOpenings(250), furniture: basic().slice(0, 4), lifestyle: 'single' },
  { name: '긴 방', widthCm: 240, depthCm: 600, openings: moreOpenings(240), furniture: basic(), lifestyle: 'single' },
  { name: '문이 둘인 방', widthCm: 350, depthCm: 400, openings: [...moreOpenings(350), door('left', 150, 'op_door_2')], furniture: basic(), lifestyle: 'single' },
  { name: '아이가 있는 집', widthCm: 400, depthCm: 450, openings: moreOpenings(400), furniture: [...basic(), catalogPiece('play_mat', 'furn_mat_1'), catalogPiece('drawer_chest', 'furn_drawer_1')], lifestyle: 'family_child' },
]

for (const sample of MORE_ROOMS) {
  test(`통합: ${sample.name}의 배치안도 확실한 문제가 0건이고 의자는 책상 앞에 있어요`, () => {
    const room = { ...exampleRoom().room, widthCm: sample.widthCm, depthCm: sample.depthCm, openings: sample.openings, furniture: sample.furniture }
    const variants = generateVariants(room, { lifestyle: sample.lifestyle })
    assert.ok(variants.length >= 1)
    assert.equal(new Set(variants.map((v) => v.unplacedIds.length)).size, 1)
    for (const v of variants) {
      assert.equal('score' in v, false)
      const placedIds = new Set(v.placements.map((p) => p.furnitureId))
      const furniture = applyPlacements(room.furniture, v.placements).filter((f) => placedIds.has(f.id))
      const result = validateRoom({ ...room, furniture }, { lifestyle: sample.lifestyle })
      assert.deepEqual(result.errors.map((e) => `${e.code}:${e.furnitureIds.join(',')}`), [], `${sample.name} ${v.themeKey}`)
      const desk = furniture.find((f) => f.category === 'desk')
      const chair = furniture.find((f) => f.category === 'chair')
      if (desk && chair) {
        const far = Math.hypot(chair.xCm + 25 - (desk.xCm + 60), chair.yCm + 25 - (desk.yCm + 30))
        assert.ok(far <= 150, `${sample.name} ${v.themeKey}: 의자가 책상에서 너무 멀어요 (${Math.round(far)}cm)`)
      }
    }
  })
}

// 리포트 자료 테스트: 사양서의 치수·위치가 방과 같은지, 3D 좌표 변환, 복사용 표의 열, 보유 가구 제외 합계.

/** @import { Room } from '../src/types/schema.ts' */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildContractorSpec,
  toTsv,
  formatKrw,
  furnitureCells,
  FURNITURE_COLUMNS,
  OPENING_COLUMNS,
  COORDINATE_NOTE,
} from '../src/engine/report.js'
import { summarizeCost } from '../src/engine/cost.js'
import { footprint, toModelPlacement } from '../src/engine/geometry.js'
import { createExampleProject } from '../src/data/exampleProject.js'
import { WALL_LABELS } from '../src/data/labels.js'

/** @returns {Room} */
function exampleRoom() {
  const project = createExampleProject()
  const room = project.rooms.find((candidate) => candidate.id === project.activeRoomId) ?? project.rooms[0]
  return room
}

test('방 치수표는 cm와 m, 넓이가 방과 같아요', () => {
  const room = exampleRoom()
  const spec = buildContractorSpec(room)
  assert.deepEqual(
    spec.dimensions.map((row) => [row.label, row.cm]),
    [
      ['가로', room.widthCm],
      ['세로', room.depthCm],
      ['높이', room.heightCm],
    ],
  )
  for (const row of spec.dimensions) assert.equal(row.m, Math.round(row.cm) / 100)
  assert.equal(spec.areaM2, Math.round((room.widthCm * room.depthCm) / 100) / 100)
  assert.equal(spec.roomName, room.name)
})

test('가구 표의 크기와 위치는 방에 놓인 가구와 같아요', () => {
  const room = exampleRoom()
  const spec = buildContractorSpec(room)
  assert.equal(spec.furniture.length, room.furniture.length)
  room.furniture.forEach((item, index) => {
    const row = spec.furniture[index]
    const body = footprint(item)
    assert.equal(row.no, index + 1)
    assert.equal(row.name, item.name)
    assert.equal(row.widthCm, item.widthCm)
    assert.equal(row.depthCm, item.depthCm)
    assert.equal(row.heightCm, item.heightCm)
    assert.equal(row.xCm, body.xCm, '위치 x는 바닥 차지 자리의 왼쪽 위예요')
    assert.equal(row.yCm, body.yCm, '위치 y는 바닥 차지 자리의 왼쪽 위예요')
    assert.equal(row.footprintWidthCm, body.widthCm)
    assert.equal(row.footprintDepthCm, body.depthCm)
    assert.equal(row.rotation, item.rotation)
    assert.equal(row.owned, item.owned)
  })
})

test('중심 좌표(m)는 toModelPlacement와 같아요', () => {
  const room = exampleRoom()
  // 회전한 가구도 꼭 확인하도록 첫 가구를 90도로 돌려 둔다
  room.furniture[0] = { ...room.furniture[0], rotation: 90, xCm: 15, yCm: 20 }
  const spec = buildContractorSpec(room)
  room.furniture.forEach((item, index) => {
    const model = toModelPlacement(item, room)
    const row = spec.furniture[index]
    assert.ok(Math.abs(row.centerXM - model.x) < 0.0005, `${item.name} 중심 x`)
    assert.ok(Math.abs(row.centerZM - model.z) < 0.0005, `${item.name} 중심 z`)
  })
  const turned = spec.furniture[0]
  assert.equal(turned.footprintWidthCm, room.furniture[0].depthCm, '90도면 바닥 가로와 깊이가 바뀌어요')
  assert.equal(turned.centerXM, (15 + room.furniture[0].depthCm / 2 - room.widthCm / 2) / 100)
})

test('문·창문 표는 벽 이름과 위치, 폭, 창 아래 높이, 열림 방향을 담아요', () => {
  const room = exampleRoom()
  const spec = buildContractorSpec(room)
  assert.equal(spec.openings.length, room.openings.length)
  room.openings.forEach((opening, index) => {
    const row = spec.openings[index]
    assert.equal(row.wallLabel, WALL_LABELS[opening.wall])
    assert.equal(row.offsetCm, opening.offsetCm)
    assert.equal(row.widthCm, opening.widthCm)
    if (opening.type === 'door') {
      assert.equal(row.typeLabel, '문')
      assert.equal(row.sillHeightCm, null, '문에는 창 아래 높이가 없어요')
      assert.match(row.swingLabel, opening.swingInward ? /안쪽/ : /바깥쪽/)
    } else {
      assert.equal(row.typeLabel, '창문')
      assert.equal(row.sillHeightCm, opening.sillHeightCm)
    }
  })
})

test('마감재 표는 스타일 이름과 색 코드를 그대로 담아요', () => {
  const room = exampleRoom()
  const spec = buildContractorSpec(room)
  assert.equal(spec.styleName, room.style.name)
  assert.deepEqual(
    spec.palette.map((row) => row.hex),
    [room.style.wallColor, room.style.floorColor, room.style.accentColor],
  )
})

test('복사용 표는 탭으로 나뉘고 열 수가 맞아요', () => {
  const room = exampleRoom()
  room.furniture[0] = { ...room.furniture[0], name: '탭\t줄\n바꿈 책상' }
  const spec = buildContractorSpec(room)
  const lines = toTsv(spec).split('\n')

  const furnitureHeader = lines.indexOf(FURNITURE_COLUMNS.join('\t'))
  assert.ok(furnitureHeader > 0, '가구 표 머리줄이 있어요')
  for (let index = 0; index < spec.furniture.length; index += 1) {
    const cells = lines[furnitureHeader + 1 + index].split('\t')
    assert.equal(cells.length, FURNITURE_COLUMNS.length, '가구 줄의 칸 수가 머리줄과 같아요')
    assert.deepEqual(cells.slice(3), furnitureCells(spec.furniture[index]).slice(3))
  }
  assert.equal(lines[furnitureHeader + 1].split('\t')[1], '탭 줄 바꿈 책상', '이름 속 탭과 줄바꿈은 빈칸이 돼요')

  const openingHeader = lines.indexOf(OPENING_COLUMNS.join('\t'))
  assert.ok(openingHeader > 0, '문·창문 표 머리줄이 있어요')
  for (let index = 0; index < spec.openings.length; index += 1) {
    assert.equal(lines[openingHeader + 1 + index].split('\t').length, OPENING_COLUMNS.length)
  }

  assert.ok(lines.includes(['가로', String(room.widthCm), (room.widthCm / 100).toFixed(2)].join('\t')))
  assert.equal(lines.at(-1), COORDINATE_NOTE)
})

test('가구가 없는 방도 표를 만들 수 있어요', () => {
  const room = { ...exampleRoom(), furniture: [], openings: [] }
  const spec = buildContractorSpec(room)
  assert.deepEqual(spec.furniture, [])
  assert.deepEqual(spec.openings, [])
  assert.ok(toTsv(spec).includes(FURNITURE_COLUMNS.join('\t')))
})

test('이미 있는 가구는 살 가구 합계에서 빠져요', () => {
  const room = exampleRoom()
  room.furniture = room.furniture.map((item, index) => ({
    ...item,
    owned: index === 0,
    price: { estimatedKrw: 100000, manualKrw: null, source: 'estimated' },
  }))
  const summary = summarizeCost(room.furniture, 1000000)
  assert.equal(summary.totalKrw, 100000 * (room.furniture.length - 1))
  assert.equal(summary.ownedExcludedKrw, 100000)
  const spec = buildContractorSpec(room)
  assert.equal(furnitureCells(spec.furniture[0]).at(-1), '이미 있어요')
  assert.equal(furnitureCells(spec.furniture[1]).at(-1), '')
})

test('금액은 쉼표와 원을 붙여 써요', () => {
  assert.equal(formatKrw(1500000), '1,500,000원')
  assert.equal(formatKrw(Number.NaN), '0원')
})

test('사양서 자료에 점수나 등급 같은 칸이 없어요', () => {
  const text = JSON.stringify(buildContractorSpec(exampleRoom())) + toTsv(buildContractorSpec(exampleRoom()))
  assert.doesNotMatch(text, /score|grade|rank|점수|등급|별점/i)
})

// 리포트 자료 만들기. 방 자료를 가족용 가구 목록과 업체용 사양서 표로 바꾼다.
// 순수 계산만 한다(화면·브라우저 기능을 쓰지 않는다). 좌표는 geometry.js의 약속을 그대로 따른다.

/** @import { Room } from '../types/schema.ts' */

import { CATEGORY_LABELS, FLOOR_LABELS, WALL_LABELS } from '../data/labels.js'
import { footprintSize, toModelPlacement } from './geometry.js'

/**
 * @typedef {{ label: string, cm: number, m: number }} DimensionRow
 * @typedef {{ id: string, typeLabel: string, wallLabel: string, offsetCm: number, widthCm: number, sillHeightCm: number | null, swingLabel: string }} OpeningRow
 * @typedef {{
 *   no: number, id: string, name: string, categoryLabel: string,
 *   widthCm: number, depthCm: number, heightCm: number,
 *   xCm: number, yCm: number, footprintWidthCm: number, footprintDepthCm: number,
 *   rotation: number, centerXM: number, centerZM: number, owned: boolean,
 * }} FurnitureRow
 * @typedef {{ label: string, value: string, hex: string | null }} PaletteRow
 * @typedef {{
 *   roomName: string, dimensions: DimensionRow[], areaM2: number,
 *   openings: OpeningRow[], furniture: FurnitureRow[],
 *   styleName: string, palette: PaletteRow[], coordinateNote: string,
 * }} ContractorSpec
 */

/** 좌표를 읽는 법을 한 문장으로 적은 글. 화면과 복사한 표에 같이 쓴다. */
export const COORDINATE_NOTE =
  '위치 x·y는 방 안쪽 왼쪽 위 모서리에서 가구 바닥 자리의 왼쪽 위까지 잰 거리(cm)이고, 중심 x·z는 방 바닥 한가운데를 0으로 본 3D 좌표(m)예요.'

/**
 * 소수 자리를 정해 반올림한다.
 * @param {number} value
 * @param {number} digits
 * @returns {number}
 */
function roundTo(value, digits) {
  const scale = 10 ** digits
  const rounded = Math.round(value * scale) / scale
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * 금액을 "1,500,000원" 모양으로 쓴다.
 * @param {number} krw
 * @returns {string}
 */
export function formatKrw(krw) {
  const safe = typeof krw === 'number' && Number.isFinite(krw) ? Math.round(krw) : 0
  return `${safe.toLocaleString('ko-KR')}원`
}

/**
 * 업체·시공용 사양서 자료.
 * 가구 위치(xCm, yCm)는 바닥 차지 직사각형의 왼쪽 위(방 안쪽 왼쪽 위가 0, 0)이고,
 * 중심(centerXM, centerZM)은 toModelPlacement()의 3D 좌표(m)다.
 * @param {Room} room
 * @returns {ContractorSpec}
 */
export function buildContractorSpec(room) {
  /** @type {DimensionRow[]} */
  const dimensions = [
    { label: '가로', cm: room.widthCm, m: roundTo(room.widthCm / 100, 2) },
    { label: '세로', cm: room.depthCm, m: roundTo(room.depthCm / 100, 2) },
    { label: '높이', cm: room.heightCm, m: roundTo(room.heightCm / 100, 2) },
  ]

  /** @type {OpeningRow[]} */
  const openings = (room.openings ?? []).map((opening) => {
    const isDoor = opening.type === 'door'
    return {
      id: opening.id,
      typeLabel: isDoor ? '문' : '창문',
      wallLabel: WALL_LABELS[opening.wall],
      offsetCm: opening.offsetCm,
      widthCm: opening.widthCm,
      sillHeightCm: isDoor ? null : opening.sillHeightCm,
      swingLabel: isDoor ? (opening.swingInward ? '방 안쪽으로 열림' : '방 바깥쪽으로 열림') : '해당 없음',
    }
  })

  /** @type {FurnitureRow[]} */
  const furniture = (room.furniture ?? []).map((item, index) => {
    const size = footprintSize(item)
    const model = toModelPlacement(item, room)
    return {
      no: index + 1,
      id: item.id,
      name: item.name,
      categoryLabel: CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other,
      widthCm: item.widthCm,
      depthCm: item.depthCm,
      heightCm: item.heightCm,
      xCm: item.xCm,
      yCm: item.yCm,
      footprintWidthCm: size.widthCm,
      footprintDepthCm: size.depthCm,
      rotation: item.rotation,
      centerXM: roundTo(model.x, 3),
      centerZM: roundTo(model.z, 3),
      owned: item.owned === true,
    }
  })

  const style = room.style
  /** @type {PaletteRow[]} */
  const palette = [
    { label: '벽 색', value: '벽면', hex: style.wallColor },
    { label: '바닥 색', value: FLOOR_LABELS[style.floorMaterial] ?? '바닥', hex: style.floorColor },
    { label: '포인트 색', value: '포인트', hex: style.accentColor },
  ]

  return {
    roomName: room.name,
    dimensions,
    areaM2: roundTo((room.widthCm * room.depthCm) / 10000, 2),
    openings,
    furniture,
    styleName: style.name,
    palette,
    coordinateNote: COORDINATE_NOTE,
  }
}

/** 가구 표의 열 이름. 화면 표와 복사한 표가 같은 순서를 쓴다. */
export const FURNITURE_COLUMNS = [
  '번호',
  '이름',
  '종류',
  '가로(cm)',
  '깊이(cm)',
  '높이(cm)',
  '위치 x(cm)',
  '위치 y(cm)',
  '회전(도)',
  '중심 x(m)',
  '중심 z(m)',
  '보유',
]

/** 문·창문 표의 열 이름. */
export const OPENING_COLUMNS = ['종류', '벽', '위치(cm)', '폭(cm)', '창 아래 높이(cm)', '열림 방향']

/**
 * 가구 한 줄을 FURNITURE_COLUMNS 순서의 글자 배열로 바꾼다.
 * @param {FurnitureRow} row
 * @returns {string[]}
 */
export function furnitureCells(row) {
  return [
    String(row.no),
    row.name,
    row.categoryLabel,
    String(row.widthCm),
    String(row.depthCm),
    String(row.heightCm),
    String(row.xCm),
    String(row.yCm),
    String(row.rotation),
    row.centerXM.toFixed(3),
    row.centerZM.toFixed(3),
    row.owned ? '이미 있어요' : '',
  ]
}

/**
 * 문·창문 한 줄을 OPENING_COLUMNS 순서의 글자 배열로 바꾼다.
 * @param {OpeningRow} row
 * @returns {string[]}
 */
export function openingCells(row) {
  return [
    row.typeLabel,
    row.wallLabel,
    String(row.offsetCm),
    String(row.widthCm),
    row.sillHeightCm === null ? '-' : String(row.sillHeightCm),
    row.swingLabel,
  ]
}

/**
 * 표 한 칸에 들어갈 글자에서 탭과 줄바꿈을 없앤다(칸이 밀리지 않게).
 * @param {string} text
 * @returns {string}
 */
function cell(text) {
  return String(text ?? '').replace(/[\t\r\n]+/g, ' ').trim()
}

/**
 * 사양서를 탭으로 나눈 글자로 바꾼다. 엑셀 같은 표 프로그램에 그대로 붙여 넣을 수 있다.
 * @param {ContractorSpec} spec
 * @returns {string}
 */
export function toTsv(spec) {
  /** @type {string[][]} */
  const lines = []
  lines.push([`${spec.roomName} 시공 사양서`])
  lines.push([])
  lines.push(['방 치수'])
  lines.push(['항목', 'cm', 'm'])
  for (const row of spec.dimensions) lines.push([row.label, String(row.cm), row.m.toFixed(2)])
  lines.push(['바닥 넓이(㎡)', spec.areaM2.toFixed(2)])
  lines.push([])
  lines.push(['문·창문'])
  lines.push(OPENING_COLUMNS)
  for (const row of spec.openings) lines.push(openingCells(row))
  lines.push([])
  lines.push(['가구'])
  lines.push(FURNITURE_COLUMNS)
  for (const row of spec.furniture) lines.push(furnitureCells(row))
  lines.push([])
  lines.push(['마감재'])
  lines.push(['항목', '내용', '색 코드'])
  lines.push(['스타일', spec.styleName, ''])
  for (const row of spec.palette) lines.push([row.label, row.value, row.hex ?? ''])
  lines.push([])
  lines.push([spec.coordinateNote])
  return lines.map((line) => line.map(cell).join('\t')).join('\n')
}

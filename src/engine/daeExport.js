// 스케치업 내보내기: 방 하나를 COLLADA 1.4.1(.dae) 글로 바꾼다. 서버 없이 브라우저 안에서 돈다.
// 순수 계산만 한다(화면·브라우저 기능을 쓰지 않는다). 좌표와 회전은 geometry.js의 약속을 그대로 따른다.
//
// 약속:
// - 단위는 미터, 위쪽은 Z(스케치업과 같다). 원점은 방 안쪽 왼쪽 아래 모서리의 바닥 윗면이다.
// - 평면도는 y가 아래로 커지고 스케치업은 위에서 볼 때 Y가 위로 커진다. 그래서 Y = (방 세로 − y)로 뒤집는다.
//   뒤집어야 평면도의 위쪽 벽이 스케치업에서도 위에 오고, 방이 거울에 비친 모양이 되지 않는다.
// - 방 부분은 바닥 1 + 벽 4, 가구는 하나에 상자 하나다. 부분마다 <node>가 하나라서 스케치업에서 이름 붙은 묶음으로 따로 잡힌다.
// - 벽은 방 안쪽 치수 바깥에 세우고 문·창문 자리는 비운다. 벽 두께 10cm, 문 높이 210cm, 창 높이 120cm는
//   SCHEMA에 없는 값이라 3D 화면(sceneEngine)과 같은 어림값을 쓴다. 문짝·창틀·유리는 그리지 않는다.
// - 숫자가 잘못된(NaN, 0 이하 크기, 너무 큰 값) 상자는 쓰지 않고 건너뛴다.
// - 날짜와 사용자 이름을 넣지 않는다. 같은 방이면 언제나 같은 글이 나온다.

/** @import { FurnitureItem, ProjectState, Room, Wall } from '../types/schema.ts' */

import { WALL_LABELS } from '../data/labels.js'
import { footprint } from './geometry.js'
import { cleanText } from './sanitize.js'

/**
 * @typedef {object} DaeOptions
 * @property {string} [roomId] 내보낼 방의 id. 없으면 지금 보고 있는 방(activeRoomId), 그 방도 없으면 첫 방
 * @property {number} [wallThicknessCm] 벽 두께(cm). 기본 10
 */

/** @typedef {{ min: [number, number, number], max: [number, number, number] }} Box 상자의 두 끝점(cm) */

/**
 * 장면에 놓이는 묶음 하나(<node> 하나). 상자는 묶음 자신의 좌표(cm)로 적고, 묶음을 Z축으로 돌린 뒤 (xCm, yCm)로 옮긴다.
 * @typedef {{ name: string, color: string, boxes: Box[], xCm: number, yCm: number, rotation: 0 | 90 | 180 | 270 }} Part
 */

/** 벽 두께 기본값(cm). SCHEMA에 벽 두께가 없어서 3D 화면과 같은 값을 쓴다 */
export const DAE_WALL_THICKNESS_CM = 10
/** 바닥 판 두께(cm). 윗면이 높이 0이다 */
const FLOOR_THICKNESS_CM = 6
/** 문 높이와 창 높이(cm). SCHEMA에 없어서 3D 화면과 같은 어림값을 쓴다 */
const DOOR_HEIGHT_CM = 210
const WINDOW_HEIGHT_CM = 120
/** 이보다 좁은 문·창문은 벽을 비우지 않는다(3D 화면과 같다) */
const MIN_OPENING_CM = 5
/** 이보다 얇은 상자는 쓰지 않는다(1mm) */
const MIN_SIZE_CM = 0.1
/** 이보다 큰 숫자는 잘못된 값으로 본다(1km) */
const MAX_CM = 100000
const NAME_MAX = 80
/** 색 값이 잘못됐을 때 쓰는 색. 3D 화면의 기본색과 같다 */
const FALLBACK_COLORS = { floor: '#D9C3A3', wall: '#F7F5F0', furniture: '#CFCBC2' }

/** @type {Wall[]} */
const WALLS = ['top', 'bottom', 'left', 'right']

/**
 * Z축으로 도는 각도의 [cos, sin]. 네 방향뿐이라 표로 둔다(삼각함수의 아주 작은 오차가 글에 섞이지 않게).
 * @type {Record<0 | 90 | 180 | 270, [number, number]>}
 */
const TURN = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }

/** 상자 하나의 삼각형 12개. 꼭짓점 번호는 x + 2y + 4z(각각 0 또는 1)이고, 밖에서 볼 때 반시계 방향이라 겉면이 바깥을 본다 */
const BOX_TRIANGLES = [
  0, 2, 3, 0, 3, 1, // 아래
  4, 5, 7, 4, 7, 6, // 위
  0, 1, 5, 0, 5, 4, // y가 작은 쪽
  2, 6, 7, 2, 7, 3, // y가 큰 쪽
  0, 4, 6, 0, 6, 2, // x가 작은 쪽
  1, 3, 7, 1, 7, 5, // x가 큰 쪽
]

/**
 * 내보내도 되는 길이·좌표인지. 숫자가 아니거나 끝이 없거나 1km를 넘으면 false.
 * @param {unknown} value
 * @returns {value is number}
 */
function isLength(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_CM
}

/**
 * 내보내도 되는 크기인지. isLength에 더해 1mm 이상이어야 한다(0·음수는 false).
 * @param {unknown} value
 * @returns {value is number}
 */
function isSize(value) {
  return isLength(value) && value >= MIN_SIZE_CM
}

/**
 * 두 끝점으로 상자를 만든다. 숫자가 잘못됐거나 어느 쪽이든 1mm보다 얇으면 null.
 * @param {number} x0
 * @param {number} y0
 * @param {number} z0
 * @param {number} x1
 * @param {number} y1
 * @param {number} z1
 * @returns {Box | null}
 */
function makeBox(x0, y0, z0, x1, y1, z1) {
  if (![x0, y0, z0, x1, y1, z1].every(isLength)) return null
  if (x1 - x0 < MIN_SIZE_CM || y1 - y0 < MIN_SIZE_CM || z1 - z0 < MIN_SIZE_CM) return null
  return { min: [x0, y0, z0], max: [x1, y1, z1] }
}

/**
 * 상자 꼭짓점 8개의 좌표 24개. 순서는 BOX_TRIANGLES의 번호와 같다.
 * @param {Box} box
 * @returns {number[]}
 */
function boxCorners(box) {
  const corners = []
  for (let corner = 0; corner < 8; corner += 1) {
    corners.push(
      corner & 1 ? box.max[0] : box.min[0],
      corner & 2 ? box.max[1] : box.min[1],
      corner & 4 ? box.max[2] : box.min[2],
    )
  }
  return corners
}

/**
 * #RGB·#RRGGBB 색을 대문자 #RRGGBB로. 색이 아니면 fallback.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function hexColor(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`.toUpperCase()
  return fallback
}

/**
 * 소수 여섯 자리까지 쓰고 끝의 0은 뗀 숫자 글. 지수 표기(1e-7)나 -0이 나오지 않게 한다.
 * @param {number} value
 * @returns {string}
 */
function plainNumber(value) {
  const text = value.toFixed(6).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}

/**
 * cm 값을 m 글자로.
 * @param {number} cm
 * @returns {string}
 */
function meters(cm) {
  return plainNumber(cm / 100)
}

/**
 * #RRGGBB(sRGB)를 COLLADA 색 "r g b a"(0~1)로.
 * @param {string} hex
 * @returns {string}
 */
function colorValues(hex) {
  const channels = [1, 3, 5].map((start) => plainNumber(parseInt(hex.slice(start, start + 2), 16) / 255))
  return `${channels.join(' ')} 1`
}

/**
 * 묶음 이름으로 쓸 글. XML에 쓸 수 없는 글자(제어 문자, 짝 잃은 반쪽 글자)를 빼고 길이를 자른다. 비면 fallback.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function partName(value, fallback) {
  if (typeof value !== 'string') return fallback
  return cleanText(value.replace(/[\uD800-\uDFFF￾￿]/gu, ''), NAME_MAX) || fallback
}

/**
 * XML 속성 값에 넣어도 되게 바꾼다.
 * @param {string} text
 * @returns {string}
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 방 껍데기: 바닥 1 + 벽 4. 상자를 내보내는 좌표로 바로 적는다(옮기거나 돌리지 않는다).
 * 방 가로·세로는 정상이어야 한다(roomToDae가 먼저 본다). 방 높이가 잘못되면 벽은 세우지 않고 바닥만 낸다.
 * @param {Room} room
 * @param {number} thick 벽 두께(cm)
 * @returns {Part[]}
 */
function shellParts(room, thick) {
  const { widthCm: width, depthCm: depth, heightCm: height } = room
  /** @type {Part[]} */
  const parts = []
  /**
   * @param {string} name
   * @param {string} color
   * @param {(Box | null)[]} boxes
   */
  const addPart = (name, color, boxes) => {
    /** @type {Box[]} */
    const solid = []
    for (const box of boxes) if (box) solid.push(box)
    if (solid.length > 0) parts.push({ name, color, boxes: solid, xCm: 0, yCm: 0, rotation: 0 })
  }
  /**
   * 평면도 좌표(y가 아래로 커진다)의 상자를 내보내는 좌표로 바꾼다. Y만 뒤집는다.
   * @type {(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number) => Box | null}
   */
  const planBox = (x0, y0, x1, y1, z0, z1) => makeBox(x0, depth - y1, z0, x1, depth - y0, z1)

  // 바닥 판은 벽 밑까지 깔고, 윗면을 높이 0에 맞춘다
  addPart('바닥', hexColor(room.style?.floorColor, FALLBACK_COLORS.floor), [
    planBox(-thick, -thick, width + thick, depth + thick, -FLOOR_THICKNESS_CM, 0),
  ])

  if (!isSize(height)) return parts

  const wallColor = hexColor(room.style?.wallColor, FALLBACK_COLORS.wall)
  const allOpenings = Array.isArray(room.openings) ? room.openings : []
  for (const wall of WALLS) {
    const horizontal = wall === 'top' || wall === 'bottom'
    const length = horizontal ? width : depth
    /**
     * 벽을 따라 s0~s1, 높이 z0~z1인 조각. 벽은 방 안쪽 치수 바깥에 세운다.
     * @type {(s0: number, s1: number, z0: number, z1: number) => Box | null}
     */
    const piece = (s0, s1, z0, z1) => {
      if (wall === 'top') return planBox(s0, -thick, s1, 0, z0, z1)
      if (wall === 'bottom') return planBox(s0, depth, s1, depth + thick, z0, z1)
      if (wall === 'left') return planBox(-thick, s0, 0, s1, z0, z1)
      return planBox(width, s0, width + thick, s1, z0, z1)
    }
    const openings = allOpenings
      .filter(
        (opening) =>
          opening != null &&
          opening.wall === wall &&
          isLength(opening.offsetCm) &&
          isLength(opening.widthCm) &&
          (opening.type === 'door' || isLength(opening.sillHeightCm)),
      )
      .sort((a, b) => a.offsetCm - b.offsetCm)

    /** @type {(Box | null)[]} */
    const pieces = []
    // 위·아래 벽은 모서리까지 덮도록 양쪽으로 벽 두께만큼 늘린다(3D 화면과 같다)
    let cursor = horizontal ? -thick : 0
    const end = horizontal ? length + thick : length
    for (const opening of openings) {
      // 문·창문은 벽 길이 안에서만 비운다. 앞의 문·창문과 겹친 부분은 다시 비우지 않는다
      const s0 = Math.max(cursor, Math.min(length, Math.max(0, opening.offsetCm)))
      const s1 = Math.max(s0, Math.min(length, opening.offsetCm + opening.widthCm))
      if (!(s1 - s0 >= MIN_OPENING_CM)) continue
      pieces.push(piece(cursor, s0, 0, height))
      cursor = s1
      if (opening.type === 'door') {
        pieces.push(piece(s0, s1, Math.min(DOOR_HEIGHT_CM, height - 5), height))
      } else {
        const sill = Math.max(0, Math.min(opening.sillHeightCm, height - 40))
        pieces.push(piece(s0, s1, 0, sill), piece(s0, s1, Math.min(sill + WINDOW_HEIGHT_CM, height - 15), height))
      }
    }
    pieces.push(piece(cursor, end, 0, height))
    addPart(WALL_LABELS[wall], wallColor, pieces)
  }
  return parts
}

/**
 * 가구 하나를 상자 하나로 바꾼다. 숫자가 잘못된 가구는 null(내보내지 않는다).
 * 상자는 바닥 한가운데를 원점으로 회전 0일 때의 크기로 적고, 묶음을 돌려서 놓는다.
 * @param {FurnitureItem} item
 * @param {number} roomDepthCm
 * @returns {Part | null}
 */
function furniturePart(item, roomDepthCm) {
  if (item == null || typeof item !== 'object') return null
  const { widthCm, depthCm, heightCm } = item
  if (![widthCm, depthCm, heightCm, item.xCm, item.yCm].every(isLength)) return null
  const box = makeBox(-widthCm / 2, -depthCm / 2, 0, widthCm / 2, depthCm / 2, heightCm)
  // 회전을 반영한 바닥 차지 영역(geometry.js)의 한가운데에 놓는다
  const body = footprint(item)
  const xCm = body.xCm + body.widthCm / 2
  const yCm = roomDepthCm - (body.yCm + body.depthCm / 2)
  if (!box || !isLength(xCm) || !isLength(yCm)) return null
  // 평면도에서 회전은 반시계 방향으로 커지고(nextRotation), Y를 뒤집어 위에서 본 모양이 같으니 Z축으로 같은 각도만큼 돌린다.
  // 네 방향이 아닌 값은 geometry.js와 같이 회전 0으로 본다
  const rotation = item.rotation === 90 || item.rotation === 180 || item.rotation === 270 ? item.rotation : 0
  return {
    name: partName(item.name, '이름 없는 가구'),
    color: hexColor(item.color, FALLBACK_COLORS.furniture),
    boxes: [box],
    xCm,
    yCm,
    rotation,
  }
}

/**
 * 묶음들을 COLLADA 1.4.1 글로 쓴다.
 * @param {Part[]} parts
 * @returns {string}
 */
function writeDocument(parts) {
  // 색마다 재질 하나. 처음 나온 순서로 번호를 매겨서 같은 방이면 같은 번호가 나온다
  const colors = [...new Set(parts.map((part) => part.color))]
  /** @param {Part} part */
  const materialId = (part) => `mat_${colors.indexOf(part.color) + 1}`

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
    '  <asset>',
    '    <contributor>',
    '      <authoring_tool>방봄</authoring_tool>',
    '    </contributor>',
    '    <unit name="meter" meter="1"/>',
    '    <up_axis>Z_UP</up_axis>',
    '  </asset>',
  ]

  // 빈 library 요소는 COLLADA 규격에 맞지 않아서, 쓸 것이 있을 때만 만든다
  if (parts.length > 0) {
    lines.push('  <library_effects>')
    colors.forEach((color, index) => {
      lines.push(
        `    <effect id="fx_${index + 1}">`,
        '      <profile_COMMON>',
        '        <technique sid="common">',
        '          <lambert>',
        '            <diffuse>',
        `              <color>${colorValues(color)}</color>`,
        '            </diffuse>',
        '          </lambert>',
        '        </technique>',
        '      </profile_COMMON>',
        '    </effect>',
      )
    })
    lines.push('  </library_effects>', '  <library_materials>')
    colors.forEach((color, index) => {
      lines.push(
        `    <material id="mat_${index + 1}" name="색_${color.slice(1)}">`,
        `      <instance_effect url="#fx_${index + 1}"/>`,
        '    </material>',
      )
    })
    lines.push('  </library_materials>', '  <library_geometries>')
    parts.forEach((part, index) => {
      const id = `geo_${index + 1}`
      const vertexCount = part.boxes.length * 8
      const positions = part.boxes.flatMap(boxCorners).map(meters).join(' ')
      const triangles = part.boxes.flatMap((_, box) => BOX_TRIANGLES.map((corner) => corner + box * 8)).join(' ')
      lines.push(
        `    <geometry id="${id}" name="${escapeXml(part.name)}">`,
        '      <mesh>',
        `        <source id="${id}_pos">`,
        `          <float_array id="${id}_pos_arr" count="${vertexCount * 3}">${positions}</float_array>`,
        '          <technique_common>',
        `            <accessor source="#${id}_pos_arr" count="${vertexCount}" stride="3">`,
        '              <param name="X" type="float"/>',
        '              <param name="Y" type="float"/>',
        '              <param name="Z" type="float"/>',
        '            </accessor>',
        '          </technique_common>',
        '        </source>',
        `        <vertices id="${id}_vtx">`,
        `          <input semantic="POSITION" source="#${id}_pos"/>`,
        '        </vertices>',
        // 재질 기호를 재질 id와 같게 둔다. 기호를 id로 바로 읽는 프로그램에서도 색이 맞게 붙는다
        `        <triangles material="${materialId(part)}" count="${part.boxes.length * 12}">`,
        `          <input semantic="VERTEX" source="#${id}_vtx" offset="0"/>`,
        `          <p>${triangles}</p>`,
        '        </triangles>',
        '      </mesh>',
        '    </geometry>',
      )
    })
    lines.push('  </library_geometries>')
  }

  lines.push('  <library_visual_scenes>', '    <visual_scene id="scene" name="방봄">')
  parts.forEach((part, index) => {
    const [cos, sin] = TURN[part.rotation]
    // 4×4 행렬을 가로줄 순서로 적는다: Z축 회전 다음에 (x, y)로 옮기기. 뒤집기(거울)는 넣지 않는다
    const matrix = [cos, 0 - sin, 0, meters(part.xCm), sin, cos, 0, meters(part.yCm), 0, 0, 1, 0, 0, 0, 0, 1].join(' ')
    lines.push(
      `      <node id="node_${index + 1}" name="${escapeXml(part.name)}" type="NODE">`,
      `        <matrix>${matrix}</matrix>`,
      `        <instance_geometry url="#geo_${index + 1}">`,
      '          <bind_material>',
      '            <technique_common>',
      `              <instance_material symbol="${materialId(part)}" target="#${materialId(part)}"/>`,
      '            </technique_common>',
      '          </bind_material>',
      '        </instance_geometry>',
      '      </node>',
    )
  })
  lines.push(
    '    </visual_scene>',
    '  </library_visual_scenes>',
    '  <scene>',
    '    <instance_visual_scene url="#scene"/>',
    '  </scene>',
    '</COLLADA>',
  )
  return `${lines.join('\n')}\n`
}

/**
 * 방 하나를 COLLADA 1.4.1(.dae) 글로 바꾼다. 스케치업의 "가져오기"로 열 수 있다.
 * 노드 순서는 바닥, 위쪽·아래쪽·왼쪽·오른쪽 벽, 그다음 가구(방에 적힌 순서)다.
 * @param {Room} room
 * @param {DaeOptions} [options]
 * @returns {string}
 */
export function roomToDae(room, options = {}) {
  const wanted = options.wallThicknessCm
  const thick = isSize(wanted) ? wanted : DAE_WALL_THICKNESS_CM
  // 방 가로·세로가 잘못되면 벽도 가구 자리도 정할 수 없어서 빈 장면을 낸다
  if (!isSize(room.widthCm) || !isSize(room.depthCm)) return writeDocument([])
  const parts = shellParts(room, thick)
  for (const item of Array.isArray(room.furniture) ? room.furniture : []) {
    const part = furniturePart(item, room.depthCm)
    if (part) parts.push(part)
  }
  return writeDocument(parts)
}

/**
 * 프로젝트에서 방 하나(기본은 지금 보고 있는 방)를 COLLADA 1.4.1(.dae) 글로 바꾼다. 방이 없으면 빈 장면이 나온다.
 * @param {ProjectState} project
 * @param {DaeOptions} [options]
 * @returns {string}
 */
export function projectToDae(project, options = {}) {
  const rooms = Array.isArray(project?.rooms) ? project.rooms : []
  const wantedId = options.roomId ?? project?.activeRoomId
  const room = rooms.find((entry) => entry?.id === wantedId) ?? rooms[0]
  return room ? roomToDae(room, options) : writeDocument([])
}

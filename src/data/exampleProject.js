// 예시 방과 빈 프로젝트 만들기. 값은 SCHEMA.md의 예시를 따른다.

/** @import { ProjectState, Room, RoomStyle, FurnitureItem, Opening } from '../types/schema.ts' */

/** @type {RoomStyle} */
export const DEFAULT_STYLE = {
  id: 'warm_minimal',
  name: '웜 미니멀',
  wallColor: '#F7F5F0',
  floorColor: '#D9C3A3',
  floorMaterial: 'oak_wood',
  accentColor: '#5B7C99',
  description: '따뜻한 우드 바닥과 아이보리 벽면 조합',
}

/**
 * 문 하나와 창문 하나가 있는 기본 개구부. 문은 아래 벽, 창문은 위 벽.
 * @param {number} widthCm 방 가로
 * @returns {Opening[]}
 */
export function defaultOpenings(widthCm) {
  const windowWidth = Math.min(150, Math.max(60, widthCm - 100))
  return [
    { id: 'op_door_1', type: 'door', wall: 'bottom', offsetCm: 20, widthCm: 90, sillHeightCm: 0, swingInward: true },
    {
      id: 'op_win_1',
      type: 'window',
      wall: 'top',
      offsetCm: Math.round((widthCm - windowWidth) / 2),
      widthCm: windowWidth,
      sillHeightCm: 90,
      swingInward: false,
    },
  ]
}

/**
 * 가구가 없는 방.
 * @param {{ widthCm: number, depthCm: number, heightCm?: number, name?: string, id?: string }} size
 * @returns {Room}
 */
export function createRoom(size) {
  return {
    id: size.id ?? 'room_1',
    name: size.name ?? '내 방',
    widthCm: size.widthCm,
    depthCm: size.depthCm,
    heightCm: size.heightCm ?? 240,
    windowDirection: 'south',
    openings: defaultOpenings(size.widthCm),
    style: { ...DEFAULT_STYLE },
    furniture: [],
    activeVariantId: null,
    variants: [],
  }
}

/**
 * @param {Room} room
 * @returns {ProjectState}
 */
function projectWith(room) {
  return {
    version: '2.0.0',
    activeRoomId: room.id,
    profile: { lifestyle: 'single', budgetKrw: 1500000 },
    rooms: [room],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 방 크기만 정한 빈 프로젝트.
 * @param {{ widthCm: number, depthCm: number, heightCm?: number }} size
 * @returns {ProjectState}
 */
export function createEmptyProject(size) {
  return projectWith(createRoom(size))
}

/**
 * 예시 가구 한 줄을 FurnitureItem으로 만든다.
 * @param {Pick<FurnitureItem, 'id' | 'name' | 'category' | 'widthCm' | 'depthCm' | 'heightCm' | 'xCm' | 'yCm' | 'rotation' | 'color' | 'material' | 'clearanceFrontCm' | 'hasSharpCorner'> & { estimatedKrw: number, owned?: boolean }} seed
 * @returns {FurnitureItem}
 */
function exampleItem(seed) {
  const { estimatedKrw, owned, ...rest } = seed
  return {
    ...rest,
    owned: owned ?? false,
    price: { estimatedKrw, manualKrw: null, source: 'estimated' },
    locked: false,
  }
}

/**
 * "1초 예시 체험"용 원룸(가로 300 × 세로 400cm). 문은 아래 벽 왼쪽, 창문은 위 벽.
 * 처음 배치는 겹침·문 막힘이 없는 상태다.
 * @returns {ProjectState}
 */
export function createExampleProject() {
  const room = createRoom({ widthCm: 300, depthCm: 400, name: '내 원룸' })
  room.openings = [
    { id: 'op_door_1', type: 'door', wall: 'bottom', offsetCm: 20, widthCm: 90, sillHeightCm: 0, swingInward: true },
    { id: 'op_win_1', type: 'window', wall: 'top', offsetCm: 80, widthCm: 150, sillHeightCm: 90, swingInward: false },
  ]
  room.furniture = [
    exampleItem({
      id: 'furn_bed_1', name: '슈퍼싱글 수납 침대', category: 'bed',
      widthCm: 115, depthCm: 205, heightCm: 45, xCm: 185, yCm: 0, rotation: 0,
      color: '#E8DFD5', material: 'fabric', clearanceFrontCm: 50, hasSharpCorner: false, estimatedKrw: 350000,
    }),
    exampleItem({
      id: 'furn_desk_1', name: '1200 책상', category: 'desk',
      widthCm: 120, depthCm: 60, heightCm: 72, xCm: 0, yCm: 0, rotation: 0,
      color: '#C9A77C', material: 'wood', clearanceFrontCm: 60, hasSharpCorner: true, estimatedKrw: 120000,
    }),
    exampleItem({
      id: 'furn_chair_1', name: '책상 의자', category: 'chair',
      widthCm: 50, depthCm: 50, heightCm: 85, xCm: 35, yCm: 62, rotation: 180,
      color: '#6E7B85', material: 'fabric', clearanceFrontCm: 0, hasSharpCorner: false, estimatedKrw: 80000, owned: true,
    }),
    exampleItem({
      id: 'furn_wardrobe_1', name: '800 옷장', category: 'wardrobe',
      widthCm: 80, depthCm: 60, heightCm: 200, xCm: 240, yCm: 260, rotation: 270,
      color: '#F2EFE9', material: 'white_matte', clearanceFrontCm: 50, hasSharpCorner: false, estimatedKrw: 180000,
    }),
    exampleItem({
      id: 'furn_bookshelf_1', name: '800 책장', category: 'bookshelf',
      widthCm: 80, depthCm: 30, heightCm: 180, xCm: 0, yCm: 150, rotation: 90,
      color: '#C9A77C', material: 'wood', clearanceFrontCm: 40, hasSharpCorner: false, estimatedKrw: 90000,
    }),
  ]
  return projectWith(room)
}

// SCHEMA.md를 코드로 옮긴 타입 정의. 필드 이름과 값은 SCHEMA.md와 같아야 한다.
// 길이는 cm, 각도는 도(0·90·180·270), 금액은 원(KRW).
// 좌표·회전 약속은 docs/ARCHITECTURE.md 2장을 따른다.

export type Lifestyle = 'single' | 'couple' | 'family_child' | 'wfh' | 'pet'
export type WindowDirection = 'south' | 'east' | 'west' | 'north'
export type OpeningType = 'door' | 'window'
export type Wall = 'top' | 'bottom' | 'left' | 'right'
export type FloorMaterial = 'oak_wood' | 'walnut_wood' | 'tile_gray' | 'linoleum_light'
export type FurnitureCategory =
  | 'bed'
  | 'desk'
  | 'chair'
  | 'wardrobe'
  | 'bookshelf'
  | 'drawer'
  | 'sofa'
  | 'table'
  | 'tv_stand'
  | 'mat'
  | 'other'
export type Rotation = 0 | 90 | 180 | 270
export type FurnitureMaterial = 'wood' | 'fabric' | 'metal' | 'white_matte' | 'glass'
export type PriceSource = 'manual' | 'catalog' | 'estimated'
export type ThemeKey = 'open_space' | 'zone_split' | 'window_desk' | 'max_storage' | 'compact'
export type ErrorCode =
  | 'OVERLAP'
  | 'OUT_OF_BOUNDS'
  | 'DOOR_BLOCKED'
  | 'NO_ACCESS'
  | 'CLEARANCE_BLOCKED'
  | 'WINDOW_BLOCKED'
export type TipCode =
  | 'DOOR_BED_SIGHTLINE'
  | 'BED_UNDER_WINDOW'
  | 'BED_DESK_ADJACENT'
  | 'DEAD_SPACE_GAP'
  | 'NARROW_PASSAGE'
  | 'CHILD_TIP_RISK'
  | 'CHILD_WINDOW_CLIMB'
  | 'CHILD_SHARP_CORNER'
export type TipCategory = 'interior' | 'child_safety'
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night'

// ── 1. 최상위 프로젝트 상태 ─────────────────────────────────────────────
export interface Profile {
  lifestyle: Lifestyle
  budgetKrw: number
}

export interface ProjectState {
  version: '2.0.0'
  activeRoomId: string
  profile: Profile
  rooms: Room[]
  updatedAt: string
}

// ── 2. 방 ───────────────────────────────────────────────────────────────
export interface Opening {
  id: string
  type: OpeningType
  wall: Wall
  /** 벽의 왼쪽(위·아래 벽) 또는 위쪽(왼·오른쪽 벽) 끝에서 잰 거리 */
  offsetCm: number
  widthCm: number
  /** 창문 아래 높이. 문은 0, 창문 기본 90 */
  sillHeightCm: number
  swingInward: boolean
}

export interface RoomStyle {
  id: string
  name: string
  wallColor: string
  floorColor: string
  floorMaterial: FloorMaterial
  accentColor: string
  description: string
}

export interface Room {
  id: string
  name: string
  widthCm: number
  depthCm: number
  heightCm: number
  windowDirection: WindowDirection
  openings: Opening[]
  style: RoomStyle
  furniture: FurnitureItem[]
  /** 사용자가 손으로 고친 뒤에는 null */
  activeVariantId: string | null
  variants: LayoutVariant[]
}

// ── 3. 가구 ─────────────────────────────────────────────────────────────
export interface FurniturePrice {
  estimatedKrw: number
  /** 사용자가 직접 넣은 값. 있으면 가장 먼저 쓴다 */
  manualKrw: number | null
  source: PriceSource
}

export interface FurnitureItem {
  id: string
  name: string
  category: FurnitureCategory
  /** 회전 0일 때의 가로(x 방향) */
  widthCm: number
  /** 회전 0일 때의 깊이(y 방향) */
  depthCm: number
  heightCm: number
  /** 회전을 반영한 바닥 차지 영역의 왼쪽 위 x */
  xCm: number
  /** 회전을 반영한 바닥 차지 영역의 왼쪽 위 y */
  yCm: number
  rotation: Rotation
  color: string
  material: FurnitureMaterial
  /** true면 "이미 있어요" (예산 합계에서 뺀다) */
  owned: boolean
  clearanceFrontCm: number
  hasSharpCorner: boolean
  price: FurniturePrice
  /** 사용자가 손으로 옮긴 가구 보호 표시 */
  locked: boolean
}

// ── 4. 테마 배치안 ──────────────────────────────────────────────────────
export interface Placement {
  furnitureId: string
  xCm: number
  yCm: number
  rotation: Rotation
}

export interface LayoutVariant {
  id: string
  themeKey: ThemeKey
  title: string
  summary: string
  placements: Placement[]
  unplacedIds: string[]
}

// ── 5. 3단계 피드백 (점수 필드는 없다) ──────────────────────────────────
export interface ValidationError {
  code: ErrorCode
  severity: 'error'
  furnitureIds: string[]
  title: string
  message: string
}

export interface ValidationTip {
  code: TipCode
  severity: 'tip'
  category: TipCategory
  furnitureIds: string[]
  title: string
  message: string
  isReferenceValue: boolean
}

export interface MatZone {
  xCm: number
  yCm: number
  widthCm: number
  depthCm: number
}

export interface ValidationResult {
  errors: ValidationError[]
  tips: ValidationTip[]
  strengths: string[]
  /** 영유아 가족 모드에서만 채운다. 없으면 null */
  matZone: MatZone | null
}

// ── 6. /api 입출력 ──────────────────────────────────────────────────────
export interface AdviceRequest {
  room: Room
  validationResult: ValidationResult
  lifestyle: Lifestyle
}
export interface AdviceResponse {
  summary: string
  highlights: string[]
  improvements: string[]
  isFallback: boolean
}

export interface FurnitureRequest {
  text?: string
  imageBase64?: string
  url?: string
}
export interface FurnitureResponse {
  items: Partial<FurnitureItem>[]
  note: string
  isFallback: boolean
}

/** SCHEMA.md 6장에 빠져 있어 보충한 규약 (docs/DECISIONS.md 참고) */
export interface StyleRequest {
  text: string
}
export interface StyleResponse {
  style: RoomStyle
  note: string
  isFallback: boolean
}

export interface FloorplanRequest {
  imageBase64: string
  areaPyeong?: number
}
export interface FloorplanResponse {
  widthCm: number
  depthCm: number
  openings: Opening[]
  note: string
  isFallback: boolean
}

export interface RenderPhotoRequest {
  snapshotBase64: string
  styleName: string
  timeOfDay: TimeOfDay
}
export interface RenderPhotoResponse {
  imageUrlOrBase64: string
  disclaimer: string
  isFallback: boolean
}

// ── 보충: 계산과 화면에서 함께 쓰는 작은 타입 (SCHEMA 필드는 아니다) ────
/** 축에 나란한 직사각형. (xCm, yCm)은 왼쪽 위 */
export interface Rect {
  xCm: number
  yCm: number
  widthCm: number
  depthCm: number
}

/** 기본 가구 카탈로그 한 줄 */
export interface CatalogItem {
  key: string
  name: string
  category: FurnitureCategory
  widthCm: number
  depthCm: number
  heightCm: number
  color: string
  material: FurnitureMaterial
  clearanceFrontCm: number
  hasSharpCorner: boolean
  /** 시연용 예상 가격 */
  estimatedKrw: number
  /** 자연어 입력에서 이 가구를 찾을 때 쓰는 낱말 */
  keywords: string[]
}

export interface CostSummary {
  /** 살 가구의 합계 (보유 가구 제외) */
  totalKrw: number
  /** 보유 가구라서 뺀 금액 */
  ownedExcludedKrw: number
  buyCount: number
  ownedCount: number
  budgetKrw: number
  remainingKrw: number
  overBudget: boolean
}

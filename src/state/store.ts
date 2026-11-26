// 앱 상태 한곳 관리: 프로젝트 자료, 선택, 실행취소·다시실행(50단계), 자동 저장.
// 화면은 useAppState()로 읽고 actions로만 바꾼다. 계산은 src/engine 의 함수에 맡긴다.
import { useSyncExternalStore } from 'react'
import { createEmptyProject, createExampleProject } from '../data/exampleProject.js'
import { clampToRoom, footprint, nextRotation, rotateInPlace } from '../engine/geometry.js'
import { applyPlacements, generateVariants, placeNewFurniture } from '../engine/layout.js'
import { validateRoom } from '../engine/validator.js'
import { loadJson, removeJson, saveJson } from '../lib/storage.ts'
import type {
  FurnitureItem,
  LayoutVariant,
  Lifestyle,
  Opening,
  OpeningType,
  ProjectState,
  Rect,
  Room,
  RoomStyle,
  ValidationResult,
  WindowDirection,
} from '../types/schema.ts'

export type CategoryKey = 'room' | 'style' | 'furniture' | 'layout' | 'cost' | 'report'
export type ViewMode = '2d' | '3d'
/** 3D에서 방 안에 서서 보는 눈높이. off는 밖에서 둘러보기, child는 아이 눈높이 90cm, adult는 어른 눈높이 160cm */
export type EyeMode = 'off' | 'child' | 'adult'

export interface AppState {
  project: ProjectState
  /** 시작 화면을 지났는지 */
  started: boolean
  selectedId: string | null
  activeCategory: CategoryKey
  viewMode: ViewMode
  eyeMode: EyeMode
  /** 지금 방의 3단계 피드백. project가 바뀔 때마다 다시 계산한다 */
  validation: ValidationResult
  canUndo: boolean
  canRedo: boolean
  hasClipboard: boolean
}

/** 새 가구를 만들 때 넘기는 값. 빠진 값은 기본값으로 채운다 */
export type FurnitureSeed = Pick<FurnitureItem, 'name' | 'category' | 'widthCm' | 'depthCm' | 'heightCm'> &
  Partial<Pick<FurnitureItem, 'color' | 'material' | 'clearanceFrontCm' | 'hasSharpCorner' | 'owned'>> & {
    estimatedKrw?: number
    priceSource?: 'catalog' | 'estimated'
  }

const HISTORY_LIMIT = 50
/**
 * 주소에 ?slot=이름이 있으면 그 이름으로 따로 저장한다.
 * 방봄 "집 보기"에서 단지·방마다 꾸민 배치를 따로 기억하기 위해서다.
 */
function storageKeyFromUrl(): string {
  try {
    const slot = new URLSearchParams(window.location.search).get('slot') ?? ''
    return /^[a-z0-9_-]{1,40}$/i.test(slot) ? `project.${slot}` : 'project'
  } catch {
    return 'project'
  }
}
const STORAGE_KEY = storageKeyFromUrl()
const MIN_SIZE_CM = 20
const DEFAULT_ROOM = { widthCm: 300, depthCm: 400 }

let past: ProjectState[] = []
let future: ProjectState[] = []
/** 끌기 같은 연속 동작이 시작될 때의 상태. 동작 하나가 실행취소 한 단계가 되게 한다 */
let gestureStart: ProjectState | null = null
let clipboard: FurnitureItem | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined
/** 아직 저장하지 않은 변경이 있는지 (저장을 기다리는 중인지) */
let savePending = false
let variantTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

export function activeRoomOf(project: ProjectState): Room {
  return project.rooms.find((room) => room.id === project.activeRoomId) ?? project.rooms[0]
}

function validate(project: ProjectState): ValidationResult {
  return validateRoom(activeRoomOf(project), { lifestyle: project.profile.lifestyle })
}

/** 저장돼 있던 자료가 쓸 수 있는 모양인지 본다. 깨졌으면 새로 시작한다 */
function isUsableProject(value: unknown): value is ProjectState {
  if (typeof value !== 'object' || value === null) return false
  const project = value as Partial<ProjectState>
  return (
    project.version === '2.0.0' &&
    typeof project.activeRoomId === 'string' &&
    typeof project.profile?.lifestyle === 'string' &&
    typeof project.profile?.budgetKrw === 'number' &&
    Array.isArray(project.rooms) &&
    project.rooms.length > 0 &&
    project.rooms.every(
      (room) =>
        typeof room?.widthCm === 'number' &&
        typeof room?.depthCm === 'number' &&
        Array.isArray(room?.furniture) &&
        Array.isArray(room?.openings) &&
        Array.isArray(room?.variants) &&
        typeof room?.style?.wallColor === 'string',
    )
  )
}

function makeState(project: ProjectState, started: boolean): AppState {
  return {
    project,
    started,
    selectedId: null,
    activeCategory: 'room',
    viewMode: '2d',
    eyeMode: 'off',
    validation: validate(project),
    canUndo: false,
    canRedo: false,
    hasClipboard: false,
  }
}

function initialState(): AppState {
  const saved = loadJson<unknown>(STORAGE_KEY)
  if (isUsableProject(saved)) {
    try {
      return makeState(saved, true)
    } catch {
      removeJson(STORAGE_KEY)
    }
  }
  return makeState(createEmptyProject(DEFAULT_ROOM), false)
}

let state: AppState = initialState()

function set(patch: Partial<AppState>): void {
  state = {
    ...state,
    ...patch,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    hasClipboard: clipboard !== null,
  }
  for (const listener of listeners) listener()
}

function scheduleSave(): void {
  clearTimeout(saveTimer)
  savePending = true
  saveTimer = setTimeout(() => {
    savePending = false
    saveJson(STORAGE_KEY, state.project)
  }, 400)
}

// 화면을 떠날 때, 기다리던 저장이 있으면 바로 한다. 방봄 "집 보기"에서 방을 바꾸면 이 화면이 바로 닫히기 때문이다.
// 기다리던 저장이 없으면 아무것도 쓰지 않는다 (오래 열어 둔 화면이 닫히면서 새 내용을 옛 내용으로 덮지 않게).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!savePending) return
    clearTimeout(saveTimer)
    savePending = false
    if (state.started) saveJson(STORAGE_KEY, state.project)
  })
}

/** 프로젝트를 바꾸고 실행취소 기록에 남긴다. 끌기 중에는 기록하지 않고 endGesture에서 한 번만 남긴다 */
function commit(project: ProjectState, extra: Partial<AppState> = {}): void {
  const next: ProjectState = { ...project, updatedAt: new Date().toISOString() }
  if (gestureStart === null) {
    past = [...past, state.project].slice(-HISTORY_LIMIT)
    future = []
  }
  set({ ...extra, project: next, validation: validate(next) })
  scheduleSave()
}

function withRoom(project: ProjectState, change: (room: Room) => Room): ProjectState {
  const current = activeRoomOf(project)
  return { ...project, rooms: project.rooms.map((room) => (room === current ? change(room) : room)) }
}

function withItem(room: Room, id: string, change: (item: FurnitureItem, room: Room) => FurnitureItem): Room {
  return { ...room, furniture: room.furniture.map((item) => (item.id === id ? change(item, room) : item)) }
}

/** 손으로 고친 가구: 방 안으로 맞추고, 손댄 표시를 남긴다 */
function placedByHand(item: FurnitureItem, room: Room): FurnitureItem {
  return { ...item, ...clampToRoom(footprint(item), room), locked: true }
}

function changeItemByHand(id: string, change: (item: FurnitureItem, room: Room) => FurnitureItem): void {
  const next = withRoom(state.project, (room) => ({
    ...withItem(room, id, (item, r) => placedByHand(change(item, r), r)),
    activeVariantId: null,
  }))
  commit(next)
}

function newId(prefix: string, taken: string[]): string {
  const used = new Set(taken)
  let n = 1
  while (used.has(`${prefix}_${n}`)) n += 1
  return `${prefix}_${n}`
}

function safeVariants(room: Room, lifestyle: Lifestyle): LayoutVariant[] {
  try {
    // 배치안은 "전체를 다시 놓는 안"이라 손으로 옮긴 표시(locked)를 무시한다. 무시하지 않으면 다 같은 안만 나온다.
    const unlocked = room.furniture.map((item) => (item.locked ? { ...item, locked: false } : item))
    return generateVariants({ ...room, furniture: unlocked }, { lifestyle })
  } catch (error) {
    console.error('배치안을 만들지 못했어요', error)
    return []
  }
}

/** 가구 구성이 바뀌면 배치안 미리보기를 조용히 다시 만든다. 지금 배치는 건드리지 않는다 */
function scheduleVariants(): void {
  clearTimeout(variantTimer)
  variantTimer = setTimeout(() => {
    const room = activeRoomOf(state.project)
    const variants = room.furniture.length > 0 ? safeVariants(room, state.project.profile.lifestyle) : []
    const project = withRoom(state.project, (r) => ({
      ...r,
      variants,
      activeVariantId: variants.some((variant) => variant.id === r.activeVariantId) ? r.activeVariantId : null,
    }))
    set({ project })
    scheduleSave()
  }, 250)
}

function startWith(project: ProjectState): void {
  past = []
  future = []
  gestureStart = null
  set({ ...makeState(project, true), activeCategory: state.activeCategory, viewMode: state.viewMode })
  scheduleSave()
}

function addItem(room: Room, base: FurnitureItem): { item: FurnitureItem; placed: boolean } {
  const spot = placeNewFurniture(room, base)
  if (spot) return { item: { ...base, ...spot }, placed: true }
  const centered = {
    ...base,
    xCm: Math.round((room.widthCm - base.widthCm) / 2),
    yCm: Math.round((room.depthCm - base.depthCm) / 2),
  }
  return { item: { ...centered, ...clampToRoom(footprint(centered), room) }, placed: false }
}

export const actions = {
  // ── 시작과 초기화 ──
  /** [1초 예시 체험] */
  startWithExample(): void {
    const project = createExampleProject()
    const room = activeRoomOf(project)
    const variants = safeVariants(room, project.profile.lifestyle)
    startWith(withRoom(project, (r) => ({ ...r, variants })))
  },
  /** [방 크기 설정]으로 시작 */
  startEmpty(size: { widthCm: number; depthCm: number; heightCm?: number }): void {
    startWith(createEmptyProject(size))
  },
  /** 방봄 "집 보기"에서 넘겨받은 방(크기·이름·문·창문)과 먼저 놓아 둘 가구로 시작 */
  startWithRoom(spec: {
    widthCm: number
    depthCm: number
    name?: string
    openings?: Omit<Opening, 'id'>[]
    seeds?: FurnitureSeed[]
  }): void {
    const project = createEmptyProject({ widthCm: spec.widthCm, depthCm: spec.depthCm })
    startWith(
      withRoom(project, (room) => ({
        ...room,
        name: spec.name ?? room.name,
        openings: spec.openings
          ? spec.openings.map((opening, index) => ({
              ...opening,
              id: `${opening.type === 'door' ? 'op_door' : 'op_win'}_${index + 1}`,
            }))
          : room.openings,
      })),
    )
    for (const seed of spec.seeds ?? []) actions.addFurniture(seed)
    // 처음 놓아 둔 가구는 실행취소로 사라지지 않게 한다
    past = []
    future = []
    set({ selectedId: null })
  },
  /** [처음부터] */
  resetAll(): void {
    clearTimeout(saveTimer)
    savePending = false
    clearTimeout(variantTimer)
    removeJson(STORAGE_KEY)
    past = []
    future = []
    gestureStart = null
    clipboard = null
    set(makeState(createEmptyProject(DEFAULT_ROOM), false))
  },

  // ── 화면 상태 (실행취소 대상이 아니다) ──
  setCategory(activeCategory: CategoryKey): void {
    set({ activeCategory })
  },
  setViewMode(viewMode: ViewMode): void {
    set({ viewMode })
  },
  /** 눈높이 보기를 켜면 3D로 바꾼다 (실행취소 대상이 아니다) */
  setEyeMode(eyeMode: EyeMode): void {
    set(eyeMode === 'off' ? { eyeMode } : { eyeMode, viewMode: '3d' })
  },
  select(selectedId: string | null): void {
    if (selectedId !== state.selectedId) set({ selectedId })
  },

  // ── 방 ──
  setRoomSize(size: { widthCm?: number; depthCm?: number; heightCm?: number }): void {
    commit(
      withRoom(state.project, (room) => {
        const resized = { ...room, ...size }
        return {
          ...resized,
          furniture: room.furniture.map((item) => ({ ...item, ...clampToRoom(footprint(item), resized) })),
        }
      }),
    )
    scheduleVariants()
  },
  setRoomName(name: string): void {
    commit(withRoom(state.project, (room) => ({ ...room, name })))
  },
  setWindowDirection(windowDirection: WindowDirection): void {
    commit(withRoom(state.project, (room) => ({ ...room, windowDirection })))
  },
  addOpening(type: OpeningType): void {
    commit(
      withRoom(state.project, (room) => {
        const opening: Opening = {
          id: newId(type === 'door' ? 'op_door' : 'op_win', room.openings.map((o) => o.id)),
          type,
          wall: type === 'door' ? 'bottom' : 'top',
          offsetCm: 20,
          widthCm: type === 'door' ? 90 : 120,
          sillHeightCm: type === 'door' ? 0 : 90,
          swingInward: type === 'door',
        }
        return { ...room, openings: [...room.openings, opening] }
      }),
    )
    scheduleVariants()
  },
  updateOpening(id: string, patch: Partial<Omit<Opening, 'id'>>): void {
    commit(
      withRoom(state.project, (room) => ({
        ...room,
        openings: room.openings.map((opening) => (opening.id === id ? { ...opening, ...patch } : opening)),
      })),
    )
    scheduleVariants()
  },
  removeOpening(id: string): void {
    commit(
      withRoom(state.project, (room) => ({ ...room, openings: room.openings.filter((opening) => opening.id !== id) })),
    )
    scheduleVariants()
  },
  setStyle(style: RoomStyle): void {
    commit(withRoom(state.project, (room) => ({ ...room, style })))
  },
  setLifestyle(lifestyle: Lifestyle): void {
    commit({ ...state.project, profile: { ...state.project.profile, lifestyle } })
    scheduleVariants()
  },
  setBudget(budgetKrw: number): void {
    commit({ ...state.project, profile: { ...state.project.profile, budgetKrw: Math.max(0, Math.round(budgetKrw)) } })
  },

  // ── 가구 ──
  /** 가구 추가. 이미 놓인 가구는 그대로 두고 빈 자리에만 놓는다. 자리가 없으면 placed가 false */
  addFurniture(seed: FurnitureSeed): { id: string; placed: boolean } {
    const room = activeRoomOf(state.project)
    const base: FurnitureItem = {
      id: newId(`furn_${seed.category}`, room.furniture.map((item) => item.id)),
      name: seed.name,
      category: seed.category,
      widthCm: Math.max(MIN_SIZE_CM, Math.round(seed.widthCm)),
      depthCm: Math.max(MIN_SIZE_CM, Math.round(seed.depthCm)),
      heightCm: Math.max(1, Math.round(seed.heightCm)),
      xCm: 0,
      yCm: 0,
      rotation: 0,
      color: seed.color ?? '#D8D2C8',
      material: seed.material ?? 'wood',
      owned: seed.owned ?? false,
      clearanceFrontCm: seed.clearanceFrontCm ?? 0,
      hasSharpCorner: seed.hasSharpCorner ?? false,
      price: {
        estimatedKrw: Math.max(0, Math.round(seed.estimatedKrw ?? 0)),
        manualKrw: null,
        source: seed.priceSource ?? 'estimated',
      },
      locked: false,
    }
    const { item, placed } = addItem(room, base)
    commit(
      withRoom(state.project, (r) => ({ ...r, furniture: [...r.furniture, item] })),
      { selectedId: item.id },
    )
    scheduleVariants()
    return { id: item.id, placed }
  },
  /** 이름·색·재질 같은 값 고치기. 위치와 크기는 아래 전용 동작을 쓴다 */
  updateFurniture(
    id: string,
    patch: Partial<Pick<FurnitureItem, 'name' | 'color' | 'material' | 'heightCm' | 'clearanceFrontCm' | 'hasSharpCorner' | 'category'>>,
  ): void {
    commit(withRoom(state.project, (room) => withItem(room, id, (item) => ({ ...item, ...patch }))))
  },
  /** 왼쪽 위 좌표로 옮기기 (끌기) */
  moveFurniture(id: string, xCm: number, yCm: number): void {
    changeItemByHand(id, (item) => ({ ...item, xCm: Math.round(xCm), yCm: Math.round(yCm) }))
  },
  /** 방향키 이동 */
  nudgeFurniture(id: string, dxCm: number, dyCm: number): void {
    changeItemByHand(id, (item) => ({ ...item, xCm: item.xCm + dxCm, yCm: item.yCm + dyCm }))
  },
  /** 90도 회전 (가운데를 그대로 둔다) */
  rotateFurniture(id: string): void {
    changeItemByHand(id, (item) => ({ ...item, ...rotateInPlace(item, nextRotation(item.rotation)) }))
  },
  /** 바닥 차지 영역(회전 반영)을 새 직사각형으로 바꾼다. 리사이즈 손잡이와 치수 입력이 쓴다 */
  resizeFurniture(id: string, rect: Rect): void {
    changeItemByHand(id, (item, room) => {
      const widthCm = Math.min(room.widthCm, Math.max(MIN_SIZE_CM, Math.round(rect.widthCm)))
      const depthCm = Math.min(room.depthCm, Math.max(MIN_SIZE_CM, Math.round(rect.depthCm)))
      const turned = item.rotation === 90 || item.rotation === 270
      return {
        ...item,
        xCm: Math.round(rect.xCm),
        yCm: Math.round(rect.yCm),
        widthCm: turned ? depthCm : widthCm,
        depthCm: turned ? widthCm : depthCm,
      }
    })
    if (gestureStart === null) scheduleVariants()
  },
  removeFurniture(id: string): void {
    commit(
      withRoom(state.project, (room) => ({ ...room, furniture: room.furniture.filter((item) => item.id !== id) })),
      { selectedId: state.selectedId === id ? null : state.selectedId },
    )
    scheduleVariants()
  },
  /** Ctrl+C */
  copySelected(): void {
    const item = activeRoomOf(state.project).furniture.find((entry) => entry.id === state.selectedId)
    if (!item) return
    clipboard = item
    set({})
  },
  /** Ctrl+V: 복사해 둔 가구를 빈 자리에 하나 더 놓는다 */
  pasteClipboard(): { id: string; placed: boolean } | null {
    if (!clipboard) return null
    const room = activeRoomOf(state.project)
    const base: FurnitureItem = {
      ...clipboard,
      id: newId(`furn_${clipboard.category}`, room.furniture.map((item) => item.id)),
      price: { ...clipboard.price },
      locked: false,
    }
    const { item, placed } = addItem(room, base)
    commit(
      withRoom(state.project, (r) => ({ ...r, furniture: [...r.furniture, item] })),
      { selectedId: item.id },
    )
    scheduleVariants()
    return { id: item.id, placed }
  },
  /** [이미 있어요] */
  toggleOwned(id: string): void {
    commit(withRoom(state.project, (room) => withItem(room, id, (item) => ({ ...item, owned: !item.owned }))))
  },
  /** 가격 직접 입력. null이면 직접 입력을 지우고 예상 가격으로 돌아간다 */
  setManualPrice(id: string, krw: number | null): void {
    commit(
      withRoom(state.project, (room) =>
        withItem(room, id, (item) => ({
          ...item,
          price:
            krw === null
              ? { ...item.price, manualKrw: null, source: 'estimated' }
              : { ...item.price, manualKrw: Math.max(0, Math.round(krw)), source: 'manual' },
        })),
      ),
    )
  },

  // ── 배치안 ──
  /** [전체 다시 추천]: 배치안을 새로 만들고 첫 번째 안을 적용한다 */
  regenerateVariants(): void {
    clearTimeout(variantTimer)
    const room = activeRoomOf(state.project)
    const variants = safeVariants(room, state.project.profile.lifestyle)
    const first = variants[0]
    commit(
      withRoom(state.project, (r) => ({
        ...r,
        variants,
        activeVariantId: first ? first.id : null,
        furniture: first
          ? applyPlacements(r.furniture, first.placements).map((item) => ({ ...item, locked: false }))
          : r.furniture,
      })),
    )
  },
  /** 배치안 하나를 골라 적용한다 */
  applyVariant(variantId: string): void {
    const variant = activeRoomOf(state.project).variants.find((entry) => entry.id === variantId)
    if (!variant) return
    commit(
      withRoom(state.project, (room) => ({
        ...room,
        activeVariantId: variant.id,
        furniture: applyPlacements(room.furniture, variant.placements).map((item) => ({ ...item, locked: false })),
      })),
    )
  },

  // ── 연속 동작과 실행취소 ──
  /** 끌기·리사이즈를 시작할 때 부른다 */
  beginGesture(): void {
    if (gestureStart === null) gestureStart = state.project
  },
  /** 끌기·리사이즈가 끝나면 부른다. 동작 전체가 실행취소 한 단계가 된다 */
  endGesture(): void {
    const start = gestureStart
    gestureStart = null
    if (start === null || start === state.project) return
    past = [...past, start].slice(-HISTORY_LIMIT)
    future = []
    set({})
    scheduleVariants()
  },
  undo(): void {
    const previous = past[past.length - 1]
    if (!previous) return
    past = past.slice(0, -1)
    future = [state.project, ...future].slice(0, HISTORY_LIMIT)
    gestureStart = null
    restore(previous)
  },
  redo(): void {
    const next = future[0]
    if (!next) return
    future = future.slice(1)
    past = [...past, state.project].slice(-HISTORY_LIMIT)
    gestureStart = null
    restore(next)
  },
}

function restore(project: ProjectState): void {
  const stillThere = activeRoomOf(project).furniture.some((item) => item.id === state.selectedId)
  set({ project, validation: validate(project), selectedId: stillThere ? state.selectedId : null })
  scheduleSave()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 화면 밖(이벤트 처리 등)에서 지금 상태를 읽을 때 */
export function getState(): AppState {
  return state
}

/**
 * 상태의 한 부분을 읽는다. selector는 상태 안의 값을 그대로 돌려줘야 한다
 * (매번 새 객체·배열을 만들어 돌려주면 화면이 끝없이 다시 그려진다).
 */
export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

/** 지금 편집 중인 방 */
export function useActiveRoom(): Room {
  return useAppState((current) => activeRoomOf(current.project))
}

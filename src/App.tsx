// 앱의 가장 바깥. 시작 전이면 시작 화면, 시작했으면 편집 화면을 보여 준다.
import { useLayoutEffect } from 'react'
import AppShell from './components/AppShell.tsx'
import StartScreen from './components/StartScreen.tsx'
import { CATEGORIES } from './components/categories.ts'
import { CATALOG } from './data/catalog.js'
import { actions, getState, useAppState, type FurnitureSeed } from './state/store.ts'
import type { Opening } from './types/schema.ts'

/** 주소 뒤 옵션은 처음 한 번만 적용한다 (개발 모드에서 두 번 실행되는 것을 막는다) */
let urlOptionsApplied = false

/** 방봄 "집 보기"에서 방 종류마다 먼저 놓아 두는 가구 (카탈로그 key) */
const ROOM_PRESETS: Record<string, string[]> = {
  living: ['sofa_2', 'tv_stand', 'table_dining'],
  master: ['bed_queen', 'wardrobe_1200', 'nightstand'],
  bed: ['bed_super_single', 'desk_1200', 'chair_desk', 'wardrobe_800'],
}

const WALLS = ['top', 'bottom', 'left', 'right'] as const

function presetSeeds(kind: string | null): FurnitureSeed[] {
  // 주소에서 온 값이라, 정해 둔 이름일 때만 쓴다 (constructor 같은 값은 버린다)
  const keys = kind !== null && Object.prototype.hasOwnProperty.call(ROOM_PRESETS, kind) ? ROOM_PRESETS[kind] : []
  return keys.flatMap((key) => {
    const item = CATALOG.find((entry) => entry.key === key)
    if (!item) return []
    const { name, category, widthCm, depthCm, heightCm, color, material, clearanceFrontCm, hasSharpCorner, estimatedKrw } = item
    return [
      { name, category, widthCm, depthCm, heightCm, color, material, clearanceFrontCm, hasSharpCorner, estimatedKrw, priceSource: 'catalog' as const },
    ]
  })
}

/** "door:left:183:90,window:bottom:60:280" → 문·창문 목록. 벽 길이를 넘지 않게 맞춘다 */
function parseOpenings(text: string | null, widthCm: number, depthCm: number): Omit<Opening, 'id'>[] | undefined {
  if (!text) return undefined
  const openings: Omit<Opening, 'id'>[] = []
  for (const part of text.split(',').slice(0, 8)) {
    const [type, wallText, offsetText, widthText] = part.split(':')
    const wall = WALLS.find((name) => name === wallText)
    if ((type !== 'door' && type !== 'window') || !wall) continue
    const wallLength = wall === 'top' || wall === 'bottom' ? widthCm : depthCm
    const width = Math.min(Math.max(Math.round(Number(widthText)), 40), wallLength)
    const offset = Math.min(Math.max(Math.round(Number(offsetText)), 0), wallLength - width)
    if (!Number.isFinite(width) || !Number.isFinite(offset)) continue
    openings.push({
      type,
      wall,
      offsetCm: offset,
      widthCm: width,
      sillHeightCm: type === 'door' ? 0 : 90,
      swingInward: type === 'door',
    })
  }
  return openings
}

/**
 * 방봄 "집 보기"가 주소로 넘겨준 방(?w=400&d=500&name=...&kind=living|master|bed&op=door:left:183:90,...)으로 시작한다.
 * 이미 시작했거나(그 방을 전에 꾸며서 저장된 것이 있을 때 포함) 주소에 방이 없으면 아무것도 하지 않는다.
 */
function startRoomFromUrl(): void {
  if (getState().started) return
  const params = new URLSearchParams(window.location.search)
  const widthCm = Math.round(Number(params.get('w')))
  const depthCm = Math.round(Number(params.get('d')))
  const sizeOk = (value: number) => Number.isFinite(value) && value >= 150 && value <= 2000
  if (!sizeOk(widthCm) || !sizeOk(depthCm)) return
  actions.startWithRoom({
    widthCm,
    depthCm,
    name: params.get('name')?.trim().slice(0, 40) || undefined,
    openings: parseOpenings(params.get('op'), widthCm, depthCm),
    seeds: presetSeeds(params.get('kind')),
  })
}

/**
 * 주소 옵션.
 * ?example=1 예시 방으로 바로 시작, ?view=3d 3D 보기, ?tab=room|style|furniture|layout|cost|report 해당 메뉴 열기
 * ?eye=child|adult 3D에서 방 안에 서서 보는 눈높이 보기(아이 90cm·어른 160cm)로 바로 열기 (3D로 바뀐다)
 * ?slot=c01-liv 저장 칸 이름 (store.ts), 방봄이 넘겨주는 방은 startRoomFromUrl 참고
 */
function applyUrlOptions(): void {
  if (urlOptionsApplied) return
  urlOptionsApplied = true
  const params = new URLSearchParams(window.location.search)
  startRoomFromUrl()
  if (params.get('example') === '1') actions.startWithExample()
  const view = params.get('view')
  if (view === '3d' || view === '2d') actions.setViewMode(view)
  // 방을 시작한 뒤에 켠다 (시작하면서 보기 상태가 처음 값으로 돌아가기 때문이다)
  const eye = params.get('eye')
  if (eye === 'child' || eye === 'adult') actions.setEyeMode(eye)
  const tab = params.get('tab')
  const category = CATEGORIES.find((entry) => entry.key === tab)
  if (category) actions.setCategory(category.key)
}

export default function App() {
  const started = useAppState((state) => state.started)

  // 첫 화면이 그려지기 전에 적용해서 시작 화면이 잠깐 비치지 않게 한다
  useLayoutEffect(() => {
    applyUrlOptions()
  }, [])

  // 방봄 "집 보기"에서 열린 화면은 [처음부터]를 눌러도 시작 화면으로 가지 않고 그 방의 처음 상태로 돌아간다.
  // (시작 화면에서 다른 방을 만들면 단지 방의 저장 칸에 엉뚱한 방이 남기 때문이다)
  useLayoutEffect(() => {
    if (!started) startRoomFromUrl()
  }, [started])

  return started ? <AppShell /> : <StartScreen />
}

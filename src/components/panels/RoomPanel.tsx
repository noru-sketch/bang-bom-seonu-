// 방 패널: 방 크기, 생활 유형, 창 방향, 문·창문.
// 숫자는 칸을 벗어나거나 Enter를 누를 때 한 번만 반영하고, 문·창문은 늘 벽 길이 안에 들어오게 맞춘다.
// 휴대폰 시트에서는 칩 셋(크기 / 문·창문 / 생활·창 방향)으로 나눠 한 번에 한 항목만 보여 준다.
import { useId, useState } from 'react'
import { DIRECTION_LABELS, LIFESTYLE_LABELS, WALL_LABELS } from '../../data/labels.js'
import { actions, activeRoomOf, getState, useActiveRoom, useAppState } from '../../state/store.ts'
import type { Lifestyle, Opening, OpeningType, Room, Wall, WindowDirection } from '../../types/schema.ts'
import Icon from '../Icon.tsx'
import NumberField from '../NumberField.tsx'
import { SectionTabs } from '../sheet.tsx'
import { useInSheet } from '../sheetContext.ts'
import { Chevron } from './shared.tsx'

const SIZE_MIN_CM = 150
const SIZE_MAX_CM = 1500
const HEIGHT_MIN_CM = 200
const HEIGHT_MAX_CM = 400
const SILL_MAX_CM = 200
/** 문·창문 폭 범위 */
const WIDTH_LIMITS: Record<OpeningType, { min: number; max: number }> = {
  door: { min: 60, max: 180 },
  window: { min: 30, max: 400 },
}

const LIFESTYLES = Object.keys(LIFESTYLE_LABELS) as Lifestyle[]
const DIRECTIONS = Object.keys(DIRECTION_LABELS) as WindowDirection[]
const WALLS = Object.keys(WALL_LABELS) as Wall[]

type RoomSize = Pick<Room, 'widthCm' | 'depthCm'>
/** 휴대폰 시트의 칩 */
type RoomTab = 'size' | 'openings' | 'life'

function wallLength(room: RoomSize, wall: Wall): number {
  return wall === 'top' || wall === 'bottom' ? room.widthCm : room.depthCm
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, max), Math.max(min, value))
}

/** 문·창문이 벽 안에 들어오도록 폭과 위치를 맞춘 값 */
function fitOpening(
  opening: Pick<Opening, 'type' | 'wall' | 'offsetCm' | 'widthCm'>,
  room: RoomSize,
): { offsetCm: number; widthCm: number } {
  const length = wallLength(room, opening.wall)
  const limits = WIDTH_LIMITS[opening.type]
  const widthCm = clamp(Math.round(opening.widthCm), Math.min(limits.min, length), Math.min(limits.max, length))
  const offsetCm = clamp(Math.round(opening.offsetCm), 0, length - widthCm)
  return { offsetCm, widthCm }
}

/** 방 크기를 바꾸고, 벽 밖으로 나가게 된 문·창문을 같이 맞춘다. 전체가 실행취소 한 단계다 */
function changeRoomSize(patch: { widthCm?: number; depthCm?: number; heightCm?: number }): void {
  const room = activeRoomOf(getState().project)
  const resized = { ...room, ...patch }
  actions.beginGesture()
  actions.setRoomSize(patch)
  for (const opening of room.openings) {
    const fitted = fitOpening(opening, resized)
    if (fitted.offsetCm !== opening.offsetCm || fitted.widthCm !== opening.widthCm) {
      actions.updateOpening(opening.id, fitted)
    }
  }
  actions.endGesture()
}

/** 문·창문 값을 고친다. 벽·폭·위치가 서로 맞도록 같이 고쳐서 한 번에 반영한다 */
function changeOpening(opening: Opening, patch: Partial<Omit<Opening, 'id'>>): void {
  const room = activeRoomOf(getState().project)
  const next = { ...opening, ...patch }
  actions.updateOpening(opening.id, { ...patch, ...fitOpening(next, room) })
}

interface OpeningCardProps {
  opening: Opening
  title: string
  isEntrance: boolean
  room: Room
  /** 휴대폰 시트에서만 준다: 한 줄 요약으로 접어 두고 누르면 편다 */
  fold?: { open: boolean; onToggle: () => void }
}

function OpeningCard({ opening, title, isEntrance, room, fold }: OpeningCardProps) {
  const wallId = useId()
  const swingId = useId()
  const length = wallLength(room, opening.wall)
  const limits = WIDTH_LIMITS[opening.type]
  const fromEdge = opening.wall === 'top' || opening.wall === 'bottom' ? '왼쪽' : '위쪽'

  const removeButton = (
    <button
      type="button"
      className={`btn btn-quiet w-9 px-0 text-muted max-lg:w-11 ${fold ? 'mr-1' : 'ml-auto'}`}
      aria-label={`${title} 지우기`}
      title={`${title} 지우기`}
      onClick={() => actions.removeOpening(opening.id)}
    >
      <Icon name="trash" size={18} />
    </button>
  )

  const fields = (
    <>
      <div>
        <label className="label" htmlFor={wallId}>
          어느 벽
        </label>
        <select
          id={wallId}
          className="input"
          value={opening.wall}
          onChange={(event) => changeOpening(opening, { wall: event.target.value as Wall })}
        >
          {WALLS.map((wall) => (
            <option key={wall} value={wall}>
              {WALL_LABELS[wall]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="위치 (cm)"
          value={opening.offsetCm}
          min={0}
          max={Math.max(0, length - opening.widthCm)}
          onCommit={(offsetCm) => changeOpening(opening, { offsetCm })}
        />
        <NumberField
          label="폭 (cm)"
          value={opening.widthCm}
          min={Math.min(limits.min, length)}
          max={Math.min(limits.max, length)}
          onCommit={(widthCm) => changeOpening(opening, { widthCm })}
        />
      </div>
      <p className="hint">위치는 벽의 {fromEdge} 끝에서 잰 거리예요.</p>

      {opening.type === 'window' ? (
        <NumberField
          label="창문 아래 높이 (cm)"
          value={opening.sillHeightCm}
          min={0}
          max={SILL_MAX_CM}
          hint="바닥에서 창문 아래 끝까지의 높이예요."
          onCommit={(sillHeightCm) => changeOpening(opening, { sillHeightCm })}
        />
      ) : (
        <label htmlFor={swingId} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink max-lg:min-h-11">
          <input
            id={swingId}
            type="checkbox"
            className="h-4 w-4 accent-accent max-lg:h-5 max-lg:w-5"
            checked={opening.swingInward}
            onChange={(event) => changeOpening(opening, { swingInward: event.target.checked })}
          />
          안으로 열림
        </label>
      )}
    </>
  )

  if (fold) {
    return (
      <li className={`card overflow-hidden ${fold.open ? 'border-accent' : ''}`}>
        <div className="flex items-center">
          <button
            type="button"
            className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 pr-1 pl-3 text-left"
            aria-expanded={fold.open}
            onClick={fold.onToggle}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-ink">{title}</span>
                {isEntrance && <span className="chip chip-accent">현관</span>}
              </span>
              <span className="block text-[13px] text-muted tabular-nums">
                {WALL_LABELS[opening.wall]} · 위치 {opening.offsetCm} · 폭 {opening.widthCm}cm
              </span>
            </span>
            <Chevron open={fold.open} />
          </button>
          {removeButton}
        </div>
        {fold.open ? <div className="space-y-3 border-t border-line px-3 py-3">{fields}</div> : null}
      </li>
    )
  }

  return (
    <li className="card p-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        {isEntrance && <span className="chip chip-accent">현관</span>}
        {removeButton}
      </div>

      <div className="mt-2 space-y-3">{fields}</div>
    </li>
  )
}

export default function RoomPanel() {
  const room = useActiveRoom()
  const lifestyle = useAppState((state) => state.project.profile.lifestyle)
  const lifestyleId = useId()
  const directionId = useId()
  const inSheet = useInSheet()
  const [tab, setTab] = useState<RoomTab>('size')
  /** 휴대폰에서 펼쳐 둔 문·창문 (한 번에 하나) */
  const [openId, setOpenId] = useState<string | null>(null)

  // 문 1, 문 2, 창문 1 … 번호를 미리 매긴다
  const titles = new Map<string, string>()
  let doorCount = 0
  let windowCount = 0
  for (const opening of room.openings) {
    if (opening.type === 'door') doorCount += 1
    else windowCount += 1
    titles.set(opening.id, opening.type === 'door' ? `문 ${doorCount}` : `창문 ${windowCount}`)
  }
  const firstDoorId = room.openings.find((opening) => opening.type === 'door')?.id

  /** 문·창문을 넣고, 휴대폰에서는 방금 넣은 것을 펼쳐 보여 준다 */
  function addOpening(type: OpeningType): void {
    const before = new Set(room.openings.map((opening) => opening.id))
    actions.addOpening(type)
    const added = activeRoomOf(getState().project).openings.find((opening) => !before.has(opening.id))
    if (added) setOpenId(added.id)
  }

  const lifestyleField = (
    <div>
      <label id={`${lifestyleId}-title`} className="label" htmlFor={lifestyleId}>
        생활 유형
      </label>
      <select
        id={lifestyleId}
        className="input"
        value={lifestyle}
        onChange={(event) => actions.setLifestyle(event.target.value as Lifestyle)}
      >
        {LIFESTYLES.map((key) => (
          <option key={key} value={key}>
            {LIFESTYLE_LABELS[key]}
          </option>
        ))}
      </select>
      {lifestyle === 'family_child' && <p className="hint mt-1">아이 안전 체크와 매트 자리를 같이 알려 드려요.</p>}
    </div>
  )

  const sizeFields = (
    <>
      <h3 className="text-sm font-semibold text-ink max-lg:sr-only">방 크기</h3>
      <div className="grid grid-cols-3 gap-2.5">
        <NumberField
          label="가로 (cm)"
          value={room.widthCm}
          min={SIZE_MIN_CM}
          max={SIZE_MAX_CM}
          onCommit={(widthCm) => changeRoomSize({ widthCm })}
        />
        <NumberField
          label="세로 (cm)"
          value={room.depthCm}
          min={SIZE_MIN_CM}
          max={SIZE_MAX_CM}
          onCommit={(depthCm) => changeRoomSize({ depthCm })}
        />
        <NumberField
          label="높이 (cm)"
          value={room.heightCm}
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          onCommit={(heightCm) => changeRoomSize({ heightCm })}
        />
      </div>
      <p className="hint">
        벽 안쪽 길이예요. 가로·세로는 {SIZE_MIN_CM}~{SIZE_MAX_CM}cm, 높이는 {HEIGHT_MIN_CM}~{HEIGHT_MAX_CM}cm까지 넣을 수 있어요.
      </p>
    </>
  )

  const directionField = (
    <div>
      <label className="label" htmlFor={directionId}>
        창 방향
      </label>
      <select
        id={directionId}
        className="input"
        value={room.windowDirection}
        onChange={(event) => actions.setWindowDirection(event.target.value as WindowDirection)}
      >
        {DIRECTIONS.map((key) => (
          <option key={key} value={key}>
            {DIRECTION_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  )

  const openingList = (
    <>
      <h3 className="text-sm font-semibold text-ink max-lg:sr-only">문과 창문</h3>
      {room.openings.length === 0 ? (
        <p className="hint">아직 문이나 창문이 없어요. 아래 버튼으로 넣어 주세요.</p>
      ) : (
        <ul className="space-y-2.5">
          {room.openings.map((opening) => (
            <OpeningCard
              key={opening.id}
              opening={opening}
              title={titles.get(opening.id) ?? ''}
              isEntrance={opening.id === firstDoorId}
              room={room}
              fold={
                inSheet
                  ? { open: openId === opening.id, onToggle: () => setOpenId(openId === opening.id ? null : opening.id) }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn" onClick={() => addOpening('door')}>
          <Icon name="plus" size={16} />문 추가
        </button>
        <button type="button" className="btn" onClick={() => addOpening('window')}>
          <Icon name="plus" size={16} />
          창문 추가
        </button>
      </div>
    </>
  )

  if (inSheet) {
    return (
      <div>
        <h2 className="panel-title sr-only">방</h2>
        <SectionTabs
          label="방 메뉴"
          tabs={[
            { key: 'size', label: '크기' },
            { key: 'openings', label: '문·창문', count: room.openings.length },
            { key: 'life', label: '생활·창 방향' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'size' ? (
          <section className="space-y-3" aria-label="방 크기">
            {sizeFields}
          </section>
        ) : null}
        {tab === 'openings' ? (
          <section className="space-y-3" aria-label="문과 창문">
            {openingList}
          </section>
        ) : null}
        {tab === 'life' ? (
          <section className="space-y-4" aria-label="생활 유형과 창 방향">
            {lifestyleField}
            {directionField}
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="panel-title">방</h2>

      <section className="space-y-3" aria-labelledby={`${lifestyleId}-title`}>
        {lifestyleField}
      </section>

      <div className="divider" />

      <section className="space-y-3" aria-label="방 크기">
        {sizeFields}
        {directionField}
      </section>

      <div className="divider" />

      <section className="space-y-3" aria-label="문과 창문">
        {openingList}
      </section>
    </div>
  )
}

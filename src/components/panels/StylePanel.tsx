// 스타일 패널: 프리셋 고르기, 원하는 분위기를 글로 적어 색 만들기, 벽·바닥·포인트 색 직접 고치기.
// 휴대폰 시트에서는 칩 셋(프리셋 / 분위기로 만들기 / 색 고치기)으로 나눠 한 번에 한 항목만 보여 준다.
import { useEffect, useId, useRef, useState } from 'react'
import { NOTICES } from '../../data/labels.js'
import { STYLE_PRESETS } from '../../data/styles.js'
import { requestStyle } from '../../lib/api.ts'
import { actions, activeRoomOf, getState, useActiveRoom } from '../../state/store.ts'
import type { RoomStyle } from '../../types/schema.ts'
import { SectionTabs } from '../sheet.tsx'
import { useInSheet } from '../sheetContext.ts'

/** 휴대폰 시트의 칩 */
type StyleTab = 'preset' | 'mood' | 'color'
type ColorKey = 'wallColor' | 'floorColor' | 'accentColor'

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: 'wallColor', label: '벽' },
  { key: 'floorColor', label: '바닥' },
  { key: 'accentColor', label: '포인트' },
]

/** 색 고르기 칸은 #rrggbb 모양만 받는다. 다른 모양이면 맞춰 준다 */
function toHex6(color: string): string {
  const value = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  return '#ffffff'
}

function Swatches({ style }: { style: RoomStyle }) {
  return (
    <span className="flex h-9 overflow-hidden rounded-md border border-line" aria-hidden="true">
      <span className="flex-[3]" style={{ background: style.wallColor }} />
      <span className="flex-[2]" style={{ background: style.floorColor }} />
      <span className="flex-1" style={{ background: style.accentColor }} />
    </span>
  )
}

/** 색 하나 고치기. 색 고르는 창을 끄는 동안의 변화 전체가 실행취소 한 단계가 된다 */
function ColorField({ label, value, onPick }: { label: string; value: string; onPick: (color: string) => void }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const picking = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    function finish(): void {
      if (!picking.current) return
      picking.current = false
      actions.endGesture()
    }
    // 색 고르는 창이 닫히거나 칸을 벗어나면 한 단계로 마무리한다
    input.addEventListener('change', finish)
    input.addEventListener('blur', finish)
    return () => {
      input.removeEventListener('change', finish)
      input.removeEventListener('blur', finish)
      finish()
    }
  }, [])

  return (
    <div className="flex min-h-10 items-center gap-3 max-lg:min-h-12">
      <input
        ref={inputRef}
        id={id}
        type="color"
        className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-0.5 max-lg:h-11 max-lg:w-14"
        value={toHex6(value)}
        onChange={(event) => {
          if (!picking.current) {
            picking.current = true
            actions.beginGesture()
          }
          onPick(event.target.value)
        }}
      />
      <label htmlFor={id} className="flex-1 cursor-pointer text-sm text-ink max-lg:flex max-lg:min-h-11 max-lg:items-center max-lg:text-[15px]">
        {label}
      </label>
      <span className="text-[13px] text-muted tabular-nums max-lg:text-sm">{toHex6(value).toUpperCase()}</span>
    </div>
  )
}

export default function StylePanel() {
  const room = useActiveRoom()
  const style = room.style
  const moodId = useId()
  const [mood, setMood] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ note: string; isFallback: boolean } | null>(null)
  const inSheet = useInSheet()
  const [tab, setTab] = useState<StyleTab>('preset')

  async function makeFromMood(): Promise<void> {
    const text = mood.trim()
    if (text === '' || loading) return
    setLoading(true)
    setResult(null)
    try {
      const response = await requestStyle({ text })
      actions.setStyle(response.style)
      setResult({ note: response.note, isFallback: response.isFallback })
    } catch {
      setResult({ note: '색을 만들지 못했어요. 잠시 뒤에 다시 눌러 주세요.', isFallback: false })
    } finally {
      setLoading(false)
    }
  }

  function pickColor(key: ColorKey, color: string): void {
    const current = activeRoomOf(getState().project).style
    actions.setStyle({
      ...current,
      id: 'custom',
      name: '직접 고른 색',
      description: '직접 고른 색 조합',
      [key]: color,
    })
  }

  const presetSection = (
    <section className="space-y-3" aria-label="스타일 프리셋">
      <h3 className="text-sm font-semibold text-ink max-lg:sr-only">프리셋</h3>
      <ul className="grid grid-cols-2 gap-2.5">
        {STYLE_PRESETS.map((preset) => {
          const active = preset.id === style.id
          return (
            <li key={preset.id}>
              <button
                type="button"
                aria-pressed={active}
                title={preset.description}
                onClick={() => actions.setStyle({ ...preset })}
                className={`card relative flex w-full cursor-pointer flex-col gap-2 p-2.5 text-left transition-colors hover:border-line-strong ${
                  active ? 'border-accent hover:border-accent' : ''
                }`}
              >
                <Swatches style={preset} />
                <span className="block truncate text-[13px] font-medium text-ink max-lg:text-sm max-lg:whitespace-normal">
                  {preset.name}
                </span>
                {active && (
                  <span className="chip chip-accent absolute top-1 right-1 border border-accent">선택됨</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )

  const moodForm = (
    <form
      className="space-y-2.5"
      aria-label="분위기로 색 만들기"
      onSubmit={(event) => {
        event.preventDefault()
        void makeFromMood()
      }}
    >
      <label className="label" htmlFor={moodId}>
        원하는 분위기
      </label>
      <input
        id={moodId}
        className="input"
        type="text"
        maxLength={80}
        placeholder="따뜻한 우드 미드센추리"
        value={mood}
        onChange={(event) => setMood(event.target.value)}
      />
      <button type="submit" className="btn btn-primary w-full" disabled={loading || mood.trim() === ''}>
        {loading ? '색을 만들고 있어요' : '이 분위기로 색 만들기'}
      </button>
      <div aria-live="polite" className="space-y-1.5">
        {result && (
          <>
            {result.isFallback && <span className="chip chip-tip whitespace-normal">{NOTICES.fallback}</span>}
            {/* 서버가 보낸 안내 문장을 쓰되, 위 칩과 같은 문장이면 한 번만 보여 준다 */}
            {result.note && !(result.isFallback && result.note === NOTICES.fallback) && <p className="hint">{result.note}</p>}
          </>
        )}
      </div>
    </form>
  )

  const colorSection = (
    <section className="space-y-2" aria-label="색 고치기">
      <h3 className="text-sm font-semibold text-ink max-lg:sr-only">색 고치기</h3>
      <Swatches style={style} />
      <div>
        {COLOR_FIELDS.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            value={style[field.key]}
            onPick={(color) => pickColor(field.key, color)}
          />
        ))}
      </div>
    </section>
  )

  const nowStyle = (
    <p className="hint mt-1 max-lg:mt-0">
      지금 스타일: <span className="font-medium text-ink">{style.name}</span>
    </p>
  )

  if (inSheet) {
    return (
      <div className="space-y-3">
        <h2 className="panel-title sr-only">스타일</h2>
        <SectionTabs
          label="스타일 메뉴"
          tabs={[
            { key: 'preset', label: '프리셋' },
            { key: 'mood', label: '분위기로 만들기' },
            { key: 'color', label: '색 고치기' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {nowStyle}
        {tab === 'preset' ? presetSection : null}
        {tab === 'mood' ? moodForm : null}
        {tab === 'color' ? colorSection : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="panel-title">스타일</h2>
        {nowStyle}
      </div>

      {presetSection}

      <div className="divider" />

      {moodForm}

      <div className="divider" />

      {colorSection}
    </div>
  )
}

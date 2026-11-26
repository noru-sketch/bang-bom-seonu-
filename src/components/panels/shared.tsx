// 패널들이 같이 쓰는 작은 부품: 금액·치수 글자, 접는 구역, 숫자·글자 입력 칸, 스위치.
import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

/** 금액을 "1,234,000원" 모양으로 */
export function formatKrw(krw: number): string {
  return `${Math.round(krw).toLocaleString('ko-KR')}원`
}

/** 가로 × 깊이 × 높이 */
export function sizeText(widthCm: number, depthCm: number, heightCm: number): string {
  return `${widthCm} × ${depthCm} × ${heightCm}cm`
}

/** 입력 칸에서 누른 키가 평면도 단축키(삭제·방향키·실행취소)로 넘어가지 않게 한다 */
function keepKeysInside(event: KeyboardEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

interface FoldProps {
  title: string
  /** 제목 오른쪽에 붙는 작은 표시 (개수 등) */
  badge?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
  /**
   * 휴대폰 시트에서 제목들을 두 칸 격자로 늘어놓을 때 켠다 (부모가 grid여야 한다).
   * 제목은 격자의 한 칸이 되고, 펼친 내용은 그 아래 한 줄을 다 쓴다. PC 틀에서는 아무것도 바뀌지 않는다
   */
  tile?: boolean
}

/** 제목을 누르면 펴지고 접히는 구역 */
export function Fold({ title, badge, open, onToggle, children, tile = false }: FoldProps) {
  const bodyId = useId()
  return (
    <div className={tile ? 'contents' : undefined}>
      <button
        type="button"
        className={
          tile
            ? `flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border px-3 text-left ${open ? 'border-ink bg-white' : 'border-line bg-white'}`
            : 'flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-1 text-left hover:bg-sunken max-lg:min-h-11'
        }
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{title}</span>
        {badge}
        <Chevron open={open} />
      </button>
      {open ? (
        <div id={bodyId} className={tile ? 'col-span-full pb-1' : 'pt-2 pb-1'}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  /** 포커스를 옮기거나 Enter를 누르면 한 번만 불린다 */
  onCommit: (value: number) => void
  min?: number
  max?: number
  unit?: string
  /** 라벨을 화면에서는 숨기고 읽기 도구에만 알려 준다 */
  hideLabel?: boolean
}

/** 숫자 입력 칸. 치는 동안에는 바꾸지 않고, 칸을 벗어나거나 Enter를 누를 때 반영한다 */
export function NumberField({ label, value, onCommit, min = 0, max = 999_999_999, unit, hideLabel }: NumberFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)

  function commit(): void {
    if (draft === null) return
    const digits = draft.replace(/[^\d]/g, '')
    setDraft(null)
    if (digits === '') return
    const next = Math.min(max, Math.max(min, Number(digits)))
    if (next !== value) onCommit(next)
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`input tabular-nums ${unit ? 'pr-8' : ''}`}
          inputMode="numeric"
          autoComplete="off"
          value={draft ?? String(value)}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={commit}
          onKeyDown={(event) => {
            keepKeysInside(event)
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setDraft(null)
          }}
        />
        {unit ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted max-lg:text-[13px]">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  hideLabel?: boolean
}

/** 글자 입력 칸. 칸을 벗어나거나 Enter를 누를 때 반영한다. 비워 두면 바꾸지 않는다 */
export function TextField({ label, value, onCommit, placeholder, hideLabel }: TextFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)

  function commit(): void {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next !== '' && next !== value) onCommit(next)
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        autoComplete="off"
        maxLength={40}
        placeholder={placeholder}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          keepKeysInside(event)
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(null)
        }}
      />
    </div>
  )
}

interface SwitchProps {
  label: string
  checked: boolean
  onChange: () => void
  /** 같은 글자의 스위치가 여러 개일 때 읽기 도구에 알려 줄 이름 */
  ariaLabel?: string
}

/** 켜고 끄는 스위치 (진짜 체크박스). 숨긴 체크박스가 스크롤 영역 밖으로 나가지 않게 label을 기준(relative)으로 둔다 */
export function Switch({ label, checked, onChange, ariaLabel }: SwitchProps) {
  return (
    <label className="relative inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-ink select-none max-lg:min-h-11 max-lg:text-sm">
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        aria-label={ariaLabel}
        onChange={onChange}
        onKeyDown={keepKeysInside}
      />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface after:transition-transform peer-checked:after:translate-x-4"
      />
      {label}
    </label>
  )
}

/** 짧은 알림 한 줄 (읽기 도구도 읽어 준다) */
export function Notice({ tone = 'plain', children }: { tone?: 'plain' | 'tip' | 'ok'; children: ReactNode }) {
  const look =
    tone === 'tip' ? 'bg-tip-soft text-tip' : tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-sunken text-muted'
  return (
    <p role="status" className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed max-lg:text-sm ${look}`}>
      {children}
    </p>
  )
}

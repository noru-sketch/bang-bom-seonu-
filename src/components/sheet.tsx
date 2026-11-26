// 휴대폰 시트 머리줄에 그리는 부품: 카테고리 칩(SectionTabs)과 머리줄 자리(SheetHeaderSlot).
// 칩은 시트 머리줄의 자리(slot)에 그려져서 내용이 스크롤돼도 제자리에 있다. PC 틀에서는 아무것도 그리지 않는다.
// "휴대폰 시트 안인지"는 sheetContext.ts 의 useInSheet()로 안다.
import { useContext } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SheetContext } from './sheetContext.ts'

/** 시트 머리줄 자리에 내용을 그린다. PC 틀이거나 자리가 아직 없으면 그리지 않는다 */
export function SheetHeaderSlot({ children }: { children: ReactNode }) {
  const sheet = useContext(SheetContext)
  if (!sheet?.slot) return null
  return createPortal(children, sheet.slot)
}

export interface SectionTab<K extends string> {
  key: K
  label: string
  /** 이름 뒤에 붙는 개수 */
  count?: number
  /** 개수가 있을 때의 글자 색 (문제는 danger, 제안은 tip). 색과 함께 글자·숫자로도 알린다 */
  tone?: 'danger' | 'tip'
}

interface SectionTabsProps<K extends string> {
  /** 읽기 도구에 알려 줄 칩 줄 이름 */
  label: string
  tabs: SectionTab<K>[]
  value: K
  onChange: (key: K) => void
}

/** 시트 안 카테고리 칩 한 줄. 누르면 그 항목만 보인다. 넘치면 가로로 민다 */
export function SectionTabs<K extends string>({ label, tabs, value, onChange }: SectionTabsProps<K>) {
  const sheet = useContext(SheetContext)
  return (
    <SheetHeaderSlot>
      <div role="tablist" aria-label={label} className="flex w-max items-center gap-1.5 pr-1 pl-4">
        {tabs.map((tab) => {
          const active = tab.key === value
          const tone = !active && tab.count ? (tab.tone === 'danger' ? 'text-danger' : tab.tone === 'tip' ? 'text-tip' : '') : ''
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              className="seg-chip-hit"
              onClick={() => {
                onChange(tab.key)
                sheet?.resetScroll()
              }}
            >
              <span className={`seg-chip ${active ? 'seg-chip-on' : tone}`}>
                {tab.label}
                {/* 빈칸은 읽기 도구가 "문제 1"로 읽게 하려고 둔다 (화면에서는 gap이 간격을 만든다) */}
                {tab.count !== undefined ? ' ' : null}
                {tab.count !== undefined ? <span className="tabular-nums">{tab.count}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </SheetHeaderSlot>
  )
}

// 비용 패널: 예산, 가구별 가격(직접 고치기), 보유 가구 제외 합계, 쇼핑몰 검색 링크.
// 휴대폰 시트에서는 칩 둘(요약 / 가구별 가격)로 나눠 한 번에 한 항목만 보여 준다.
import { useState } from 'react'
import { NOTICES } from '../../data/labels.js'
import { effectivePriceKrw, priceSourceLabel, shopSearchLinks, summarizeCost } from '../../engine/cost.js'
import { actions, useActiveRoom, useAppState } from '../../state/store.ts'
import type { CostSummary, FurnitureItem } from '../../types/schema.ts'
import { SectionTabs } from '../sheet.tsx'
import { useInSheet } from '../sheetContext.ts'
import { formatKrw, NumberField, Switch } from './shared.tsx'

/** 휴대폰 시트의 칩 */
type CostTab = 'summary' | 'items'

/** 가격이 어디서 온 값인지. 예상 가격이면 고지 문구를 그대로 쓴다 */
function sourceLabel(item: FurnitureItem): string {
  if (item.price.manualKrw === null && item.price.source === 'estimated') return NOTICES.price
  return priceSourceLabel(item)
}

export function CostSummaryCard({ summary }: { summary: CostSummary }) {
  const hasBudget = summary.budgetKrw > 0
  const over = hasBudget && summary.overBudget
  return (
    <dl className="card divide-y divide-line text-sm">
      <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
        <dt className="text-muted">살 가구 합계 ({summary.buyCount}개)</dt>
        <dd className="font-semibold text-ink tabular-nums">{formatKrw(summary.totalKrw)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
        <dt className="text-muted">보유해서 뺀 금액 ({summary.ownedCount}개)</dt>
        <dd className="text-ink tabular-nums">{formatKrw(summary.ownedExcludedKrw)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
        <dt className="text-muted">예산</dt>
        <dd className="text-ink tabular-nums">{hasBudget ? formatKrw(summary.budgetKrw) : '정하지 않았어요'}</dd>
      </div>
      {hasBudget ? (
        <div className={`flex items-baseline justify-between gap-3 px-3 py-2.5 ${over ? 'bg-danger-soft' : ''}`}>
          <dt className={over ? 'font-medium text-danger' : 'text-muted'}>{over ? '초과 금액 (예산을 넘었어요)' : '남는 금액'}</dt>
          <dd className={`font-semibold tabular-nums ${over ? 'text-danger' : 'text-ok'}`}>
            {formatKrw(Math.abs(summary.remainingKrw))}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function PriceCell({ item }: { item: FurnitureItem }) {
  const [draft, setDraft] = useState<string | null>(null)
  const price = effectivePriceKrw(item)

  function commit(): void {
    if (draft === null) return
    const digits = draft.replace(/[^\d]/g, '')
    setDraft(null)
    if (digits === '') {
      // 칸을 비우면 예상 가격으로 돌아간다
      if (item.price.manualKrw !== null) actions.setManualPrice(item.id, null)
      return
    }
    const next = Math.min(999_999_999, Number(digits))
    if (next !== price) actions.setManualPrice(item.id, next)
  }

  if (draft === null) {
    return (
      <button
        type="button"
        className="btn shrink-0 tabular-nums"
        aria-label={`${item.name} 가격 ${formatKrw(price)}, 눌러서 고치기`}
        onClick={() => setDraft(String(price))}
      >
        {formatKrw(price)}
      </button>
    )
  }
  return (
    <div className="relative w-32 shrink-0">
      <input
        className="input pr-7 text-right tabular-nums"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        aria-label={`${item.name} 가격 (원). 비우면 예상 가격으로 돌아가요`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setDraft(null)
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted max-lg:text-[13px]">원</span>
    </div>
  )
}

export default function CostPanel() {
  const room = useActiveRoom()
  const budgetKrw = useAppState((state) => state.project.profile.budgetKrw)
  const summary = summarizeCost(room.furniture, budgetKrw)
  const inSheet = useInSheet()
  const [tab, setTab] = useState<CostTab>('summary')

  const summaryBlock = (
    <div className="space-y-3">
      <NumberField label="예산" unit="원" value={budgetKrw} onCommit={(value) => actions.setBudget(value)} />
      <CostSummaryCard summary={summary} />
      <p className="hint">가구 가격은 {NOTICES.price}이에요. 실제 가격은 쇼핑몰에서 확인해 주세요.</p>
    </div>
  )

  const itemsBlock = (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ink max-lg:sr-only">가구별 가격</h3>
      {room.furniture.length === 0 ? (
        <p className="hint">가구를 추가하면 가격을 보여 드려요.</p>
      ) : (
        <>
          <p className="hint">가격을 누르면 직접 고칠 수 있어요. 칸을 비우면 예상 가격으로 돌아가요.</p>
          <ul className="card divide-y divide-line">
            {room.furniture.map((item) => (
              <li key={item.id} className="space-y-1 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium max-lg:text-[15px] max-lg:whitespace-normal ${item.owned ? 'text-muted' : 'text-ink'}`}
                    >
                      {item.name}
                    </span>
                    <span className="block text-[12px] text-muted max-lg:text-[13px]">
                      {item.owned ? '보유 중이라 합계에서 뺐어요' : sourceLabel(item)}
                    </span>
                  </span>
                  <PriceCell item={item} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <Switch
                    label="이미 있어요"
                    ariaLabel={`${item.name} 이미 있어요`}
                    checked={item.owned}
                    onChange={() => actions.toggleOwned(item.id)}
                  />
                  <span className="flex items-center gap-0.5 max-lg:-mr-1.5 max-lg:gap-0">
                    {shopSearchLinks(item.name).map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${item.name} ${link.label}에서 찾기 (새 창)`}
                        className="inline-flex min-h-9 items-center rounded-md px-1.5 text-[12px] font-medium text-accent hover:bg-accent-soft max-lg:min-h-11 max-lg:min-w-11 max-lg:justify-center max-lg:text-[13px]"
                      >
                        {link.label}
                      </a>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )

  if (inSheet) {
    return (
      <div>
        <h2 className="panel-title sr-only">비용</h2>
        <SectionTabs
          label="비용 메뉴"
          tabs={[
            { key: 'summary', label: '요약' },
            { key: 'items', label: '가구별 가격', count: room.furniture.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'summary' ? summaryBlock : itemsBlock}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h2 className="panel-title">비용</h2>

      {summaryBlock}

      <div className="divider" />

      {itemsBlock}
    </div>
  )
}

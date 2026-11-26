// 리포트 패널: 가족·사용자용 리포트와 업체·시공용 사양서를 골라 보고, 크게 보고, 표를 복사하고, 인쇄한다.
// 인쇄할 때는 앱 화면을 숨기고 고른 리포트만 A4 종이에 나오도록 문서 맨 바깥에 인쇄용 사본을 둔다.
// 휴대폰 시트에서는 종류를 칩으로 고르고, 긴 본문은 시트에 늘어놓지 않고 [크게 보기](화면 전체)로 읽는다.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildContractorSpec, toTsv } from '../../engine/report.js'
import { useActiveRoom } from '../../state/store.ts'
import { REPORT_LABELS, ReportDocument } from '../report/ReportDocuments.tsx'
import type { ReportKind } from '../report/ReportDocuments.tsx'
import { SectionTabs } from '../sheet.tsx'
import { useInSheet } from '../sheetContext.ts'

const PRINT_ID = 'bangkkumi-print-report'

// 인쇄 규칙: 앱(#root)은 숨기고 인쇄용 사본만 A4에 검정 글자·흰 바탕으로 찍는다. 색 견본만 색을 남긴다.
const PRINT_RULES = `
@page { size: A4; margin: 14mm; }
@media print {
  #root { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  #${PRINT_ID} { color: #000 !important; background: #fff !important; }
  #${PRINT_ID} * { color: #000 !important; }
  #${PRINT_ID} *:not([data-report-swatch]) { background-color: transparent !important; box-shadow: none !important; }
  #${PRINT_ID} tr, #${PRINT_ID} li, #${PRINT_ID} figure { break-inside: avoid; page-break-inside: avoid; }
  #${PRINT_ID} thead { display: table-header-group; }
}
`

const KIND_BUTTONS: { kind: ReportKind; label: string }[] = [
  { kind: 'family', label: '가족·사용자용' },
  { kind: 'contractor', label: '업체·시공용' },
]

type CopyState = 'idle' | 'done' | 'failed'

// 다른 메뉴에 다녀와도 마지막에 보던 리포트를 다시 보여 준다
let rememberedKind: ReportKind = 'family'

export default function ReportPanel() {
  const room = useActiveRoom()
  const [kind, setKind] = useState<ReportKind>(rememberedKind)
  const [expanded, setExpanded] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const inSheet = useInSheet()

  function chooseKind(next: ReportKind): void {
    rememberedKind = next
    setKind(next)
    setCopyState('idle')
  }

  function closeExpanded(): void {
    setExpanded(false)
    openButtonRef.current?.focus()
  }

  // 크게 보기가 열려 있는 동안: 닫기 버튼에 초점을 두고, Esc로 닫는다
  useEffect(() => {
    if (!expanded) return
    closeButtonRef.current?.focus()
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setExpanded(false)
        openButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [expanded])

  const tsv = kind === 'contractor' ? toTsv(buildContractorSpec(room)) : ''

  async function copyTable(): Promise<void> {
    try {
      // 보안 연결이 아니거나 오래된 브라우저에는 클립보드 기능이 없을 수 있다
      const clipboard: Clipboard | undefined = navigator.clipboard
      if (!clipboard) throw new Error('클립보드를 쓸 수 없어요')
      await clipboard.writeText(tsv)
      setCopyState('done')
    } catch {
      setCopyState('failed')
    }
  }

  const actionButtons = (
    <>
      {kind === 'contractor' ? (
        <button type="button" className="btn" onClick={() => void copyTable()}>
          표 복사
        </button>
      ) : null}
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        인쇄 / PDF 저장
      </button>
    </>
  )

  const copyMessage =
    kind === 'contractor' && copyState !== 'idle' ? (
      <div className="space-y-1.5">
        <p role="status" className={`text-[13px] leading-relaxed ${copyState === 'done' ? 'text-ok' : 'text-tip'}`}>
          {copyState === 'done'
            ? '표를 복사했어요. 엑셀이나 메모장에 붙여 넣어 보세요.'
            : '이 브라우저에서는 바로 복사할 수 없어요. 아래 글을 눌러 전체를 고른 뒤 직접 복사해 주세요.'}
        </p>
        {copyState === 'failed' ? (
          <textarea
            readOnly
            aria-label="사양서 표 글자 (직접 복사용)"
            className="input h-28 w-full font-mono text-[11px] leading-snug max-lg:h-28 max-lg:text-base"
            value={tsv}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        ) : null}
      </div>
    ) : null

  const kindHint = (
    <p className="hint">
      {kind === 'family'
        ? '가족과 같이 볼 요약이에요. 평면도, 피드백, 가구, 비용이 들어 있어요.'
        : '시공 업체에 그대로 건넬 수 있는 치수와 좌표 표예요.'}
    </p>
  )

  return (
    <div className="space-y-4 max-lg:space-y-3">
      {inSheet ? (
        <div className="space-y-3">
          <h2 className="panel-title sr-only">리포트</h2>
          <SectionTabs
            label="리포트 종류"
            tabs={KIND_BUTTONS.map((button) => ({ key: button.kind, label: button.label }))}
            value={kind}
            onChange={chooseKind}
          />
          {kindHint}
          <button ref={openButtonRef} type="button" className="btn btn-primary btn-lg w-full" onClick={() => setExpanded(true)}>
            크게 보기
          </button>
          <div className="flex gap-2">
            {kind === 'contractor' ? (
              <button type="button" className="btn flex-1" onClick={() => void copyTable()}>
                표 복사
              </button>
            ) : null}
            <button type="button" className="btn flex-1" onClick={() => window.print()}>
              인쇄 / PDF 저장
            </button>
          </div>
          {expanded ? null : copyMessage}
          <p className="hint">인쇄하면 지금 고른 리포트만 A4 종이에 나와요.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <h2 className="panel-title">리포트</h2>
            <div role="group" aria-label="리포트 종류" className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1">
              {KIND_BUTTONS.map((button) => (
                <button
                  key={button.kind}
                  type="button"
                  aria-pressed={kind === button.kind}
                  className={`btn ${kind === button.kind ? 'btn-primary' : 'btn-quiet'}`}
                  onClick={() => chooseKind(button.kind)}
                >
                  {button.label}
                </button>
              ))}
            </div>
            {kindHint}
            <div className="flex flex-wrap gap-2">
              <button ref={openButtonRef} type="button" className="btn" onClick={() => setExpanded(true)}>
                크게 보기
              </button>
              {actionButtons}
            </div>
            {expanded ? null : copyMessage}
            <p className="hint">인쇄하면 지금 고른 리포트만 A4 종이에 나와요.</p>
          </div>

          <div className="divider" />

          <ReportDocument kind={kind} />
        </>
      )}

      {expanded
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${REPORT_LABELS[kind]} 크게 보기`}
              className="fixed inset-0 z-50 flex flex-col bg-surface text-ink print:hidden"
              style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <p className="mr-auto text-sm font-semibold text-ink max-lg:w-full max-lg:text-[15px]">{REPORT_LABELS[kind]}</p>
                {actionButtons}
                <button ref={closeButtonRef} type="button" className="btn" onClick={closeExpanded}>
                  닫기
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-paper">
                <div className="mx-auto my-4 max-w-[820px] space-y-3 bg-surface p-5 sm:p-8">
                  {copyMessage}
                  <ReportDocument kind={kind} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {createPortal(
        <div id={PRINT_ID} className="hidden print:block">
          <style>{PRINT_RULES}</style>
          <ReportDocument kind={kind} />
        </div>,
        document.body,
      )}
    </div>
  )
}

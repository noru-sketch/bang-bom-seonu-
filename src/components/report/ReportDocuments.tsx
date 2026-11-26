// 리포트 두 가지의 본문: 가족·사용자용 리포트와 업체·시공용 사양서.
// 패널의 미리보기, 크게 보기, 인쇄용 사본이 같은 본문을 쓴다. 표는 자기 상자 안에서 가로로 넘겨 볼 수 있다.
import type { ReactNode } from 'react'
import { NOTICES } from '../../data/labels.js'
import { summarizeCost } from '../../engine/cost.js'
import {
  buildContractorSpec,
  formatKrw,
  furnitureCells,
  openingCells,
  FURNITURE_COLUMNS,
  OPENING_COLUMNS,
} from '../../engine/report.js'
import { useActiveRoom, useAppState } from '../../state/store.ts'
import type { ValidationTip } from '../../types/schema.ts'
import PlanFigure from './PlanFigure.tsx'

export type ReportKind = 'family' | 'contractor'

export const REPORT_LABELS: Record<ReportKind, string> = {
  family: '가족·사용자용 리포트',
  contractor: '업체·시공용 사양서',
}

/** 오늘 날짜 (예: 2026. 11. 26.) */
function todayText(): string {
  return new Date().toLocaleDateString('ko-KR')
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="break-after-avoid text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

/** 가로로 넘겨 볼 수 있는 표 상자. 인쇄할 때는 넘김 없이 다 보여 준다 */
function TableBox({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      className="card max-w-full overflow-x-auto print:overflow-visible"
      role="region"
      aria-label={`${label} (옆으로 넘겨 볼 수 있어요)`}
      tabIndex={0}
    >
      {children}
    </div>
  )
}

const TH = 'px-2 py-1.5 font-medium whitespace-nowrap'
const TD = 'px-2 py-1.5 text-ink tabular-nums whitespace-nowrap'
const TABLE = 'w-full border-collapse text-left text-[12px] leading-snug'
const ROW = 'break-inside-avoid border-t border-line align-top'

function TipList({ tips }: { tips: ValidationTip[] }) {
  return (
    <ul className="space-y-1.5 text-[13px] leading-relaxed">
      {tips.map((tip, index) => (
        <li key={index} className="break-inside-avoid">
          <span className="font-medium text-ink">{tip.title}</span>
          {tip.isReferenceValue ? <span className="chip chip-tip ml-1.5 align-middle">참고값</span> : null}
          <span className="block text-muted">{tip.message}</span>
        </li>
      ))}
    </ul>
  )
}

/** 3단계 피드백: 확실한 문제 / 개선 제안 / 좋은 점. 숫자로 매기는 평가는 없다 */
function FeedbackSection() {
  const validation = useAppState((state) => state.validation)
  const interiorTips = validation.tips.filter((tip) => tip.category !== 'child_safety')
  const safetyTips = validation.tips.filter((tip) => tip.category === 'child_safety')
  // 참고값을 쓴 항목이 하나라도 있으면 고지 문구를 꼭 보여 준다 (문제·좋은 점에 나온 참고값도 포함)
  const usesReference =
    validation.tips.some((tip) => tip.isReferenceValue) ||
    safetyTips.length > 0 ||
    validation.errors.some((error) => error.code === 'CLEARANCE_BLOCKED' || error.code === 'NO_ACCESS' || error.message.includes('참고값')) ||
    validation.strengths.some((line) => line.includes('참고값'))

  return (
    <Section title="배치 피드백">
      <div className="space-y-1">
        <h4 className={`break-after-avoid text-[13px] font-semibold ${validation.errors.length > 0 ? 'text-danger' : 'text-muted'}`}>
          확실한 문제 {validation.errors.length}개
        </h4>
        {validation.errors.length === 0 ? (
          <p className="hint">확실한 문제는 찾지 못했어요.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px] leading-relaxed">
            {validation.errors.map((error, index) => (
              <li key={index} className="break-inside-avoid">
                <span className="font-medium text-ink">{error.title}</span>
                <span className="block text-muted">{error.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <h4 className={`break-after-avoid text-[13px] font-semibold ${validation.tips.length > 0 ? 'text-tip' : 'text-muted'}`}>
          개선 제안 {validation.tips.length}개
        </h4>
        {validation.tips.length === 0 ? <p className="hint">따로 드릴 제안이 없어요.</p> : null}
        {interiorTips.length > 0 ? <TipList tips={interiorTips} /> : null}
        {safetyTips.length > 0 ? (
          <>
            <p className="pt-1 text-[12px] font-semibold text-tip">{NOTICES.childSafety}</p>
            <TipList tips={safetyTips} />
          </>
        ) : null}
      </div>
      <div className="space-y-1">
        <h4 className={`break-after-avoid text-[13px] font-semibold ${validation.strengths.length > 0 ? 'text-ok' : 'text-muted'}`}>
          좋은 점 {validation.strengths.length}개
        </h4>
        {validation.strengths.length === 0 ? (
          <p className="hint">아직 찾은 좋은 점이 없어요.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink">
            {validation.strengths.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      {usesReference ? <p className="hint">{NOTICES.reference}</p> : null}
    </Section>
  )
}

function DocumentTitle({ kind, roomName }: { kind: ReportKind; roomName: string }) {
  return (
    <header className="space-y-0.5 border-b border-line pb-2">
      <h2 className="text-base font-semibold text-ink">
        {roomName} {kind === 'family' ? '배치 리포트' : '시공 사양서'}
      </h2>
      <p className="text-[12px] text-muted">
        {REPORT_LABELS[kind]} · 만든 날 {todayText()}
      </p>
    </header>
  )
}

/** 가족·사용자용 리포트 */
export function FamilyReport() {
  const room = useActiveRoom()
  const budgetKrw = useAppState((state) => state.project.profile.budgetKrw)
  const summary = summarizeCost(room.furniture, budgetKrw)
  const hasBudget = summary.budgetKrw > 0

  return (
    <article className="space-y-5">
      <DocumentTitle kind="family" roomName={room.name} />

      <Section title="평면도">
        <PlanFigure room={room} className="mx-auto w-full max-w-[520px] break-inside-avoid print:max-w-[400px]" />
        <p className="hint">
          방 크기는 가로 {room.widthCm} × 세로 {room.depthCm} × 높이 {room.heightCm}cm예요. 3D 그림은 준비 중이에요.
        </p>
      </Section>

      <FeedbackSection />

      <Section title={`가구 ${room.furniture.length}개`}>
        {room.furniture.length === 0 ? (
          <p className="hint">아직 놓인 가구가 없어요.</p>
        ) : (
          <TableBox label="가구 목록">
            <table className={TABLE}>
              <thead>
                <tr className="bg-sunken text-muted">
                  <th scope="col" className={TH}>
                    번호
                  </th>
                  <th scope="col" className={TH}>
                    가구
                  </th>
                  <th scope="col" className={TH}>
                    가로 × 깊이 × 높이 (cm)
                  </th>
                  <th scope="col" className={TH}>
                    보유
                  </th>
                </tr>
              </thead>
              <tbody>
                {room.furniture.map((item, index) => (
                  <tr key={item.id} className={ROW}>
                    <td className={TD}>{index + 1}</td>
                    <th scope="row" className="px-2 py-1.5 font-medium text-ink">
                      {item.name}
                    </th>
                    <td className={TD}>
                      {item.widthCm} × {item.depthCm} × {item.heightCm}
                    </td>
                    <td className={TD}>{item.owned ? '이미 있어요' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBox>
        )}
      </Section>

      <Section title="비용">
        <dl className="card break-inside-avoid space-y-1.5 p-3 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">살 가구 합계 ({summary.buyCount}개)</dt>
            <dd className="font-semibold text-ink tabular-nums">{formatKrw(summary.totalKrw)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">보유해서 뺀 금액 ({summary.ownedCount}개)</dt>
            <dd className="text-ink tabular-nums">{formatKrw(summary.ownedExcludedKrw)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">예산</dt>
            <dd className="text-ink tabular-nums">{hasBudget ? formatKrw(summary.budgetKrw) : '정하지 않았어요'}</dd>
          </div>
          {hasBudget ? (
            <div className="flex justify-between gap-3 border-t border-line pt-1.5">
              <dt className={summary.overBudget ? 'font-semibold text-danger' : 'text-muted'}>
                {summary.overBudget ? '초과 금액' : '남는 금액'}
              </dt>
              <dd className={`font-semibold tabular-nums ${summary.overBudget ? 'text-danger' : 'text-ink'}`}>
                {formatKrw(Math.abs(summary.remainingKrw))}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="hint">가구 가격은 {NOTICES.price}이에요. 직접 넣은 가격은 그대로 썼어요.</p>
      </Section>
    </article>
  )
}

/** 색 견본. 인쇄할 때도 색이 찍히게 한다 */
function Swatch({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden="true"
      data-report-swatch=""
      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-line-strong align-middle"
      style={{ backgroundColor: hex, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    />
  )
}

/** 업체·시공용 사양서 */
export function ContractorSpecDocument() {
  const room = useActiveRoom()
  const spec = buildContractorSpec(room)

  return (
    <article className="space-y-5">
      <DocumentTitle kind="contractor" roomName={room.name} />

      <Section title="방 치수">
        <TableBox label="방 치수표">
          <table className={TABLE}>
            <thead>
              <tr className="bg-sunken text-muted">
                <th scope="col" className={TH}>
                  항목
                </th>
                <th scope="col" className={TH}>
                  cm
                </th>
                <th scope="col" className={TH}>
                  m
                </th>
              </tr>
            </thead>
            <tbody>
              {spec.dimensions.map((row) => (
                <tr key={row.label} className={ROW}>
                  <th scope="row" className="px-2 py-1.5 font-medium text-ink">
                    {row.label}
                  </th>
                  <td className={TD}>{row.cm}</td>
                  <td className={TD}>{row.m.toFixed(2)}</td>
                </tr>
              ))}
              <tr className={ROW}>
                <th scope="row" className="px-2 py-1.5 font-medium text-ink">
                  바닥 넓이
                </th>
                <td className={TD} colSpan={2}>
                  {spec.areaM2.toFixed(2)}㎡
                </td>
              </tr>
            </tbody>
          </table>
        </TableBox>
      </Section>

      <Section title={`문·창문 ${spec.openings.length}개`}>
        {spec.openings.length === 0 ? (
          <p className="hint">문이나 창문이 아직 없어요.</p>
        ) : (
          <TableBox label="문·창문 표">
            <table className={TABLE}>
              <thead>
                <tr className="bg-sunken text-muted">
                  {OPENING_COLUMNS.map((column) => (
                    <th key={column} scope="col" className={TH}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.openings.map((row) => (
                  <tr key={row.id} className={ROW}>
                    {openingCells(row).map((text, index) => (
                      <td key={index} className={TD}>
                        {text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-2 py-1.5 text-[12px] text-muted">
              위치는 위·아래 벽이면 왼쪽 끝에서, 왼·오른쪽 벽이면 위쪽 끝에서 잰 거리예요.
            </p>
          </TableBox>
        )}
      </Section>

      <Section title={`가구 ${spec.furniture.length}개`}>
        {spec.furniture.length === 0 ? (
          <p className="hint">아직 놓인 가구가 없어요.</p>
        ) : (
          <TableBox label="가구 표">
            <table className={TABLE}>
              <thead>
                <tr className="bg-sunken text-muted">
                  {FURNITURE_COLUMNS.map((column) => (
                    <th key={column} scope="col" className={TH}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.furniture.map((row) => (
                  <tr key={row.id} className={ROW}>
                    {furnitureCells(row).map((text, index) =>
                      index === 1 ? (
                        <th key={index} scope="row" className="px-2 py-1.5 font-medium whitespace-nowrap text-ink">
                          {text}
                        </th>
                      ) : (
                        <td key={index} className={TD}>
                          {text}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBox>
        )}
        <p className="hint">{spec.coordinateNote}</p>
      </Section>

      <Section title="마감재">
        <TableBox label="마감재 표">
          <table className={TABLE}>
            <thead>
              <tr className="bg-sunken text-muted">
                <th scope="col" className={TH}>
                  항목
                </th>
                <th scope="col" className={TH}>
                  내용
                </th>
                <th scope="col" className={TH}>
                  색 코드
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className={ROW}>
                <th scope="row" className="px-2 py-1.5 font-medium text-ink">
                  스타일
                </th>
                <td className={TD} colSpan={2}>
                  {spec.styleName}
                </td>
              </tr>
              {spec.palette.map((row) => (
                <tr key={row.label} className={ROW}>
                  <th scope="row" className="px-2 py-1.5 font-medium whitespace-nowrap text-ink">
                    {row.label}
                  </th>
                  <td className={TD}>{row.value}</td>
                  <td className={TD}>
                    {row.hex ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch hex={row.hex} />
                        {row.hex.toUpperCase()}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Section>

      <Section title="평면도 (치수선)">
        <PlanFigure room={room} showDimensions className="mx-auto w-full max-w-[560px] break-inside-avoid print:max-w-[440px]" />
        <p className="hint">3D 그림은 준비 중이에요.</p>
      </Section>
    </article>
  )
}

export function ReportDocument({ kind }: { kind: ReportKind }) {
  return kind === 'family' ? <FamilyReport /> : <ContractorSpecDocument />
}

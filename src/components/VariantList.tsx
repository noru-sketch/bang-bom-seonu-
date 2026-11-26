// 테마 배치안 목록. 순위나 평가 없이 특징 이름과 한 줄 설명, 작은 평면도로 고르게 한다.
// 휴대폰 시트에서는 카드 전체가 누르는 자리다(누르면 적용). 글이 좁은 칸에서 여러 줄로 늘어지지 않게 단추를 따로 두지 않는다.
import { actions, useActiveRoom } from '../state/store.ts'
import RoomThumbnail from './panels/RoomThumbnail.tsx'
import { useInSheet } from './sheetContext.ts'

export default function VariantList() {
  const room = useActiveRoom()
  const variants = room.variants
  const inSheet = useInSheet()

  return (
    <section aria-label="배치안" className="space-y-3">
      <div className={`flex items-baseline justify-between gap-2 ${inSheet ? 'sr-only' : ''}`}>
        <h2 className="panel-title">배치안</h2>
        {variants.length > 0 ? <span className="hint">{variants.length}가지</span> : null}
      </div>

      {variants.length === 0 ? (
        <p className="hint">
          {room.furniture.length === 0
            ? '가구를 추가하면 배치안을 보여 드려요.'
            : '아직 배치안이 없어요. [전체 다시 추천]을 누르면 만들어 드려요.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {variants.map((variant) => {
            const active = variant.id === room.activeVariantId
            const missing = variant.unplacedIds.length

            if (inSheet) {
              const body = (
                <>
                  <RoomThumbnail
                    room={room}
                    placements={variant.placements}
                    unplacedIds={variant.unplacedIds}
                    label={`${variant.title} 평면도`}
                    className="h-16 w-16 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[15px] leading-snug font-semibold text-ink">{variant.title}</span>
                      {active ? <span className="chip chip-accent">적용됨</span> : null}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{variant.summary}</span>
                    {missing > 0 ? (
                      <span className="block text-[13px] leading-relaxed text-tip">자리를 찾지 못한 가구 {missing}개</span>
                    ) : null}
                  </span>
                </>
              )
              return (
                <li key={variant.id} aria-current={active ? 'true' : undefined} className={`card overflow-hidden ${active ? 'border-accent' : ''}`}>
                  {active ? (
                    <div className="flex items-center gap-3 p-3">{body}</div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-3 p-3 text-left"
                      aria-label={`${variant.title} 적용`}
                      onClick={() => actions.applyVariant(variant.id)}
                    >
                      {body}
                    </button>
                  )}
                </li>
              )
            }

            return (
              <li
                key={variant.id}
                aria-current={active ? 'true' : undefined}
                className={`card flex gap-3 p-3 ${active ? 'border-accent' : ''}`}
              >
                <RoomThumbnail
                  room={room}
                  placements={variant.placements}
                  unplacedIds={variant.unplacedIds}
                  label={`${variant.title} 평면도`}
                  className="h-20 w-20 shrink-0"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="text-sm leading-snug font-semibold text-ink">{variant.title}</h3>
                  <p className="text-[12px] leading-relaxed text-muted">{variant.summary}</p>
                  {missing > 0 ? (
                    <p className="text-[12px] leading-relaxed text-tip">자리를 찾지 못한 가구 {missing}개</p>
                  ) : null}
                  <div className="mt-1 flex min-h-9 items-center">
                    {active ? (
                      <span className="chip chip-accent">적용됨</span>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        aria-label={`${variant.title} 적용`}
                        onClick={() => actions.applyVariant(variant.id)}
                      >
                        적용
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

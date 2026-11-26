// 배치 패널: [전체 다시 추천]과 테마 배치안 목록.
// PC(1024px 이상)에서는 오른쪽 열에 배치안 목록이 늘 있으므로 여기서는 좁은 화면에서만 목록을 보여 준다.
// 휴대폰 시트에서는 [전체 다시 추천]을 시트 머리줄에 두어 목록을 내려도 늘 누를 수 있게 한다.
import { actions, useActiveRoom } from '../../state/store.ts'
import { SheetHeaderSlot } from '../sheet.tsx'
import { useInSheet } from '../sheetContext.ts'
import VariantList from '../VariantList.tsx'

export default function LayoutPanel() {
  const room = useActiveRoom()
  const hasFurniture = room.furniture.length > 0
  const inSheet = useInSheet()

  if (inSheet) {
    return (
      <div className="space-y-3">
        <h2 className="panel-title sr-only">배치</h2>
        {hasFurniture ? (
          <>
            <SheetHeaderSlot>
              <div className="flex items-center gap-2 pl-4">
                <p className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                  {room.variants.length > 0 ? `배치안 ${room.variants.length}가지` : '배치안'}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => actions.regenerateVariants()}>
                  전체 다시 추천
                </button>
              </div>
            </SheetHeaderSlot>
            <p className="hint">
              배치안을 누르면 바로 적용돼요. [전체 다시 추천]은 모든 가구를 처음부터 다시 놓아요. 실행취소로 되돌릴 수 있어요.
            </p>
            <VariantList />
          </>
        ) : (
          <>
            <p className="hint">아직 놓인 가구가 없어요. 가구를 먼저 추가하면 배치를 추천해 드려요.</p>
            <button type="button" className="btn" onClick={() => actions.setCategory('furniture')}>
              가구 추가하러 가기
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h2 className="panel-title">배치</h2>
        {hasFurniture ? (
          <>
            <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => actions.regenerateVariants()}>
              전체 다시 추천
            </button>
            <p className="hint">
              모든 가구를 처음부터 다시 놓아요. 가구를 추가할 때는 지금 배치를 그대로 두고 빈 자리에만 놓아요. 마음에
              들지 않으면 실행취소로 되돌릴 수 있어요.
            </p>
          </>
        ) : (
          <>
            <p className="hint">아직 놓인 가구가 없어요. 가구를 먼저 추가하면 배치를 추천해 드려요.</p>
            <button type="button" className="btn" onClick={() => actions.setCategory('furniture')}>
              가구 추가하러 가기
            </button>
          </>
        )}
      </div>

      {hasFurniture ? (
        <>
          <p className="hint hidden lg:block">배치안은 오른쪽 목록에서 골라요.</p>
          <div className="space-y-5 lg:hidden">
            <div className="divider" />
            <VariantList />
          </div>
        </>
      ) : null}
    </div>
  )
}

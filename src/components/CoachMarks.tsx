// 첫 방문 도움말 3단계(방 → 가구 → 이동). 닫으면 기기에 기억해서 다시 나오지 않는다.
// PC: 평면도·3D 버튼을 가리지 않도록 헤더와 무대 사이의 얇은 띠로 보여 준다(무대를 아래로 민다).
// 휴대폰: 평면도 자리를 줄이지 않도록 아래 시트 안(칩 줄 바로 아래)에 보여 준다. 방봄 "집 보기" 안의 휴대폰 화면에서는 띄우지 않는다.
import { useState } from 'react'
import { loadJson, saveJson } from '../lib/storage.ts'
import { actions } from '../state/store.ts'
import type { CategoryKey } from '../state/store.ts'
import Icon from './Icon.tsx'
import { useInSheet } from './sheetContext.ts'

const DONE_KEY = 'onboardingDone'

const STEPS: { title: string; text: string; touchText?: string; category: CategoryKey | null }[] = [
  { title: '방', text: '방 메뉴에서 크기와 문, 창문 위치를 맞춰요.', category: 'room' },
  { title: '가구', text: '가구 메뉴에서 필요한 가구를 골라 넣어요. 빈 자리에 알아서 놓여요.', category: 'furniture' },
  {
    title: '이동',
    text: '평면도에서 가구를 끌어 옮기고, 선택한 뒤 R 키나 회전 버튼으로 돌려요.',
    touchText: '평면도에서 가구를 끌어 옮기고, 누른 뒤 회전 버튼으로 돌려요.',
    category: null,
  },
]

export default function CoachMarks() {
  // 주소에 tips=0 이 있으면 띄우지 않는다 (자동 검사가 처음 온 기기로 열 때)
  const [visible, setVisible] = useState(() => !/[?&]tips=0(&|$)/.test(location.search) && loadJson<boolean>(DONE_KEY) !== true)
  const [index, setIndex] = useState(0)
  const inSheet = useInSheet()

  if (!visible) return null

  function close(): void {
    saveJson(DONE_KEY, true)
    setVisible(false)
  }

  function next(): void {
    const following = STEPS[index + 1]
    if (!following) {
      close()
      return
    }
    // 다음 단계가 가리키는 메뉴를 같이 열어 준다
    if (following.category) actions.setCategory(following.category)
    setIndex(index + 1)
  }

  const step = STEPS[index]
  const last = index === STEPS.length - 1

  return (
    <aside
      aria-label="처음 쓰는 분을 위한 도움말"
      className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 max-lg:border-t max-lg:pr-1 max-lg:pl-4"
    >
      <span className="chip chip-accent shrink-0">
        {index + 1} / {STEPS.length}
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink max-lg:text-sm" aria-live="polite">
        <span className="font-semibold">{step.title}</span> · {inSheet && step.touchText ? step.touchText : step.text}
      </p>
      <button type="button" className="btn btn-sm h-9 shrink-0 max-lg:h-11" onClick={next}>
        {last ? '알겠어요' : '다음'}
      </button>
      <button
        type="button"
        className="btn btn-quiet -mr-1.5 w-9 shrink-0 px-0 max-lg:mr-0 max-lg:w-11"
        aria-label="도움말 닫기"
        onClick={close}
      >
        <Icon name="close" size={18} />
      </button>
    </aside>
  )
}

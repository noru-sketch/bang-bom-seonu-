// 휴대폰 틀(아래 시트)과 패널이 주고받는 약속. 부품은 sheet.tsx 에 있다.
// 패널은 useInSheet()로 "지금 휴대폰 시트 안인지"를 알고, 긴 내용을 칩으로 나눠 한 번에 한 항목만 보여 준다.
import { createContext, useContext } from 'react'

export interface SheetInfo {
  /** 시트 머리줄에서 칩이 들어갈 자리. 아직 그려지기 전이면 null */
  slot: HTMLElement | null
  /** 시트 내용을 맨 위로 올린다 (칩으로 항목을 바꿨을 때) */
  resetScroll: () => void
}

export const SheetContext = createContext<SheetInfo | null>(null)

/** 휴대폰 틀(화면 너비 1024px 미만) 안에서 그려지는 중인지. PC 틀에서는 false */
export function useInSheet(): boolean {
  return useContext(SheetContext) !== null
}

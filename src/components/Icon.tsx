// 가는 선 아이콘 모음. 글자 색(currentColor)을 따라가고, 화면 읽기 프로그램에는 숨긴다.
import type { ReactNode } from 'react'

export type IconName =
  | 'room'
  | 'style'
  | 'furniture'
  | 'layout'
  | 'cost'
  | 'report'
  | 'reset'
  | 'undo'
  | 'redo'
  | 'share'
  | 'download'
  | 'link'
  | 'close'
  | 'plus'
  | 'trash'
  | 'feedback'
  | 'more'
  | 'chevronUp'

const PATHS: Record<IconName, ReactNode> = {
  room: (
    <>
      <path d="M10 20H4V4h16v16h-5" />
      <path d="M4 11h7" />
      <path d="M15 20v-5" />
    </>
  ),
  style: (
    <>
      <path d="M12 3.5c3 3.6 5.5 6.3 5.5 9.5a5.5 5.5 0 0 1-11 0c0-3.2 2.5-5.9 5.5-9.5z" />
      <path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5" />
    </>
  ),
  furniture: (
    <>
      <path d="M5.5 11V8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3" />
      <path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" />
      <path d="M6 18v2M18 18v2" />
    </>
  ),
  layout: (
    <>
      <rect x="4" y="4" width="7" height="9" rx="1" />
      <rect x="14" y="4" width="6" height="5" rx="1" />
      <rect x="14" y="12" width="6" height="8" rx="1" />
      <rect x="4" y="16" width="7" height="4" rx="1" />
    </>
  ),
  cost: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 9l1.6 6L12 9.5l2.4 5.5L16 9" />
      <path d="M7.5 12h9" />
    </>
  ),
  report: (
    <>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M10 12h5M10 15.5h5" />
    </>
  ),
  reset: (
    <>
      <path d="M5 12a7 7 0 1 0 2.2-5.1" />
      <path d="M7.2 3.4v3.5H3.7" />
    </>
  ),
  undo: (
    <>
      <path d="M8 5L4 9l4 4" />
      <path d="M4 9h10a5 5 0 0 1 0 10h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M16 5l4 4-4 4" />
      <path d="M20 9H10a5 5 0 0 0 0 10h3" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M8 11.5l4 4 4-4" />
      <path d="M5 19.5h14" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M10 7V4.5h4V7" />
      <path d="M7 7l.8 12.5h8.4L17 7" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </>
  ),
  feedback: (
    <>
      <path d="M4.5 5.5h15v11h-8l-4 3.5v-3.5h-3z" />
      <path d="M8.5 9.5h7M8.500 12.500h4.500" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="18.5" cy="12" r="1.25" />
    </>
  ),
  chevronUp: <path d="M6 14.5l6-6 6 6" />,
}

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  )
}

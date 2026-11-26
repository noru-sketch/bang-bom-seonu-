// 왼쪽 레일과 아래 탭 바가 같이 쓰는 카테고리 6개. 순서는 고정이다 (docs/ARCHITECTURE.md 6장).
import type { CategoryKey } from '../state/store.ts'
import type { IconName } from './Icon.tsx'

export interface CategoryInfo {
  key: CategoryKey
  label: string
  icon: IconName
}

export const CATEGORIES: CategoryInfo[] = [
  { key: 'room', label: '방', icon: 'room' },
  { key: 'style', label: '스타일', icon: 'style' },
  { key: 'furniture', label: '가구', icon: 'furniture' },
  { key: 'layout', label: '배치', icon: 'layout' },
  { key: 'cost', label: '비용', icon: 'cost' },
  { key: 'report', label: '리포트', icon: 'report' },
]

export function categoryLabel(key: CategoryKey): string {
  return CATEGORIES.find((entry) => entry.key === key)?.label ?? ''
}

// 화면과 계산이 함께 쓰는 이름과 고지 문구. 문구는 CLAUDE.md 2장 6번, SPEC, SCHEMA의 글자를 그대로 쓴다.

/** @import { FurnitureCategory, Lifestyle, ThemeKey, Wall, WindowDirection, FurnitureMaterial, FloorMaterial } from '../types/schema.ts' */

/** @type {Record<FurnitureCategory, string>} */
export const CATEGORY_LABELS = {
  bed: '침대',
  desk: '책상',
  chair: '의자',
  wardrobe: '옷장',
  bookshelf: '책장',
  drawer: '서랍장',
  sofa: '소파',
  table: '테이블',
  tv_stand: 'TV장',
  mat: '매트',
  other: '기타',
}

/** @type {Record<Lifestyle, string>} */
export const LIFESTYLE_LABELS = {
  single: '1인 자취방',
  couple: '신혼집',
  family_child: '영유아 가족',
  wfh: '재택근무',
  pet: '반려동물',
}

/** @type {Record<Wall, string>} */
export const WALL_LABELS = { top: '위쪽 벽', bottom: '아래쪽 벽', left: '왼쪽 벽', right: '오른쪽 벽' }

/** @type {Record<WindowDirection, string>} */
export const DIRECTION_LABELS = { south: '남향', east: '동향', west: '서향', north: '북향' }

/** @type {Record<FurnitureMaterial, string>} */
export const MATERIAL_LABELS = { wood: '나무', fabric: '패브릭', metal: '금속', white_matte: '무광 화이트', glass: '유리' }

/** @type {Record<FloorMaterial, string>} */
export const FLOOR_LABELS = {
  oak_wood: '오크 마루',
  walnut_wood: '월넛 마루',
  tile_gray: '그레이 타일',
  linoleum_light: '밝은 장판',
}

/**
 * 테마 배치안 5종 (SPEC 2.3). 점수 순위가 아니라 특징 이름으로 고른다.
 * @type {{ themeKey: ThemeKey, id: string, title: string, summary: string }[]}
 */
export const THEMES = [
  { themeKey: 'open_space', id: 'var_open', title: '넓게 비운 개방형', summary: '큰 가구를 벽 쪽으로 정리해 방 가운데를 넓게 비웠어요.' },
  { themeKey: 'zone_split', id: 'var_zone', title: '침대로 구역 나눈 분리형', summary: '자는 곳과 일하는 곳이 나뉘게 침대와 다른 가구를 떨어뜨려 놓았어요.' },
  { themeKey: 'window_desk', id: 'var_window', title: '창가 집중 워크스페이스형', summary: '햇빛이 드는 창가에 책상을 두었어요.' },
  { themeKey: 'max_storage', id: 'var_storage', title: '수납 극대화형', summary: '수납 가구를 한쪽 벽에 모아 정리하기 편하게 했어요.' },
  { themeKey: 'compact', id: 'var_compact', title: '콤팩트 원룸형', summary: '좁은 방에서도 다니기 편하게 가구를 한쪽으로 모았어요.' },
]

/**
 * 3D에서 보는 방식 이름. off는 밖에서 둘러보기, adult·child는 방 안에 서서 보는 눈높이 보기.
 * @type {Record<'off' | 'adult' | 'child', string>}
 */
export const EYE_MODE_LABELS = { off: '둘러보기', adult: '어른 눈높이', child: '아이 눈높이' }

const CHILD_SAFETY_NOTICE = '참고용 안전 체크'

/** 정직한 고지 문구. 화면과 API 응답에서 이 값을 그대로 쓴다. */
export const NOTICES = {
  price: '시연용 예상 가격',
  reference: '참고값 (법적·안전 기준 아님)',
  childSafety: CHILD_SAFETY_NOTICE,
  /** 아이 눈높이 보기의 빨간 점 설명 (3D 화면에 reference와 함께 보여 준다) */
  eyeCorners: `빨간 점: 아이 얼굴 높이의 모서리 · ${CHILD_SAFETY_NOTICE}`,
  aiImageBadge: 'AI 연출 이미지·치수 참고용',
  aiImageDisclaimer: 'AI 연출 이미지 (실제 치수와 다를 수 있음)',
  aiEstimate: 'AI 추정값으로 치수·가격 수정 가능',
  aiStyle: 'AI가 제안한 색이에요. 직접 고칠 수 있어요',
  floorplan: '어림값이므로 실제 치수를 확인해 주세요',
  fallback: '규칙으로 만든 기본 답이에요 (AI 연결 안 됨)',
}

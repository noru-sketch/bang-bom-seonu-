// 기본 가구 카탈로그. 크기와 가격은 흔한 국내 보급형 제품을 어림한 시연용 값이다(쇼핑몰 자료를 쓰지 않는다).
// 줄 = [key, 이름, 분류, 가로, 깊이, 높이, 정면 여유, 뾰족한 모서리, 색, 재질, 예상 가격, 찾는 낱말]

/** @import { CatalogItem, FurnitureCategory, FurnitureMaterial } from '../types/schema.ts' */

/** @type {[string, string, FurnitureCategory, number, number, number, number, boolean, string, FurnitureMaterial, number, string][]} */
const ROWS = [
  ['bed_single', '싱글 침대', 'bed', 100, 200, 45, 0, false, '#E8DFD5', 'fabric', 250000, '싱글|single'],
  ['bed_super_single', '슈퍼싱글 침대', 'bed', 110, 200, 45, 0, false, '#E8DFD5', 'fabric', 320000, '슈퍼싱글|슈퍼 싱글|ss침대|침대|베드|매트리스|bed'],
  ['bed_queen', '퀸 침대', 'bed', 150, 200, 45, 0, false, '#E3DCD2', 'fabric', 450000, '퀸|queen|더블|퀸사이즈|퀸 사이즈'],
  ['desk_1200', '1200 책상', 'desk', 120, 60, 72, 60, true, '#C9A77C', 'wood', 90000, '책상|데스크|desk|1200 책상|책상 1200'],
  ['desk_1400', '1400 책상', 'desk', 140, 70, 72, 60, true, '#C9A77C', 'wood', 120000, '1400 책상|책상 1400|큰 책상|컴퓨터 책상'],
  ['chair_desk', '책상 의자', 'chair', 50, 50, 85, 0, false, '#6E7B85', 'fabric', 60000, '의자|체어|chair'],
  ['wardrobe_800', '800 옷장', 'wardrobe', 80, 60, 200, 50, false, '#F2EFE9', 'white_matte', 150000, '옷장|장롱|장농|wardrobe|800 옷장|옷장 800'],
  ['wardrobe_1200', '1200 옷장', 'wardrobe', 120, 60, 200, 50, false, '#F2EFE9', 'white_matte', 260000, '1200 옷장|옷장 1200|큰 옷장|붙박이장'],
  ['bookshelf_800', '800 책장', 'bookshelf', 80, 30, 180, 0, false, '#C9A77C', 'wood', 70000, '책장|책꽂이|선반|bookshelf'],
  ['drawer_chest', '서랍장', 'drawer', 80, 45, 85, 50, true, '#EDE8E0', 'white_matte', 100000, '서랍장|서랍|수납장|체스트|drawer'],
  ['nightstand', '협탁', 'drawer', 45, 40, 50, 50, true, '#D8C3A5', 'wood', 40000, '협탁|사이드 테이블|사이드테이블|nightstand'],
  ['sofa_2', '2인 소파', 'sofa', 150, 80, 80, 0, false, '#B8B3A8', 'fabric', 300000, '소파|쇼파|카우치|sofa'],
  ['table_dining', '2인 식탁', 'table', 80, 60, 73, 60, true, '#D2B48C', 'wood', 90000, '식탁|테이블|탁자|table'],
  ['tv_stand', 'TV장', 'tv_stand', 120, 40, 45, 0, true, '#BFA98A', 'wood', 90000, 'tv장|tv 장|티비장|거실장|tv다이|티비 다이|tv'],
  ['play_mat', '놀이 매트', 'mat', 140, 200, 4, 0, false, '#DCE6E2', 'fabric', 70000, '매트|놀이매트|놀이 매트|러그|카펫|mat'],
  ['vanity', '화장대', 'table', 80, 40, 75, 60, true, '#EFE9E1', 'white_matte', 110000, '화장대|vanity'],
  ['shoe_cabinet', '신발장', 'drawer', 80, 35, 110, 50, true, '#EAE5DC', 'white_matte', 70000, '신발장|슈즈랙|신발 정리대'],
  ['cat_tower', '캣타워', 'other', 60, 60, 150, 0, false, '#D9CDBA', 'fabric', 80000, '캣타워|캣 타워|캣폴|고양이 타워'],
]

/** @type {CatalogItem[]} */
export const CATALOG = ROWS.map(
  ([key, name, category, widthCm, depthCm, heightCm, clearanceFrontCm, hasSharpCorner, color, material, estimatedKrw, words]) => ({
    key,
    name,
    category,
    widthCm,
    depthCm,
    heightCm,
    color,
    material,
    clearanceFrontCm,
    hasSharpCorner,
    estimatedKrw,
    keywords: words.split('|'),
  }),
)

/**
 * key로 카탈로그 한 줄을 찾는다.
 * @param {string} key
 * @returns {CatalogItem | undefined}
 */
export function findCatalogItem(key) {
  return CATALOG.find((item) => item.key === key)
}

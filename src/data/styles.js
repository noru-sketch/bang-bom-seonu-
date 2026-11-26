// 스타일 프리셋. 첫 번째는 exampleProject.js의 DEFAULT_STYLE과 같다. 채도가 낮은 차분한 색만 쓴다.

/** @import { RoomStyle } from '../types/schema.ts' */

import { DEFAULT_STYLE } from './exampleProject.js'

/** @type {RoomStyle[]} */
export const STYLE_PRESETS = [
  { ...DEFAULT_STYLE },
  {
    id: 'bright_white',
    name: '화이트 모던',
    wallColor: '#FAFAF8',
    floorColor: '#E3DDD3',
    floorMaterial: 'linoleum_light',
    accentColor: '#6B7F99',
    description: '흰 벽과 밝은 바닥으로 방이 넓어 보이는 조합',
  },
  {
    id: 'natural_wood',
    name: '내추럴 우드',
    wallColor: '#F4F0E6',
    floorColor: '#C8AD86',
    floorMaterial: 'oak_wood',
    accentColor: '#7A8F6A',
    description: '밝은 나무 바닥에 초록 포인트를 더한 편안한 조합',
  },
  {
    id: 'midcentury_walnut',
    name: '미드센추리 월넛',
    wallColor: '#F1ECE2',
    floorColor: '#8A6A4F',
    floorMaterial: 'walnut_wood',
    accentColor: '#B07A4A',
    description: '짙은 월넛 바닥과 따뜻한 벽면의 차분한 조합',
  },
  {
    id: 'calm_gray',
    name: '차분한 그레이',
    wallColor: '#F0F0EE',
    floorColor: '#B9BCBE',
    floorMaterial: 'tile_gray',
    accentColor: '#5E6B78',
    description: '회색 타일 바닥과 밝은 회색 벽의 깔끔한 조합',
  },
  {
    id: 'soft_beige',
    name: '소프트 베이지',
    wallColor: '#F6EFE6',
    floorColor: '#DCCBB5',
    floorMaterial: 'linoleum_light',
    accentColor: '#A8876B',
    description: '베이지 톤으로 맞춘 부드럽고 포근한 조합',
  },
]

/**
 * 분위기 글에서 프리셋을 고를 때 쓰는 낱말. 키는 STYLE_PRESETS의 id.
 * @type {Record<string, string[]>}
 */
export const STYLE_KEYWORDS = {
  warm_minimal: ['미니멀', '웜', '따뜻', '아이보리', '심플', 'minimal', 'warm'],
  bright_white: ['화이트', '흰', '하얀', '모던', '밝', '깨끗', '깔끔', 'white', 'modern'],
  natural_wood: ['내추럴', '우드', '원목', '나무', '식물', '초록', '자연', '북유럽', 'natural', 'wood'],
  midcentury_walnut: ['미드센추리', '월넛', '빈티지', '레트로', '짙은', '어두운', '브라운', 'walnut', 'vintage'],
  calm_gray: ['그레이', '회색', '타일', '시크', '인더스트리얼', '차분', '도시', 'gray', 'grey'],
  soft_beige: ['베이지', '포근', '부드러', '아늑', '코지', '크림', 'beige', 'cozy'],
}

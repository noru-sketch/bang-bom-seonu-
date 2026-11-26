# SCHEMA.md — 방꾸미 2.0 공통 데이터 규약 (JSON Contract)

UI, 2D SVG 에디터, 배치/검증 엔진(`src/engine/*`), 3D PBR 뷰어(`src/canvas3d/*`), Vercel AI 서버(`/api/*`)는 모두 아래 JSON 스키마를 단일 진실 공급원(Single Source of Truth)으로 사용합니다.
모든 길이 단위는 **센티미터(cm)**, 각도는 **도(degree: 0, 90, 180, 270)**, 금액은 **원(KRW)**으로 통일합니다.

---

## 1. 최상위 프로젝트 상태 (`ProjectState`)
```json
{
  "version": "2.0.0",
  "activeRoomId": "room_1",
  "profile": {
    "lifestyle": "single", // "single" | "couple" | "family_child" | "wfh" | "pet"
    "budgetKrw": 1500000
  },
  "rooms": [ /* Room[] */ ],
  "updatedAt": "2026-11-26T09:00:00Z"
}
```

---

## 2. 방 데이터 (`Room`)
```json
{
  "id": "room_1",
  "name": "내 원룸",
  "widthCm": 300,
  "depthCm": 400,
  "heightCm": 240,
  "windowDirection": "south", // "south" | "east" | "west" | "north"
  "openings": [
    {
      "id": "op_door_1",
      "type": "door",         // "door" | "window"
      "wall": "bottom",       // "top" | "bottom" | "left" | "right"
      "offsetCm": 20,         // 벽의 왼쪽/위쪽 끝으로부터의 거리
      "widthCm": 90,
      "sillHeightCm": 0,      // 창문 하단 높이 (문은 0, 창문은 기본 90)
      "swingInward": true     // 실내 쪽으로 열리는지 여부
    },
    {
      "id": "op_win_1",
      "type": "window",
      "wall": "top",
      "offsetCm": 80,
      "widthCm": 150,
      "sillHeightCm": 90,
      "swingInward": false
    }
  ],
  "style": {
    "id": "warm_minimal",
    "name": "웜 미니멀",
    "wallColor": "#F7F5F0",
    "floorColor": "#D9C3A3",
    "floorMaterial": "oak_wood", // "oak_wood" | "walnut_wood" | "tile_gray" | "linoleum_light"
    "accentColor": "#5B7C99",
    "description": "따뜻한 우드 바닥과 아이보리 벽면 조합"
  },
  "furniture": [ /* FurnitureItem[] */ ],
  "activeVariantId": "var_open",
  "variants": [ /* LayoutVariant[] */ ]
}
```

---

## 3. 가구 아이템 (`FurnitureItem`)
```json
{
  "id": "furn_bed_1",
  "name": "슈퍼싱글 수납 침대",
  "category": "bed", // "bed" | "desk" | "chair" | "wardrobe" | "bookshelf" | "drawer" | "sofa" | "table" | "tv_stand" | "mat" | "other"
  "widthCm": 115,
  "depthCm": 205,
  "heightCm": 45,
  "xCm": 185,        // 방 좌측 상단(0,0) 기준 배치 X 좌표
  "yCm": 0,          // 방 좌측 상단(0,0) 기준 배치 Y 좌표
  "rotation": 0,     // 0 | 90 | 180 | 270
  "color": "#E8DFD5",
  "material": "fabric", // "wood" | "fabric" | "metal" | "white_matte" | "glass"
  "owned": false,    // true이면 "이미 있어요" (예산 합계에서 제외)
  "clearanceFrontCm": 50, // 서랍/문/의자 등 정면 필요 공간 (없으면 0)
  "hasSharpCorner": false, // 아이 안전 검사 참고용
  "price": {
    "estimatedKrw": 350000,
    "manualKrw": null,    // 사용자가 직접 입력한 값 (최우선)
    "source": "estimated" // "manual" | "catalog" | "estimated"
  },
  "locked": false    // 사용자가 수동 이동한 가구 보호 플래그
}
```

---

## 4. 취향별 테마 배치안 (`LayoutVariant`)
```json
{
  "id": "var_open",
  "themeKey": "open_space", // "open_space" | "zone_split" | "window_desk" | "max_storage" | "compact"
  "title": "넓게 비운 개방형",
  "summary": "큰 가구를 벽면으로 정돈해 방 중앙 활동 공간을 최대로 확보했습니다.",
  "placements": [
    { "furnitureId": "furn_bed_1", "xCm": 185, "yCm": 0, "rotation": 0 }
  ],
  "unplacedIds": []
}
```

---

## 5. 3단계 전문가 피드백 (`ValidationResult`)
**주의: 100점 점수 필드는 존재하지 않는다.**
```json
{
  "errors": [
    {
      "code": "OVERLAP", // "OVERLAP" | "OUT_OF_BOUNDS" | "DOOR_BLOCKED" | "NO_ACCESS" | "CLEARANCE_BLOCKED" | "WINDOW_BLOCKED"
      "severity": "error",
      "furnitureIds": ["furn_bed_1", "furn_desk_1"],
      "title": "가구 겹침",
      "message": "슈퍼싱글 침대와 1200 책상이 15cm 겹쳐 있습니다."
    }
  ],
  "tips": [
    {
      "code": "DEAD_SPACE_GAP", // "DOOR_BED_SIGHTLINE" | "BED_UNDER_WINDOW" | "BED_DESK_ADJACENT" | "DEAD_SPACE_GAP" | "NARROW_PASSAGE" | "CHILD_TIP_RISK" | "CHILD_WINDOW_CLIMB" | "CHILD_SHARP_CORNER"
      "severity": "tip",
      "category": "interior", // "interior" | "child_safety"
      "furnitureIds": ["furn_wardrobe_1", "furn_bookshelf_1"],
      "title": "가구 사이 28cm 애매한 틈",
      "message": "옷장과 책장 사이에 28cm 틈이 남습니다. 딱 붙여 쓰거나 좁은 틈새 선반을 두면 공간을 아낄 수 있습니다.",
      "isReferenceValue": true
    }
  ],
  "strengths": [
    "책상이 창가에 배치되어 자연광을 활용하기 좋습니다.",
    "방문에서 침대가 바로 보이지 않아 아늑한 동선입니다."
  ],
  "matZone": {
    "xCm": 40,
    "yCm": 140,
    "widthCm": 140,
    "depthCm": 180
  }
}
```

---

## 6. Vercel Serverless API 입출력 규약 (`/api/*`)

### 6.1 `POST /api/advice` (3단계 피드백 자연어 해설)
- **Request:** `{ room, validationResult, lifestyle }`
- **Response:** `{ summary: string, highlights: string[], improvements: string[], isFallback: boolean }`

### 6.2 `POST /api/furniture` (자연어·사진·링크 가구 추정)
- **Request:** `{ text?: string, imageBase64?: string, url?: string }`
- **Response:** `{ items: Partial<FurnitureItem>[], note: "AI 추정값으로 치수·가격 수정 가능", isFallback: boolean }`

### 6.3 `POST /api/floorplan` (평면도 사진 인식)
- **Request:** `{ imageBase64: string, areaPyeong?: number }`
- **Response:** `{ widthCm: number, depthCm: number, openings: Opening[], note: "어림값이므로 실제 치수를 확인해 주세요", isFallback: boolean }`

### 6.4 `POST /api/render-photo` (AI 포토리얼 연출 이미지)
- **Request:** `{ snapshotBase64: string, styleName: string, timeOfDay: "morning" | "noon" | "evening" | "night" }`
- **Response:** `{ imageUrlOrBase64: string, disclaimer: "AI 연출 이미지 (실제 치수와 다를 수 있음)", isFallback: boolean }`

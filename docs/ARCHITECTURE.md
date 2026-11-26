# ARCHITECTURE.md — 방꾸미 2.0 구조와 모듈 계약

여러 작업이 동시에 만들어도 서로 맞물리도록 정한 약속이다. **여기 적힌 파일 이름, 함수 이름, 인자, 반환값은 바꾸지 않는다.**
바꿔야 하면 바꾸지 말고 보고서의 `deviations`에 적는다. 기능 요구는 `SPEC.md`, 자료 모양은 `SCHEMA.md`와 `src/types/schema.ts`가 기준이다.

## 1. 폴더와 언어

```text
api/*.js            Vercel 서버 함수 (순수 ESM JS). 파일 하나 = 주소 하나 (/api/advice 등)
server/*.js         서버 함수들이 같이 쓰는 도우미 (http, ai). 브라우저 코드에서 가져오지 않는다
src/types/schema.ts SCHEMA.md를 옮긴 타입 (이미 있음)
src/data/*.js       기본 자료 (labels.js·exampleProject.js 는 이미 있음, catalog.js·styles.js)
src/engine/*.js     순수 계산 (geometry.js 는 이미 있음, validator·layout·cost·fallback·sanitize·eyeLevel)
src/state/store.ts  앱 상태, 실행취소, 자동 저장 (이미 있음)
src/lib/*.ts        api.ts (서버 호출), storage.ts (이미 있음), embed.ts (방봄 "집 보기" 안에 끼워졌는지)
src/canvas2d/*.tsx  2D 평면도 편집기
src/canvas3d/*.tsx  3D 보기 (지연 로딩)
src/components/     화면 틀과 패널
tests/*.test.js     node --test
scripts/            dev-api-plugin.js(이미 있음), check-dist.mjs, make-report.mjs, sync-bangbom.mjs,
                    e2e-smoke.mjs(방 배치 도구 눌러 보기), e2e-bangbom.mjs(방봄 화면 눌러 보기)
bangbom/src/        방봄 화면 원본 (8장). 고친 뒤 npm run bangbom 으로 public/index.html 을 다시 만든다
```

- **화면(`src/components`, `canvas2d`, `canvas3d`, `lib`, `state`, `App.tsx`)은 TypeScript(TSX).**
- **계산·자료·서버(`src/engine`, `src/data`, `api`, `server`, `tests`, `scripts`)는 순수 ESM JavaScript + JSDoc 타입.** `npm run build`의 `tsc -b`가 JS도 검사한다(checkJs).
- JS 파일 규칙: 상대 경로 import에는 확장자를 꼭 쓴다(`./geometry.js`). 타입은 `/** @import { Room } from '../types/schema.ts' */` 로만 가져온다(실제 import 문으로 타입을 가져오면 안 된다). `src/engine`·`src/data`는 React, three, DOM, `process`, `import.meta.env`, Vite 전용 기능을 쓰지 않는다(서버와 브라우저, Node 테스트가 같은 파일을 쓴다).
- TS 파일 규칙: `enum`·`namespace` 금지(erasableSyntaxOnly), 타입은 `import type`, 상대 경로에 확장자(`.ts`/`.tsx`/`.js`)를 쓴다. `any` 금지.
- **의존성 추가 금지.** `package.json`은 고치지 않는다. 설치된 것: react 19, three 0.187(+@types/three), tailwindcss 4, @anthropic-ai/sdk, marked. 더 필요하면 보고서에 적는다.
- 주석·화면 글·테스트 이름은 한국어. 화면 글은 쉬운 존댓말("~해요").

## 2. 좌표와 회전 (모든 모듈 공통)

- 방 안쪽 왼쪽 위가 `(0, 0)`. x는 오른쪽, y는 아래쪽. 단위 cm, 좌표는 정수.
- 벽: `top`(y=0), `bottom`(y=depthCm), `left`(x=0), `right`(x=widthCm). 문·창문의 `offsetCm`은 위·아래 벽이면 왼쪽 끝에서, 왼·오른쪽 벽이면 위쪽 끝에서 잰다.
- 가구 `widthCm`·`depthCm`은 회전 0일 때 크기. 회전 90·270이면 바닥 차지 크기가 서로 바뀐다. `(xCm, yCm)`은 **회전을 반영한 바닥 차지 직사각형의 왼쪽 위**.
- 정면: 회전 0은 아래(+y), 90은 오른쪽(+x), 180은 위(−y), 270은 왼쪽(−x). 정면은 사람이 쓰는 쪽(책상=의자 쪽, 옷장·서랍장·책장=문 쪽, 소파·TV장=바라보는 쪽, 침대=발치). **침대 머리는 뒤쪽.**
- 안쪽으로 열리는 문이 쓰는 공간은 문 폭 × 문 폭 정사각형(`doorSwingZone`). 첫 번째 문을 현관으로 본다.
- 3D는 `toModelPlacement()`로 바꾼다: 1 = 1m, 방 바닥 가운데가 원점, +Y 위, `rotation_y = 회전(도) × π/180`.
- 이 계산은 전부 `src/engine/geometry.js`에 있다: `footprint`, `footprintSize`, `overlapCm`, `rectsOverlap`(1cm 이상 겹쳐야 겹침), `isInsideRoom`, `clampToRoom`, `frontDirection`, `frontZone`, `backWall`, `openingSpan`, `openingFrontZone`, `doorSwingZone`, `gapBetween`, `distanceToWalls`, `rotateInPlace`, `nextRotation`, `toModelPlacement`. **직접 다시 만들지 말고 가져다 쓴다.**

## 3. 절대 규칙 (CLAUDE.md 2장)

1. 좌표·치수·충돌·통로·예산은 전부 코드가 계산한다. AI에게 좌표나 점수를 계산시키지 않는다.
2. **점수(숫자 평가)를 만들지 않는다.** 화면·자료·API 어디에도 score, 점, 등급이 없다. 배치 엔진 안에서 후보를 고르는 내부 비교값은 써도 되지만 밖으로 내보내지 않는다.
3. **벽이나 다른 가구에 딱 붙인 배치(0cm)는 문제도 팁도 아니다.** 가구와 가구 사이 5~50cm 틈만 `DEAD_SPACE_GAP` 팁이다. 벽과의 틈은 팁이 아니다.
4. API 키는 `api/`·`server/`에서 `process.env`로만 읽는다. `VITE_` 이름에 키를 넣지 않는다.
5. 쇼핑몰 페이지를 서버가 가져오지 않는다(fetch 금지). 검색 결과 링크만 만든다. `/api/furniture`의 `url`은 글자로만 본다.
6. 고지 문구는 `src/data/labels.js`의 `NOTICES`를 쓴다.
7. `/api/*` 호출은 15초 안에 끝나거나 규칙 기반 기본 답으로 바뀐다. 인터넷이 끊겨도 2D·3D·배치·비용은 돌아간다(CDN 글꼴·스크립트 금지).

## 4. 계산 모듈 계약 (`src/engine`)

```js
// validator.js
export const REFERENCE // { passageCm: 60, drawerFrontCm: 50, chairFrontCm: 60, deadSpaceMinCm: 5, deadSpaceMaxCm: 50, ... }
/** @param {Room} room  @param {{ lifestyle?: Lifestyle }} [options]  @returns {ValidationResult} */
export function validateRoom(room, options)

// layout.js
/** 테마 배치안. 최대 5개, themeKey가 서로 다르고 배치도 서로 달라야 한다. id·title·summary는 labels.js THEMES 값.
 *  @param {Room} room  @param {{ lifestyle?: Lifestyle }} [options]  @returns {LayoutVariant[]} */
export function generateVariants(room, options)
/** 이미 놓인 가구는 그대로 두고 새 가구 하나가 들어갈 빈 자리를 찾는다. 없으면 null.
 *  @param {Room} room  @param {FurnitureItem} item  @returns {{ xCm: number, yCm: number, rotation: Rotation } | null} */
export function placeNewFurniture(room, item)
/** 배치안의 좌표를 가구 배열에 적용한 새 배열. placements에 없는 가구는 그대로 둔다.
 *  @param {FurnitureItem[]} furniture  @param {Placement[]} placements  @returns {FurnitureItem[]} */
export function applyPlacements(furniture, placements)

// cost.js
export function effectivePriceKrw(item)            // manualKrw ?? estimatedKrw
export function priceSourceLabel(item)             // '직접 입력' | '카탈로그 가격' | '시연용 예상 가격'
export function summarizeCost(furniture, budgetKrw) // → CostSummary (보유 가구는 합계에서 뺀다)
export function shopSearchLinks(name)              // → [{ label: '오늘의집'|'네이버쇼핑'|'쿠팡', url }]

// fallback.js  (AI가 실패했을 때 서버와 브라우저가 똑같이 쓰는 규칙 기반 기본 답. 모두 isFallback: true)
export function fallbackAdvice({ room, validationResult, lifestyle })  // → AdviceResponse
export function fallbackFurniture({ text, url })                       // → FurnitureResponse
export function fallbackStyle({ text })                                // → StyleResponse
export function fallbackFloorplan({ areaPyeong })                      // → FloorplanResponse
export function fallbackRenderPhoto({ snapshotBase64 })                // → RenderPhotoResponse

// sanitize.js  (AI 답과 서버 답을 믿지 않고 모양·범위를 고친다. 못 쓰면 null)
export function sanitizeAdvice(raw)  export function sanitizeFurnitureItems(raw)
export function sanitizeStyle(raw)   export function sanitizeFloorplan(raw)

// eyeLevel.js  (3D 눈높이 보기의 계산. three.js·브라우저에 기대지 않는다. 위치와 높이만 만들고 점수는 없다)
export const EYE_REFERENCE // { childEyeCm: 90, adultEyeCm: 160, standMarginCm: 20, walkOverCm: 10, entryStepCm: 70, cornerMinCm: 40, cornerMaxCm: 110, cornerWallCm: 5, gridCm: 5, ... } 모두 참고값
export function eyeHeightCm(mode)                // 'child' 90, 'adult' 160, 'off' null
export function standObstacles(room)             // 서 있을 수 없는 가구의 바닥 영역 (매트·높이 10cm 미만은 뺀다)
export function canStandAt(room, xCm, yCm)       // 벽과 가구에서 20cm 이상 떨어진 방 안쪽인지
export function nearestStandSpot(room, xCm, yCm) // 누른 곳에서 가장 가까운 설 수 있는 자리. 없으면 null
export function yawTowardDeg(from, to)           // 보는 방향(도). 가구 회전과 같은 약속: 0 아래(+y), 90 오른쪽(+x)
export function initialStandSpot(room)           // → { xCm, yCm, yawDeg } 첫 번째 문에서 70cm 들어온 곳, 문이 없으면 방 가운데
export function walkPath(room, from, to)         // → { points, reachable } 가구를 돌아가는 길 (5cm 격자)
export function sharpCornerMarkers(room)         // → [{ furnitureId, xCm, yCm, heightCm }] 아이 눈높이에서 빨간 점을 찍을 모서리
```

검사 규칙은 SPEC 2장 그대로. 보충 약속:
- `mat`(매트)는 바닥에 깔리는 것이라 겹침·막힘 판정에서 뺀다. `chair`(의자)는 책상·테이블 정면 공간 안에 있어도 막힘이 아니다.
- 의자 사용 공간 침범과 서랍·옷장 앞 막힘은 둘 다 `CLEARANCE_BLOCKED`. 정면 공간이 방 밖으로 나가는 경우(정면이 벽에 너무 가까움)도 막힘이다.
- `BED_DESK_ADJACENT`는 침대와 책상이 맞닿았을 때만. 침대+협탁·서랍장, 책상+책장이 맞닿는 것은 아무 말도 하지 않는다.
- 문장(`title`, `message`)은 실제로 잰 값을 넣는다("28cm 틈"). 참고값을 쓴 항목은 `isReferenceValue: true`.
- `strengths`는 실제로 확인된 사실만("책상이 창가에 있어요"). 문제가 있는 항목을 칭찬하지 않는다.
- `matZone`은 `lifestyle === 'family_child'`일 때만 채운다(가장 넓은 빈 바닥, 120×120cm 이상). 아니면 null.
- 아이 안전 팁 3종도 `family_child`일 때만 낸다.
- 눈높이 보기(`eyeLevel.js`): 빨간 점은 뾰족한 모서리가 있는 가구(`hasSharpCorner`) 가운데 **윗면 높이 40~110cm**인 것의 윗면 꼭짓점에만 찍는다. 벽에서 5cm 안에 붙은 꼭짓점, 같거나 더 높은 가구에 맞닿아 가려진 꼭짓점은 뺀다(의자는 가린 것으로 보지 않는다). 생활 유형과 상관없이 [아이 눈높이]를 켜면 보인다. 화면에는 `NOTICES.eyeCorners`와 `NOTICES.reference`를 함께 적는다. 값의 근거는 `EYE_REFERENCE` 주석과 `docs/DECISIONS.md`에 있다.

## 5. 서버 계약 (`api`, `server`)

- 함수 모양(Vercel 권장): `export default { async fetch(request) { ... return Response } }`. 테스트에서 `handler.fetch(new Request(...))`로 바로 부른다.
- `server/http.js`: `preflight()`(204 + CORS), `json(data, status)`(CORS 포함), `readJson(request, maxBytes)`(크기 제한·깨진 JSON 처리), `handle(fn)` 같은 공통 틀. CORS와 출처 검사는 여기 한 곳에서만 한다(`guardOrigin(request, respond)`: Origin 머리말이 있으면 사이트 자신·localhost·127.0.0.1·앱 웹뷰·환경변수 `ALLOWED_ORIGINS`만 받고 그 출처를 그대로 돌려준다, 그 밖은 403. Origin이 없으면 받는다. `Vary: Origin`, `POST, OPTIONS`, `Content-Type`).
- `server/ai.js`: Claude 호출 한 곳. `@anthropic-ai/sdk` 사용, 키는 `process.env.ANTHROPIC_API_KEY`, 모델은 `process.env.AI_MODEL || 'claude-opus-5-5'`, 서버 쪽 제한 12초(`timeout: 12000, maxRetries: 0`), 구조화 출력으로 JSON만 받는다. 키가 없으면 부르지 않고 바로 기본 답.
- 주소: `POST /api/advice`, `/api/furniture`, `/api/style`, `/api/floorplan`, `/api/render-photo` (입출력은 `schema.ts`의 `*Request`/`*Response`), `GET /api/health` → `{ status: 'ok', aiConfigured: boolean }`.
- 응답 규칙: 입력이 틀리면 400 `{ error: { code, message } }`, 다른 메서드는 405, AI 실패·키 없음·거절은 **200 + 기본 답(`isFallback: true`)**. AI 답은 `sanitize.js`를 거친 뒤에만 내보낸다.
- `/api/render-photo`는 이미지 생성 AI가 아직 정해지지 않아 항상 기본 답(받은 그림을 그대로 돌려줌)이다.
- `src/lib/api.ts`: `requestAdvice`, `requestFurniture`, `requestStyle`, `requestFloorplan`, `requestRenderPhoto`. 주소는 `import.meta.env.VITE_API_BASE_URL || ''` + 경로, 15초 제한(AbortController). **절대 reject하지 않는다**: 시간 초과·끊김·오류·모양 이상이면 `fallback.js`의 기본 답을 돌려준다. `navigator.onLine === false`거나 `VITE_USE_MOCK === 'true'`면 서버를 부르지 않고 바로 기본 답.

## 6. 화면 계약

상태는 `src/state/store.ts`만 쓴다(파일을 읽어 볼 것). 요약:

```ts
useAppState(selector)   // 상태 읽기. selector는 상태 안의 값을 그대로 돌려줘야 한다(새 객체·배열 금지)
useActiveRoom()         // 지금 방(Room)
getState()              // 이벤트 처리 안에서 읽기
actions.startWithExample() / startEmpty({ widthCm, depthCm }) / resetAll()
actions.setCategory(key) / setViewMode('2d' | '3d') / select(id | null)
actions.setEyeMode('off' | 'child' | 'adult')   // 3D에서 보는 방식. child·adult를 고르면 3D로 바뀐다. 상태 값은 eyeMode
actions.setRoomSize / setRoomName / setWindowDirection / addOpening / updateOpening / removeOpening
actions.setStyle(style) / setLifestyle(l) / setBudget(krw)
actions.addFurniture(seed) → { id, placed }   // 기존 배치는 그대로, 빈 자리에만. placed가 false면 자리가 없어 가운데에 둔 것
actions.updateFurniture(id, patch) / moveFurniture(id, xCm, yCm) / nudgeFurniture(id, dx, dy)
actions.rotateFurniture(id) / resizeFurniture(id, rect) / removeFurniture(id)
actions.copySelected() / pasteClipboard() / toggleOwned(id) / setManualPrice(id, krw | null)
actions.regenerateVariants()   // [전체 다시 추천]
actions.applyVariant(variantId)
actions.beginGesture() / endGesture()   // 끌기·리사이즈의 시작과 끝. 그 사이의 변경은 실행취소 한 단계가 된다
actions.undo() / redo()
```

파일과 기본 내보내기(모두 props 없음, 상태는 store에서 읽는다):

| 파일 | 내용 |
|---|---|
| `src/App.tsx` | `started`가 false면 `StartScreen`, 아니면 `AppShell` |
| `src/components/StartScreen.tsx` | [방 크기 설정](가로·세로 입력 후 시작) + [1초 예시 체험]. 긴 설명 없이 바로 |
| `src/components/AppShell.tsx` | 반응형 틀. PC(≥1024px): 위 `Header` + 왼쪽 카테고리 레일 + 열린 패널 하나 + 가운데 `Stage` + 오른쪽 `VariantList`·`FeedbackPanel`. 휴대폰(1024px 미만): 위 막대 하나(`Stage`의 도구 줄) + 평면도·3D(화면 높이의 46%) + 아래 시트 + 맨 아래 탭 바 7개(메뉴 6개 + 피드백). 아래 "휴대폰 틀" 참고 |
| `src/components/Header.tsx` | PC 틀의 머리글: 이름, [처음부터] [실행취소] [다시실행] [저장/공유] 고정. 휴대폰 도구 줄에 넣는 `MobileTools`([실행취소] [다시실행] [더보기])도 내보낸다 |
| `src/components/Stage.tsx` | [2D]/[3D] 전환. 2D는 `FloorPlanEditor`, 3D는 `lazy(() => import('../canvas3d/Room3DView.tsx'))`. 휴대폰 틀에서는 이 도구 줄이 화면의 하나뿐인 위 막대다 |
| `src/components/sheet.tsx`, `sheetContext.ts` | 휴대폰 시트 머리줄의 칩(`SectionTabs`), 머리줄 자리(`SheetHeaderSlot`), "지금 시트 안인지"(`useInSheet`) |
| `src/components/panels/RoomPanel.tsx` | 방 크기, 생활 유형, 창 방향, 문·창문 |
| `src/components/panels/StylePanel.tsx` | 스타일 프리셋, 분위기 글 → `requestStyle`, 색 고치기 |
| `src/components/panels/FurniturePanel.tsx` | 카탈로그에서 추가, 글로 추가(`requestFurniture`), 놓인 가구 목록·치수·[이미 있어요]·삭제 |
| `src/components/panels/LayoutPanel.tsx` | [전체 다시 추천], 배치안 목록 |
| `src/components/panels/CostPanel.tsx` | 예산, 가격 직접 수정, 보유 제외 합계, 쇼핑몰 검색 링크 |
| `src/components/panels/ReportPanel.tsx` | 요약 보기와 인쇄 |
| `src/components/VariantList.tsx` | 테마 배치안 미리보기(작은 평면도)와 선택 |
| `src/components/FeedbackPanel.tsx` | 3단계 피드백: 확실한 문제 / 개선 제안 / 좋은 점, [AI 해설] |
| `src/canvas2d/FloorPlanEditor.tsx` | SVG 평면도 편집 |
| `src/canvas3d/Room3DView.tsx` | three.js 3D 보기. 보는 방식 세 가지: 둘러보기 / 어른 눈높이 / 아이 눈높이 |

카테고리 6개(순서 고정): `room` 방, `style` 스타일, `furniture` 가구, `layout` 배치, `cost` 비용, `report` 리포트. 한 번에 패널 하나만 보인다.

휴대폰 틀 (화면 너비 1024px 미만):
- 고정 막대는 위 하나(도구 줄: [2D|3D], 방 이름, [실행취소] [다시실행] [더보기]), 아래 하나(탭 바)뿐이다. [처음부터]와 [저장/공유]는 [더보기] 안에 있다.
- 시트는 세 크기다: 가장 작게(머리줄 56px만) / 기본 / 크게. 머리줄을 위아래로 끌거나 단추로 바꾼다.
- 긴 패널은 시트 머리줄의 **칩**으로 나눈다. 칩을 누르면 그 항목만 보인다(한 번에 하나, 칩 줄은 한 겹). 패널이 `SectionTabs`로 머리줄 자리에 그린다.
- 눈높이 보기(`eyeMode`가 `child`·`adult`이고 3D일 때)에서는 시트를 가장 작게 접고, 끄면 전 크기로 되돌린다. 주소 옵션으로 처음부터 눈높이 보기로 열려도 접힌 채로 시작한다.
- `embed=1`(방봄 "집 보기" 안)이면 머리줄과 첫 방문 도움말을 그리지 않는다. `src/lib/embed.ts`의 `EMBEDDED`를 본다.
- 휴대폰에서만 키우는 크기(누름 자리 44px, 입력 글자 16px)는 `src/index.css`의 변형 `phone`(화면이면서 1024px 미만)을 쓴다. `max-lg`로 쓰면 A4 인쇄에도 걸려 PC의 인쇄 리포트가 바뀐다.
- 좁은 평면도의 가구 이름표는 "…"로 자르지 않는다. 한 줄 → 눕혀서 한 줄 → 두 줄 → 작은 글자 → 가구 종류 이름 순서로 들어가는 것을 쓰고, 안 들어가면 그리지 않는다(`planMath.ts`의 `layoutLabel`, 검사는 `tests/planLabel.test.js`).

3D 눈높이 보기 (`src/canvas3d/sceneEngine.ts`의 `setEyeMode`, 계산은 `src/engine/eyeLevel.js`):
- 끌면 그 자리에서 고개를 돌리고(좌우 끝없이, 위아래 ±60도), 바닥을 한 번 누르면 가구를 피해 그 자리로 걸어간다. WASD·방향 패드는 없다. 키보드는 화살표(돌기)와 Enter·Space(한 걸음).
- 지금 상태는 3D 화면 바깥 요소의 속성에 남는다(검사용): `data-eye-mode`(off·child·adult), `data-eye-x`·`data-eye-y`(cm), `data-eye-yaw`(도), `data-eye-markers`(방 전체의 빨간 점 개수).
- 고화질 저장 그림에는 빨간 점을 넣지 않는다(그림에는 "참고용" 글이 없기 때문이다).

모양 규칙:
- 색은 `src/index.css`의 토큰만 쓴다: `paper surface sunken line line-strong ink muted accent accent-strong accent-soft danger danger-soft tip tip-soft ok ok-soft` (예: `bg-surface text-muted border-line bg-accent-soft`). 새 색을 만들지 않는다.
- 공통 클래스: `btn`(+`btn-primary` `btn-quiet` `btn-danger` `btn-sm` `btn-lg`), `card`, `panel-title`, `label`, `input`, `hint`, `chip`(+`chip-accent` `chip-danger` `chip-tip` `chip-ok`), `divider`.
- 느낌: 밝고 깨끗한 쇼핑앱. 흰 카드, 얇은 선, 넉넉한 여백, 파랑은 한 가지만. 한 화면에 다 늘어놓지 않는다. 이모지·그라데이션·그림자 과용·깜빡이는 효과·만화 같은 그림 금지. 아이콘은 가는 선의 인라인 SVG.
- 1단계 문제는 `danger`, 2단계 제안은 `tip`, 좋은 점은 `ok`. 색만으로 구분하지 않고 글자를 같이 쓴다.
- 누르는 곳은 높이 36px 이상(휴대폰 틀에서는 44px 이상, 탭 바는 48px 이상). 입력에는 `<label>`, 아이콘 버튼에는 `aria-label`. 키보드로 쓸 수 있어야 한다.
- 모바일에서 노치 여백: `env(safe-area-inset-top/bottom)`.

## 7. 확인 명령

```bash
node --test "tests/**/*.test.js"   # 또는 내 파일만: node --test tests/validator.test.js
npx tsc -p tsconfig.app.json --noEmit    # 화면 + src 전체 타입 검사
npx tsc -p tsconfig.node.json --noEmit   # api·server·tests·scripts·engine·data 타입 검사
npm run build                            # 전체 (다른 작업이 끝나기 전에는 실패할 수 있다)

# 실제 브라우저(헤드리스 Edge·Chrome)로 눌러 보는 검사. 먼저 npm run build 뒤 npm run serve 로 4180번을 켜 둔다
node scripts/e2e-smoke.mjs   [주소]         # 방 배치 도구: PC 1280x800 + 휴대폰 390x844. E2E_NO_AI=1 이면 AI 주소를 막고 돈다
node scripts/e2e-bangbom.mjs [주소] [--ai]  # 방봄 화면: PC 1440x900 + 휴대폰 390x844·360x740. --ai 를 주면 상담에 실제 질문을 한 번 보낸다
```

두 검사 모두 주소를 안 쓰면 `http://localhost:4180`을 본다. 휴대폰은 크기와 터치를 흉내 낸 것이고 엔진은 Chromium이라, 사파리와 실제 기기는 따로 확인해야 한다.

다른 작업의 파일이 아직 없어서 나는 오류는 무시하고, **내 파일에서 나는 오류만** 고친다.

## 8. 방봄 화면과 잇는 약속 (2026-11-26)

사이트 첫 화면(`/`)은 방봄이고, 방꾸미는 `/room.html`이에요. 방봄 원본은 `bangbom/src/`에 있고 `npm run bangbom`이 `public/index.html`을 다시 만들어요.

### 집 보기 → 방꾸미 (주소 옵션)

방봄의 `House.open()`(`bangbom/src/shell/app_bb.js`)이 iframe으로 아래 주소를 열고, `src/App.tsx`의 `applyUrlOptions()`가 읽어요.

| 옵션 | 뜻 | 받는 쪽 |
| :-- | :-- | :-- |
| `slot` | 저장 칸 이름(영문·숫자·`-`·`_` 40자까지). `bangkkumi2.project.<slot>`에 따로 저장해요 | `store.ts`의 `storageKeyFromUrl()` |
| `w`, `d` | 방 가로·세로(cm, 150~2000). 그 칸에 저장된 것이 없을 때만 새 방을 만들어요 | `actions.startWithRoom()` |
| `name` | 방 이름(40자까지) | 같은 곳 |
| `kind` | `living`, `master`, `bed`. 먼저 놓아 둘 가구 묶음을 골라요(`ROOM_PRESETS`) | `presetSeeds()` |
| `op` | 문·창문 목록. `종류:벽:벽 끝에서 거리(cm):너비(cm)`를 쉼표로 이어요. 종류는 `door`·`window`, 벽은 `top`·`bottom`·`left`·`right` | `parseOpenings()` |
| `embed` | `1`이면 방봄 안에 끼워진 화면이에요. PC는 머리글에 이름 대신 "집 꾸미기"를 적고, 휴대폰(너비 1024px 미만)은 머리줄과 첫 방문 도움말을 그리지 않아요. [링크 공유하기]는 `/room.html`이 아니라 사이트 첫 주소를 알려 줘요 | `src/lib/embed.ts`, `Header.tsx`, `Stage.tsx` |
| `view` | `3d` 또는 `2d`. 처음 보여 줄 화면 | `applyUrlOptions()` |
| `eye` | `child`(아이 눈높이 90cm) 또는 `adult`(어른 눈높이 160cm). 3D 눈높이 보기로 바로 열어요. `view`가 없어도 3D로 바뀌어요 | `applyUrlOptions()` → `actions.setEyeMode()` |

가구 좌표와 검사는 지금까지처럼 방꾸미의 계산 코드가 해요. 방봄은 방의 크기와 문·창문만 넘겨요.

### 눈높이로 집 보기 (`window.MH.setEye`)

- `MH.setEye('child' | 'adult')`: 다음에 집 보기를 열 때 iframe 주소에 `view=3d&eye=<값>`을 붙여요. 한 번 쓰고 지워요. 이미 `#house`면 같은 방을 바로 다시 열어요. 눈높이 화면 자체는 방꾸미(`room.html`)가 그려요.
- 방봄 화면의 링크에 `data-eye="child"`를 달면 `shell.js`가 누를 때 `MH.setEye`를 먼저 불러요. 홈의 "아이 눈높이 90cm로 보기 →"(`href="#house"`)가 이렇게 돼 있어요.
- 방을 바꾸면(`#hvRooms`) 눈높이 옵션 없이 열려요. 방을 바꿀 때는 iframe을 새로 끼워서 뒤로 가기 기록이 쌓이지 않아요(뒤로 가기는 들어온 화면으로 가요).

### 방봄의 휴대폰 화면 약속 (폭 820px 이하)

기준 폭은 한 곳이에요: `mobile_home.css`·`mobile_app.css`의 `@media (max-width:820px)`와 `shell.js`·`app_bb.js`의 `PHONE`. PC(821px 이상)는 전과 같은 모습이어야 해요. 휴대폰용 CSS는 `build.py`가 맨 끝에 붙여요(홈·이용 안내는 `mobile_home.css`, 조건 입력·지도·단지 카드·집 보기·상담은 `mobile_app.css`).

| 화면 | 휴대폰에서 달라지는 것 |
| :-- | :-- |
| 홈, 이용 안내 | 위 막대 아래에 붙는 **카테고리 칩 줄**(`.cats` > `.cat[data-cat]`, 높이 52px)로 나눠요. 고른 묶음(`[data-catp].is-on`) 하나만 보여요. 홈은 숫자·평면·돕는 방법·우리 이야기, 이용 안내는 다섯 걸음·자주 묻는 질문 |
| 조건 입력 (`body.input-mode`) | 세 걸음(`#vInput[data-step]`): 기본 정보·주거 상황·예산·시설. 아래 탭 막대를 숨기고 그 자리에 이전/다음 단추를 둬요. 제출은 마지막 걸음에서만 돼요 |
| 지도 | 위에는 구 바로가기 칩 한 줄과 한 줄 요약(`#jpLine`, 누르면 펼침)만 있어요 |
| 단지 카드 | 화면의 3분의 2까지 올라오는 아래 시트예요. 칩(`.cc-chips [data-tab]`)으로 항목(`[data-pane]`) 하나씩 보고, 머리를 아래로 끌면 닫혀요. 칩을 바꿔도 이름과 칩 줄은 제자리에 있어요 |
| 집 보기 (`body.house-mode`) | 방봄의 위 막대와 아래 탭 막대를 숨기고 화면을 통째로 써요. 위에는 두 줄(← 지도로·단지 이름·상담 / 방 고르기 칩)만 있고, 아래 고정 막대는 방꾸미의 탭 바 하나예요. 나가는 길은 "← 지도로"와 뒤로 가기예요 |
| 상담 서랍 | 화면 전체 높이, 빠른 질문은 가로로 넘기는 한 줄이에요. 열 때 입력 칸에 커서를 두지 않아요 |

- `body.house-mode`, `body.input-mode`는 `app_bb.js`의 `route()`가 붙여요.
- 칩은 보이는 높이 38px, 손가락이 닿는 면적은 44px 이상이에요(`::after`나 바깥 단추로 넓혀요). 칩 줄은 한 겹만 둬요.
- `.cats`, `.cat`, `[data-catp]`는 홈·이용 안내의 칩 전용 이름이에요. 820px 이하에서 `[data-catp]`는 고른 것만 보이므로 다른 곳에 이 이름을 쓰지 않아요(지도 범례 `#legend .cat`는 지금 숨겨 둔 것이라 다시 켜면 모양을 따로 봐야 해요).
- `mobile_home.css`가 820px 이하에서 `:root`에 넣는 변수: `--cat-h`(칩 줄 52px), `--safe-b`(아래 안전 영역), `--vh`(100svh), `--panel-h`(묶음 하나가 쓰는 한 화면 높이).
- 안전 영역: `build.py`가 `viewport-fit=cover`를 빼고 만들어서 방봄 화면의 `env(safe-area-inset-*)`는 지금 0이에요. CSS는 이미 `env()`를 쓰고 있어 켜면 바로 반영되지만, 실제 기기(아이폰 사파리, 안드로이드 크롬)에서 확인한 뒤에 켜요.

### 상담 (`POST /api/consult`)

- 요청: `{ question: string(500자까지), draft?: string(규칙이 만든 답, 3000자까지), facts?: string(규칙 판정 자료, 6000자까지) }`
- 응답: `{ answer: string, note: string, isFallback: boolean }`
- AI를 못 쓰거나 주민번호 모양이 있으면 `answer`는 `draft` 그대로이고 `isFallback`은 `true`예요.
- AI 답에서는 인터넷 주소와 마크다운 기호를 지우고, 단정 표현("가능합니다", "승인돼요" 등)이 든 문장은 안전한 문장으로 바꿔요(`cleanReply`). 링크는 방봄의 규칙 코드만 붙여요.
- 화면(방봄 `Consult.ask`)은 15초 안에 답이 없으면 규칙이 만든 답을 보여 줘요.

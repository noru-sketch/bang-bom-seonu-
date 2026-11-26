# API_SPEC.md · 온라인 모델하우스 (v3)

- 서버: FastAPI, `http://{백엔드 IP}:8000`, Swagger `/docs`
- **단위: 금액 만 원(소수 첫째 자리), 가구 가격만 원(정수), 길이 m, 거리 km, 시간 분**
- CORS: `http://localhost:5173`, `http://{프론트 IP}:5173`
- 오류: 입력 오류 422, 없는 ID 404 `{"detail": "complex not found"}`, 서버 오류 500
- v2 대비: `GET /api/complexes`(둘러보기), `nearby`·`infra_score` 추가, 입력 필드 이름 변경(`daegu_resident_or_moving`, `annual_income_gross`, `priorities`), `POST /api/chat`, `GET /api/layouts` 추가, 예시 숫자를 계산 규칙과 일치하게 수정

---

## 1. GET /api/health
`{ "status": "ok", "llm": true }`  (`llm`: LLM 키가 설정돼 있고 마지막 호출이 성공했는지)

## 2. GET /api/complexes  ← 둘러보기 모드
판정 없이 모든 미분양 단지. `{ "items": [ ComplexBasic, ... ] }`

`ComplexBasic`
```json
{
  "id": "c02",
  "name": "월성 든든하우스(샘플)",
  "is_sample": true,
  "supply_type": "lh_dundeun",
  "district": "달서구",
  "lat": 35.826, "lng": 128.530,
  "map_x": 8.0, "map_z": 20.8,
  "area_m2": 59,
  "deposit": 15000, "rent": 0, "mgmt": 15, "mgmt_known": true,
  "room_id": "room_59a",
  "source": "샘플", "checked_at": null,
  "nearby": [
    { "infra_id": "i01", "name": "상인역", "category": "subway", "distance_km": 0.4, "walk_min": 6, "drive_min": null }
  ],
  "infra_score": { "score": 72, "label": "생활 편의 높음", "by_category": { "subway": 3, "hospital": 2, "mall": 2, "culture": 1, "university": 0, "park": 3, "office": 1 } }
}
```
- `supply_type`: `cr_reits_jeonse`(CR리츠 전세) | `lh_dundeun`(LH 든든전세)
- `mgmt_known: false`면 화면에 "관리비 미확인(추정 OO만 원)"으로 표시. 0원으로 쓰지 않는다.
- `nearby`: 카테고리별 가장 가까운 1곳, 최대 7개. **서버가 미리 계산**해서 넣는다 → 호버할 때 추가 요청 없이 선을 그린다.
- `infra_score`: 아래 5장 규칙. `priorities` 없이 기본 가중치로 계산.

## 3. GET /api/infra
지도에 깔아 둘 랜드마크 전체. `{ "items": [ Infra, ... ] }`
```json
{ "id": "i01", "name": "상인역", "category": "subway", "lat": 35.8183, "lng": 128.5371, "map_x": 8.9, "map_z": 22.6 }
```
- `category`: `subway` | `hospital` | `mall` | `culture`(영화관·공연장) | `university` | `park` | `office`

## 4. POST /api/match  ← 더 알아보기 모드 핵심
요청
```json
{
  "age": 27,
  "monthly_income": 250,
  "annual_income_gross": null,
  "assets": 1000,
  "homeless": true,
  "lives_with_parents": false,
  "daegu_resident_or_moving": true,
  "monthly_budget": 60,
  "priorities": ["subway", "hospital"]
}
```
| 필드 | 형식 | 필수 | 규칙 |
|---|---|---|---|
| age | int | O | 19~70 |
| monthly_income | number | O | 월 실수령, 만 원, 0 이상 |
| annual_income_gross | number \| null | X | 세전 연소득. 없으면 추정 범위로 판정하고 애매하면 needs_check |
| assets | number | O | 보증금으로 쓸 수 있는 돈, 만 원 |
| homeless | bool | O | |
| lives_with_parents | bool | O | |
| daegu_resident_or_moving | bool | O | 대구 거주 또는 전입 예정 |
| monthly_budget | number | O | 월세+관리비+이자로 낼 수 있는 최대 금액, 만 원 |
| priorities | string[] | X | 중요한 시설 카테고리. 편의 평가 가중치 2배 |

응답 200 (아래 숫자는 `data/rules_reference.py`로 계산한 실제 값)
```json
{
  "profile_result": {
    "loans": [
      { "id": "youth_beotimok", "name": "청년전용 버팀목 전세자금대출(시연용)", "status": "eligible",
        "max_amount": 20000, "rate": 2.5, "reason": "월 실수령 기준 추정 연소득이 기준(5,000만 원) 이하", "approval_by": "수탁은행 · HUG/HF",
        "source_url": "https://nhuf.molit.go.kr", "checked_at": null },
      { "id": "market_jeonse_loan", "name": "시중은행 전세대출", "status": "needs_check",
        "max_amount": 40000, "rate": 4.5, "reason": "시중은행 대출은 은행 심사로 결정돼요", "approval_by": "각 은행" }
    ],
    "policies": [
      { "id": "daegu_interest", "name": "대구 청년 임차보증금 대출이자 지원(시연용)", "status": "needs_check",
        "support_rate": 2.5, "reason": "대구시 배점 선정 결과 확인 필요", "approval_by": "대구시 (대구안방)" },
      { "id": "youth_monthly_rent", "name": "청년월세 특별지원(시연용)", "status": "ineligible",
        "monthly_amount": 20, "reason": "추정 소득인정액이 기준(월 154만 원) 초과", "approval_by": "주소지 행정복지센터" }
    ],
    "summary": { "on": 3, "dim": 2, "off": 3, "min_net_monthly": 44.2 }
  },
  "complexes": [ ComplexMatched, ... ]
}
```
- `status`: `"eligible"`(요건 충족) | `"needs_check"`(확인 필요) | `"ineligible"`(미충족)

`ComplexMatched` = `ComplexBasic` + 아래 필드 (infra_score는 priorities 반영해 다시 계산)
```json
{
  "id": "c01", "name": "상인푸르지오 센터파크", "deposit": 22200, "mgmt": 22, "mgmt_known": false,
  "loan_needed": 21200,
  "light": "dim",
  "light_reason": "시중 전세대출 + 대구 청년 이자지원(확인 필요)을 받으면 월 57.3만 원으로 예산 안이에요",
  "net_monthly": null,
  "net_monthly_best": 57.3,
  "net_monthly_worst": 101.5,
  "financing": "시중 전세대출 + 대구 청년 이자지원"
}
```
```json
{
  "id": "c02", "name": "월성 든든하우스(샘플)", "deposit": 15000, "mgmt": 15,
  "loan_needed": 14000,
  "light": "on",
  "light_reason": "청년전용 버팀목 전세자금대출 요건 충족 기준으로 월 44.2만 원, 예산 안이에요",
  "net_monthly": 44.2,
  "net_monthly_best": 38.3,
  "net_monthly_worst": 67.5,
  "financing": "청년전용 버팀목 전세자금대출"
}
```
- `net_monthly`: 요건 충족(eligible) 대출·지원만으로 가능한 최저 월 부담. 없으면 `null` → 카드에 "요건 충족 지원만으로는 어려워요"
- `net_monthly_best`: 확인 필요까지 모두 받을 때 최저 / `net_monthly_worst`: 지원 없이 시중금리
- 정렬 기준: `net_monthly` 오름차순, `null`은 뒤로 가고 그 안에서 `net_monthly_best` 순

### 판정·계산 규칙 (backend/rules.py, 참고 구현 `data/rules_reference.py`)
1. **대출 필요액** `loan_needed = max(0, deposit − assets)`
2. **사람 요건**: 나이·무주택·대구 거주/전입·부모와 따로 사는지·소득을 rules.json으로 판정.
   - 소득: `annual_income_gross`가 있으면 그대로 비교. 없으면 `월 실수령 × 12 × 1.35 ≤ 기준`이면 eligible, `월 실수령 × 12 > 기준`이면 ineligible, 그 사이면 needs_check.
   - `always_needs_check`가 있는 지원(배점 선정, 부모 소득 등)은 다른 요건이 맞아도 needs_check.
3. **집 요건**: 공급유형(`applies_to`), 보증금 상한(`deposit_max`), 대출 한도(`max_amount`), 보증금 대비 비율(`ltv`, null이면 미적용).
4. **조합**: 가능한 대출·지원 조합을 모두 만든다. `exclusive_with`에 걸린 것은 같이 넣지 않는다 (대구 이자지원 ↔ 버팀목). 시중 대출은 항상 needs_check.
5. **월 이자** `= loan_needed × 금리 / 100 / 12`, 이자지원은 금리에서 `support_rate`를 뺀다.
6. **실부담** `= rent + mgmt + 월 이자 − 월세지원(rent > 0일 때만)`
7. **불빛**: eligible 조합으로 예산 이하 → `on` / needs_check 조합까지 넣어 예산 이하 → `dim` / 그래도 안 됨 → `off`
8. `reason`, `light_reason`은 화면에 그대로 나갈 한국어 한 문장. 금액은 "4억 1,000만 원" 형식.
9. 수치는 **rules.json에만** 둔다.

## 5. 생활 편의 평가 규칙 (`infra_score`)
- 카테고리별 가장 가까운 시설까지: 도보 10분 이하 3점, 20분 이하 2점, 차로 15분 이하 1점, 그 외 0점
- 거리: 위경도 직선거리(하버사인) × 1.3(도로 보정). `walk_min = km × 15`, 1.5km 넘으면 `drive_min = km × 3 + 3`, `walk_min`은 null
- 가중치: 기본 1, `priorities`에 있으면 2. `score = Σ(점수×가중치) ÷ Σ(3×가중치) × 100` (반올림)
- 라벨: 70 이상 "생활 편의 높음", 40~69 "보통", 40 미만 "낮음". "좋은 동네/나쁜 동네" 같은 말은 쓰지 않는다.

## 6. POST /api/complexes/{id}/detail
요청 바디: `/api/match`와 같음. 둘러보기 모드는 빈 바디 `{}` → 판정 필드 없이 기본 정보만.

응답 200 (c02, 페르소나)
```json
{
  "complex": { ComplexMatched },
  "breakdown": { "rent": 0, "mgmt": 15, "loan_interest": 29.2, "rent_support": 0, "total": 44.2, "financing": "청년전용 버팀목 전세자금대출" },
  "applied": [ { "id": "youth_beotimok", "name": "청년전용 버팀목 전세자금대출(시연용)", "status": "eligible", "reason": "...", "source_url": "...", "checked_at": null } ],
  "not_applied": [ { "id": "daegu_interest", "reason": "버팀목 대출 이용자는 대구 이자지원과 중복 불가" } ],
  "infra": [ { "infra_id": "i01", "name": "상인역", "category": "subway", "distance_km": 0.4, "walk_min": 6, "drive_min": null } ],
  "infra_score": { "score": 72, "label": "생활 편의 높음", "by_category": { } },
  "checklist": [ { "text": "계약금 내기 전 은행 대출 사전 상담", "link": null }, { "text": "대출 불가 시 계약 해제 특약 확인", "link": null } ],
  "apply_links": [ { "label": "LH청약플러스", "url": "https://apply.lh.or.kr" } ],
  "room_id": "room_59a"
}
```
- `breakdown.total`은 카드의 `net_monthly`(없으면 `net_monthly_best`)와 같아야 한다 (통합 체크 항목).

## 7. POST /api/chat  ← 24시간 상담 (자세한 규칙은 CONSULT_SPEC.md)
요청
```json
{ "session_id": "uuid", "message": "대구 이자지원은 언제 신청해요?", "profile": { ... /api/match 요청과 같음, 없으면 null }, "complex_id": "c01", "history": [ { "role": "user", "text": "..." }, { "role": "assistant", "text": "..." } ] }
```
응답 200
```json
{
  "reply": "대구 청년 임차보증금 대출이자 지원은 대구시가 배점으로 선정해요. 입력하신 조건으로는 나이·무주택·전입 요건은 맞고, 선정 여부는 확인이 필요해요. ...",
  "status_mentions": [ { "id": "daegu_interest", "status": "needs_check" } ],
  "links": [ { "label": "대구안방 사업 안내", "url": "https://..." } ],
  "quick_replies": ["필요한 서류는?", "버팀목이랑 같이 받을 수 있어요?"],
  "mode": "llm"
}
```
- `mode`: `"llm"` | `"template"` (LLM 실패·키 없음·8초 초과 시 템플릿)
- `links`는 서버가 rules.json·policy_docs에서 붙인다. LLM이 만든 URL은 버린다.
- `history`는 최근 6턴까지만. 서버는 대화를 저장하지 않는다.

## 8. 집 보기 (S4)
### GET /api/rooms · GET /api/rooms/{id}
```json
{ "id": "room_84a", "name": "84㎡ A타입", "area_m2": 84, "model_url": "/models/room_84a.glb",
  "zones": [ { "id": "living", "name": "거실", "polygon": [[-3.2,-1.0],[2.0,-1.0],[2.0,3.5],[-3.2,3.5]] } ],
  "camera_presets": { "plan": { "position": [0, 14, 0.01], "target": [0, 0, 0] }, "bird": { "position": [9, 9, 9], "target": [0, 0, 0] },
                      "inside": { "position": [0, 1.6, 3.0], "target": [0, 1.4, 0] } } }
```
### GET /api/furniture?category=
```json
{ "items": [ { "id": "sofa_01", "name": "3인 패브릭 소파", "category": "sofa", "price": 390000,
  "width": 2.0, "depth": 0.9, "height": 0.8, "model_url": "/models/sofa_01.glb",
  "shop": "{판매처}", "url": "{상품 링크}", "price_checked_at": "2026-11-26", "is_affiliate": false } ] }
```
### GET /api/layouts?room_id=room_84a
추천 배치 2~3개. `{ "items": [ { "id": "l84_basic", "name": "기본형", "placements": [ { "furniture_id": "sofa_01", "zone": "living", "x": -1.2, "z": 2.8, "rotation_y": 3.1416 } ] } ] }`

### POST /api/recommend
요청 `{ "room_id": "room_84a", "budget": 3000000, "layout_id": "l84_basic" }` (budget은 **원**)
응답 `{ "items": [ { "furniture_id": "sofa_01", "price": 390000, "x": -1.2, "z": 2.8, "rotation_y": 3.1416 } ], "total_price": 2870000, "over_budget": false, "skipped": ["dining_table"] }`
- 배치 슬롯마다 예산 안에서 고른다. 예산이 모자라면 우선순위 낮은 슬롯부터 비우고 `skipped`에 넣는다. 우선순위: 침대 > 소파 > 식탁 > 책상 > 수납 > 조명.

---

## 데이터 파일 (backend/data/)
| 파일 | 내용 | 담당 |
|---|---|---|
| `complexes.json` | 단지 8개 (초안 `data/complexes.json`) | PM |
| `infra.json` | 7개 카테고리 15~25곳 | PM |
| `rules.json` | 대출·지원 요건 (초안 `data/rules.json`) | PM |
| `policy_docs/*.md` | 지원별 공고 요약 (CONSULT_SPEC 3장 형식) | PM |
| `buildings.json` | 지도 트레이싱 건물 (MODEL_SPEC A-3) | 모델링 |
| `rooms.json`, `layouts.json`, `furniture.json` | 집 보기 | 모델링 + 백엔드 |

## Swagger 검증 체크 (PM)
- [ ] `GET /api/complexes` → 8개, 모두 `nearby`·`infra_score` 있음
- [ ] 페르소나 `/api/match` → on 3 · dim 2 · off 3, `rules_reference.py` 출력과 숫자 일치
- [ ] age 40 → 버팀목·청년월세 ineligible, 대구 이자지원(19~39) ineligible, 이유 문장 자연스러움
- [ ] 자산 5,000만 → on이 늘어나는지 / 예산 40 → off가 늘어나는지
- [ ] `annual_income_gross: 6000` → 버팀목 ineligible
- [ ] `/api/chat` LLM 키 없이 → `mode: "template"`로 200
- [ ] 없는 단지 ID → 404
- [ ] 응답 필드 이름이 프론트 목업과 같은지

/* ═══════ 지도·시설·가구 데이터 (시연용 샘플 · PM 확정 전) ═══════
   - 시설 위치: 지도 좌표(map_x, map_z)로 적고 위경도는 MODEL_SPEC A-1 식을 거꾸로 써서 계산 → 거리 계산과 지도 위치가 항상 일치
   - 지하철역 이름만 실제 이름, 나머지 시설은 (샘플) */
const INFRA_RAW = [
  ["i01", "상인역", "subway", 8.9, 22.6], ["i02", "대곡역", "subway", 9.9, 25.6], ["i03", "반월당역", "subway", 18.1, 12.9],
  ["i04", "범어역", "subway", 24.4, 13.4], ["i05", "동대구역", "subway", 24.3, 10.4], ["i06", "지하철역(샘플) 북구", "subway", 16.4, 7.6],
  ["i07", "지하철역(샘플) 서구", "subway", 13.2, 11.8], ["i08", "지하철역(샘플) 시지", "subway", 36.4, 18.0],
  ["i11", "종합병원(샘플) 달서", "hospital", 7.0, 18.6], ["i12", "종합병원(샘플) 중구", "hospital", 19.6, 13.8], ["i13", "종합병원(샘플) 북구", "hospital", 19.0, 6.6],
  ["i14", "종합병원(샘플) 수성", "hospital", 28.6, 16.4], ["i15", "종합병원(샘플) 동구", "hospital", 26.0, 8.4],
  ["i21", "대형마트(샘플) 상인", "mall", 11.4, 23.4], ["i22", "쇼핑몰(샘플) 중구", "mall", 17.2, 11.6], ["i23", "대형마트(샘플) 시지", "mall", 34.0, 20.4],
  ["i24", "대형마트(샘플) 북구", "mall", 15.0, 4.8], ["i25", "쇼핑몰(샘플) 동대구", "mall", 22.4, 11.2],
  ["i31", "영화관(샘플) 달서", "culture", 6.8, 22.0], ["i32", "영화관(샘플) 중구", "culture", 18.8, 11.2], ["i33", "영화관(샘플) 수성", "culture", 25.8, 15.6],
  ["i41", "대학교(샘플) 달서", "university", 2.4, 17.0], ["i42", "대학교(샘플) 북구", "university", 20.6, 4.8], ["i43", "대학교(샘플) 동쪽", "university", 38.0, 15.4],
  ["i51", "공원(샘플) 대곡", "park", 12.4, 27.8], ["i52", "공원(샘플) 월성", "park", 9.4, 19.2], ["i53", "공원(샘플) 두류", "park", 13.6, 16.4],
  ["i54", "공원(샘플) 수성못", "park", 25.4, 18.8], ["i55", "공원(샘플) 북구", "park", 14.0, 8.4],
  ["i61", "업무지구(샘플) 중구", "office", 17.4, 14.0], ["i62", "업무지구(샘플) 범어", "office", 22.2, 15.8], ["i63", "업무지구(샘플) 성서", "office", 4.2, 16.4]
];
const INFRA = INFRA_RAW.map(([id, name, category, x, z]) => ({ id, name, category, map_x: x, map_z: z, lat: 35.93 - z / 200, lng: 128.48 + x / 160 }));
const CAT_KO = { subway: "지하철", hospital: "병원", mall: "쇼핑", culture: "영화관", university: "대학", park: "공원", office: "업무지구" };
const CAT_LIGHT = { subway: "#7FA3CC", hospital: "#D68E89", mall: "#E2AE82", culture: "#C79BC4", university: "#A498C9", park: "#8DBB9E", office: "#A9A9A5" };
const CAT_DARK = { subway: "#4A7BB7", hospital: "#C9605A", mall: "#D98C4A", culture: "#A45FA0", university: "#7D6BB0", park: "#5E9C76", office: "#8A8A86" };

/* 큰길·강 (단순화, 지명 표기 없음) */
const ROADS = [
  { pts: [[0, 18.5], [48, 15.0]], w: .8 }, { pts: [[8, 11.8], [40, 11.0]], w: .6 }, { pts: [[3, 24.6], [14, 25.0], [22, 21.6], [31, 21.8]], w: .6 },
  { pts: [[24.9, 2], [25.2, 22]], w: .6 }, { pts: [[14.6, 2], [15.2, 22]], w: .5 }, { pts: [[30, 4], [31, 30]], w: .5 }, { pts: [[6, 8], [6.6, 34]], w: .5 }
];
const RIVERS = [
  { pts: [[22, 40], [20.6, 20], [21.4, 10], [22.2, 0]], w: .6 },
  { pts: [[0, 6], [10, 4.5], [18, 3.2], [26, 4.2], [34, 3.0], [48, 5.5]], w: 1.0 }
];
/* 지형 (예시 · 지도 연출용, 실제 지형 아님) */
const MOUNTS = [[[0, 33], [26, 33.5], [30, 36], [30, 40], [0, 40]], [[41, 20], [44, 18], [48, 17], [48, 40], [38, 40], [39, 30]], [[36, 0], [48, 0], [48, 4.6], [40, 3.6]]];
const LAKES = [[27.6, 25.2, 1.6, 1.0]];
const DISTRICTS = [["달서구", 9.3, 23.3], ["북구", 17.6, 6.0], ["동구", 23.2, 9.0], ["수성구", 29.2, 16.7], ["서구", 12.0, 10.6]];
const SUPPLY_KO = { cr_reits_jeonse: "CR리츠 전세", lh_dundeun: "LH 든든전세" };
/* 단지 카드 "왜 이 집?" 한 줄. built: 준공 연도(null = 확인 전), below: 주변 시세 대비 낮은 비율. 시세 비교는 모두 샘플 값 */
const LANDLORD_KO = { cr_reits_jeonse: "임대인 리츠(CR리츠)", lh_dundeun: "임대인 LH" };
const WHY = { c01: { built: null, below: 10 }, c02: { built: 2024, below: 12 }, c03: { built: 2023, below: 10 }, c04: { built: 2024, below: 8 }, c05: { built: 2025, below: 9 }, c06: { built: 2023, below: 11 }, c07: { built: 2024, below: 13 }, c08: { built: 2025, below: 7 } };
const APPLY_LINKS = {
  cr_reits_jeonse: [{ label: "단지 임대 공고 (공급사 안내)", url: null }],
  lh_dundeun: [{ label: "LH청약플러스", url: "https://apply.lh.or.kr" }]
};

/* 정책 안내 요약 (CONSULT_SPEC 3장 형식 · 시연용, PM이 공고 확인 후 교체) */
const POLICY_DOCS = {
  youth_beotimok: { agency: "주택도시기금 · 수탁은행", apply: "주택도시기금 누리집에서 대출 자격을 먼저 확인하고, 수탁은행에서 상담·신청해요. 임대차계약서와 소득 증빙이 필요해요.", info_url: "https://nhuf.molit.go.kr" },
  market_jeonse_loan: { agency: "각 은행", apply: "거래 은행에서 전세대출 사전 상담을 받아요. 한도와 금리는 은행 심사로 정해져요.", info_url: null },
  daegu_interest: { agency: "대구시 (대구안방)", apply: "대구시 모집 공고 기간에 온라인으로 신청해요. 배점으로 선정하고, 주택도시기금 전세대출(버팀목 등) 이용자는 제외돼요.", info_url: "https://www.daegu.go.kr" },
  youth_monthly_rent: { agency: "주소지 행정복지센터", apply: "복지로 또는 주소지 행정복지센터에서 신청해요. 부모님(원가구) 소득·재산 기준도 함께 봐요.", info_url: "https://www.bokjiro.go.kr" }
};

/* 가구 (가격 원 · 판매처·링크는 샘플) */
const FURNITURE = [
  { id: "bed_q", cat: "bed", name: "퀸 원목 침대", w: 1.6, d: 2.0, h: .45, price: 420000 },
  { id: "bed_ss", cat: "bed", name: "슈퍼싱글 침대", w: 1.1, d: 2.0, h: .45, price: 250000 },
  { id: "sofa_3", cat: "sofa", name: "3인 패브릭 소파", w: 2.0, d: .9, h: .8, price: 390000 },
  { id: "sofa_2", cat: "sofa", name: "2인 소파", w: 1.5, d: .85, h: .8, price: 220000 },
  { id: "table_4", cat: "dining_table", name: "4인 원목 식탁", w: 1.2, d: .8, h: .74, price: 280000 },
  { id: "table_2", cat: "dining_table", name: "2인 원형 식탁", w: .8, d: .8, h: .74, price: 120000, round: 1 },
  { id: "desk_12", cat: "desk", name: "책상 1200", w: 1.2, d: .6, h: .74, price: 150000 },
  { id: "desk_10", cat: "desk", name: "책상 1000", w: 1.0, d: .5, h: .74, price: 89000 },
  { id: "ward_12", cat: "storage", name: "옷장 1200", w: 1.2, d: .6, h: 2.0, price: 330000 },
  { id: "shelf_8", cat: "storage", name: "책장 800", w: .8, d: .3, h: 1.8, price: 79000 },
  { id: "tv_16", cat: "tv_stand", name: "TV장 1600", w: 1.6, d: .4, h: .5, price: 160000 },
  { id: "tv_12", cat: "tv_stand", name: "TV장 1200", w: 1.2, d: .4, h: .5, price: 99000 },
  { id: "lamp", cat: "light", name: "플로어 스탠드", w: .4, d: .4, h: 1.6, price: 59000 }
];
const FCAT_KO = { bed: "침대", sofa: "소파", dining_table: "식탁", desk: "책상", storage: "수납", tv_stand: "TV장", light: "조명" };
const FCAT_PRI = ["bed", "sofa", "dining_table", "desk", "storage", "light", "tv_stand"];
const LAYOUTS = [
  { id: "basic", name: "기본형", items: ["bed_q", "sofa_3", "table_4", "tv_16", "ward_12", "lamp"] },
  { id: "remote", name: "재택형", remote: 1, items: ["bed_q", "desk_12", "sofa_2", "table_2", "tv_12", "shelf_8"] },
  { id: "storage", name: "수납형", items: ["bed_q", "ward_12", "shelf_8", "sofa_3", "table_4", "tv_16"] }
];

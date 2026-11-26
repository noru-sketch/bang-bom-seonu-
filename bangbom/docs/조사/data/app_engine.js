const RULES = {
 "_note": "시연용 가정치. 실제 공고 기준과 다를 수 있음. PM이 각 source_url을 열어 값과 기준일을 확인한 뒤 확정한다. 금액 단위: 만 원, 금리: 연 %.",
 "version": "2026-11-26-demo",
 "market_loan": {
  "id": "market_jeonse_loan",
  "name": "시중은행 전세대출",
  "rate": 4.5,
  "max_amount": 40000,
  "ltv": null,
  "status_rule": "always_needs_check",
  "reason": "시중은행 대출은 은행 심사로 결정돼요",
  "approval_by": "각 은행",
  "link": null
 },
 "loans": [
  {
   "id": "youth_beotimok",
   "name": "청년전용 버팀목 전세자금대출(시연용)",
   "age_min": 19,
   "age_max": 34,
   "homeless": true,
   "income_max_annual": 5000,
   "deposit_max": 20000,
   "max_amount": 20000,
   "ltv": null,
   "rate": 2.5,
   "is_housing_fund": true,
   "applies_to": [
    "cr_reits_jeonse",
    "lh_dundeun"
   ],
   "approval_by": "수탁은행 · HUG/HF",
   "source_url": "https://nhuf.molit.go.kr",
   "checked_at": null
  }
 ],
 "policies": [
  {
   "id": "daegu_interest",
   "name": "대구 청년 임차보증금 대출이자 지원(시연용)",
   "type": "interest_rate_support",
   "age_min": 19,
   "age_max": 39,
   "homeless": true,
   "daegu_resident_or_moving": true,
   "support_rate": 2.5,
   "requires_loan": "market_jeonse_loan",
   "exclusive_with": [
    "youth_beotimok"
   ],
   "always_needs_check": [
    "대구시 배점 선정 결과"
   ],
   "approval_by": "대구시 (대구안방)",
   "source_url": "https://www.daegu.go.kr",
   "checked_at": null
  },
  {
   "id": "youth_monthly_rent",
   "name": "청년월세 특별지원(시연용)",
   "type": "rent_support",
   "age_min": 19,
   "age_max": 34,
   "homeless": true,
   "lives_apart_from_parents": true,
   "income_max_monthly_recognized": 154,
   "earned_income_deduction": 0.3,
   "monthly_amount": 20,
   "months": 24,
   "requires_rent": true,
   "deposit_max": 5000,
   "rent_max": 70,
   "always_needs_check": [
    "부모님(원가구) 소득·재산 기준"
   ],
   "approval_by": "주소지 행정복지센터",
   "source_url": "https://www.bokjiro.go.kr",
   "checked_at": null
  }
 ],
 "income_estimate": {
  "_note": "월 실수령만 받았을 때 세전 연소득을 추정하는 배율. 추정치가 기준보다 확실히 낮거나 높을 때만 판정하고, 애매하면 needs_check.",
  "gross_multiplier_low": 1.1,
  "gross_multiplier_high": 1.35
 },
 "fixed_checklist": [
  "계약금 내기 전 은행 대출 사전 상담",
  "대출 불가 시 계약 해제 특약 확인"
 ]
};
const COMPLEXES = [
 {
  "id": "c01",
  "name": "상인푸르지오 센터파크",
  "is_sample": false,
  "supply_type": "cr_reits_jeonse",
  "district": "달서구",
  "lat": 35.818,
  "lng": 128.537,
  "map_x": 9.6,
  "map_z": 22.0,
  "area_m2": 84,
  "deposit": 22200,
  "rent": 0,
  "mgmt": 22,
  "mgmt_known": false,
  "room_id": "room_84a",
  "source": "뉴시스·뉴스1 2026.9 보도",
  "checked_at": "2026-11-26"
 },
 {
  "id": "c02",
  "name": "월성 든든하우스(샘플)",
  "is_sample": true,
  "supply_type": "lh_dundeun",
  "district": "달서구",
  "lat": 35.826,
  "lng": 128.53,
  "map_x": 8.0,
  "map_z": 20.8,
  "area_m2": 59,
  "deposit": 15000,
  "rent": 0,
  "mgmt": 15,
  "mgmt_known": true,
  "room_id": "room_59a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c03",
  "name": "침산 리버뷰(샘플)",
  "is_sample": true,
  "supply_type": "lh_dundeun",
  "district": "북구",
  "lat": 35.9,
  "lng": 128.59,
  "map_x": 17.6,
  "map_z": 6.0,
  "area_m2": 59,
  "deposit": 17000,
  "rent": 0,
  "mgmt": 16,
  "mgmt_known": true,
  "room_id": "room_59a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c04",
  "name": "신암 센트럴(샘플)",
  "is_sample": true,
  "supply_type": "cr_reits_jeonse",
  "district": "동구",
  "lat": 35.885,
  "lng": 128.625,
  "map_x": 23.2,
  "map_z": 9.0,
  "area_m2": 84,
  "deposit": 19500,
  "rent": 0,
  "mgmt": 20,
  "mgmt_known": true,
  "room_id": "room_84a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c05",
  "name": "범어 파크원(샘플)",
  "is_sample": true,
  "supply_type": "cr_reits_jeonse",
  "district": "수성구",
  "lat": 35.858,
  "lng": 128.625,
  "map_x": 23.2,
  "map_z": 14.4,
  "area_m2": 84,
  "deposit": 32000,
  "rent": 0,
  "mgmt": 25,
  "mgmt_known": true,
  "room_id": "room_84a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c06",
  "name": "대곡 그린시티(샘플)",
  "is_sample": true,
  "supply_type": "cr_reits_jeonse",
  "district": "달서구",
  "lat": 35.8085,
  "lng": 128.542,
  "map_x": 9.9,
  "map_z": 24.3,
  "area_m2": 74,
  "deposit": 21000,
  "rent": 0,
  "mgmt": 19,
  "mgmt_known": true,
  "room_id": "room_84a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c07",
  "name": "평리 더힐(샘플)",
  "is_sample": true,
  "supply_type": "lh_dundeun",
  "district": "서구",
  "lat": 35.877,
  "lng": 128.555,
  "map_x": 12.0,
  "map_z": 10.6,
  "area_m2": 84,
  "deposit": 26000,
  "rent": 0,
  "mgmt": 21,
  "mgmt_known": true,
  "room_id": "room_84a",
  "source": "샘플",
  "checked_at": null
 },
 {
  "id": "c08",
  "name": "시지 레이크(샘플)",
  "is_sample": true,
  "supply_type": "cr_reits_jeonse",
  "district": "수성구",
  "lat": 35.835,
  "lng": 128.7,
  "map_x": 35.2,
  "map_z": 19.0,
  "area_m2": 84,
  "deposit": 42000,
  "rent": 0,
  "mgmt": 24,
  "mgmt_known": true,
  "room_id": "room_84a",
  "source": "샘플",
  "checked_at": null
 }
];
/* ═══════ 판정·실부담 계산 (data/rules_reference.py 그대로 옮김 · 수치는 RULES 한 곳) ═══════ */
const ELIG = "eligible", CHECK = "needs_check", NO = "ineligible";
const ST_KO = { eligible: "요건 충족", needs_check: "확인 필요", ineligible: "미충족" };
const ST_ICON = { eligible: "●", needs_check: "◐", ineligible: "○" };
const LIGHT_KO = { on: "요건 충족", dim: "확인 필요", off: "미충족" };
const LIGHT_ICON = { on: "●", dim: "◐", off: "○" };
/* 파이썬 round(x, 1)과 같게: 딱 .x5면 짝수 쪽으로 */
const r1 = v => { const y = v * 10, f = Math.floor(y), d = y - f; if (Math.abs(d - .5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / 10; return Math.round(y) / 10; };
function wonK(v) { v = Math.round(v); const eok = Math.floor(v / 10000), man = v % 10000; if (eok && man) return `${eok}억 ${man.toLocaleString("ko-KR")}만 원`; if (eok) return `${eok}억 원`; return `${man.toLocaleString("ko-KR")}만 원`; }
function worse(a, b) { const o = { eligible: 0, needs_check: 1, ineligible: 2 }; return o[a] >= o[b] ? a : b; }
const fmtN = n => Number(n).toLocaleString("ko-KR");

function incomeStatus(p, annualMax, monthlyMax, deduction) {
  const est = RULES.income_estimate, gross = p.annual_income_gross;
  if (annualMax != null) {
    if (gross != null) return gross <= annualMax ? [ELIG, "입력한 연소득이 기준 이하"] : [NO, `연소득이 기준(${fmtN(annualMax)}만 원) 초과`];
    const high = p.monthly_income * 12 * est.gross_multiplier_high, low = p.monthly_income * 12;
    if (high <= annualMax) return [ELIG, `월 실수령 기준 추정 연소득이 기준(${fmtN(annualMax)}만 원) 이하`];
    if (low > annualMax) return [NO, `월 실수령만으로도 연소득 기준(${fmtN(annualMax)}만 원) 초과`];
    return [CHECK, "월 실수령만으로는 연소득 기준을 판단할 수 없어요"];
  }
  if (monthlyMax != null) {
    const m = p.monthly_income, low = m * est.gross_multiplier_low * (1 - deduction), high = m * est.gross_multiplier_high * (1 - deduction);
    if (high <= monthlyMax) return [ELIG, "추정 소득인정액이 기준 이하"];
    if (low > monthlyMax) return [NO, `추정 소득인정액이 기준(월 ${monthlyMax}만 원) 초과`];
    return [CHECK, "소득인정액은 복지로 모의계산으로 확인이 필요해요"];
  }
  return [ELIG, ""];
}
function personChecks(p, it) {
  const reasons = []; let status = ELIG;
  if (!(it.age_min <= p.age && p.age <= it.age_max)) return [NO, `만 ${it.age_min}~${it.age_max}세 대상 (입력 만 ${p.age}세)`];
  if (it.homeless && !p.homeless) return [NO, "무주택자만 신청할 수 있어요"];
  if (it.daegu_resident_or_moving && !p.daegu_resident_or_moving) return [NO, "대구 거주 또는 전입 예정자 대상"];
  if (it.lives_apart_from_parents && p.lives_with_parents) return [NO, "부모님과 따로 사는 청년 대상"];
  const [s, r] = incomeStatus(p, it.income_max_annual, it.income_max_monthly_recognized, it.earned_income_deduction || 0);
  status = worse(status, s); if (r) reasons.push(r);
  if (s === NO) return [NO, r];
  (it.always_needs_check || []).forEach(n => { status = worse(status, CHECK); reasons.push(`${n} 확인 필요`); });
  return [status, reasons.join(" · ") || "입력 기준 요건 충족"];
}
function profileResult(p) {
  const loans = [], policies = [];
  RULES.loans.forEach(ln => { const [s, r] = personChecks(p, ln); loans.push({ id: ln.id, name: ln.name, status: s, max_amount: ln.max_amount, rate: ln.rate, reason: r, approval_by: ln.approval_by, source_url: ln.source_url, checked_at: ln.checked_at }); });
  const m = RULES.market_loan;
  loans.push({ id: m.id, name: m.name, status: CHECK, max_amount: m.max_amount, rate: m.rate, reason: m.reason, approval_by: m.approval_by, source_url: m.link });
  RULES.policies.forEach(po => { const [s, r] = personChecks(p, po); policies.push({ id: po.id, name: po.name, status: s, reason: r, monthly_amount: po.monthly_amount, support_rate: po.support_rate, approval_by: po.approval_by, source_url: po.source_url, checked_at: po.checked_at, always_needs_check: po.always_needs_check || [] }); });
  return { loans, policies };
}
const interest = (amount, rate) => amount * rate / 100 / 12;
function evaluate(p, c, pr) {
  const loan_needed = Math.max(0, Math.trunc(c.deposit - p.assets));
  const st = {}; [...pr.loans, ...pr.policies].forEach(x => st[x.id] = x.status);
  const pol = {}; RULES.policies.forEach(x => pol[x.id] = x);
  const market = RULES.market_loan;
  let rentSup = 0, rentStatus = null;
  const yr = pol.youth_monthly_rent;
  if (yr && c.rent > 0 && st[yr.id] !== NO && c.deposit <= yr.deposit_max && c.rent <= yr.rent_max) { rentSup = yr.monthly_amount; rentStatus = st[yr.id]; }
  const combos = [], base = c.rent + c.mgmt;
  const add = (status, rate, label, used) => {
    const net = base + interest(loan_needed, rate);
    combos.push({ status, net: r1(net), label, rate, used, rentSup: 0 });
    if (rentStatus) combos.push({ status: worse(status, rentStatus), net: r1(net - rentSup), label: label + " + 청년월세지원", rate, used: [...used, "youth_monthly_rent"], rentSup });
  };
  if (loan_needed === 0) add(ELIG, 0, "대출 없이", []);
  else {
    RULES.loans.forEach(ln => {
      const okHouse = ln.applies_to.includes(c.supply_type) && c.deposit <= ln.deposit_max && loan_needed <= ln.max_amount && (ln.ltv == null || loan_needed <= c.deposit * ln.ltv);
      if (okHouse && st[ln.id] !== NO) add(st[ln.id], ln.rate, ln.name.split("(")[0], [ln.id]);
    });
    const mkOk = loan_needed <= market.max_amount && (market.ltv == null || loan_needed <= c.deposit * market.ltv);
    if (mkOk) {
      add(CHECK, market.rate, "시중 전세대출", [market.id]);
      const di = pol.daegu_interest;
      if (di && st[di.id] !== NO) add(CHECK, market.rate - di.support_rate, "시중 전세대출 + 대구 청년 이자지원", [market.id, di.id]);
    }
  }
  const elig = combos.filter(x => x.status === ELIG);
  const eBest = elig.length ? elig.reduce((a, b) => b.net < a.net ? b : a) : null;
  const best = combos.length ? combos.reduce((a, b) => b.net < a.net ? b : a) : null;
  const worst = (loan_needed === 0 || loan_needed <= market.max_amount) ? r1(base + interest(loan_needed, market.rate)) : null;
  const budget = p.monthly_budget;
  let light, reason, chosen;
  if (eBest && eBest.net <= budget) { light = "on"; chosen = eBest; reason = `${eBest.label} 요건 충족 기준으로 월 ${eBest.net}만 원, 예산 안이에요`; }
  else if (best && best.net <= budget) { light = "dim"; chosen = best; reason = `${best.label}(확인 필요)을 받으면 월 ${best.net}만 원으로 예산 안이에요`; }
  else {
    light = "off"; chosen = best;
    if (!combos.length) { const limit = Math.max(market.max_amount, ...RULES.loans.map(l => l.max_amount)); reason = `필요 대출 ${wonK(loan_needed)}이 대출 한도(${wonK(limit)})보다 ${wonK(loan_needed - limit)} 많아요`; }
    else reason = `지원을 모두 받아도 월 ${best.net}만 원으로 예산보다 ${r1(best.net - budget)}만 원 많아요`;
  }
  return { id: c.id, loan_needed, light, light_reason: reason, net_monthly: eBest ? eBest.net : null, net_monthly_best: best ? best.net : null, net_monthly_worst: worst, financing: chosen ? chosen.label : null, chosen, combos, rentSup };
}
function breakdown(c, ev) {
  const ch = ev.chosen; if (!ch) return null;
  const li = r1(interest(ev.loan_needed, ch.rate));
  return { rent: c.rent, mgmt: c.mgmt, loan_needed: ev.loan_needed, rate: ch.rate, loan_interest: li, rent_support: ch.rentSup || 0, total: ch.net, financing: ch.label };
}
function appliedLists(c, ev, pr) {
  const all = {}; [...pr.loans, ...pr.policies].forEach(x => all[x.id] = x);
  const used = ev.chosen ? ev.chosen.used : [];
  const applied = used.map(id => all[id]).filter(Boolean);
  const not_applied = [];
  pr.policies.forEach(po => {
    if (used.includes(po.id)) return;
    if (po.status === NO) { not_applied.push({ id: po.id, name: po.name, reason: po.reason }); return; }
    if (po.id === "daegu_interest" && used.includes("youth_beotimok")) not_applied.push({ id: po.id, name: po.name, reason: "버팀목 대출 이용자는 대구 이자지원과 중복 불가" });
    else if (po.id === "daegu_interest" && ev.loan_needed === 0) not_applied.push({ id: po.id, name: po.name, reason: "대출이 필요 없어 해당 없음" });
    else if (po.id === "youth_monthly_rent" && c.rent === 0) not_applied.push({ id: po.id, name: po.name, reason: "월세가 없는 전세 단지라 해당 없음" });
    else not_applied.push({ id: po.id, name: po.name, reason: "더 낮은 조합이 있어 이번 계산에선 빠졌어요" });
  });
  return { applied, not_applied };
}

/* ═══════ 생활 편의 평가 (API_SPEC 5장) ═══════ */
function haversine(a, b) { const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const CATS = ["subway", "hospital", "mall", "culture", "university", "park", "office"];
function nearbyOf(c) {
  return CATS.map(cat => {
    let best = null;
    INFRA.filter(i => i.category === cat).forEach(i => { const km = haversine(c, i) * 1.3; if (!best || km < best.km) best = { i, km }; });
    if (!best) return null;
    const km = Math.round(best.km * 10) / 10, walk = km <= 1.5 ? Math.round(km * 15) : null, drive = km > 1.5 ? Math.round(km * 3 + 3) : null;
    return { infra_id: best.i.id, name: best.i.name, category: cat, distance_km: km, walk_min: walk, drive_min: drive, map_x: best.i.map_x, map_z: best.i.map_z };
  }).filter(Boolean);
}
function infraScore(nearby, priorities = []) {
  let sum = 0, max = 0; const by = {};
  nearby.forEach(n => {
    const pts = n.walk_min != null && n.walk_min <= 10 ? 3 : n.walk_min != null && n.walk_min <= 20 ? 2 : n.drive_min != null && n.drive_min <= 15 ? 1 : 0;
    const w = priorities.includes(n.category) ? 2 : 1; sum += pts * w; max += 3 * w; by[n.category] = pts;
  });
  const score = max ? Math.round(sum / max * 100) : 0;
  return { score, label: score >= 70 ? "생활 편의 높음" : score >= 40 ? "생활 편의 보통" : "생활 편의 낮음", by_category: by };
}
if (typeof module !== "undefined") module.exports = { profileResult, evaluate, breakdown, appliedLists };
const P = {
 A:{age:27,monthly_income:250,annual_income_gross:null,assets:1000,homeless:true,lives_with_parents:false,daegu_resident_or_moving:true,monthly_budget:60},
 B:{age:33,monthly_income:320,annual_income_gross:null,assets:4000,homeless:true,lives_with_parents:false,daegu_resident_or_moving:true,monthly_budget:80},
 C:{age:38,monthly_income:280,annual_income_gross:null,assets:2000,homeless:true,lives_with_parents:false,daegu_resident_or_moving:true,monthly_budget:70},
 D:{age:36,monthly_income:480,annual_income_gross:7000,assets:15000,homeless:true,lives_with_parents:false,daegu_resident_or_moving:true,monthly_budget:150}};
const out={};
for (const k in P){ const pr=profileResult(P[k]); out[k]={}; for (const c of COMPLEXES){ const e=evaluate(P[k],c,pr); out[k][c.id]={light:e.light,net:e.net_monthly,best:e.net_monthly_best,worst:e.net_monthly_worst,fin:e.financing,loan:e.loan_needed}; } }
console.log(JSON.stringify(out));

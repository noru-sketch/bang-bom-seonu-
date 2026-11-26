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
      if (di && st[di.id] !== NO && c.deposit <= di.deposit_max) add(CHECK, market.rate - di.support_rate, "시중 전세대출 + 대구 청년 이자지원", [market.id, di.id]);
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
    if (po.id === "daegu_interest" && c.deposit > RULES.policies.find(x => x.id === po.id).deposit_max) not_applied.push({ id: po.id, name: po.name, reason: "보증금이 대구 이자지원 기준(2억5천만 원)을 넘어요" });
    else if (po.id === "daegu_interest" && used.includes("youth_beotimok")) not_applied.push({ id: po.id, name: po.name, reason: "버팀목 대출 이용자는 대구 이자지원과 중복 불가" });
    else if (po.id === "daegu_interest" && ev.loan_needed === 0) not_applied.push({ id: po.id, name: po.name, reason: "대출이 필요 없어 해당 없음" });
    else if (po.id === "youth_monthly_rent" && c.rent === 0) not_applied.push({ id: po.id, name: po.name, reason: "월세가 없는 전세 단지라 해당 없음" });
    else not_applied.push({ id: po.id, name: po.name, reason: "더 낮은 조합이 있어 이번 계산에선 빠졌어요" });
  });
  return { applied, not_applied };
}

/* ═══════ 가까운 시설 (카테고리마다 가장 가까운 1곳) ═══════ */
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
if (typeof module !== "undefined") module.exports = { profileResult, evaluate, breakdown, appliedLists };

{
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HAS3D = typeof window.THREE !== "undefined";
const T3 = window.THREE;
const isMobile = () => innerWidth < 768;
const won = n => Math.round(n).toLocaleString("ko-KR");
const man1 = n => n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1);
function toast(m) { const t = $("#mhToast"); t.textContent = m; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("is-on"), 2400); }

/* ─── 상태 ─── */
const PERSONA = { age: 27, monthly_income: 250, annual_income_gross: null, assets: 1000, homeless: true, lives_with_parents: false, daegu_resident_or_moving: true, monthly_budget: 60, priorities: [] };
const S = { mode: "browse", profile: null, pr: null, evals: {}, sel: null, hover: null, chk: {} };
try { const raw = localStorage.getItem("mh-profile"); if (raw) { S.profile = JSON.parse(raw); } } catch (e) {}
const COMPLEX = COMPLEXES.map(c => Object.assign({}, c, { nearby: nearbyOf(c) }));
function recompute() {
  if (!S.profile) { S.pr = null; S.evals = {}; return; }
  S.pr = profileResult(S.profile); S.evals = {};
  COMPLEX.forEach(c => { S.evals[c.id] = evaluate(S.profile, c, S.pr); });
}
function counts() { const n = { on: 0, dim: 0, off: 0 }; Object.values(S.evals).forEach(e => n[e.light]++); return n; }
function minNet() { const v = Object.values(S.evals).map(e => e.net_monthly).filter(x => x != null); return v.length ? Math.min(...v) : null; }
recompute();

/* ─── 라우팅: 방봄 셸이 #input #map #house 일 때 호출 ─── */
let VIEW = null;
function route(v) {
  VIEW = v;
  $("#mh").hidden = !v;
  if (!v) { House.close(); return; }
  if (!MapView.ok) MapView.init();
  if (v === "house" && !S.sel) S.sel = "c01";
  $("#vInput").hidden = v !== "input";
  const house = v === "house";
  $("#houseView").classList.toggle("is-on", house);
  house ? House.open(S.sel) : House.close();
  if (v === "input") fillForm(S.profile || null);
  renderTop(v); renderPanels();
}

/* ─── 상단 ─── */
function renderTop(v) {
  const per = {}; COMPLEX.forEach(c => per[c.district] = (per[c.district] || 0) + 1);
  $("#dnav").innerHTML = v === "house" ? "" : DISTRICTS.filter(d => per[d[0]]).map(d => `<button data-dx="${d[1]}" data-dz="${d[2]}">${d[0]}<b>${per[d[0]]}</b></button>`).join("");
  $$("#dnav button").forEach(b => b.addEventListener("click", () => { if (location.hash !== "#map") location.hash = "#map"; MapView.fly(+b.dataset.dx, +b.dataset.dz, 40); }));
  $("#topRight").innerHTML = v === "house" ? "" : S.profile && S.mode === "match"
    ? `<button class="btn btn--ghost btn--sm" id="tEdit">조건 바꾸기</button><button class="btn btn--ghost btn--sm" id="tBrowse">둘러보기 모드</button>`
    : `<button class="btn btn--sm" id="tMatch">${S.profile ? "내 조건으로 보기" : "정보 입력하기"}</button>`;
  const e = $("#tEdit"), b = $("#tBrowse"), m = $("#tMatch");
  if (e) e.onclick = () => location.hash = "#input";
  if (b) b.onclick = () => setMode("browse");
  if (m) m.onclick = () => S.profile ? setMode("match") : (location.hash = "#input");
}
function setMode(m) { S.mode = m; MapView.applyMode(true); renderTop("map"); renderPanels(); if (location.hash !== "#map") location.hash = "#map"; }

/* ─── 왼쪽 패널 / 범례 / 숫자 알약 ─── */
let jpOpen = false, plOpen = true;
function syncPl() { const b = $("#plToggle"); const vis = VIEW === "map" && plOpen && !document.body.classList.contains("card-open"); $("#panelL").hidden = !vis; b.hidden = VIEW !== "map"; b.textContent = plOpen ? "−" : "+"; b.setAttribute("aria-expanded", plOpen); b.setAttribute("aria-label", plOpen ? "패널 닫기" : "패널 열기"); }

function renderPanels() {
  const v = VIEW || "map";
  const onMap = v === "map";
  $("#legend").hidden = !onMap; $("#mapHint").hidden = !onMap; $("#pillsR").hidden = true;
  if (!onMap) { closeCard(); }
  if (S.mode === "match" && S.pr) {
    const n = counts(), tot = n.on + n.dim + n.off || 1;
    const row = x => `<div class="jp-row" role="button" tabindex="0"><span class="ico ${x.status}">${ST_ICON[x.status]}</span><span class="nm">${esc(x.name)}</span><span class="st st--${x.status}">${ST_KO[x.status]}</span>
      <span class="jp-more">${esc(x.reason)}<br>최종 결정: ${esc(x.approval_by)}${x.source_url ? ` · <a href="${esc(x.source_url)}" target="_blank" rel="noopener" style="pointer-events:auto">출처</a>` : ""}${x.checked_at ? ` · 확인일 ${esc(x.checked_at)}` : " · 기준일 확인 전(시연용)"}</span></div>`;
    $("#panelL").innerHTML = `<button class="x pl-x" aria-label="패널 닫기"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l10 10M13 3L3 13"/></svg></button><div class="jp"><span class="eyebrow-s">Your result</span><div class="jp-head"><h2>내 조건 판정</h2><button class="jp-fold" id="jpFold">${jpOpen ? "접기" : "대출·지원 보기"}</button></div>
      <div ${jpOpen ? "" : "hidden"}>
        <p class="jp-date">기준 ${esc(RULES.version)} · 시연용 가정치</p>
        <p class="jp-sec">대출</p>${S.pr.loans.map(row).join("")}
        <p class="jp-sec">지원</p>${S.pr.policies.map(row).join("")}
      </div>
      <div class="bar3" aria-hidden="true"><span style="width:${n.on / tot * 100}%;background:var(--teal)"></span><span style="width:${n.dim / tot * 100}%;background:var(--glow)"></span><span style="width:${n.off / tot * 100}%;background:#CFCAC1"></span></div>
      <p class="bar3-txt"><b style="color:var(--green)">●</b> 요건 충족 ${n.on} · ◐ 확인 필요 ${n.dim} · <span class="muted">○ 미충족 ${n.off}</span></p>
      <div class="jp-btns"><button class="btn btn--sm" id="jpConsult">상담 이어가기 →</button></div></div>`;
    $$(".jp-row").forEach(r => { const t = () => r.classList.toggle("is-open"); r.addEventListener("click", t); r.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t(); } }); });
    $("#jpFold").onclick = () => { jpOpen = !jpOpen; renderPanels(); };
    $("#jpConsult").onclick = () => { Consult.open(); Consult.ask("내 판정 결과 쉽게 설명해 줘"); };
    const mn = minNet();
    $("#pillsR").innerHTML = `<span class="pill-n">모은 돈 <b>${won(S.profile.assets)}만</b></span><span class="pill-n">월 예산 <b>${won(S.profile.monthly_budget)}만</b></span>${mn != null ? `<span class="pill-n">지원 반영 최저 <b>월 ${man1(mn)}만</b></span>` : ""}`;
    $("#legend").innerHTML = "";
  } else {
    $("#panelL").innerHTML = `<button class="x pl-x" aria-label="패널 닫기"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l10 10M13 3L3 13"/></svg></button><div class="jp"><span class="eyebrow-s">Browse</span><h2>대구 미분양 ${COMPLEX.length}곳</h2><p class="muted small" style="margin-top:4px">단지를 누르면 주변 시설과 집 정보가 보여요</p>
      <div class="jp-btns"><button class="btn btn--sm" id="bMatch">${S.profile ? "내 조건으로 보기" : "내 조건 넣고 불 켜기"} →</button></div></div>`;
    $("#bMatch").onclick = () => S.profile ? setMode("match") : (location.hash = "#input");
    $("#legend").innerHTML = "";
  }
  bindPl();
}
function bindPl() { const x = $("#panelL .pl-x"); if (x) x.onclick = () => { plOpen = false; syncPl(); }; syncPl(); }
function legendCats() { return Object.keys(CAT_KO).map(k => `<span class="cat"><i style="background:${CAT_LIGHT[k]}"></i>${CAT_KO[k]}</span>`).join(""); }

/* ─── 단지 카드 ─── */
function cardHTML(id) {
  const c = COMPLEX.find(x => x.id === id), ev = S.evals[id], match = S.mode === "match" && ev;
  const pr = (S.profile && S.profile.priorities) || [], near = c.nearby.slice().sort((a, b) => pr.includes(b.category) - pr.includes(a.category)).map(n => `<li><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${CAT_DARK[n.category]};margin-right:6px"></i>${esc(n.name)} · ${n.walk_min != null ? `도보 ${n.walk_min}분` : `차 ${n.drive_min}분`}</span></li>`).join("");
  const mg = c.mgmt_known ? `${c.mgmt}만 원` : `미확인 (추정 ${c.mgmt}만 원)`;
  const roomNote = c.room_id === "room_84a" && c.area_m2 !== 84 ? `<p class="small muted" style="margin-top:6px">집 보기는 ${c.area_m2}㎡ 평면이 아직 없어 84㎡ 구조로 대신 보여줘요.</p>` : "";
  let head = `<div class="cc-plan">${planSVG(buildLayout(c.room_id || "room_84a"))}<span class="cc-plan-tag">평면 예시 · ${c.area_m2}㎡</span></div><div class="cc-top"><div><span class="eyebrow-s">${c.is_sample ? "Sample complex" : "Complex"}</span>${match ? `<span class="st st--${ev.light}">${LIGHT_ICON[ev.light]} ${LIGHT_KO[ev.light]}</span>` : ""}<h2 style="margin-top:${match ? 8 : 0}px">${esc(c.name)}</h2>
    <div class="tags"><span class="tag">${SUPPLY_KO[c.supply_type]}</span><span class="tag">${esc(c.district)}</span><span class="tag">${c.area_m2}㎡</span>${c.is_sample ? '<span class="sample">샘플</span>' : ""}</div></div>
    <button class="x" id="ccX" aria-label="카드 닫기"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l10 10M13 3L3 13"/></svg></button></div>`;
  let body = "";
  if (match) {
    const bd = breakdown(c, ev), al = appliedLists(c, ev, S.pr);
    const main = ev.net_monthly != null ? ev.net_monthly : ev.net_monthly_best;
    body += `<p class="big">지원 반영 후 월 부담<b class="${ev.light === "off" ? "is-off" : ""}">${main != null ? `월 ${man1(main)}만 원` : "계산할 수 없어요"}</b>
      ${ev.net_monthly == null && ev.net_monthly_best != null ? "요건 충족 지원만으로는 어려워요 · 확인 필요까지 받을 때 기준<br>" : ""}지원 모두 받으면 ${man1(ev.net_monthly_best)}만 · 하나도 못 받으면 ${ev.net_monthly_worst != null ? man1(ev.net_monthly_worst) + "만 원" : "대출 한도 초과"}</p>
      <p class="why">${esc(ev.light_reason)}</p>`;
    if (bd) body += `<details class="fold"><summary>계산 내역</summary><table class="calc"><tbody>
      <tr><td>월세</td><td>${man1(bd.rent)}만</td></tr><tr><td>관리비${c.mgmt_known ? "" : " (추정)"}</td><td>${man1(bd.mgmt)}만</td></tr>
      <tr><td>보증금 대출이자<br><span class="muted">${wonK(bd.loan_needed)} × ${bd.rate}% ÷ 12</span></td><td>${man1(bd.loan_interest)}만</td></tr>
      <tr><td>월세 지원</td><td class="neg">−${man1(bd.rent_support)}만</td></tr>
      <tr class="tot"><td>월 실부담 · ${esc(bd.financing)}</td><td>${man1(bd.total)}만</td></tr></tbody></table>
      <p class="small muted" style="margin-top:6px">실부담 = 월세 + 관리비 + 보증금 대출이자 − 월세지원 − 이자지원 (이자지원은 금리에서 빼서 계산)</p></details>`;
    body += `<details class="fold"><summary>적용 지원 · 빠진 지원</summary><ul class="lst">${al.applied.map(a => `<li><span>${esc(a.name)}</span><span class="st st--${a.status}">${ST_KO[a.status]}</span></li>`).join("") || "<li><span>대출·지원 없이 계산</span><span></span></li>"}
      ${al.not_applied.map(a => `<li><span class="muted">${esc(a.name)}</span><span style="white-space:normal;text-align:right">${esc(a.reason)}</span></li>`).join("")}</ul></details>`;
    body += `<details class="fold"><summary>계약 전 체크리스트</summary><ul class="chk">${RULES.fixed_checklist.concat(["등기부등본으로 소유자·근저당 확인", "전세보증보험 가입 가능 여부 확인"]).map((t, i) => `<li><label><input type="checkbox" data-ck="${c.id}-${i}"${S.chk[c.id + "-" + i] ? " checked" : ""}>${esc(t)}</label></li>`).join("")}</ul></details>`;
    const links = [...(APPLY_LINKS[c.supply_type] || []), ...al.applied.map(a => ({ label: a.name.replace("(시연용)", "") + " 안내", url: a.source_url }))];
    body += `<details class="fold"><summary>신청·문의 링크</summary><div class="links">${links.map(l => l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>` : `<span>${esc(l.label)} · 공고 확인 중</span>`).join("")}</div></details>`;
  } else {
    body += `<p class="big">보증금<b>${wonK(c.deposit)}</b>${c.rent ? `월세 ${c.rent}만 원` : "월세 없음 (전세)"} · 관리비 ${mg}</p><p class="why">내 조건을 넣으면 대출·지원을 반영한 실제 월 부담을 계산해 드려요.</p>`;
  }
  body += `<details class="fold"><summary>가까운 시설</summary><ul class="lst">${near}</ul><p class="small muted" style="margin-top:6px">거리는 직선거리 × 1.3으로 추정했어요. 시설 위치는 샘플이에요.</p></details>`;
  body += roomNote;
  body += `<div class="cc-btns"><a href="#house" class="btn" id="ccHouse">집 보기 →</a>${match ? `<button class="btn btn--ghost" id="ccConsult">이 단지 상담하기</button>` : `<button class="btn btn--ghost" id="ccMatch">내 조건으로 보기</button>`}</div>`;
  return `<div class="cc">${head}${body}</div>`;
}
function openCard(id) {
  S.sel = id; const p = $("#panelR"); p.innerHTML = cardHTML(id); p.classList.add("is-open"); p.scrollTop = 0;
  $("#ccX").onclick = () => { closeCard(); MapView.select(null); };
  const cm = $("#ccMatch"); if (cm) cm.onclick = () => S.profile ? setMode("match") : (location.hash = "#input");
  const cc = $("#ccConsult"); if (cc) cc.onclick = () => { Consult.open(); Consult.ask("이 단지 월 부담은 어떻게 계산했어요?"); };
  $$("[data-ck]").forEach(i => i.addEventListener("change", () => S.chk[i.dataset.ck] = i.checked));
  document.body.classList.add("card-open"); syncPl();
}
function closeCard() { document.body.classList.remove("card-open"); $("#panelR").classList.remove("is-open"); syncPl(); }

/* ─── S1 입력 ─── */
const fval = { homeless: 1, lives_with_parents: 0, daegu_resident_or_moving: 1 };
let prio = [];
function fillForm(p) {
  p = p || {};
  $("#f-age").value = p.age ?? ""; $("#f-income").value = p.monthly_income ?? ""; $("#f-gross").value = p.annual_income_gross ?? "";
  $("#f-assets").value = p.assets ?? ""; $("#f-budget").value = p.monthly_budget ?? "";
  fval.homeless = p.homeless === false ? 0 : 1; fval.lives_with_parents = p.lives_with_parents ? 1 : 0; fval.daegu_resident_or_moving = p.daegu_resident_or_moving === false ? 0 : 1;
  prio = [...(p.priorities || [])]; syncSeg(); renderPrio(); $$(".err").forEach(e => e.textContent = "");
}
function syncSeg() { $$("#form .seg").forEach(g => $$("button", g).forEach(b => b.classList.toggle("is-on", String(fval[g.dataset.k]) === b.dataset.v))); }
$$("#form .seg").forEach(g => $$("button", g).forEach(b => b.addEventListener("click", () => { fval[g.dataset.k] = +b.dataset.v; syncSeg(); })));
function renderPrio() {
  $("#prioChips").innerHTML = Object.entries(CAT_KO).map(([k, v]) => `<button type="button" class="chip${prio.includes(k) ? " is-on" : ""}" data-p="${k}" aria-pressed="${prio.includes(k)}">${v}</button>`).join("");
  $$("#prioChips button").forEach(b => b.addEventListener("click", () => { const k = b.dataset.p; prio = prio.includes(k) ? prio.filter(x => x !== k) : [...prio, k]; renderPrio(); }));
}
$("#fillPersona").onclick = () => fillForm(PERSONA);
$("#formBack").onclick = () => { S.mode = "browse"; location.hash = "#map"; };
$("#form").addEventListener("submit", e => {
  e.preventDefault();
  const num = id => { const v = $("#" + id).value.trim(); return v === "" ? null : Number(v); };
  const p = { age: num("f-age"), monthly_income: num("f-income"), annual_income_gross: num("f-gross"), assets: num("f-assets"), monthly_budget: num("f-budget"),
    homeless: !!fval.homeless, lives_with_parents: !!fval.lives_with_parents, daegu_resident_or_moving: !!fval.daegu_resident_or_moving, priorities: prio };
  const errs = { age: p.age == null || p.age < 19 || p.age > 70 ? "19~70 사이로 넣어주세요" : "", income: p.monthly_income == null || p.monthly_income < 0 ? "월 실수령을 넣어주세요" : "",
    assets: p.assets == null || p.assets < 0 ? "모은 돈을 넣어주세요 (없으면 0)" : "", budget: p.monthly_budget == null || p.monthly_budget <= 0 ? "월 예산을 넣어주세요" : "" };
  Object.entries(errs).forEach(([k, v]) => $("#e-" + k).textContent = v);
  const bad = Object.entries(errs).find(([, v]) => v); if (bad) { $("#f-" + bad[0]).focus(); return; }
  S.profile = p; try { localStorage.setItem("mh-profile", JSON.parse(JSON.stringify(p)) && JSON.stringify(p)); } catch (er) {}
  recompute(); S.mode = "match"; jpOpen = false; location.hash = "#map"; MapView.applyMode(true);
});

/* ═══════════════ 3D 공통 ═══════════════ */
const matCache = {};
function mat(hex, o = {}) { const k = hex + JSON.stringify(o); if (matCache[k]) return matCache[k]; const m = new T3.MeshStandardMaterial(Object.assign({ color: new T3.Color(hex).convertSRGBToLinear(), roughness: .9, metalness: 0 }, o)); return matCache[k] = m; }
function box(w, h, d, m) { const b = new T3.Mesh(new T3.BoxGeometry(w, h, d), m); b.castShadow = true; b.receiveShadow = true; return b; }
function rbox(w, h, d, r, m) {
  r = Math.max(.002, Math.min(r, w / 2 - .01, d / 2 - .01)); const bev = Math.min(.018, h / 4), iw = w - bev * 2, id = d - bev * 2, x = -iw / 2, y = -id / 2, rr = Math.max(.001, Math.min(r, iw / 2 - .001, id / 2 - .001));
  const s = new T3.Shape(); s.moveTo(x + rr, y); s.lineTo(x + iw - rr, y); s.quadraticCurveTo(x + iw, y, x + iw, y + rr); s.lineTo(x + iw, y + id - rr); s.quadraticCurveTo(x + iw, y + id, x + iw - rr, y + id); s.lineTo(x + rr, y + id); s.quadraticCurveTo(x, y + id, x, y + id - rr); s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
  const g = new T3.ExtrudeGeometry(s, { depth: Math.max(.002, h - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 }); g.rotateX(-Math.PI / 2); g.translate(0, bev, 0);
  const m2 = new T3.Mesh(g, m); m2.castShadow = true; m2.receiveShadow = true; return m2;
}
function ribbon(pts, width, m, y) {
  const curve = new T3.CatmullRomCurve3(pts.map(p => new T3.Vector3(p[0], y, p[1])), false, "catmullrom", .2);
  const n = Math.max(24, pts.length * 16), sp = curve.getSpacedPoints(n), pos = [], idx = [];
  sp.forEach((p, i) => { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2; pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz); if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); });
  const g = new T3.BufferGeometry(); g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const me = new T3.Mesh(g, m); me.receiveShadow = true; return me;
}
function inPoly(x, z, p) { let o = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) o = !o; } return o; }
function segD(x, z, [ax, az], [bx, bz]) { const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz, t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1); return Math.hypot(x - ax - vx * t, z - az - vz * t); }
function inGeo(x, z, polys) { return polys.some(p => inPoly(x, z, p[0]) && !p.slice(1).some(h => inPoly(x, z, h))); }
function seeded(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ h >>> 15, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }
function renderer(canvas) {
  const r = new T3.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputEncoding = T3.sRGBEncoding; r.toneMapping = T3.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = T3.PCFSoftShadowMap; return r;
}
function dragInput(el, h) {
  const pts = new Map(); let pinch = 0, moved = 0, sx = 0, sy = 0, downT = 0;
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; sx = e.clientX; sy = e.clientY; downT = performance.now(); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } h.down && h.down(e); });
  el.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) { h.hover && h.hover(e); return; }
    const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) h.zoom && h.zoom(d / pinch); pinch = d; }
    else h.drag && h.drag(dx, dy, e);
  });
  const up = e => { if (pts.has(e.pointerId) && pts.size === 1) { if (moved < 6 && h.tap) h.tap(e); h.up && h.up(e, moved); } pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", e => { pts.delete(e.pointerId); pinch = 0; h.up && h.up(e, 99); });
  el.addEventListener("pointerleave", e => { if (!pts.size) h.leave && h.leave(e); });
  el.addEventListener("wheel", e => { e.preventDefault(); h.zoom && h.zoom(Math.exp(-e.deltaY * .0015)); }, { passive: false });
}
function ndc(el, e) { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; }
function badgeTexture(cat) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill(); x.lineWidth = 4; x.strokeStyle = "rgba(0,0,0,.08)"; x.stroke();
  x.fillStyle = CAT_LIGHT[cat]; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineWidth = 7; x.lineCap = "round"; x.lineJoin = "round";
  const P = new Path2D();
  if (cat === "subway") { x.strokeRect(46, 40, 36, 40); x.beginPath(); x.moveTo(50, 92); x.lineTo(56, 82); x.moveTo(78, 92); x.lineTo(72, 82); x.stroke(); }
  else if (cat === "hospital") { x.fillRect(57, 40, 14, 48); x.fillRect(40, 57, 48, 14); }
  else if (cat === "mall") { x.strokeRect(44, 52, 40, 36); x.beginPath(); x.arc(64, 52, 10, Math.PI, 0); x.stroke(); }
  else if (cat === "culture") { x.strokeRect(42, 46, 44, 36); x.beginPath(); x.moveTo(42, 58); x.lineTo(86, 58); x.stroke(); }
  else if (cat === "university") { x.beginPath(); x.moveTo(36, 60); x.lineTo(64, 46); x.lineTo(92, 60); x.lineTo(64, 74); x.closePath(); x.fill(); x.fillRect(52, 70, 24, 12); }
  else if (cat === "park") { x.beginPath(); x.arc(64, 56, 16, 0, Math.PI * 2); x.fill(); x.fillRect(60, 64, 8, 22); }
  else { x.strokeRect(50, 38, 28, 50); x.beginPath(); x.moveTo(58, 50); x.lineTo(70, 50); x.moveTo(58, 62); x.lineTo(70, 62); x.stroke(); }
  const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding; return t;
}
function windowTexture(seed, frac, lit) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256; const x = c.getContext("2d"), rnd = seeded(seed);
  x.fillStyle = lit ? "#000" : "#FFF1D6"; x.fillRect(0, 0, 64, 256);
  for (let r = 0; r < 16; r++) for (let k = 0; k < 4; k++) {
    const on = rnd() < frac;
    if (lit) { if (on) { x.fillStyle = "#fff"; x.fillRect(4 + k * 15, 6 + r * 16, 11, 8); } }
    else { x.fillStyle = "#EFE1C4"; x.fillRect(4 + k * 15, 6 + r * 16, 11, 8); }
  }
  const t = new T3.CanvasTexture(c); t.encoding = T3.sRGBEncoding; return t;
}

/* ═══════════════ 2.5D 미분양 지도 ═══════════════ */
const MapView = {
  ok: false, units: {}, target: new T3.Vector3(innerWidth < 768 ? 14 : 18, 0, innerWidth < 768 ? 18 : 16), zoom: innerWidth < 768 ? 17 : 26, fly0: null, lines: null, lineFor: null, lineT: 0, touchArmed: null,
  init() {
    if (!HAS3D) { $("#mapWrap").innerHTML = '<p style="padding:120px 24px;text-align:center;color:#7A766F">3D 지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>'; return; }
    const cv = $("#mapCanvas"); this.cv = cv; this.r = renderer(cv); this.r.setClearColor(new T3.Color("#e4e2dc"), 1);
    const sc = this.scene = new T3.Scene();
    this.cam = new T3.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    this.hemi = new T3.HemisphereLight(0xfffaf2, 0xd8d2c6, .8); sc.add(this.hemi); this.night = 0; this.nightT = 0;
    const sun = this.sun = new T3.DirectionalLight(0xfff0da, 1.35); sun.castShadow = true; sun.shadow.mapSize.set(isMobile() ? 1024 : 2048, isMobile() ? 1024 : 2048); sun.shadow.bias = -.0005; sun.shadow.radius = 6;
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 }); sun.shadow.camera.updateProjectionMatrix(); sc.add(sun); sc.add(sun.target);
    this.decor = new T3.Group(); sc.add(this.decor); this.buildGround();
    this.buildCity(); this.buildLandmarks(); this.buildUnits();
    this.lines = new T3.Group(); sc.add(this.lines);
    this.ray = new T3.Raycaster();
    const hits = () => Object.values(this.units).map(u => u.hit);
    dragInput(cv, {
      down: () => { this.fly0 = null; },
      drag: (dx, dy) => { const s = 1 / this.zoom, e = Math.asin(1 / Math.sqrt(3)); const right = new T3.Vector3(1, 0, -1).normalize(), fwd = new T3.Vector3(-1, 0, -1).normalize(); this.target.addScaledVector(right, -dx * s).addScaledVector(fwd, dy * s / Math.sin(e)); this.clampT(); },
      zoom: k => { this.zoom = clamp(this.zoom * k, 4.5, 90); this.fly0 = null; },
      hover: e => { if (e.pointerType !== "mouse") return; this.ray.setFromCamera(ndc(cv, e), this.cam); const h = this.ray.intersectObjects(hits())[0]; const id = h ? h.object.userData.id : null; cv.style.cursor = id ? "pointer" : "grab"; if (id !== S.hover) { S.hover = id; this.lift(); } },
      leave: () => { if (S.hover) { S.hover = null; this.lift(); } },
      tap: e => {
        this.ray.setFromCamera(ndc(cv, e), this.cam); const h = this.ray.intersectObjects(hits())[0];
        if (!h) { return; }
        const id = h.object.userData.id;
        this.select(id, true);
      }
    });
    new ResizeObserver(() => this.resize()).observe($("#mapWrap"));
    this.resize(); this.applyMode(false); this.ok = true;
    let t0 = performance.now();
    const loop = t => { const dt = Math.min(.05, (t - t0) / 1000); t0 = t; this.tick(dt, t / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },
  clampT() { this.target.x = clamp(this.target.x, -18, 64); this.target.z = clamp(this.target.z, -76, 62); },
  resize() { const w = innerWidth, h = innerHeight; this.r.setSize(w, h, false); Object.assign(this.cam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 }); this.cam.updateProjectionMatrix(); },
  blocked(x, z, pad) {
    if (!inGeo(x, z, GEO.outline)) return true;
    for (const c of COMPLEX) if (Math.abs(x - c.map_x) < 2.0 + pad && Math.abs(z - c.map_z) < 1.8 + pad) return true;
    for (const i of INFRA) if (Math.hypot(x - i.map_x, z - i.map_z) < (i.category === "park" ? 1.4 : .9)) return true;
    if (GEO.lakes.some(([lx, lz, rx, rz]) => ((x - lx) / (rx + .5)) ** 2 + ((z - lz) / (rz + .5)) ** 2 < 1)) return true;
    const near = (list, extra) => list.some(r => { for (let k = 0; k < r.pts.length - 1; k++) if (segD(x, z, r.pts[k], r.pts[k + 1]) < r.w / 2 + extra) return true; return false; });
    return near(GEO.roads, .4) || near(GEO.rivers, .55);
  },
  buildGround() {
    /* 대구 9개 구·군 실제 경계 위에 지형을 얹어요 */
    const D = this.decor, rnd = seeded("ground-v5");
    const shapeOf = poly => { const sh = new T3.Shape(poly[0].map(([x, z]) => new T3.Vector2(x, z))); poly.slice(1).forEach(h => sh.holes.push(new T3.Path(h.map(([x, z]) => new T3.Vector2(x, z))))); return sh; };
    const flat = (sh, color, y) => { const g = new T3.ShapeGeometry(sh, 8); g.rotateX(Math.PI / 2); const m = new T3.Mesh(g, mat(color, { side: T3.DoubleSide })); m.position.y = y; m.receiveShadow = true; D.add(m); return m; };
    const ell = (x, z, rx, rz) => { const s = new T3.Shape(); s.absellipse(x, z, rx, rz, 0, Math.PI * 2, false, 0); return s; };
    /* 판: 대구 외곽선을 두께 있는 판으로 */
    GEO.outline.forEach(p => { const g = new T3.ExtrudeGeometry(shapeOf(p), { depth: .7, bevelEnabled: false }); g.rotateX(Math.PI / 2); const m = new T3.Mesh(g, mat("#cfcabf")); m.position.y = 0; m.receiveShadow = true; this.scene.add(m); });
    /* 구·군 면: 도심은 밝게, 군 지역은 연한 초록 */
    const tone = { 중구: "#f8f7f3", 서구: "#f6f5f0", 남구: "#f7f6f1", 북구: "#f5f4ef", 동구: "#f4f3ed", 수성구: "#f6f5f0", 달서구: "#f5f4ef", 달성군: "#eaeee4", 군위군: "#e8ede2" };
    Object.entries(GEO.gu).forEach(([k, ps]) => ps.forEach(p => flat(shapeOf(p), tone[k] || "#efede7", .004)));
    /* 산: 실제 산 위치에 숲 덩어리 (도심 밖만) */
    const trees = [];
    GEO.mounts.forEach(([mx, mz, r]) => { for (let k = 0; k < r * r * 7; k++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r, x = mx + Math.cos(a) * d, z = mz + Math.sin(a) * d; if (!inGeo(x, z, GEO.outline) || inGeo(x, z, GEO.urban)) continue; const hgt = 1 - d / r; trees.push([x, z, .34 + rnd() * .26, .2 + hgt * .9 + rnd() * .15, rnd()]); } });
    /* 군 지역 들판·마을 조각 */
    for (let k = 0; k < 2600; k++) { const x = -20 + rnd() * 87, z = -79 + rnd() * 144; if (!inGeo(x, z, GEO.outline) || inGeo(x, z, GEO.urban)) continue; if (rnd() < .22) trees.push([x, z, .25 + rnd() * .2, .16 + rnd() * .2, rnd()]); }
    /* 호수 · 공원 · 강 · 도로 */
    GEO.lakes.forEach(([x, z, rx, rz]) => { flat(ell(x, z, rx + .3, rz + .25), "#e3e2d8", .006); flat(ell(x, z, rx, rz), "#a9c9cb", .008); });
    INFRA.filter(i => i.category === "park").forEach(i => { flat(ell(i.map_x, i.map_z, 1.25, 1.0), "#dbe5d6", .007); for (let k = 0; k < 9; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * .9; trees.push([i.map_x + Math.cos(a) * d * 1.15, i.map_z + Math.sin(a) * d * .9, .2 + rnd() * .1, .16, rnd()]); } });
    GEO.rivers.forEach(r => { D.add(ribbon(r.pts, r.w + .8, mat("#dfe6dc"), .009)); D.add(ribbon(r.pts, r.w, mat("#a9c9cb", { roughness: .3 }), .011)); });
    GEO.roads.forEach(r => { D.add(ribbon(r.pts, r.w + .36, mat("#f7f5f1"), .012)); D.add(ribbon(r.pts, r.w, mat("#d0ccc3"), .014)); if (r.w >= .6) D.add(ribbon(r.pts, .04, mat("#f6f4ef"), .016)); });
    const geo = new T3.IcosahedronGeometry(1, 0); geo.translate(0, .55, 0);
    const im = new T3.InstancedMesh(geo, new T3.MeshStandardMaterial({ roughness: 1, flatShading: true }), trees.length), m = new T3.Matrix4(), q = new T3.Quaternion();
    const pal = ["#b9cbb2", "#aec4a8", "#c4d3bc", "#a6bd9f"].map(h => new T3.Color(h).convertSRGBToLinear());
    trees.forEach((t, i) => { m.compose(new T3.Vector3(t[0], 0, t[1]), q, new T3.Vector3(t[2], t[3], t[2])); im.setMatrixAt(i, m); im.setColorAt(i, pal[Math.floor(t[4] * pal.length)]); });
    im.receiveShadow = true; D.add(im);
    /* 구·군 이름: 바닥에 눕힌 글씨 */
    this.guLabels = [];
    const mk = () => Object.entries(GEO.label).forEach(([k, [x, z]]) => {
      const c = document.createElement("canvas"); c.width = 512; c.height = 160; const t = c.getContext("2d");
      t.font = '600 92px "PretendardLocal", sans-serif'; t.fillStyle = "rgba(31,38,34,.34)"; t.textAlign = "center"; t.textBaseline = "middle"; t.fillText(k, 256, 84);
      const tex = new T3.CanvasTexture(c); tex.encoding = T3.sRGBEncoding; tex.anisotropy = 8;
      const big = k === "달성군" || k === "군위군", w = big ? 9 : k === "중구" ? 3.2 : 5;
      const g = new T3.PlaneGeometry(w, w * 160 / 512); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 4);
      const me = new T3.Mesh(g, new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); me.position.set(x, .03, z); me.renderOrder = 4; this.scene.add(me); this.guLabels.push(me);
    });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(mk);
    this.buildArt();
  },
  buildArt() {
    /* 단지 주변 바닥 지도: OpenStreetMap 데이터로 다시 그린 그림(img/map, 8x8 단위). 가장자리는 둥글게 흐려지게 */
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, "#fff"); g.addColorStop(.6, "#fff"); g.addColorStop(1, "#000");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const fade = new T3.CanvasTexture(c), loader = new T3.TextureLoader();
    COMPLEX.forEach(u => loader.load(`img/map/${u.id}.jpg`, tex => {
      tex.encoding = T3.sRGBEncoding; tex.anisotropy = 8;
      const top = u.id === "c01", geo = new T3.PlaneGeometry(8, 8); geo.rotateX(-Math.PI / 2);
      const m = new T3.Mesh(geo, new T3.MeshStandardMaterial({ map: tex, alphaMap: fade, transparent: true, depthWrite: false, roughness: 1, metalness: 0 }));
      m.position.set(u.map_x, top ? .02 : .018, u.map_z); m.renderOrder = top ? 2 : 1; m.receiveShadow = true; this.decor.add(m);
    }, undefined, () => {})); /* 파일로 열면(file://) 그림이 안 올라와도 기본 지도는 그대로 */
  },
  buildCity() {
    /* 도심 격자 블록 (예시, 실제 건물 아님): 미분양 단지보다 낮고 무채색으로 */
    const rnd = seeded("daegu-v5"), apt = [], low = [], field = [], CW = 2.0, CD = 1.7;
    for (let gx = -11; gx < 34; gx++) for (let gz = -12; gz < 40; gz++) {
      const cx = gx * CW + CW / 2, cz = gz * CD + CD / 2;
      if (!inGeo(cx, cz, GEO.urban) || rnd() < .3 || rnd() < .5) continue;
      const free = (x, z, pad) => !this.blocked(x, z, pad) && inGeo(x, z, GEO.urban) && !COMPLEX.some(u => Math.hypot(x - u.map_x, z - u.map_z) < 3.2); /* 바닥 지도 위에는 예시 블록을 두지 않음 */
      const kind = rnd(), dense = Math.max(0, 1 - Math.hypot(cx - 18, cz - 13) / 22);
      if (kind < .36 + dense * .2) {
        const rows = 2 + Math.floor(rnd() * 2), hgt = (.3 + rnd() * .28 + dense * .2) * .6;
        for (let r = 0; r < rows; r++) { const z = cz - CD * .3 + r * (CD * .6 / Math.max(1, rows - 1)); for (const x of [cx - .45, cx + .45]) if (free(x, z, .15)) apt.push([x, z, .78, .24, hgt * (.85 + rnd() * .3)]); }
      } else if (kind < .9) {
        for (let k = 0; k < 7; k++) { const x = cx + (rnd() - .5) * CW * .8, z = cz + (rnd() - .5) * CD * .8; if (free(x, z, .1)) low.push([x, z, .22 + rnd() * .2, .2 + rnd() * .18, (.08 + rnd() * .1) * .7]); }
      } else if (free(cx, cz, .5)) { field.push([cx - .25, cz]); apt.push([cx + .55, cz, .26, .9, .18]); }
    }
    const inst = (arr, color) => {
      const geo = new T3.BoxGeometry(1, 1, 1); geo.translate(0, .5, 0);
      const im = new T3.InstancedMesh(geo, mat(color, { roughness: 1 }), arr.length), m = new T3.Matrix4(), q = new T3.Quaternion();
      arr.forEach((b, i) => { m.compose(new T3.Vector3(b[0], 0, b[1]), q, new T3.Vector3(b[2], b[4], b[3])); im.setMatrixAt(i, m); });
      im.castShadow = true; im.receiveShadow = true; this.decor.add(im);
    };
    inst(apt, "#eeeeec"); inst(low, "#ebeae7");
    field.forEach(([x, z]) => { const f = rbox(1.0, .02, 1.1, .3, mat("#e2d9c8")); f.position.set(x, 0, z); f.castShadow = false; this.decor.add(f); });
  },
  buildLandmarks() {
    this.marks = [];
    INFRA.forEach(i => {
      const g = new T3.Group(); g.position.set(i.map_x, 0, i.map_z);
      const wall = mat("#e9e7e2");
      if (i.category === "subway") { const p = rbox(1.2, .12, .7, .1, wall); g.add(p); const cn = box(1.0, .05, .5, mat("#D8DAD6")); cn.position.y = .36; g.add(cn); [-.4, .4].forEach(x => { const c = box(.05, .3, .05, wall); c.position.set(x, .2, 0); g.add(c); }); }
      else if (i.category === "park") { const p = rbox(1.4, .05, 1.1, .2, mat("#DCE6DE")); g.add(p); [[-.35, -.2], [.3, .15], [0, .3]].forEach(([x, z]) => { const t = new T3.Mesh(new T3.SphereGeometry(.2, 12, 8), mat("#C9D8CC")); t.position.set(x, .3, z); t.castShadow = true; g.add(t); }); }
      else if (i.category === "university") { [[-.35, 0], [.4, .1]].forEach(([x, z]) => { const b = rbox(.6, .5, .5, .05, wall); b.position.set(x, 0, z); g.add(b); }); }
      else if (i.category === "mall") g.add(rbox(1.5, .35, 1.0, .06, wall));
      else if (i.category === "culture") { g.add(rbox(1.0, .42, .8, .05, wall)); const a = box(.8, .04, .25, mat("#D8DAD6")); a.position.set(0, .3, .5); g.add(a); }
      else if (i.category === "office") g.add(rbox(.7, .7, .7, .05, wall));
      else { g.add(rbox(1.0, .55, .8, .05, wall)); }
      const sp = new T3.Sprite(new T3.SpriteMaterial({ map: badgeTexture(i.category), transparent: true, depthTest: false })); sp.scale.set(.55, .55, 1); sp.position.y = 1.1; sp.renderOrder = 5; g.add(sp);
      g.userData = { i, sp }; this.scene.add(g); this.marks.push(g);
    });
  },
  buildUnits() {
    COMPLEX.forEach(c => {
      const g = new T3.Group(); g.position.set(c.map_x, 0, c.map_z); this.scene.add(g);
      const rim = rbox(3.3, .03, 2.8, .3, mat("#d9e8de")); g.add(rim); const site = rbox(3.1, .05, 2.6, .25, mat("#f7f2e8")); g.add(site);
      const rnd = seeded(c.id), n = 3 + (rnd() > .5 ? 1 : 0), L = rnd() > .5;
      const wallTex = windowTexture(c.id, 1, false);
      const em = { browse: windowTexture(c.id, .4, true), on: windowTexture(c.id, .7, true), dim: windowTexture(c.id, .3, true) };
      const wallM = new T3.MeshStandardMaterial({ color: 0xffffff, map: wallTex, roughness: .9, emissive: new T3.Color("#FFC46B").convertSRGBToLinear(), emissiveMap: em.browse, emissiveIntensity: 1.2 });
      const roofM = new T3.MeshStandardMaterial({ color: new T3.Color("#FFF1D6").convertSRGBToLinear(), roughness: .9 });
      const bandM = new T3.MeshStandardMaterial({ color: new T3.Color("#1f6b4f").convertSRGBToLinear(), roughness: .8 });
      const blds = new T3.Group(); g.add(blds); let top = 0;
      for (let k = 0; k < n; k++) {
        const h = (2.7 + rnd() * 1.1) * 2.5, x = L && k === n - 1 ? .95 : -1.05 + k * (2.1 / (n - (L ? 2 : 1) || 1)), z = L && k === n - 1 ? .45 : -.4;
        const b = new T3.Mesh(new T3.BoxGeometry(.62, h, 1.0), [wallM, wallM, roofM, roofM, wallM, wallM]); b.castShadow = true; b.receiveShadow = true;
        if (L && k === n - 1) b.rotation.y = Math.PI / 2;
        b.position.set(clamp(x, -1.05, 1.05), h / 2 + .05, z); blds.add(b); top = Math.max(top, h);
        const t = .06, y = h + .07, bw = .62, bd = 1.0, rot = b.rotation.y;
        const band = new T3.Group(); band.position.set(b.position.x, y, b.position.z); band.rotation.y = rot;
        [[0, -bd / 2 + t / 2, bw, t], [0, bd / 2 - t / 2, bw, t], [-bw / 2 + t / 2, 0, t, bd], [bw / 2 - t / 2, 0, t, bd]].forEach(([px, pz, w, d]) => { const m = new T3.Mesh(new T3.BoxGeometry(w, .05, d), bandM); m.position.set(px, 0, pz); band.add(m); });
        blds.add(band);
        const crown = new T3.Mesh(new T3.BoxGeometry(bw * .55, .22, bd * .4), bandM); crown.position.set(b.position.x, h + .16, b.position.z); crown.rotation.y = rot; blds.add(crown);
      }
      const beam = new T3.Mesh(new T3.CylinderGeometry(1.3, 1.55, 22, 32, 1, true), new T3.MeshBasicMaterial({ map: beamTex(), color: 0xffc46b, transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide })); beam.position.y = 11; beam.renderOrder = 3; g.add(beam);
      const glow = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex(), color: 0xffc46b, blending: T3.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })); glow.scale.set(6.5, 6.5, 1); glow.position.y = 1.4; g.add(glow);
      const ring = new T3.Mesh(new T3.RingGeometry(1.75, 1.88, 48), new T3.MeshBasicMaterial({ color: new T3.Color("#1f6b4f").convertSRGBToLinear(), transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; g.add(ring);
      const ring0 = new T3.Mesh(new T3.RingGeometry(1.75, 1.95, 48), new T3.MeshBasicMaterial({ color: new T3.Color("#1f6b4f").convertSRGBToLinear(), transparent: true, opacity: 0, depthWrite: false })); ring0.rotation.x = -Math.PI / 2; ring0.position.y = .06; g.add(ring0);
      const sq = new T3.LineSegments(new T3.EdgesGeometry(new T3.PlaneGeometry(3.5, 3.0)), new T3.LineDashedMaterial({ color: new T3.Color("#9a6a1f").convertSRGBToLinear(), dashSize: .14, gapSize: .1, transparent: true, opacity: 0 })); sq.rotation.x = -Math.PI / 2; sq.position.y = .05; sq.computeLineDistances(); g.add(sq);
      /* 클릭 대상: 동 묶음 전체를 덮는 보이지 않는 박스 */
      const hit = new T3.Mesh(new T3.BoxGeometry(3.6, top + 1, 3.2), new T3.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.y = (top + 1) / 2; hit.userData.id = c.id; g.add(hit);
      const lbl = document.createElement("button"); lbl.className = "clabel"; lbl.setAttribute("aria-label", c.name + " 카드 열기");
      lbl.addEventListener("click", () => this.select(c.id, true)); $("#lblLayer").appendChild(lbl);
      this.units[c.id] = { c, g, blds, wallM, roofM, bandM, em, glow, beam, ring, ring0, top, sq, hit, lbl, cur: 1.2, tgt: 1.2, delay: 0, light: "browse", lift: 0 };
    });
  },
  applyMode(animate) {
    if (!this.ok && !this.units.c01) return;
    const order = ["on", "dim", "off"];
    const ids = Object.keys(this.units);
    const ranked = ids.slice().sort((a, b) => order.indexOf((S.evals[a] || {}).light) - order.indexOf((S.evals[b] || {}).light));
    ranked.forEach((id, k) => {
      const u = this.units[id], light = S.mode === "match" && S.evals[id] ? S.evals[id].light : "browse";
      u.light = light; u.delay = animate && !REDUCED ? performance.now() / 1000 + k * .1 : 0;
      u.wallM.emissiveMap = light === "off" ? u.em.browse : u.em[light]; u.wallM.needsUpdate = true;
      u.tgt = { browse: 1.0, on: 3.0, dim: 1.0, off: 0 }[light];
      if (animate && light !== "browse") u.cur = 0;
      const off = light === "off";
      u.wallM.color.set(off ? new T3.Color("#c3c6c4").convertSRGBToLinear() : new T3.Color("#ffffff"));
      u.bandM.color.set(new T3.Color(off ? "#9DB5B1" : "#1f6b4f").convertSRGBToLinear());
      const ev = S.evals[id];
      u.lbl.className = "clabel" + (light === "on" ? " is-on" : light === "dim" ? " is-dim" : light === "off" ? " is-off" : "");
      u.lbl.innerHTML = (light !== "browse" ? `<i>${LIGHT_ICON[light]}</i>` : `<i class="b">●</i>`) + esc(u.c.name.replace("(샘플)", ""));
    });
    this.nightT = S.mode === "match" ? 1 : 0;
    if (S.sel && $("#panelR").classList.contains("is-open")) openCard(S.sel);
  },
  lift() { Object.entries(this.units).forEach(([id, u]) => u.liftT = (id === S.hover || id === S.sel) ? .05 : 0); },
  fly(x, z, zoom) { this.fly0 = { x, z, zoom: zoom || this.zoom, t: 0, fx: this.target.x, fz: this.target.z, fzoom: this.zoom }; },
  select(id, fly) {
    if (id && !this.home) this.home = { x: this.target.x, z: this.target.z, zoom: this.zoom };
    S.sel = id; this.lift(); this.showLines(id);
    if (!id) { if (this.home) { this.fly(this.home.x, this.home.z, this.home.zoom); this.home = null; } return; }
    if (location.hash !== "#map") location.hash = "#map";
    /* 동 중간 높이가 화면 가운데 오게: 등각 시점에서 높이 H는 바닥 (x-H, z-H)와 겹쳐 보여요 */
    const u = this.units[id], c = u.c, m = u.top * .45; if (fly) this.fly(c.map_x - m + (isMobile() ? 0 : 1.6), c.map_z - m + (isMobile() ? 2.2 : 0), clamp(this.zoom, 36, 44));
    openCard(id);
  },
  showLines(id) {
    while (this.lines.children.length) { const o = this.lines.children.pop(); o.geometry && o.geometry.dispose(); }
    $$(".ilabel", $("#lblLayer")).forEach(e => e.remove());
    this.lineFor = id; this.lineT = 0;
    this.marks.forEach(m => { m.userData.sp.scale.setScalar(.48); m.userData.sp.material.opacity = id ? .35 : .7; });
    if (!id) return;
    const u = this.units[id], c = u.c, top = Math.max(...u.blds.children.filter(b => b.geometry && b.geometry.parameters && b.geometry.parameters.height > 1).map(b => b.geometry.parameters.height)) + .2;
    c.nearby.forEach(n => {
      const a = new T3.Vector3(c.map_x, top, c.map_z), b = new T3.Vector3(n.map_x, 1.1, n.map_z), mid = a.clone().lerp(b, .5); mid.y = Math.max(a.y, b.y) + 1.0;
      const curve = new T3.QuadraticBezierCurve3(a, mid, b), tube = new T3.TubeGeometry(curve, 40, .04, 6, false);
      const m = new T3.Mesh(tube, new T3.MeshBasicMaterial({ color: new T3.Color(CAT_DARK[n.category]).convertSRGBToLinear() })); m.userData.count = tube.index.count; tube.setDrawRange(0, 0); this.lines.add(m);
      const mk = this.marks.find(g => g.userData.i.id === n.infra_id); if (mk) { mk.userData.sp.scale.setScalar(.72); mk.userData.sp.material.opacity = 1; }
      const el = document.createElement("span"); el.className = "ilabel"; el.innerHTML = `<i style="background:${CAT_DARK[n.category]}"></i>${esc(n.name)} · ${n.walk_min != null ? "도보 " + n.walk_min + "분" : "차 " + n.drive_min + "분"}`; el.style.opacity = 0; el._p = b.clone(); $("#lblLayer").appendChild(el);
    });
  },
  project(v) { const p = v.clone().project(this.cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; },
  tick(dt, time) {
    if (VIEW !== "map" && VIEW !== "input") return;
    if (this.fly0) { const f = this.fly0; f.t = Math.min(1, f.t + dt / .6); const k = 1 - Math.pow(1 - f.t, 3); this.target.set(f.fx + (f.x - f.fx) * k, 0, f.fz + (f.z - f.fz) * k); this.zoom = f.fzoom + (f.zoom - f.fzoom) * k; if (f.t >= 1) this.fly0 = null; }
    const off = new T3.Vector3(20, 20, 20); this.cam.position.copy(this.target).add(off); this.cam.lookAt(this.target); this.cam.zoom = this.zoom; this.cam.updateProjectionMatrix();
    this.sun.position.copy(this.target).add(new T3.Vector3(10, 15, 3)); this.sun.target.position.copy(this.target);
    const now = performance.now() / 1000;
    this.night += (this.nightT - this.night) * Math.min(1, dt * 2.5); const n = this.night;
    this.hemi.intensity = .8 - .42 * n; this.sun.intensity = 1.35 - .8 * n;
    if (!this._c0) { this._c0 = new T3.Color("#e4e2dc"); this._c1 = new T3.Color("#cdd1d0"); this._cc = new T3.Color(); }
    this.r.setClearColor(this._cc.copy(this._c0).lerp(this._c1, n), 1);
    Object.values(this.units).forEach(u => {
      if (now >= u.delay) u.cur += (u.tgt - u.cur) * Math.min(1, dt * 6);
      let e = u.cur;
      if (u.light === "dim") e = .3 + 1.3 * (.5 + .5 * Math.sin(time * Math.PI * 2 / 3));
      u.wallM.emissiveIntensity = e * (now >= u.delay ? 1 : 0);
      u.beam.material.opacity = u.light === "on" ? (.22 + .08 * Math.sin(time * 2.4)) * Math.min(1, u.cur / 3) : 0;
      u.glow.material.opacity = u.light === "on" ? .8 * Math.min(1, u.cur / 3) : u.light === "dim" ? .25 * (e / 1.4) : u.light === "browse" ? .18 : 0;
      if (u.light === "on" && !REDUCED) { const p = (time % 1.8) / 1.8; u.ring.scale.setScalar(.8 + p * .6); u.ring.material.opacity = .7 * (1 - p); } else u.ring.material.opacity = 0;
      u.ring0.material.opacity = u.light === "on" ? .9 : 0;
      u.sq.material.opacity = u.light === "dim" ? .5 : 0;
      u.lift = (u.lift || 0) + ((u.liftT || 0) - (u.lift || 0)) * Math.min(1, dt * 10); u.blds.position.y = u.lift;
      const p = this.project(new T3.Vector3(u.c.map_x, u.top + .6, u.c.map_z)); const far = this.zoom < 18; u.lbl.classList.toggle("is-sel", S.sel === u.c.id && document.body.classList.contains("card-open"));
      u.lbl.style.left = p.x + "px"; u.lbl.style.top = p.y + "px"; u.lbl.classList.toggle("is-dot", far); const focus = this.lineFor && S.sel; u.lbl.classList.toggle("is-faint", !!focus && focus !== u.c.id);
    });
    const near = this.zoom >= 30;
    this.lines.visible = near;
    if (this.lineFor) {
      if (!this.fly0) this.lineT = Math.min(1, this.lineT + dt / .4); /* 줌인이 끝난 뒤에 선을 그려요 */
      this.lines.children.forEach(m => m.geometry.setDrawRange(0, Math.floor(m.userData.count * this.lineT / 3) * 3));
    }
    /* 시설 라벨: 겹치면 위아래로 밀어내요 */
    const placed = [];
    $$(".ilabel", $("#lblLayer")).map(el => ({ el, p: this.project(el._p), w: el.offsetWidth + 6, h: el.offsetHeight + 4 })).sort((a, b) => a.p.y - b.p.y).forEach(o => {
      let y = o.p.y;
      for (let k = 0; k < placed.length; k++) { const q = placed[k]; if (Math.abs(o.p.x - q.x) < (o.w + q.w) / 2 && Math.abs(y - q.y) < (o.h + q.h) / 2) { y = q.y + (o.h + q.h) / 2 + 1; k = -1; } } /* +1: 소수점 오차로 같은 자리에서 다시 겹치지 않게 */
      placed.push({ x: o.p.x, y, w: o.w, h: o.h });
      const el = o.el; el.style.left = o.p.x + "px"; el.style.top = y + "px"; el.style.opacity = near && this.lineT >= 1 ? 1 : 0; el.style.visibility = near ? "visible" : "hidden";
    });
    this.r.render(this.scene, this.cam);
  }
};
let _beam = null;
function beamTex() { if (_beam) return _beam; const c = document.createElement("canvas"); c.width = 4; c.height = 128; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(.35, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 4, 128); _beam = new T3.CanvasTexture(c); return _beam; }
let _glow = null;
function glowTex() { if (_glow) return _glow; const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.4, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return _glow = new T3.CanvasTexture(c); }

/* ═══════════════ 가구 모형·썸네일 ═══════════════ */
function makeFurn(it) {
    const g = new T3.Group();
    const wood = mat("#B88B5E"), fab = mat("#D8CDBB"), top = mat("#EFE6D6"), white = mat("#F4F1EA"), w = it.w, d = it.d, h = it.h;
    const add = (m, x, y2, z) => { m.position.set(x, y2, z); g.add(m); };
    if (it.cat === "bed") { add(rbox(w, .28, d, .04, wood), 0, 0, 0); add(rbox(w - .06, .17, d - .08, .06, white), 0, .28, .02); add(rbox(w, .9, .07, .03, wood), 0, 0, -d / 2 + .035); }
    else if (it.cat === "sofa") { add(rbox(w, .42, d, .06, fab), 0, 0, 0); add(rbox(w, .4, .2, .06, fab), 0, .38, -d / 2 + .1); [-1, 1].forEach(s => add(rbox(.16, .22, d, .05, fab), s * (w / 2 - .08), .38, 0)); }
    else if (it.cat === "dining_table" || it.cat === "desk") { if (it.round) { const t = new T3.Mesh(new T3.CylinderGeometry(w / 2, w / 2, .04, 32), top); t.castShadow = true; add(t, 0, h - .02, 0); add(box(.06, h - .04, .06, wood), 0, (h - .04) / 2, 0); } else { add(rbox(w, .04, d, .02, top), 0, h - .04, 0); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => add(box(.045, h - .04, .045, wood), sx * (w / 2 - .06), (h - .04) / 2, sz * (d / 2 - .06))); } }
    else if (it.cat === "tv_stand") { add(rbox(w, h, d, .02, wood), 0, 0, 0); add(box(w * .72, .5, .04, mat("#1C1F1C", { roughness: .4 })), 0, h + .27, -d / 2 + .1); }
    else if (it.cat === "light") { add(new T3.Mesh(new T3.CylinderGeometry(.04, .04, h, 12), wood), 0, h / 2, 0); const s = new T3.Mesh(new T3.SphereGeometry(.18, 16, 12), new T3.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffd9a0, emissiveIntensity: .6 })); add(s, 0, h, 0); }
    else add(rbox(w, h, d, .02, top), 0, 0, 0);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}
const Thumbs = {
  cache: {},
  get(F) {
    if (this.cache[F.id]) return this.cache[F.id];
    if (!HAS3D) return "";
    try {
      if (!this.r) { const c = document.createElement("canvas"); this.r = new T3.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true }); this.r.setPixelRatio(1); this.r.setSize(320, 240, false); this.r.outputEncoding = T3.sRGBEncoding; this.r.toneMapping = T3.ACESFilmicToneMapping; this.r.shadowMap.enabled = true; this.r.setClearColor(new T3.Color("#efeeea"), 1); }
      const sc = new T3.Scene(); sc.add(new T3.HemisphereLight(0xfffaf2, 0xd9d2c4, .75)); const sun = new T3.DirectionalLight(0xfff6ea, 1.0); sun.position.set(3, 6, 4); sun.castShadow = true; sc.add(sun);
      const it = Object.assign({ rot: 0 }, F); const g = makeFurn(it); sc.add(g);
      const fl = new T3.Mesh(new T3.PlaneGeometry(20, 20), new T3.ShadowMaterial({ opacity: .12 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; sc.add(fl);
      const size = Math.max(F.w, F.d, F.h + (F.cat === "tv_stand" ? .8 : 0)), cam = new T3.PerspectiveCamera(30, 4 / 3, .05, 50), d = size * 2.3 + .6;
      const cy = (F.h + (F.cat === "tv_stand" ? .55 : 0)) * .45; cam.position.set(d * .62, cy + d * .5, d * .78); cam.lookAt(0, cy, 0);
      this.r.render(sc, cam); const url = this.r.domElement.toDataURL("image/jpeg", .86);
      sc.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      return this.cache[F.id] = url;
    } catch (e) { return ""; }
  }
};
const thumbImg = (F, cls) => { const u = Thumbs.get(F); return u ? `<img class="${cls}" src="${u}" alt="${esc(F.name)} 3D 예시 이미지">` : ""; };

/* ═══════════════ S4 집 보기 ═══════════════ */
const House = {
  ok: false, cid: null, L: null, items: [], cam: "bird", sel: null, tab: "place", budget: 3000000, rec: null, layoutId: "basic",
  orbit: { th: .62, ph: .9, r: 16 }, look: { yaw: 0, pitch: -.1, x: 0, z: 0 },
  init() {
    if (this.ok || !HAS3D) return; this.ok = true;
    const cv = $("#houseCanvas"); this.cv = cv; this.r = renderer(cv); this.r.setClearColor(new T3.Color("#efeeea"), 1);
    this.scene = new T3.Scene();
    this.persp = new T3.PerspectiveCamera(38, 1, .05, 200); this.persp.rotation.order = "YXZ";
    this.ortho = new T3.OrthographicCamera(-1, 1, 1, -1, -50, 100);
    this.scene.add(new T3.HemisphereLight(0xfffaf2, 0xd9d2c4, .75));
    const sun = new T3.DirectionalLight(0xfff6ea, 1.0); sun.position.set(2.5, 14, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0004; this.scene.add(sun);
    this.ray = new T3.Raycaster(); this.floor = new T3.Plane(new T3.Vector3(0, 1, 0), 0);
    let drag = null;
    dragInput(cv, {
      down: e => {
        drag = null; if (this.cam === "inside") return;
        this.ray.setFromCamera(ndc(cv, e), this.curCam());
        const h = this.ray.intersectObjects(this.furnGroup ? this.furnGroup.children : [], true)[0];
        if (h) { let o = h.object; while (o.parent && !o.userData.uid) o = o.parent; const it = this.items.find(i => i.uid === o.userData.uid); if (it) { this.select(it.uid); drag = { it, ox: it.cx, oz: it.cz }; } }
      },
      drag: (dx, dy, e) => {
        if (drag) {
          this.ray.setFromCamera(ndc(cv, e), this.curCam()); const p = new T3.Vector3(); if (!this.ray.ray.intersectPlane(this.floor, p)) return;
          drag.it.cx = Math.round((p.x + this.L.W / 2) * 10) / 10; drag.it.cz = Math.round((p.z + this.L.D / 2) * 10) / 10; this.placeMesh(drag.it); return;
        }
        if (this.cam === "bird") { this.orbit.th -= dx * .006; this.orbit.ph = clamp(this.orbit.ph - dy * .005, Math.PI / 2 - 70 * Math.PI / 180, Math.PI / 2 - 25 * Math.PI / 180); }
        else if (this.cam === "inside") { this.look.yaw -= dx * .005; this.look.pitch = clamp(this.look.pitch - dy * .004, -.9, .6); }
      },
      up: () => {
        if (!drag) return; const it = drag.it;
        if (!validSpot(this.L, this.items, it)) { it.cx = drag.ox; it.cz = drag.oz; this.placeMesh(it); toast("벽이나 다른 가구와 겹쳐서 원래 자리로 돌렸어요"); }
        else this.renderSide();
        drag = null;
      },
      tap: e => { if (this.cam === "inside") return; this.ray.setFromCamera(ndc(cv, e), this.curCam()); const h = this.ray.intersectObjects(this.furnGroup ? this.furnGroup.children : [], true)[0]; if (!h) this.select(null); },
      zoom: k => { if (this.cam === "bird") this.orbit.r = clamp(this.orbit.r / k, 8, 26); else if (this.cam === "plan") this.planZoom = clamp((this.planZoom || 1) * k, .6, 2.5); }
    });
    addEventListener("keydown", e => { if (!$("#houseView").classList.contains("is-on")) return; if ((e.key === "r" || e.key === "R") && this.sel) this.rotateSel(); if ((e.key === "Delete" || e.key === "Backspace") && this.sel && document.activeElement.tagName !== "INPUT") this.removeSel(); });
    new ResizeObserver(() => this.resize()).observe($("#houseView"));
    $$("[data-cam]").forEach(b => b.addEventListener("click", () => this.setCam(b.dataset.cam)));
    $$("[data-hv]").forEach(b => b.addEventListener("click", () => { this.tab = b.dataset.hv; this.renderSide(); }));
    $("#hvBack").onclick = () => { location.hash = "#map"; };
    $("#selRot").onclick = () => this.rotateSel(); $("#selDel").onclick = () => this.removeSel();
    const loop = () => { if ($("#houseView").classList.contains("is-on")) this.tick(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  },
  open(cid) {
    this.init(); if (!HAS3D) { $("#hvTitle").innerHTML = "<b>3D를 불러오지 못했어요</b>"; return; }
    const c = COMPLEX.find(x => x.id === cid) || COMPLEX[0];
    if (this.cid !== c.id) { this.cid = c.id; this.L = buildLayout(c.room_id || "room_84a"); this.applyLayout("basic"); this.rec = null; }
    const ev = S.evals[c.id];
    $("#hvTitle").innerHTML = `<span class="eyebrow-s">Model house</span><b>${esc(c.name)} · ${esc(this.L.name)}</b><span>${SUPPLY_KO[c.supply_type]} · ${c.area_m2}㎡${c.area_m2 !== this.L.area ? ` (${this.L.area}㎡ 구조로 대신 보기)` : ""} · 표준 구조 단순화, 공고 평면도 원본 미사용${ev && S.mode === "match" ? ` · ${LIGHT_ICON[ev.light]} ${LIGHT_KO[ev.light]}` : ""}</span>`;
    this.resize(); this.setCam(this.cam);
  },
  close() { if (this.ok) this.select(null); },
  applyLayout(id) {
    this.layoutId = id; const lay = LAYOUTS.find(l => l.id === id);
    const res = placeLayout(this.L, lay.items, { remote: lay.remote });
    this.items = res.items; if (res.skipped.length) toast(`${res.skipped.map(s => FURNITURE.find(f => f.id === s).name).join(", ")}는 자리가 없어 뺐어요`);
    this.build(); this.renderSide();
  },
  build() {
    if (this.root) { this.scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const L = this.L, root = this.root = new T3.Group(); root.position.set(-L.W / 2, 0, -L.D / 2); this.scene.add(root);
    const base = box(L.W + .5, .22, L.D + .5, mat("#e7e4dc")); base.position.set(L.W / 2, -.1, L.D / 2); root.add(base);
    L.rooms.forEach(r => { const f = new T3.Mesh(new T3.PlaneGeometry(r.w, r.d), mat(r.type === "bath" ? "#e4e5e1" : r.type === "hall" || r.type === "dress" ? "#dcd6cb" : "#d9bf98", { roughness: .75 })); f.rotation.x = -Math.PI / 2; f.position.set(r.x + r.w / 2, .004, r.z + r.d / 2); f.receiveShadow = true; root.add(f); });
    this.walls = new T3.Group(); this.front = new T3.Group(); root.add(this.walls); root.add(this.front);
    const wm = mat("#f6f3ec"), capM = mat("#1f6b4f", { roughness: .6 }), glass = new T3.MeshStandardMaterial({ color: 0xcfe0dc, transparent: true, opacity: .3, depthWrite: false });
    L.pieces.forEach(p => {
      const len = p.b - p.a, hh = p.y1 - p.y0, th = p.kind === "glass" ? .03 : .15;
      const b = box(p.axis === "x" ? len : th, hh, p.axis === "x" ? th : len, p.kind === "glass" ? glass : wm); const mid = (p.a + p.b) / 2;
      b.position.set(p.axis === "x" ? mid : p.c, p.y0 + hh / 2, p.axis === "x" ? p.c : mid); (p.front ? this.front : this.walls).add(b);
      if (p.kind !== "glass" && p.y1 >= L.H - .001) { const cp = box(p.axis === "x" ? len : .16, .04, p.axis === "x" ? .16 : len, capM); cp.castShadow = false; cp.position.set(b.position.x, L.H + .02, b.position.z); (p.front ? this.front : this.walls).add(cp); }
    });
    L.fixed.forEach(f => { const w = f.x1 - f.x0, d = f.z1 - f.z0; const m = rbox(w, f.h, d, .03, mat(f.key === "counter" ? "#F2EFE8" : "#FBFAF7")); m.position.set(f.x0 + w / 2, 0, f.z0 + d / 2); root.add(m); });
    this.furnGroup = new T3.Group(); root.add(this.furnGroup);
    this.items.forEach(it => this.addMesh(it));
    this.dims = new T3.Group(); root.add(this.dims);
    const dm = new T3.LineBasicMaterial({ color: new T3.Color("#1f6b4f").convertSRGBToLinear() });
    const seg = (a, b) => { const g = new T3.BufferGeometry().setFromPoints([a, b]); this.dims.add(new T3.Line(g, dm)); };
    const o = .55, y = .02;
    seg(new T3.Vector3(0, y, -o), new T3.Vector3(L.W, y, -o)); seg(new T3.Vector3(0, y, -o - .15), new T3.Vector3(0, y, -o + .15)); seg(new T3.Vector3(L.W, y, -o - .15), new T3.Vector3(L.W, y, -o + .15));
    seg(new T3.Vector3(-o, y, 0), new T3.Vector3(-o, y, L.D)); seg(new T3.Vector3(-o - .15, y, 0), new T3.Vector3(-o + .15, y, 0)); seg(new T3.Vector3(-o - .15, y, L.D), new T3.Vector3(-o + .15, y, L.D));
    this.labels();
  },
  addMesh(it) {
    const g = makeFurn(it); g.userData.uid = it.uid;
    this.furnGroup.add(g); this.placeMesh(it);
  },
  placeMesh(it) { const g = this.furnGroup.children.find(x => x.userData.uid === it.uid); if (!g) return; g.position.set(it.cx, 0, it.cz); g.rotation.y = it.rot; this.labels(); },
  select(uid) {
    this.sel = uid; const it = this.items.find(i => i.uid === uid);
    $("#selBar").classList.toggle("is-on", !!it); if (it) $("#selName").textContent = `${it.name} · ${Math.round(it.w * 1000)}×${Math.round(it.d * 1000)}`;
    if (this.furnGroup) this.furnGroup.children.forEach(g => g.traverse(o => { if (o.isMesh) { if (!o.userData.base) o.userData.base = o.material; o.material = g.userData.uid === uid ? o.userData.base.clone() : o.userData.base; if (g.userData.uid === uid) { o.material.emissive = new T3.Color(0x1f6b4f); o.material.emissiveIntensity = .35; } } }));
  },
  rotateSel() { const it = this.items.find(i => i.uid === this.sel); if (!it) return; const old = it.rot; it.rot = (it.rot + Math.PI / 2) % (Math.PI * 2); if (!validSpot(this.L, this.items, it)) { it.rot = old; toast("돌리면 벽이나 가구와 겹쳐요"); } this.placeMesh(it); },
  removeSel() { const i = this.items.findIndex(x => x.uid === this.sel); if (i < 0) return; const g = this.furnGroup.children.find(x => x.userData.uid === this.sel); if (g) this.furnGroup.remove(g); this.items.splice(i, 1); this.select(null); this.renderSide(); },
  addItem(fid) {
    const F = FURNITURE.find(f => f.id === fid), spot = findSpot(this.L, this.items, F);
    if (!spot) { toast("놓을 빈자리가 없어요"); return; }
    const it = { uid: fid + "_" + Date.now(), id: fid, cat: F.cat, name: F.name, w: F.w, d: F.d, h: F.h, price: F.price, round: F.round, rot: 0, cx: spot.cx, cz: spot.cz };
    this.items.push(it); this.addMesh(it); this.select(it.uid); this.renderSide(); toast(`${F.name}를 놓았어요. 끌어서 옮겨보세요`);
  },
  recommend() {
    const lay = LAYOUTS.find(l => l.id === this.layoutId); const budget = this.budget;
    let pick = lay.items.map(id => FURNITURE.find(f => f.id === id));
    const total = () => pick.reduce((s, f) => s + f.price, 0);
    const cheaper = f => FURNITURE.filter(x => x.cat === f.cat && x.price < f.price).sort((a, b) => b.price - a.price)[0];
    for (const cat of [...FCAT_PRI].reverse()) { if (total() <= budget) break; pick = pick.map(f => f.cat === cat && cheaper(f) ? cheaper(f) : f); }
    const skipped = [];
    for (const cat of [...FCAT_PRI].reverse()) { if (total() <= budget) break; const k = pick.findIndex(f => f.cat === cat); if (k >= 0) { skipped.push(pick[k].name); pick.splice(k, 1); } }
    const res = placeLayout(this.L, pick.map(f => f.id), { remote: lay.remote });
    this.items = res.items; this.build(); this.select(null);
    this.rec = { total: this.items.reduce((s, i) => s + i.price, 0), skipped: skipped.concat(res.skipped.map(s => FURNITURE.find(f => f.id === s).name)), over: total() > budget };
    this.renderSide();
  },
  renderSide() {
    $$("[data-hv]").forEach(b => b.classList.toggle("is-on", b.dataset.hv === this.tab));
    const sum = this.items.reduce((s, i) => s + i.price, 0); let h = "";
    if (this.tab === "place") {
      h += `<h3>추천 배치</h3><div class="persona" style="margin:0">${LAYOUTS.map(l => `<button class="chip${l.id === this.layoutId ? " is-on" : ""}" data-lay="${l.id}">${l.name}</button>`).join("")}</div>
        <p class="small muted" style="margin-top:6px">${{ basic: "침대·소파·식탁·TV장을 기본 동선에 맞춰 놓았어요.", remote: "재택근무용 책상을 작은 방 창가에 먼저 놓았어요.", storage: "옷장·책장을 늘려 수납을 먼저 챙겼어요." }[this.layoutId]}</p>
        <h3>가구 추가 <span class="muted small" style="font-weight:500">3D 예시 이미지</span></h3><div class="pal">${FURNITURE.map(f => `<button data-add="${f.id}">${thumbImg(f, "pal-img")}<b>${esc(f.name)}</b><span>${Math.round(f.w * 1000)}×${Math.round(f.d * 1000)} · ${won(f.price)}원</span></button>`).join("")}</div>
        <p class="small muted" style="margin-top:10px">가구를 누르면 선택돼요. 끌어서 옮기고, 돌리기(R)·빼기 버튼을 쓸 수 있어요. 0.1m 단위로 맞춰지고, 벽이나 다른 가구와 겹치면 원래 자리로 돌아가요.</p>
        <div class="tot"><span>놓은 가구 ${this.items.length}개</span><b>${won(sum)}원</b></div>`;
    } else if (this.tab === "budget") {
      h += `<h3>가구 예산</h3><div class="budget"><input type="number" inputmode="numeric" id="budgetIn" value="${this.budget}" step="100000" min="0" aria-label="가구 예산(원)"><span class="muted small">원</span><button class="btn btn--sm" id="recBtn">맞춰 추천</button></div>
        <p class="small muted" style="margin-top:6px">지금 고른 ${LAYOUTS.find(l => l.id === this.layoutId).name} 배치에서 예산 안으로 골라요. 모자라면 비싼 가구를 싼 것으로 바꾸고, 그래도 넘으면 우선순위가 낮은 것(조명 → 수납 → 책상 → 식탁)부터 빼요.</p>`;
      if (this.rec) h += `<div class="why" style="margin-top:12px">${this.rec.over ? "예산 안으로 다 맞추지 못했어요." : "예산 안으로 맞췄어요."} 합계 <b>${won(this.rec.total)}원</b>${this.rec.skipped.length ? `<br>뺀 가구: ${esc(this.rec.skipped.join(", "))}` : ""}</div>`;
      h += `<div class="tot"><span>현재 합계</span><b>${won(sum)}원</b></div>`;
    } else {
      h += `<ul class="buy">${this.items.map(i => { const F = FURNITURE.find(f => f.id === i.id); return `<li>${thumbImg(F, "buy-img")}<div class="buy-txt"><b>${esc(i.name)}</b><span class="s">판매처(샘플) · ${Math.round(i.w * 1000)}×${Math.round(i.d * 1000)}×${Math.round(i.h * 1000)}mm</span><span class="s">구매 링크 준비 중</span></div><span class="p">${won(i.price)}원</span></li>`; }).join("") || "<li>놓은 가구가 없어요</li>"}</ul>
        <div class="tot"><span>합계</span><b>${won(sum)}원</b></div><p class="small muted">가격·판매처는 시연용 샘플이에요. 제휴 링크가 붙으면 따로 표시해요.</p>`;
    }
    $("#hvBody").innerHTML = h;
    $$("[data-lay]").forEach(b => b.onclick = () => { this.applyLayout(b.dataset.lay); this.rec = null; });
    $$("[data-add]").forEach(b => b.onclick = () => this.addItem(b.dataset.add));
    const bi = $("#budgetIn"); if (bi) bi.onchange = () => this.budget = Math.max(0, +bi.value || 0);
    const rb = $("#recBtn"); if (rb) rb.onclick = () => { this.budget = Math.max(0, +$("#budgetIn").value || 0); this.recommend(); };
  },
  setCam(c) {
    this.cam = c; $$("[data-cam]").forEach(b => b.classList.toggle("is-on", b.dataset.cam === c));
    $("#hvHint").textContent = { plan: "위에서 본 평면도예요. 가구를 끌어서 옮겨보세요", bird: "드래그로 돌리고 휠로 확대해요. 가구는 끌어서 옮겨요", inside: "드래그로 둘러봐요. 아래에서 방을 골라요" }[c];
    const rb = $("#roomsBar"); rb.classList.toggle("is-on", c === "inside");
    if (c === "inside") {
      const rooms = this.L.rooms.filter(r => !["bath", "hall", "dress"].includes(r.type));
      rb.innerHTML = rooms.map(r => `<button class="chip" data-room="${r.id}">${esc(r.name)}</button>`).join("");
      $$("[data-room]").forEach(b => b.onclick = () => this.goRoom(b.dataset.room));
      this.goRoom((rooms.find(r => r.type === "living") || rooms[0]).id);
    }
    this.camT = 0; this.labels();
  },
  goRoom(id) { const r = this.L.rooms.find(x => x.id === id); this.look.x = r.x + r.w / 2; this.look.z = r.z + r.d / 2; this.look.yaw = r.type === "living" ? Math.PI : 0; this.look.pitch = -.12; $$("[data-room]").forEach(b => b.classList.toggle("is-on", b.dataset.room === id)); },
  curCam() { return this.cam === "plan" ? this.ortho : this.persp; },
  resize() {
    if (!this.ok) return; const w = innerWidth, h = innerHeight; this.r.setSize(w, h, false); this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    Object.assign(this.ortho, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 }); this.ortho.updateProjectionMatrix();
  },
  labels() {
    const box2 = $("#hvLbl"); if (!this.L) return;
    if (this.cam === "inside") { box2.innerHTML = ""; return; }
    const L = this.L;
    box2.innerHTML = L.rooms.map(r => `<span class="rlabel" data-x="${r.x + r.w / 2}" data-z="${r.z + r.d / 2}">${esc(r.name)}</span>`).join("") +
      `<span class="dimlabel" data-x="${L.W / 2}" data-z="${-.55}">${L.W.toFixed(1)}m</span><span class="dimlabel" data-x="${-.55}" data-z="${L.D / 2}">${L.D.toFixed(1)}m</span>`;
  },
  tick() {
    if (!this.L) return; const L = this.L, mob = innerWidth < 900;
    const fs = this.front; if (fs) fs.scale.y = this.cam === "inside" ? 1 : .375;
    if (this.walls) this.walls.scale.y = this.cam === "plan" ? .375 : this.cam === "bird" ? .55 : 1;
    if (this.dims) this.dims.visible = this.cam === "plan";
    let cam;
    if (this.cam === "plan") {
      cam = this.ortho; const availW = mob ? innerWidth : innerWidth - 380, availH = mob ? innerHeight * .56 - 70 : innerHeight - 110;
      const z = Math.min(availW / (L.W + 2), availH / (L.D + 2)) * (this.planZoom || 1);
      const offX = mob ? 0 : 190 / z, offZ = mob ? (innerHeight * .44) / 2 / z : -20 / z;
      cam.position.set(offX, 30, offZ + .001); cam.up.set(0, 0, -1); cam.lookAt(offX, 0, offZ); cam.zoom = z; cam.updateProjectionMatrix();
    } else if (this.cam === "bird") {
      cam = this.persp; const o = this.orbit; const vw = mob ? innerWidth : innerWidth - 380, vh = mob ? innerHeight * .56 : innerHeight;
      const vf = 38 * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * vw / vh), fit = (Math.hypot(L.W, L.D) / 2 + .8) / Math.sin(Math.min(vf, hf) / 2);
      const r = fit * (o.r / 16);
      cam.up.set(0, 1, 0); cam.position.set(r * Math.sin(o.ph) * Math.sin(o.th), r * Math.cos(o.ph), r * Math.sin(o.ph) * Math.cos(o.th)); cam.lookAt(0, .4, 0);
      if (cam.fov !== 38) { cam.fov = 38; cam.updateProjectionMatrix(); }
      cam.setViewOffset(innerWidth, innerHeight, mob ? 0 : 190, mob ? innerHeight * .22 : 0, innerWidth, innerHeight);
    } else {
      cam = this.persp; cam.clearViewOffset(); cam.up.set(0, 1, 0); cam.position.set(this.look.x - L.W / 2, 1.6, this.look.z - L.D / 2); cam.rotation.set(this.look.pitch, this.look.yaw, 0); if (cam.fov !== 72) { cam.fov = 72; cam.updateProjectionMatrix(); }
    }
    $$(".rlabel,.dimlabel", $("#hvLbl")).forEach(el => { const p = new T3.Vector3(+el.dataset.x - L.W / 2, .05, +el.dataset.z - L.D / 2).project(cam); el.style.left = (p.x + 1) / 2 * innerWidth + "px"; el.style.top = (1 - p.y) / 2 * innerHeight + "px"; el.style.display = (el.classList.contains("dimlabel") && this.cam !== "plan") ? "none" : ""; });
    this.r.render(this.scene, cam);
  }
};

/* ═══════════════ S6 24시간 상담 (템플릿 모드) ═══════════════ */
const QUICK = ["내 판정 결과 쉽게 설명해 줘", "확인 필요는 어떻게 확인해요?", "신청은 어디서, 뭐가 필요해요?", "이 단지 월 부담은 어떻게 계산했어요?", "계약 전에 꼭 확인할 것은?"];
const Consult = {
  init() {
    $("#fab").onclick = () => this.open(); $("#drClose").onclick = () => this.close();
    $("#drQuick").innerHTML = QUICK.map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join("");
    $$("#drQuick button").forEach(b => b.onclick = () => this.ask(b.dataset.q));
    $("#drForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#drIn").value.trim(); if (v) { $("#drIn").value = ""; this.ask(v); } });
    this.say("안녕하세요. 대구 집 찾기와 대출·지원 요건을 안내해 드려요. 아래 질문을 눌러보거나 직접 물어보세요.", []); this.probe();
  },
  open() { $("#drawer").classList.add("is-open"); $("#drawer").setAttribute("aria-hidden", "false"); setTimeout(() => $("#drIn").focus(), 250); },
  close() { $("#drawer").classList.remove("is-open"); $("#drawer").setAttribute("aria-hidden", "true"); },
  say(text, links, me) {
    const d = document.createElement("div"); d.className = "msg " + (me ? "me" : "ai"); d.textContent = text;
    if (links && links.length) { const l = document.createElement("div"); l.className = "links"; l.innerHTML = links.map(x => x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a>` : x.action ? `<a href="${esc(x.action)}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`).join(""); d.appendChild(l); }
    $("#drBody").appendChild(d); $("#drBody").scrollTop = 1e6;
  },
  /* LLM 모드: 로컬 서버(server.py)에서 열었을 때만 /api/chat 사용. 실패하면 템플릿 답변 */
  llm: false, hist: [],
  async probe() {
    if (!/^https?:$/.test(location.protocol) || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    try { const r = await fetch("/api/health", { cache: "no-store" }); const j = await r.json(); this.llm = !!j.llm; } catch (e) { this.llm = false; }
    const tag = $("#drMode"); if (tag) tag.textContent = this.llm ? "AI 안내" : "기본 안내";
  },
  async ask(q) {
    this.say(q, null, true);
    const [t, l] = this.answer(q);
    if (!this.llm) { setTimeout(() => this.say(t, l), 250); return; }
    const wait = document.createElement("div"); wait.className = "msg ai"; wait.textContent = "답변을 정리하고 있어요…"; $("#drBody").appendChild(wait); $("#drBody").scrollTop = 1e6;
    const c = S.sel ? COMPLEX.find(x => x.id === S.sel) : null;
    const body = { message: q, profile: S.profile, profile_result: S.pr,
      complex: c ? { name: c.name, supply_type: c.supply_type, deposit: c.deposit, rent: c.rent, mgmt: c.mgmt, eval: S.evals[c.id] || null } : null,
      template_answer: t, history: this.hist.slice(-6) };
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); wait.remove();
      if (!r.ok || !j.reply) throw new Error(j.error || "no reply");
      this.say(j.reply, l); this.hist.push({ role: "user", text: q }, { role: "assistant", text: j.reply });
    } catch (e) { wait.remove(); this.say(t, l); }
  },
  polLinks(ids) { return ids.map(id => POLICY_DOCS[id]).filter(Boolean).filter(d => d.info_url).map(d => ({ label: d.agency + " 안내", url: d.info_url })).filter((x, i, a) => a.findIndex(y => y.url === x.url) === i); },
  answer(q) {
    const needP = () => ["판정은 기본정보를 넣어야 정확히 알려드릴 수 있어요. 30초면 돼요.", [{ label: "정보 입력하기", action: "#input" }]];
    if (/주민|계좌|비밀번호|여권|카드번호/.test(q)) return ["그런 정보는 여기 입력하지 마세요. 상담에는 필요 없어요.", []];
    if (/같이|중복|둘 다|함께/.test(q) && /(버팀목|이자)/.test(q)) return ["대구 청년 이자지원은 주택도시기금 전세대출(버팀목 등) 이용자는 제외돼요. 그래서 버팀목과 대구 이자지원은 같이 더하지 않고, 둘 중 하나로 계산해요. 어느 쪽이 유리한지는 단지 카드의 계산 내역에서 볼 수 있어요.", this.polLinks(["daegu_interest", "youth_beotimok"])];
    if (/대출\s*(돼|되|가능)|받을 수 있/.test(q)) { if (!S.pr) return needP(); const y = S.pr.loans[0]; return [`입력하신 조건 기준으로 ${y.name.replace("(시연용)", "")}은 ${ST_KO[y.status]}이에요. 실제 대출 여부와 한도는 ${y.approval_by}이(가) 심사로 정해요. 계약금을 내기 전에 은행 사전 상담부터 받아보세요.`, this.polLinks(["youth_beotimok"])]; }
    if (/설명|결과|판정/.test(q)) {
      if (!S.pr) return needP();
      const lines = [...S.pr.loans, ...S.pr.policies].map(x => `${x.name.replace("(시연용)", "")}: ${ST_KO[x.status]}. ${x.reason}`);
      const n = counts();
      return [lines.join("\n") + `\n\n지도에서는 ● ${n.on}곳 · ◐ ${n.dim}곳 · ○ ${n.off}곳이에요. 확인 필요 항목은 '확인 필요는 어떻게 확인해요?'를 눌러 보세요.`, this.polLinks(["youth_beotimok", "daegu_interest", "youth_monthly_rent"])];
    }
    if (/확인 필요|어떻게 확인/.test(q)) {
      if (!S.pr) return needP();
      const ck = [...S.pr.loans, ...S.pr.policies].filter(x => x.status === "needs_check");
      if (!ck.length) return ["확인 필요로 나온 항목이 없어요.", []];
      return [ck.map(x => { const d = POLICY_DOCS[x.id] || {}; return `${x.name.replace("(시연용)", "")}: ${(x.always_needs_check && x.always_needs_check.length ? x.always_needs_check.join(", ") : x.reason)} → ${d.agency || x.approval_by}에 문의`; }).join("\n") + "\n\n먼저 은행 사전 상담에서 대출 한도부터 확인해 보세요.", this.polLinks(ck.map(x => x.id))];
    }
    if (/신청|서류|어디서/.test(q)) {
      const ids = S.pr ? [...S.pr.loans, ...S.pr.policies].filter(x => x.status !== "ineligible").map(x => x.id) : Object.keys(POLICY_DOCS);
      return [ids.map(id => POLICY_DOCS[id] && `${(RULES.loans.concat(RULES.policies).find(x => x.id === id) || RULES.market_loan).name.replace("(시연용)", "")}: ${POLICY_DOCS[id].apply}`).filter(Boolean).join("\n\n") + "\n\n(시연용 요약이에요. 신청 전 공고 원문을 꼭 확인하세요.)", this.polLinks(ids)];
    }
    if (/월 부담|계산|얼마/.test(q)) {
      if (!S.pr) return needP();
      const id = S.sel || Object.keys(S.evals)[0], c = COMPLEX.find(x => x.id === id), ev = S.evals[id], bd = breakdown(c, ev);
      if (!bd) return [`${c.name}은 ${ev.light_reason}`, []];
      return [`${c.name} 기준이에요.\n관리비 ${man1(bd.mgmt)}만${bd.rent ? ` + 월세 ${man1(bd.rent)}만` : ""} + 대출이자 ${man1(bd.loan_interest)}만(${wonK(bd.loan_needed)} × ${bd.rate}% ÷ 12)${bd.rent_support ? ` − 월세지원 ${man1(bd.rent_support)}만` : ""} = 월 ${man1(bd.total)}만 원 (${bd.financing}).\n${ev.light === "on" ? "요건 충족 지원만으로 계산한 값이에요." : "확인 필요 지원까지 받을 때 값이에요."} 다른 단지를 보려면 지도에서 단지를 눌러 주세요.`, []];
    }
    if (/계약|특약|전에/.test(q)) return ["계약 전에 꼭 확인하세요.\n1. 계약금 내기 전 은행 대출 사전 상담\n2. 대출 불가 시 계약 해제 특약 확인\n3. 등기부등본으로 소유자·근저당 확인\n4. 전세보증보험 가입 가능 여부 확인\n먼저 1번부터 해보세요.", []];
    return ["그 질문은 아직 답을 준비하지 못했어요. 관련 기관 상담으로 연결해 드릴게요.", this.polLinks(["youth_beotimok", "daegu_interest", "youth_monthly_rent"])];
  }
};

/* ─── 평면 그림 (홈 갤러리용) ─── */
function planSVG(L) {
  const pad = .5, s = 100, vw = (L.W + pad * 2) * s, vh = (L.D + pad * 2) * s;
  const rooms = L.rooms.map(r => `<rect x="${(r.x + pad) * s}" y="${(r.z + pad) * s}" width="${r.w * s}" height="${r.d * s}" fill="${r.type === "bath" ? "#e6e8e4" : r.type === "kitchen" ? "#efe7da" : r.type === "hall" || r.type === "dress" ? "#ece8e0" : "#f4ede1"}"/><text x="${(r.x + r.w / 2 + pad) * s}" y="${(r.z + r.d / 2 + pad) * s}" font-size="${Math.min(30, r.w * 11)}" text-anchor="middle" dominant-baseline="middle" fill="#71746f" font-family="Pretendard, sans-serif">${esc(r.name)}</text>`).join("");
  const walls = L.pieces.filter(p => p.kind === "solid" || p.kind === "sill").map(p => p.axis === "x" ? `<line x1="${(p.a + pad) * s}" y1="${(p.c + pad) * s}" x2="${(p.b + pad) * s}" y2="${(p.c + pad) * s}"/>` : `<line x1="${(p.c + pad) * s}" y1="${(p.a + pad) * s}" x2="${(p.c + pad) * s}" y2="${(p.b + pad) * s}"/>`).join("");
  return `<svg viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(L.name)} 평면도"><rect width="100%" height="100%" fill="#fcfbf9"/>${rooms}<g stroke="#1f6b4f" stroke-width="13" stroke-linecap="square">${walls}</g></svg>`;
}

/* ─── 시작 ─── */
Consult.init();
$("#plToggle").onclick = () => { plOpen = !plOpen; if (plOpen && document.body.classList.contains("card-open")) { closeCard(); MapView.select(null); } syncPl(); };
window.MH = {
  route(v) { if (v === "map" && S.profile && S.mode !== "match" && !route.seen) S.mode = "match"; route.seen = true; route(v); if (v === "map" && MapView.ok) MapView.applyMode(false); },
  browse() { S.mode = "browse"; if (location.hash === "#map") { route("map"); MapView.applyMode(false); } else location.hash = "#map"; },
  openHouse(cid) { S.sel = cid; location.hash = "#house"; },
  galleryCards() {
    return COMPLEX.map(c => { const L = buildLayout(c.room_id || "room_84a");
      return `<button class="plan-card" data-cid="${c.id}" aria-label="${esc(c.name)} 집 보기"><div class="plan-card__media">${planSVG(L)}<span class="tag-example">${c.is_sample ? "샘플 단지" : "공개 보도 단지"}</span></div>
        <p class="plan-card__name">${esc(c.name)}</p><p class="plan-card__meta">${esc(c.district)} · ${SUPPLY_KO[c.supply_type]} · ${c.area_m2}㎡ · 보증금 ${wonK(c.deposit)}</p></button>`; }).join("");
  }
};
}

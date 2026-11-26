{
/* ═══════ 방봄 셸: 라우터·네비·홈 인터랙션 (모델하우스 흐름은 window.MH) ═══════ */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAGES = ["home", "guide"], APP = ["input", "map", "house"];
const NAVKEY = { home: "home", guide: "guide", input: "map", map: "map", house: "house" };
const TITLES = { home: "방봄 BANGBOM", guide: "이용 안내 · 방봄", input: "기본정보 입력 · 방봄", map: "미분양 지도 · 방봄", house: "집 보기 · 방봄" };
const nav = $("#nav");
let current = null;
function updateNav() { nav.classList.toggle("is-clear", current === "home" && scrollY < 24 && !document.body.classList.contains("menu-open")); }
function route() {
  let name = location.hash.replace("#", "");
  if (name === "start") name = "home";
  if (![...PAGES, ...APP].includes(name)) name = "home";
  const first = current === null, prev = current;
  current = name;
  const swap = () => {
    const app = APP.includes(name);
    document.body.classList.toggle("app-mode", app);
    $$(".page").forEach(p => p.classList.toggle("is-active", !app && p.dataset.page === name));
    $(".footer").hidden = app;
    $$("[data-route]").forEach(a => { const on = a.dataset.route === NAVKEY[name]; a.classList.toggle("is-active", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    document.title = TITLES[name];
    if (!app || !APP.includes(prev)) scrollTo(0, 0);
    closeMenu(); updateNav();
    if (window.MH) MH.route(app ? name : null);
    requestAnimationFrame(observeReveals);
  };
  const bigJump = !first && (APP.includes(name) !== APP.includes(prev) || PAGES.includes(name));
  if (bigJump && document.startViewTransition && !REDUCED) document.startViewTransition(swap); else swap();
}
if (!document.startViewTransition) document.documentElement.classList.add("no-vt");
const openBtn = $("#menuOpen"), closeBtn = $("#menuClose");
function openMenu() { document.body.classList.add("menu-open"); openBtn.setAttribute("aria-expanded", "true"); updateNav(); setTimeout(() => closeBtn.focus(), 60); }
function closeMenu() { if (!document.body.classList.contains("menu-open")) return; document.body.classList.remove("menu-open"); openBtn.setAttribute("aria-expanded", "false"); updateNav(); }
openBtn.addEventListener("click", openMenu); closeBtn.addEventListener("click", closeMenu); $("#scrim").addEventListener("click", closeMenu);
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
$$(".panel a").forEach(a => a.addEventListener("click", closeMenu));
addEventListener("hashchange", route);
addEventListener("scroll", updateNav, { passive: true });

/* 둘러보기 / 더 알아보기 진입 */
$$("[data-go]").forEach(b => b.addEventListener("click", e => { if (b.dataset.go === "browse") { e.preventDefault(); MH.browse(); } }));

/* 사진 없을 때 */
$$("img").forEach(img => { img.addEventListener("error", () => img.classList.add("is-missing")); if (img.complete && img.naturalWidth === 0 && img.src) img.classList.add("is-missing"); });

/* 나타나기 · 숫자 · 영상 */
const revealIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); } }), { threshold: .14, rootMargin: "0px 0px -6% 0px" }) : null;
function observeReveals() { $$(".page.is-active .reveal:not(.is-in)").forEach(el => revealIO ? revealIO.observe(el) : el.classList.add("is-in")); }
const countIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; countIO.unobserve(e.target);
  const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = REDUCED ? 0 : 1400;
  const step = t => { const k = dur ? clamp((t - t0) / dur, 0, 1) : 1; el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString("ko-KR"); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), { threshold: .5 }) : null;
$$("[data-count]").forEach(el => countIO ? countIO.observe(el) : el.textContent = (+el.dataset.count).toLocaleString("ko-KR"));
const vidIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.intersectionRatio >= .35) { if (v.ended) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); } else if (!v.ended) v.pause(); }), { threshold: [0, .35, .6] }) : null;
$$("video[data-autoplay]").forEach(v => vidIO && vidIO.observe(v));

/* 비포/애프터 슬라이더 */
(function () {
  const ba = $("#ba"); if (!ba) return;
  const range = $(".ba__range", ba); let done = false, touched = false;
  const set = p => { ba.style.setProperty("--p", p + "%"); range.value = p; };
  range.addEventListener("input", () => { touched = true; done = true; set(+range.value); });
  const io = new IntersectionObserver(es => {
    if (!es[0].isIntersecting || done) return; io.disconnect(); done = true;
    if (REDUCED) { set(50); return; }
    const t0 = performance.now();
    const step = t => { if (touched) return; const s = (t - t0) / 1000; let p; if (s < 1.8) { const k = s / 1.8; p = 100 - 100 * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); } else { const k = clamp((s - 1.8) / .8, 0, 1); p = 50 * (1 - Math.pow(1 - k, 3)); } set(p); if (s < 2.6) requestAnimationFrame(step); else set(50); };
    requestAnimationFrame(step);
  }, { threshold: .5 });
  io.observe(ba);
})();

/* How it helps 탭 */
let zzI = 0;
function setZZ(i) {
  const n = $$(".zz-tab").length; zzI = (i + n) % n;
  $$(".zz-tab").forEach((b, k) => { b.classList.toggle("is-on", k === zzI); b.setAttribute("aria-selected", k === zzI); });
  $$(".zz--tabbed .zz__row").forEach((r, k) => r.classList.toggle("is-on", k === zzI));
  const on = $$(".zz-tab")[zzI]; if (on && on.parentElement.scrollWidth > on.parentElement.clientWidth) on.parentElement.scrollTo({ left: on.offsetLeft - 18, behavior: REDUCED ? "auto" : "smooth" });
}
$$(".zz-tab").forEach(b => b.addEventListener("click", () => setZZ(+b.dataset.zz)));
$("#zzPrev").addEventListener("click", () => setZZ(zzI - 1)); $("#zzNext").addEventListener("click", () => setZZ(zzI + 1));

/* 평형 갤러리 (모델하우스 집 보기 구조) */
(function () {
  const track = $("#plansTrack"); if (!track || !window.MH) return;
  track.innerHTML = MH.galleryCards();
  $$("[data-cid]", track).forEach(b => b.addEventListener("click", () => MH.openHouse(b.dataset.cid)));
  const go = dir => { const c = $(".plan-card", track); const w = c ? c.getBoundingClientRect().width + 24 : 300; track.scrollBy({ left: dir * w, behavior: REDUCED ? "auto" : "smooth" }); };
  $("#plansPrev").addEventListener("click", () => go(-1)); $("#plansNext").addEventListener("click", () => go(1));
  track.addEventListener("keydown", e => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
})();

window.BB = { route };
}

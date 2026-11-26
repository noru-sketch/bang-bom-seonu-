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

/* 비포/애프터: 화면에 들어올 때마다 한 번 왔다갔다 (스크롤은 막지 않아요) */
(function () {
  const ba = $("#ba"); if (!ba) return;
  const range = $(".ba__range", ba); let touched = false, run = 0;
  const set = p => { ba.style.setProperty("--p", p + "%"); range.value = p; };
  range.addEventListener("input", () => { touched = true; set(+range.value); });
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const sweep = () => {
    if (touched) return; if (REDUCED) { set(50); return; }
    const id = ++run, t0 = performance.now();
    const step = t => { if (touched || id !== run) return; const s = (t - t0) / 1000; let p;
      if (s < .4) p = 100; else if (s < 2.0) p = 100 - 100 * ease((s - .4) / 1.6); else if (s < 2.4) p = 0; else p = 50 * ease(clamp((s - 2.4) / 1.1, 0, 1));
      set(p); if (s < 3.5) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  new IntersectionObserver(es => { if (es[0].isIntersecting) sweep(); else if (!touched) { run++; set(100); } }, { threshold: .55 }).observe(ba);
})();

/* 홈 풀페이지 스크롤: 한 번 굴리면 한 섹션. 영상·애니메이션이 끝나길 기다리지 않아요 */
(function () {
  const dots = $("#fpDots"); if (!dots) return;
  const panels = () => [...$$("#page-home .fp"), $(".footer")];
  const topOf = (el, k, n) => k === n - 1 ? document.documentElement.scrollHeight - innerHeight : Math.round(el.getBoundingClientRect().top + scrollY);
  const on = () => current === "home" && innerWidth > 900 && innerHeight >= 560 && !document.body.classList.contains("menu-open");
  const idx = () => { const ps = panels(), n = ps.length; let k = 0; ps.forEach((p, j) => { if (topOf(p, j, n) <= scrollY + innerHeight * .45) k = j; }); return k; };
  let busy = false, lastWheel = 0, raf = 0;
  const go = k => {
    const ps = panels(), n = ps.length; k = clamp(k, 0, n - 1);
    const from = scrollY, to = topOf(ps[k], k, n), t0 = performance.now(), dur = REDUCED ? 1 : 760;
    busy = true; cancelAnimationFrame(raf); paint(k);
    const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const step = t => { const x = clamp((t - t0) / dur, 0, 1); scrollTo(0, from + (to - from) * ease(x)); if (x < 1) raf = requestAnimationFrame(step); else release(); };
    raf = requestAnimationFrame(step);
  };
  const release = () => { if (performance.now() - lastWheel > 160) busy = false; else setTimeout(release, 60); };
  const paint = k => {
    const ps = panels(); $$("button", dots).forEach((b, j) => b.classList.toggle("is-on", j === k));
    dots.classList.toggle("is-light", k === 0 || (ps[k] && (ps[k].classList.contains("fp--dark") || ps[k].classList.contains("footer"))));
    $("#nav").classList.toggle("is-dark", current === "home" && !!ps[k] && ps[k].classList.contains("fp--dark") && !document.body.classList.contains("menu-open"));
  };
  dots.innerHTML = panels().map((p, j) => `<button type="button" aria-label="${p.dataset.fp || "끝"}로 이동"><span>${p.dataset.fp || "끝"}</span></button>`).join("");
  $$("button", dots).forEach((b, j) => b.addEventListener("click", () => go(j)));
  addEventListener("wheel", e => {
    if (!on() || e.ctrlKey) return;
    const tr = e.target.closest && e.target.closest(".plans__track"); if (tr && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault(); lastWheel = performance.now();
    if (busy || Math.abs(e.deltaY) < 4) return;
    go(idx() + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  addEventListener("keydown", e => {
    if (!on() || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || "")) || e.target.isContentEditable) return;
    const m = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (e.key === "Home" || e.key === "End") { e.preventDefault(); go(e.key === "Home" ? 0 : panels().length - 1); return; }
    if (m && !(e.key === " " && e.target.closest("button,a"))) { e.preventDefault(); if (!busy) go(idx() + m); }
  });
  let ty = null;
  addEventListener("touchstart", e => { ty = on() ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener("touchmove", e => { if (ty !== null && on()) e.preventDefault(); }, { passive: false });
  addEventListener("touchend", e => { if (ty === null) return; const d = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(d) > 40 && !busy) go(idx() + (d > 0 ? 1 : -1)); });
  const top = $("#toTop");
  top.addEventListener("click", () => { if (on()) go(0); else scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); });
  const syncTop = () => top.classList.toggle("is-on", current === "home" && scrollY + innerHeight >= document.documentElement.scrollHeight - 160);
  const sync = () => { document.body.classList.toggle("fp-on", on()); syncTop(); if (current !== "home") $("#nav").classList.remove("is-dark"); if (!busy) paint(idx()); };
  addEventListener("scroll", sync, { passive: true }); addEventListener("resize", sync); addEventListener("hashchange", () => setTimeout(sync, 50));
  window.BBfp = { sync }; sync();
})();

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

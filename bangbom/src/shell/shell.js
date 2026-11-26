{
/* ═══════ 방봄 셸: 라우터·네비·홈 인터랙션 (모델하우스 흐름은 window.MH) ═══════ */
/* 예전 방꾸미 주소(/?example=1, /?tab=report 등)로 들어오면 방꾸미 화면(room.html)으로 보낸다 */
if (/[?&](example|tab|view)=/.test(location.search)) location.replace("room.html" + location.search);
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
    if (window.BBfp) requestAnimationFrame(BBfp.sync);  /* 풀페이지 점·맨 위로 단추를 지금 화면에 맞춘다 */
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
/* 눈높이 고르고 집 보기로: [data-eye="child"] 를 누르면 집 보기가 아이 눈높이(90cm)로 열린다. MH.setEye 가 없으면 그냥 집 보기만 연다 */
$$("[data-eye]").forEach(a => a.addEventListener("click", () => { if (window.MH && typeof MH.setEye === "function") MH.setEye(a.dataset.eye); }));

/* 휴대폰(820px 이하) 카테고리 칩: 고른 묶음([data-catp]) 하나만 보인다. PC에서는 CSS가 칩을 숨기고 모든 묶음을 이어서 보여 준다 */
const PHONE = matchMedia("(max-width: 820px)");
function setCat(row, key, move) {
  const page = row.closest(".page");
  $$(".cat", row).forEach(b => { const on = b.dataset.cat === key; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
  $$("[data-catp]", page).forEach(p => p.classList.toggle("is-on", p.dataset.catp === key));
  const on = $(".cat.is-on", row); if (on && row.scrollWidth > row.clientWidth) row.scrollTo({ left: on.offsetLeft - 18, behavior: REDUCED ? "auto" : "smooth" });
  if (!move || !PHONE.matches) return;
  /* 묶음의 머리가 칩 줄 바로 아래에 오게 한다. 이미 칩 줄이 위에 붙어 있으면 바로, 아직 아래에 있으면 부드럽게 올린다 */
  const first = $("[data-catp].is-on", page); if (!first) return;
  let top = 0; for (let n = first; n; n = n.offsetParent) top += n.offsetTop; /* 나타나는 움직임(transform)에 흔들리지 않는 자리 */
  const y = Math.max(0, top - nav.offsetHeight - row.offsetHeight);
  if (Math.abs(scrollY - y) > 1) scrollTo({ top: y, behavior: scrollY > y || REDUCED ? "auto" : "smooth" });
}
$$(".cats").forEach(row => $$(".cat", row).forEach(b => b.addEventListener("click", () => setCat(row, b.dataset.cat, true))));

/* 사진 없을 때 */
$$("img").forEach(img => { img.addEventListener("error", () => img.classList.add("is-missing")); if (img.complete && img.naturalWidth === 0 && img.src) img.classList.add("is-missing"); });

/* 나타나기 · 숫자 · 영상 */
const revealIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); } }), { threshold: .14, rootMargin: "0px 0px -6% 0px" }) : null;
function observeReveals() { $$(".page.is-active .reveal:not(.is-in)").forEach(el => revealIO ? revealIO.observe(el) : el.classList.add("is-in")); }
const countIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; countIO.unobserve(e.target);
  const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = REDUCED ? 0 : 1400;
  const step = t => { const k = dur ? clamp((t - t0) / dur, 0, 1) : 1; const dp = (el.dataset.count.split(".")[1] || "").length; el.textContent = (to * (1 - Math.pow(1 - k, 3))).toLocaleString("ko-KR", { minimumFractionDigits: dp, maximumFractionDigits: dp }); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}), { threshold: .5 }) : null;
$$("[data-count]").forEach(el => countIO ? countIO.observe(el) : el.textContent = (+el.dataset.count).toLocaleString("ko-KR"));
const vidIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.intersectionRatio >= .35) { if (v.ended) return; const p = v.play(); if (p && p.catch) p.catch(() => {}); } else if (!v.ended) v.pause(); }), { threshold: [0, .35, .6] }) : null;
$$("video[data-autoplay]").forEach(v => vidIO && vidIO.observe(v));

/* 비포/애프터 슬라이더: 화면에 들어올 때마다 한 번 왔다갔다(sweep). 사용자가 한 번 만지면 그 뒤로는 움직이지 않는다 */
(function () {
  const ba = $("#ba"); if (!ba) return;
  const range = $(".ba__range", ba); let touched = false, run = 0;
  const set = p => { ba.style.setProperty("--p", p + "%"); range.value = p; };
  range.addEventListener("input", () => { touched = true; set(+range.value); });
  /* 터치 화면(pointer:coarse)에서는 CSS가 range 의 pointer-events 를 꺼서 여기로 온다: 사진 어디를 잡아도 선이 따라오고,
     세로로 밀면 브라우저가 페이지를 내리며(pointercancel) 선은 그대로 둔다. 마우스 화면에서는 지금처럼 range 입력이 처리한다 */
  let pid = null, x0 = 0, moved = false;
  const at = x => { const r = ba.getBoundingClientRect(); return Math.round(clamp((x - r.left) / r.width * 100, 0, 100) * 10) / 10; };
  ba.addEventListener("pointerdown", e => { if (e.target === range || e.button > 0) return; pid = e.pointerId; x0 = e.clientX; moved = false; });
  ba.addEventListener("pointermove", e => {
    if (e.pointerId !== pid) return;
    if (!moved && Math.abs(e.clientX - x0) < 6) return;
    if (!moved) { moved = true; try { ba.setPointerCapture(pid); } catch (err) {} }
    touched = true; set(at(e.clientX));
  });
  ba.addEventListener("pointerup", e => { if (e.pointerId !== pid) return; if (!moved) { touched = true; set(at(e.clientX)); } pid = null; });
  ba.addEventListener("pointercancel", e => { if (e.pointerId === pid) pid = null; });
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  /* 놓은 후(100) 잠깐 → 놓기 전(0)까지 밀고 → 잠깐 → 가운데(50). 돌아가는 중에 화면을 벗어나면 멈추고(run 이 바뀜) 처음 자리로 */
  const sweep = () => {
    if (touched) return; if (REDUCED) { set(50); return; }
    const id = ++run, t0 = performance.now();
    const step = t => {
      if (touched || id !== run) return;
      const s = (t - t0) / 1000;
      const p = s < .4 ? 100 : s < 2 ? 100 - 100 * ease((s - .4) / 1.6) : s < 2.4 ? 0 : 50 * ease(clamp((s - 2.4) / 1.1, 0, 1));
      set(p); if (s < 3.5) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  new IntersectionObserver(es => { if (es[0].isIntersecting) sweep(); else if (!touched) { run++; set(100); } }, { threshold: .55 }).observe(ba);
})();

/* 홈 풀페이지 스크롤: 휠·키보드·터치 밀기 한 번에 한 화면(홈 .hs 6화면 + 푸터). 영상·애니메이션이 끝나길 기다리지 않는다.
   - 화면보다 긴 화면(해결 1·2·3 등)은 그 안에서 굴린 만큼 내려가고(화면 끝을 넘지 않음), 끝에 닿은 뒤 새로 굴리면 다음 화면으로 간다.
     넘치는 길이가 섹션 아래 여백(48px)보다 작으면 잘리는 내용이 없으니 한 화면으로 본다.
   - 900px 이하이거나 높이 560px 미만이면 끄고 일반 스크롤. 메뉴가 열려 있어도 끈다.
   - 시작하기의 단지 가로 목록(.plans__track)에서 옆으로 미는 것은 막지 않는다 */
(function () {
  const dots = $("#fpDots"), top = $("#toTop"); if (!dots || !top) return;
  const SLACK = 48, LINE = 16;
  const panels = () => [...$$("#page-home .hs"), $(".footer")];
  const nameOf = p => p.dataset.hs || "끝";
  const isDark = p => !!p && (p.classList.contains("hero") || p.classList.contains("footer"));
  const on = () => current === "home" && innerWidth > 900 && innerHeight >= 560 && !document.body.classList.contains("menu-open");
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  /* k 번째 화면이 차지하는 스크롤 범위 [a, b]. 길지 않은 화면은 a === b */
  const span = k => {
    const ps = panels(), p = ps[k], t = Math.round(p.getBoundingClientRect().top + scrollY), h = p.offsetHeight;
    const a = Math.min(t, maxY()), b = h - innerHeight > SLACK ? Math.min(t + h - innerHeight, maxY()) : a;
    return [a, k === ps.length - 1 ? maxY() : b];
  };
  const idx = () => { const ps = panels(); let k = 0; ps.forEach((p, j) => { if (span(j)[0] <= scrollY + innerHeight * .45) k = j; }); return k; };
  let busy = false, raf = 0, lastWheel = 0, gestureAt = 0;
  const paint = k => {
    const ps = panels(); $$("button", dots).forEach((b, j) => { b.classList.toggle("is-on", j === k); b.toggleAttribute("aria-current", j === k); });
    dots.classList.toggle("is-light", isDark(ps[k]));
    nav.classList.toggle("is-dark", current === "home" && isDark(ps[k]) && !nav.classList.contains("is-clear") && !document.body.classList.contains("menu-open"));
  };
  const animate = (to, k) => {
    const from = scrollY, t0 = performance.now(), dur = REDUCED ? 0 : 760;
    busy = true; cancelAnimationFrame(raf); if (k != null) paint(k);
    const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const step = t => { const x = dur ? clamp((t - t0) / dur, 0, 1) : 1; scrollTo(0, from + (to - from) * ease(x)); if (x < 1) raf = requestAnimationFrame(step); else busy = false; };
    if (!dur) { scrollTo(0, to); busy = false; return; }
    raf = requestAnimationFrame(step);
  };
  /* 다른 화면으로: 아래로 갈 때는 그 화면 맨 위, 위로 갈 때는 그 화면 맨 아래(긴 화면이면 끝부분)로 */
  const go = (k, up) => { const n = panels().length; k = clamp(k, 0, n - 1); const [a, b] = span(k); animate(up ? b : a, k); };
  /* dy 만큼 내리려 한다. 긴 화면 안이면 그 안에서만 움직이고 true, 끝에 닿아 있으면 false */
  const inner = dy => {
    const k = idx(), [a, b] = span(k); if (a === b) return false;
    if ((dy > 0 && scrollY >= b - 1) || (dy < 0 && scrollY <= a + 1)) return false;
    cancelAnimationFrame(raf); busy = false; scrollTo(0, clamp(scrollY + dy, a, b)); return true;
  };
  /* 한 번의 몸짓(휠·키·밀기): 긴 화면 안이면 그만큼 내리고, 아니면 한 화면 넘긴다 */
  const move = (dy, fresh) => {
    if (inner(dy)) { gestureAt = performance.now(); return; }
    if (busy || !fresh) return;
    go(idx() + (dy > 0 ? 1 : -1), dy < 0);
  };
  dots.innerHTML = panels().map(p => `<button type="button" aria-label="${nameOf(p)}(으)로 이동"><span>${nameOf(p)}</span></button>`).join("");
  $$("button", dots).forEach((b, j) => b.addEventListener("click", () => go(j)));
  addEventListener("wheel", e => {
    if (!on() || e.ctrlKey) return;
    const tr = e.target.closest && e.target.closest(".plans__track"); if (tr && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now(), fresh = now - lastWheel > 220 && now - gestureAt > 220; lastWheel = now;
    if (Math.abs(e.deltaY) < 2) return;
    move(e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? innerHeight : 1), fresh);
  }, { passive: false });
  addEventListener("keydown", e => {
    if (!on() || e.altKey || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || "") || e.target.isContentEditable) return;
    if (e.key === "Home" || e.key === "End") { e.preventDefault(); go(e.key === "Home" ? 0 : panels().length - 1); return; }
    if (e.key === " " && e.target.closest && e.target.closest("button,a")) return;
    const page = innerHeight * .85, d = { ArrowDown: 120, ArrowUp: -120, PageDown: page, PageUp: -page, " ": e.shiftKey ? -page : page }[e.key];
    if (!d) return; e.preventDefault(); move(d, true);
  });
  let t0 = null;
  addEventListener("touchstart", e => { t0 = on() ? { x: e.touches[0].clientX, y: e.touches[0].clientY, y1: e.touches[0].clientY, track: !!(e.target.closest && e.target.closest(".plans__track")), side: false } : null; }, { passive: true });
  addEventListener("touchmove", e => {
    if (!t0 || !on()) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    if (t0.track && Math.abs(x - t0.x) > Math.abs(y - t0.y)) { t0.side = true; return; }   /* 단지 목록 옆으로 밀기는 그대로 */
    e.preventDefault(); if (inner(t0.y1 - y)) gestureAt = performance.now(); t0.y1 = y;  /* 긴 화면 안에서는 손가락을 따라 내려간다 */
  }, { passive: false });
  addEventListener("touchend", e => {
    if (!t0) return; const s = t0; t0 = null; if (s.side) return;
    const d = s.y - e.changedTouches[0].clientY;
    if (Math.abs(d) > 40 && performance.now() - gestureAt > 120) move(d > 0 ? 1 : -1, true);
  });
  top.addEventListener("click", () => { if (on()) go(0); else scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); });
  const sync = () => {
    document.body.classList.toggle("fp-on", on());
    top.classList.toggle("is-on", current === "home" && scrollY + innerHeight >= document.documentElement.scrollHeight - 160);
    if (current !== "home") nav.classList.remove("is-dark"); else if (!busy) paint(idx());
  };
  addEventListener("scroll", sync, { passive: true }); addEventListener("resize", sync); addEventListener("hashchange", () => setTimeout(sync, 50));
  window.BBfp = { sync, go, idx: () => idx() }; sync();
})();

/* How it helps 탭 */
/* 휴대폰에서는 탭 줄을 숨기고(칩 줄이 두 겹이 되지 않게) 네 장을 옆으로 넘긴다: 손가락으로 밀기, 앞뒤 단추, 점 표시 */
let zzI = 0, zzBusy = 0, zzTimer = 0;
const zzBox = $(".zz--tabbed");
function setZZ(i, fromScroll) {
  const n = $$(".zz-tab").length; zzI = (i + n) % n;
  $$(".zz-tab").forEach((b, k) => { b.classList.toggle("is-on", k === zzI); b.setAttribute("aria-selected", k === zzI); });
  $$(".zz--tabbed .zz__row").forEach((r, k) => r.classList.toggle("is-on", k === zzI));
  $$("#zzDots i").forEach((d, k) => d.classList.toggle("is-on", k === zzI));
  const on = $$(".zz-tab")[zzI]; if (on && on.parentElement.scrollWidth > on.parentElement.clientWidth) on.parentElement.scrollTo({ left: on.offsetLeft - 18, behavior: REDUCED ? "auto" : "smooth" });
  if (PHONE.matches && !fromScroll && zzBox) { zzBusy = performance.now() + 700; zzBox.scrollTo({ left: zzBox.clientWidth * zzI, behavior: REDUCED ? "auto" : "smooth" }); }
}
const zzSync = () => { if (!PHONE.matches || !zzBox.clientWidth) return; const i = Math.round(zzBox.scrollLeft / zzBox.clientWidth); if (i !== zzI) setZZ(i, true); };
if (zzBox) zzBox.addEventListener("scroll", () => {
  /* 단추로 넘기는 중(zzBusy)에는 지나가는 장을 세지 않고, 멈춘 뒤에 한 번 맞춘다 */
  clearTimeout(zzTimer); zzTimer = setTimeout(() => { zzBusy = 0; zzSync(); }, 140);
  if (performance.now() >= zzBusy) zzSync();
}, { passive: true });
$$(".zz-tab").forEach(b => b.addEventListener("click", () => setZZ(+b.dataset.zz)));
/* 홈 6화면(home.html)에는 이 넘김 단추가 없다. 없을 때 여기서 멈추면 아래 평면 갤러리와 BB.route 까지 멈춘다 */
const zzPrev = $("#zzPrev"), zzNext = $("#zzNext");
if (zzPrev) zzPrev.addEventListener("click", () => setZZ(zzI - 1)); if (zzNext) zzNext.addEventListener("click", () => setZZ(zzI + 1));
/* 화면을 돌리거나 창 폭이 바뀌어 휴대폰 배치로 들어오면 넘김 위치를 지금 장에 맞춘다 */
PHONE.addEventListener("change", () => { if (PHONE.matches && zzBox) requestAnimationFrame(() => { zzBox.scrollLeft = zzBox.clientWidth * zzI; }); });

/* 우리 이야기: 휴대폰에서는 둘째 문단을 접어 두고 누르면 편다 (PC에서는 단추가 없고 늘 펴져 있다) */
(function () {
  const btn = $("#storyToggle"), more = $("#storyMoreText"); if (!btn || !more) return;
  btn.addEventListener("click", () => { const open = btn.getAttribute("aria-expanded") !== "true"; btn.setAttribute("aria-expanded", open); more.classList.toggle("is-open", open); btn.textContent = open ? "팀 이야기 접기" : "팀 이야기 더 보기"; });
})();

/* 자주 묻는 질문: 휴대폰에서는 하나를 펴면 나머지를 접어서 화면이 길어지지 않게 한다 */
$$(".faq details").forEach(d => d.addEventListener("toggle", () => { if (d.open && PHONE.matches) $$(".faq details[open]").forEach(o => { if (o !== d) o.open = false; }); }));

/* 평형 갤러리 (모델하우스 집 보기 구조) */
(function () {
  const track = $("#plansTrack"); if (!track || !window.MH) return;
  /* 홈 시작하기 카드는 home_bb.js 가 판정 결과와 함께 먼저 채운다. 비어 있을 때만 예전 평면 카드로 채운다 */
  if (!track.children.length) track.innerHTML = MH.galleryCards();
  $$("[data-cid]", track).forEach(b => b.addEventListener("click", () => MH.openHouse(b.dataset.cid)));
  const go = dir => { const c = $(".plan-card", track); const w = c ? c.getBoundingClientRect().width + 24 : 300; track.scrollBy({ left: dir * w, behavior: REDUCED ? "auto" : "smooth" }); };
  $("#plansPrev").addEventListener("click", () => go(-1)); $("#plansNext").addEventListener("click", () => go(1));
  track.addEventListener("keydown", e => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
})();

window.BB = { route };
}

/* ═══════ 홈 5화면 채우기 (해결 1 · 시작하기) ═══════
   build.py 가 app_bb.js 안 표시 줄 자리에 끼워 넣는다. 같은 { } 범위라 RULES·COMPLEXES·profileResult·evaluate·appliedLists·PERSONA 를 그대로 쓴다.
   판정·개수·이유·월 부담은 모두 판정 코드(engine.js)가 계산한 값이다. 이 파일에 숫자를 직접 적지 않는다 */
(function homeFill() {
  const sup = $("#homeSupport"), track = $("#plansTrack");
  if (!sup && !track) return;
  const P = PERSONA, pr = profileResult(P);
  const evs = COMPLEXES.map(c => ({ c, e: evaluate(P, c, pr) }));
  const n = { on: 0, dim: 0, off: 0 }; evs.forEach(x => n[x.e.light]++);
  /* 판정 표시는 홈 어디서나 같다: ● 요건 충족 / ◐ 확인 필요 / ○ 미충족 (home.css 의 .jd) */
  const ST_JD = { eligible: "on", needs_check: "dim", ineligible: "off" }, ORDER = { on: 0, dim: 1, off: 2 };
  const jd = (k, label) => `<span class="jd jd--${k}"><i aria-hidden="true"></i>${esc(label || LIGHT_KO[k])}</span>`;
  const won = v => Number(v).toLocaleString("ko-KR");
  /* 작은 집 그림: ● 채움 / ◐ 왼쪽 절반 채움 / ○ 테두리만 */
  const house = (k, title) => `<svg class="hi hi--${k}" viewBox="0 0 24 24" role="img" aria-label="${esc(title)}">${k === "dim" ? `<path class="hi__half" d="M3.5 11 12 4.2V20H3.5z"/>` : ""}<path d="M3.5 11 12 4.2l8.5 6.8V20h-17z"/></svg>`;

  /* 3. 해결 1: 01 조건 → 02 하나씩 따지기 → 03 같이 못 받는 것 거르기 → 결과(단지 8곳) */
  if (sup) {
    const chips = [`${won(P.age)}세`, `월 실수령 ${won(P.monthly_income)}만`, `모은 돈 ${won(P.assets)}만`, `월 예산 ${won(P.monthly_budget)}만`];
    const items = [...pr.loans, ...pr.policies].map((x, i) => ({ x, k: ST_JD[x.status], i })).sort((a, b) => ORDER[a.k] - ORDER[b.k] || a.i - b.i);
    /* 같이 못 받는 지원: 판정 코드가 "둘 중 하나만"으로 걸러 낸 첫 단지에서, 계산에 쓴 쪽과 빠진 쪽 */
    let clash = null;
    for (const { c, e } of evs) {
      const al = appliedLists(c, e, pr), na = al.not_applied.find(x => /하나만/.test(x.reason));
      const kept = na && al.applied.find(x => x.id === "youth_beotimok" || x.id === "hf_youth_guarantee");
      if (na && kept) { clash = { kept, drop: na }; break; }
    }
    const lights = evs.slice().sort((a, b) => ORDER[a.e.light] - ORDER[b.e.light]);
    sup.innerHTML = `
      <div class="sf reveal">
        <div class="sf__step">
          <div class="sf__h"><span class="sf__no">01</span><b>조건만 넣으면</b><span class="tag-example">예시</span></div>
          <ul class="sf__chips" aria-label="김지훈 예시 조건">${chips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
          <p class="sf__note">김지훈 예시 조건이에요.</p>
        </div>
        <span class="sf__arrow" aria-hidden="true"></span>
        <div class="sf__step">
          <div class="sf__h"><span class="sf__no">02</span><b>하나씩 따져서</b></div>
          <ul class="sf__list">${items.map(({ x, k }) => `<li><span>${esc(x.name)}</span>${jd(k, ST_KO[x.status])}</li>`).join("")}</ul>
        </div>
        <span class="sf__arrow" aria-hidden="true"></span>
        <div class="sf__step">
          <div class="sf__h"><span class="sf__no">03</span><b>같이 못 받는 건 걸러요</b></div>
          ${clash ? `<div class="sf__pair">
            <p class="sf__keep">${esc(clash.kept.name)}</p>
            <p class="sf__or"><span>둘 중 하나</span></p>
            <p class="sf__drop"><s>${esc(clash.drop.name)}</s><em>빠짐</em></p>
          </div>
          <p class="sf__note">빠진 쪽은 월 부담 계산에 넣지 않아요.</p>` : `<p class="sf__note">이 조건에서는 같이 못 받는 지원이 없어요.</p>`}
        </div>
      </div>
      <div class="sf-result reveal">
        <p class="sf-result__t">대구 단지 ${COMPLEXES.length}곳 중</p>
        <div class="sf-result__houses">${lights.map(({ c, e }) => house(e.light, `${c.name.replace("(예시)", "").trim()} · ${LIGHT_KO[e.light]}`)).join("")}</div>
        <p class="sf-result__n"><span><i class="jd-dot jd-dot--on" aria-hidden="true"></i>${LIGHT_KO.on} <b>${n.on}</b></span><span><i class="jd-dot jd-dot--dim" aria-hidden="true"></i>${LIGHT_KO.dim} <b>${n.dim}</b></span><span><i class="jd-dot jd-dot--off" aria-hidden="true"></i>${LIGHT_KO.off} <b>${n.off}</b></span></p>
      </div>
      <p class="sf-foot reveal">모르는 건 24시간 상담으로 물어보세요. <a href="#input" class="link">내 조건 넣기 →</a></p>`;
  }

  /* 5. 시작하기: 단지 카드. 그림은 지도에 까는 단지 주변 지도(img/map/<id>.jpg, OpenStreetMap 재해석)이고 가운데가 단지 자리다.
     판정·월 부담은 해결 1과 같은 김지훈 예시 조건. 요건 충족 → 확인 필요 → 미충족 순. shell.js 는 이미 채워져 있으면 덮어쓰지 않는다 */
  if (track) {
    const cards = evs.map((x, i) => ({ ...x, i })).sort((a, b) => ORDER[a.e.light] - ORDER[b.e.light] || a.i - b.i).map(({ c, e }) => {
      const name = c.name.replace("(예시)", "").trim(), main = e.net_monthly != null ? e.net_monthly : e.net_monthly_best;
      const cost = main == null ? `<p class="hc__cost is-none">모은 돈이 모자라 월 부담은 계산하지 않았어요</p>`
        : `<p class="hc__cost">월 부담 약 <b>${man1(main)}만 원</b>${e.net_monthly == null ? `<small>지원을 모두 받으면</small>` : ""}</p>`;
      return `<button class="plan-card hc" data-cid="${c.id}" aria-label="${esc(name)} 집 보기">
        <div class="plan-card__media hc__media"><img src="img/map/${c.id}.jpg" alt="" loading="lazy">${house(e.light, LIGHT_KO[e.light])}<span class="tag-example">${c.is_sample ? "예시 단지" : "공개 보도 단지"}</span></div>
        ${jd(e.light)}
        <p class="plan-card__name">${esc(name)}</p>
        <p class="plan-card__meta">${esc(c.district)} · ${esc(SUPPLY_KO[c.supply_type] || "")} · ${c.area_m2}㎡</p>
        ${cost}
      </button>`;
    });
    track.innerHTML = cards.join("");
  }
})();

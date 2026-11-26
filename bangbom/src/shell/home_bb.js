/* ═══════ 홈 5화면 채우기 (해결 1 · 시작하기) ═══════
   build.py 가 app_bb.js 바로 뒤에 붙인다. 같은 { } 범위라 RULES·COMPLEXES·profileResult·evaluate·appliedLists·PERSONA 를 그대로 쓴다.
   판정·개수·이유는 모두 판정 코드가 계산한 값이다. 이 파일에 숫자를 직접 적지 않는다 */
(function homeFill() {
  const sup = $("#homeSupport");
  if (!sup) return;
  const P = PERSONA, pr = profileResult(P);
  const evs = COMPLEXES.map(c => ({ c, e: evaluate(P, c, pr) }));
  const n = { on: 0, dim: 0, off: 0 }; evs.forEach(x => n[x.e.light]++);
  const ST_CLASS = { eligible: "st--ok", needs_check: "st--check", ineligible: "st--no" };

  /* 3. 해결 1: 예시 페르소나 판정 미리보기 */
  if (sup) {
    const rows = [...pr.loans, ...pr.policies].map(x =>
      `<li><span class="hsu__name">${esc(x.name)}</span><span class="st ${ST_CLASS[x.status]}">${esc(ST_KO[x.status])}</span></li>`).join("");
    /* 같이 못 받는 지원: 판정 코드가 "둘 중 하나만"으로 걸러 낸 첫 사례 */
    let clash = null;
    for (const { c, e } of evs) { const na = appliedLists(c, e, pr).not_applied.find(x => /하나만/.test(x.reason)); if (na) { clash = na; break; } }
    const won = v => (v / 1).toLocaleString("ko-KR");
    sup.innerHTML = `
      <div class="zz__row">
        <div class="card hsu reveal">
          <div class="hsu__head">
            <p class="hsu__who">김지훈(27) · 월 실수령 ${won(P.monthly_income)}만 · 모은 돈 ${won(P.assets)}만 · 월 예산 ${won(P.monthly_budget)}만</p>
            <span class="tag-example">예시</span>
          </div>
          <ul class="hsu__list">${rows}</ul>
          <p class="hsu__sum">대구 단지 ${COMPLEXES.length}곳 중 <b>● ${LIGHT_KO.on} ${n.on}</b> · ◐ ${LIGHT_KO.dim} ${n.dim} · ○ ${LIGHT_KO.off} ${n.off}</p>
          ${clash ? `<p class="hsu__clash"><b>같이 못 받는 지원</b>${esc(clash.name)} · ${esc(clash.reason)}</p>` : ""}
          <p class="hsu__foot">최종 판정은 은행과 기관이 해요. 방봄은 요건을 미리 따져 볼 뿐이에요.</p>
        </div>
        <div class="zz__text reveal">
          <ol class="hsu__steps">
            <li><b>조건만 넣으면</b>나이, 소득, 모은 돈을 넣으면 대출과 지원을 하나씩 따져서 요건 충족 · 확인 필요 · 미충족으로 알려줘요.</li>
            <li><b>같이 못 받는 지원은 걸러요</b>둘 중 하나만 받을 수 있는 지원은 미리 빼고, 실제로 받을 수 있는 조합으로 월 부담을 계산해요.</li>
            <li><b>모르는 건 24시간 상담으로</b>궁금한 게 생기면 지도와 집 보기 화면에서 상담을 열어 물어보세요. 판정과 숫자는 규칙대로 계산한 값만 보여줘요.</li>
          </ol>
          <a href="#input" class="link">내 조건 넣고 판정 보기 →</a>
        </div>
      </div>`;
  }

})();

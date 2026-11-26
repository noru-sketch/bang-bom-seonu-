/* ═══════ 홈 6화면 채우기 (해결 1 · 해결 3) ═══════
   build.py 가 app_bb.js 바로 뒤에 붙인다. 같은 { } 범위라 RULES·COMPLEXES·profileResult·evaluate·appliedLists·PERSONA 를 그대로 쓴다.
   판정·개수·이유는 모두 판정 코드가 계산한 값이다. 이 파일에 숫자를 직접 적지 않는다 */
(function homeFill() {
  const sup = $("#homeSupport"), chk = $("#homeCheck");
  if (!sup && !chk) return;
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

  /* 5. 해결 3: 방봄이 확인한 것 / 직접 확인할 것 / 기관이 정하는 것 */
  if (chk) {
    const byType = {}; COMPLEXES.forEach(c => { byType[c.supply_type] = (byType[c.supply_type] || 0) + 1; });
    /* 공급 주체: 단지 자료에 있는 것(LH·CR리츠)은 개수까지, 민간은 지금 목록에 없어서 확인할 점만 적는다 */
    const supply = Object.keys(byType).map(t =>
      `<li><b>${esc(SUPPLY_KO[t] || t)}</b><span>${esc(LANDLORD_KO[t] || "")} · ${byType[t]}곳</span></li>`).join("")
      + `<li><b>민간 임대</b><span>임대인 개인·법인 · 지금 목록에는 없어요</span></li>`;
    const gf = RULES.badges.guarantee_fee;
    /* 체크리스트 순서: 계약금 전 은행 사전 상담 → (해제 특약) → 등기부 → 임대인 → 보증서. 앞의 다섯 줄은 판정 자료(RULES) 그대로, 보증서 한 줄만 홈에서 더한다 */
    const mine = [...RULES.fixed_checklist, ...RULES.safety_checklist, "보증에 가입했다면 보증서를 받아 두고, 이름·주소·보증금이 계약서와 같은지 확인하세요"]
      .map(t => `<li>${esc(t)}</li>`).join("");
    const by = [];
    [...RULES.loans, RULES.market_loan, ...RULES.policies].forEach(x => { if (x.approval_by && !by.includes(x.approval_by)) by.push(x.approval_by); });
    chk.innerHTML = `
      <div class="hck-grid">
        <div class="card hck reveal">
          <span class="hck__k">방봄이 확인한 것</span>
          <p class="hck__t">단지마다 공급 주체와 임대인을 먼저 보여줘요.</p>
          <ul class="hck__supply">${supply}</ul>
          <p class="hck__note"><b>보증 안내</b> ${esc(gf.text)} <a href="${esc(gf.source_url)}" target="_blank" rel="noopener">출처 ↗</a></p>
          <p class="hck__note">민간 임대는 임대인이 보증에 가입했는지 계약 전에 꼭 확인하세요. 단지별 보증 안내와 공고 링크는 단지 카드에서 같이 볼 수 있어요.</p>
        </div>
        <div class="card hck reveal">
          <span class="hck__k">직접 확인할 것</span>
          <p class="hck__t">계약 전에 이것만은 꼭 챙겨요.</p>
          <ul class="hck__list">${mine}</ul>
        </div>
        <div class="card hck reveal">
          <span class="hck__k">기관이 정하는 것</span>
          <p class="hck__t">대출 승인과 지원 선정은 기관이 정해요.</p>
          <ul class="hck__by">${by.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        </div>
      </div>`;
  }
})();

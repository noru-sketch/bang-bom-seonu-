// 판정 규칙 자체 점검: node bangbom/src/tools/check_rules.cjs bangbom/src/modelhouse/  (페르소나 김지훈 → ● 3 · ◐ 2 · ○ 3, 상인푸르지오 ◐ 39.7)
const fs = require("fs"), M = process.argv[2];
const src = ["data.js", "data2.js", "engine.js"].map(f => fs.readFileSync(M + f, "utf8")).join("\n").replace(/if \(typeof module[^\n]*/, "");
const out = new Function(src + "\nreturn { RULES, COMPLEXES, profileResult, evaluate, appliedLists };")();
const P = { age: 27, monthly_income: 250, annual_income_gross: null, assets: 1000, homeless: true, lives_with_parents: false, daegu_resident_or_moving: true, monthly_budget: 60, priorities: [] };
const pr = out.profileResult(P), n = { on: 0, dim: 0, off: 0 };
out.COMPLEXES.forEach(c => { const e = out.evaluate(P, c, pr); n[e.light]++; const di = out.appliedLists(c, e, pr).not_applied.find(x => x.id === "daegu_interest"); console.log(c.name, e.light, e.net_monthly ?? e.net_monthly_best, di ? di.reason : "(적용)"); });
console.log(n); const s = out.COMPLEXES.find(c => c.name.includes("상인푸르지오")), e = out.evaluate(P, s, pr);
console.assert(n.on === 3 && n.dim === 2 && n.off === 3, "개수 틀림"); console.assert(e.light === "dim" && e.net_monthly_best === 39.7, "상인 틀림 " + e.light + " " + e.net_monthly_best);

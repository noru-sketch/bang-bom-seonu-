/* ═══════ 세대 구조 (표준 구조 단순화 · 공고 평면도 원본 미사용) ═══════
   1 = 1m, 북쪽 z=0, 남쪽(z=D)에 발코니 창 */
const ROOMS = {
  room_84a: { name: "84㎡ A타입", area: 84, W: 10.4, D: 8.6, entry: { side: "E", t: .33 }, rooms: [
    { id: "r3", type: "bed", x: 0, z: 0, w: 3.4, d: 3.6, door: { side: "E", t: .8 } },
    { id: "kit", type: "kitchen", x: 3.4, z: 0, w: 4.0, d: 3.6, open: true },
    { id: "bath", type: "bath", x: 7.4, z: 0, w: 3.0, d: 2.0, door: { side: "S", t: .3 } },
    { id: "hall", type: "hall", x: 7.4, z: 2.0, w: 3.0, d: 1.6, open: true },
    { id: "bath2", type: "bath", x: 0, z: 3.6, w: 1.6, d: 1.8, door: { side: "E", t: .5 } },
    { id: "dress", type: "dress", x: 1.6, z: 3.6, w: 1.8, d: 1.8, door: { side: "S", t: .5 } },
    { id: "r1", type: "bed", x: 0, z: 5.4, w: 3.4, d: 3.2, door: { side: "E", t: .15 } },
    { id: "liv", type: "living", x: 3.4, z: 3.6, w: 4.0, d: 5.0, open: true },
    { id: "r2", type: "bed", x: 7.4, z: 3.6, w: 3.0, d: 5.0, door: { side: "W", t: .15 } } ] },
  room_59a: { name: "59㎡ A타입", area: 59, W: 8.4, D: 7.4, entry: { side: "E", t: .33 }, rooms: [
    { id: "r3", type: "bed", x: 0, z: 0, w: 2.9, d: 3.0, door: { side: "E", t: .8 } },
    { id: "kit", type: "kitchen", x: 2.9, z: 0, w: 3.0, d: 3.0, open: true },
    { id: "bath", type: "bath", x: 5.9, z: 0, w: 2.5, d: 1.9, door: { side: "S", t: .3 } },
    { id: "hall", type: "hall", x: 5.9, z: 1.9, w: 2.5, d: 1.1, open: true },
    { id: "r1", type: "bed", x: 0, z: 3.0, w: 2.9, d: 4.4, door: { side: "E", t: .15 } },
    { id: "liv", type: "living", x: 2.9, z: 3.0, w: 3.0, d: 4.4, open: true },
    { id: "r2", type: "bed", x: 5.9, z: 3.0, w: 2.5, d: 4.4, door: { side: "W", t: .15 } } ] }
};
const ROOM_KO = { bath: "욕실", kitchen: "주방", living: "거실", hall: "현관", dress: "드레스룸" };

function edgeOf(r, side, t) {
  if (side === "N") return { axis: "x", c: r.z, m: r.x + t * r.w };
  if (side === "S") return { axis: "x", c: r.z + r.d, m: r.x + t * r.w };
  if (side === "W") return { axis: "z", c: r.x, m: r.z + t * r.d };
  return { axis: "z", c: r.x + r.w, m: r.z + t * r.d };
}
function buildLayout(key) {
  const T = ROOMS[key], W = T.W, D = T.D, E = .02;
  const rooms = T.rooms.map(r => Object.assign({}, r));
  const beds = rooms.filter(r => r.type === "bed").sort((a, b) => b.w * b.d - a.w * a.d);
  beds.forEach((r, i) => r.name = i === 0 ? "안방" : "방 " + (i + 1));
  let bi = 0; rooms.forEach(r => { if (!r.name) r.name = r.type === "bath" ? (bi++ ? "욕실 2" : "욕실") : (ROOM_KO[r.type] || "방"); });
  const open = [];
  rooms.forEach(r => { if (r.door) { const p = edgeOf(r, r.door.side, r.door.t); open.push({ axis: p.axis, c: p.c, a: p.m - .45, b: p.m + .45, kind: "door", room: r.id, m: p.m }); } });
  const outer = { N: { axis: "x", c: 0, len: W }, S: { axis: "x", c: D, len: W }, W: { axis: "z", c: 0, len: D }, E: { axis: "z", c: W, len: D } };
  const eo = outer[T.entry.side], em = T.entry.t * eo.len;
  const entry = { axis: eo.axis, c: eo.c, a: em - .45, b: em + .45, kind: "door", entry: true, side: T.entry.side, m: em };
  open.push(entry);
  rooms.forEach(r => {
    if (["bath", "hall", "dress"].includes(r.type)) return;
    if (Math.abs(r.z + r.d - D) < E) { const ww = Math.min(r.w * .62, r.type === "living" ? 2.8 : 1.6), m = r.x + r.w / 2; open.push({ axis: "x", c: D, a: m - ww / 2, b: m + ww / 2, kind: "window", room: r.id }); }
    if (Math.abs(r.z) < E && (r.type === "bed" || r.type === "kitchen")) { const ww = Math.min(r.w * .45, 1.2), m = r.x + r.w / 2; open.push({ axis: "x", c: 0, a: m - ww / 2, b: m + ww / 2, kind: "window", room: r.id }); }
  });
  const key2 = s => s.axis + s.c.toFixed(2) + ":" + s.a.toFixed(2) + ":" + s.b.toFixed(2);
  const raw = [{ axis: "x", c: 0, a: 0, b: W, outer: "N" }, { axis: "x", c: D, a: 0, b: W, outer: "S" }, { axis: "z", c: 0, a: 0, b: D, outer: "W" }, { axis: "z", c: W, a: 0, b: D, outer: "E" }];
  const seen = new Set(raw.map(key2));
  rooms.forEach(r => {
    if (r.open) return;
    const eds = [];
    if (r.z > E) eds.push({ axis: "x", c: r.z, a: r.x, b: r.x + r.w });
    if (r.z + r.d < D - E) eds.push({ axis: "x", c: r.z + r.d, a: r.x, b: r.x + r.w });
    if (r.x > E) eds.push({ axis: "z", c: r.x, a: r.z, b: r.z + r.d });
    if (r.x + r.w < W - E) eds.push({ axis: "z", c: r.x + r.w, a: r.z, b: r.z + r.d });
    eds.forEach(s => { const kk = key2(s); if (!seen.has(kk)) { seen.add(kk); raw.push(s); } });
  });
  const H = 2.4, TH = .15, pieces = [], collide = [];
  raw.forEach(s => {
    const gaps = open.filter(o => o.axis === s.axis && Math.abs(o.c - s.c) < E && o.b > s.a && o.a < s.b).sort((p, q) => p.a - q.a);
    let cur = s.a - TH / 2;
    const front = s.outer === "S" || s.outer === "E";
    const push = (a, b, y0, y1, kind) => { if (b - a > .01) pieces.push({ axis: s.axis, c: s.c, a, b, y0, y1, kind, front }); };
    gaps.forEach(g => {
      if (g.a > cur) { push(cur, g.a, 0, H, "solid"); collide.push({ axis: s.axis, c: s.c, a: cur, b: g.a }); }
      if (g.kind === "door") push(g.a, g.b, 2.1, H, "lintel");
      else { push(g.a, g.b, 0, .9, "sill"); push(g.a, g.b, 2.1, H, "lintel"); pieces.push({ axis: s.axis, c: s.c, a: g.a, b: g.b, y0: .9, y1: 2.1, kind: "glass", front }); collide.push({ axis: s.axis, c: s.c, a: g.a, b: g.b }); }
      cur = Math.max(cur, g.b);
    });
    push(cur, s.b + TH / 2, 0, H, "solid"); collide.push({ axis: s.axis, c: s.c, a: cur, b: s.b + TH / 2 });
  });
  const L = { key, name: T.name, area: T.area, W, D, H, rooms, open, entry, raw, pieces, collide, doors: open.filter(o => o.kind === "door"), windows: open.filter(o => o.kind === "window") };
  L.fixed = [];
  rooms.filter(r => r.type === "kitchen").forEach(r => {
    let a = r.x + .08, b = r.x + r.w - .08;
    if (b - a > 2.4) { L.fixed.push({ key: "fridge", x0: b - .75, x1: b, z0: r.z + .08, z1: r.z + .82, h: 1.8 }); b -= .78; }
    L.fixed.push({ key: "counter", x0: a, x1: b, z0: r.z + .08, z1: r.z + .68, h: .9 });
  });
  rooms.filter(r => r.type === "bath").forEach(r => L.fixed.push({ key: "tub", x0: r.x + .1, x1: r.x + Math.min(r.w - .12, 1.5), z0: r.z + .1, z1: r.z + .8, h: .5, deco: 1 }));
  return L;
}

/* ═══════ 추천 배치 (벽 따라 후보 → 점수) ═══════ */
const FROOMS = { bed: ["bed"], sofa: ["living"], dining_table: ["kitchen", "living"], desk: ["bed", "living"], storage: ["bed", "living"], tv_stand: ["living"], light: ["living", "bed"] };
function rectOverlap(p, q, g = 0) { return p.x0 < q.x1 + g && p.x1 > q.x0 - g && p.z0 < q.z1 + g && p.z1 > q.z0 - g; }
function wallExists(L, axis, c, a, b) { return L.raw.some(s => s.axis === axis && Math.abs(s.c - c) < .03 && s.a <= a + .05 && s.b >= b - .05); }
function doorZones(L) { return L.doors.map(o => o.axis === "x" ? { x0: o.a, x1: o.b, z0: o.c - .9, z1: o.c + .9 } : { x0: o.c - .9, x1: o.c + .9, z0: o.a, z1: o.b }); }
function placeLayout(L, ids, opt = {}) {
  const placed = L.fixed.filter(f => !f.deco).map(f => Object.assign({}, f)), zones = doorZones(L), items = [], skipped = [];
  const beds = L.rooms.filter(r => r.type === "bed").sort((a, b) => b.w * b.d - a.w * a.d);
  const order = [...ids].sort((a, b) => FCAT_PRI.indexOf(FURNITURE.find(f => f.id === a).cat) - FCAT_PRI.indexOf(FURNITURE.find(f => f.id === b).cat));
  for (const id of order) {
    const F = FURNITURE.find(f => f.id === id);
    let rooms = L.rooms.filter(r => FROOMS[F.cat].includes(r.type));
    if (F.cat === "bed") rooms = [beds[0], ...beds.slice(1)];
    if (F.cat === "desk") rooms = opt.remote ? [...beds.slice(1), ...L.rooms.filter(r => r.type === "living")] : [...beds.slice(1), ...beds];
    if (F.cat === "storage" && F.id === "ward_12") { const bedRoom = items.find(i => i.cat === "bed"); rooms = bedRoom ? [L.rooms.find(r => r.id === bedRoom.room), ...beds] : beds; }
    rooms = rooms.filter((r, i, a) => r && a.indexOf(r) === i);
    let best = null;
    rooms.forEach((r, ri) => {
      const ix0 = r.x + .09, ix1 = r.x + r.w - .09, iz0 = r.z + .09, iz1 = r.z + r.d - .09, cands = [];
      ["N", "S", "W", "E"].forEach(side => {
        const hz = side === "N" || side === "S", A = hz ? ix0 : iz0, B = hz ? ix1 : iz1;
        for (let p = A; p + F.w <= B + 1e-6; p += .1) {
          let rc;
          if (side === "N") rc = { x0: p, x1: p + F.w, z0: iz0, z1: iz0 + F.d };
          if (side === "S") rc = { x0: p, x1: p + F.w, z0: iz1 - F.d, z1: iz1 };
          if (side === "W") rc = { x0: ix0, x1: ix0 + F.d, z0: p, z1: p + F.w };
          if (side === "E") rc = { x0: ix1 - F.d, x1: ix1, z0: p, z1: p + F.w };
          const wc = side === "N" ? r.z : side === "S" ? r.z + r.d : side === "W" ? r.x : r.x + r.w;
          if (!wallExists(L, hz ? "x" : "z", wc, p, p + F.w)) continue;
          Object.assign(rc, { side, wc, along: [p, p + F.w] }); cands.push(rc);
        }
      });
      if (F.cat === "dining_table" || F.cat === "light") {
        const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
        for (let dx = -1.2; dx <= 1.2; dx += .2) for (let dz = -1.2; dz <= 1.2; dz += .2) {
          const rc = { x0: cx + dx - F.w / 2, x1: cx + dx + F.w / 2, z0: cz + dz - F.d / 2, z1: cz + dz + F.d / 2, side: "C", center: 1 };
          if (rc.x0 < ix0 + .5 || rc.x1 > ix1 - .5 || rc.z0 < iz0 + .5 || rc.z1 > iz1 - .5) continue;
          cands.push(rc);
        }
      }
      cands.forEach(rc => {
        if (placed.some(q => rectOverlap(rc, q, rc.center ? .5 : .04)) || zones.some(q => rectOverlap(rc, q))) return;
        const winHit = rc.along && L.windows.some(w => w.axis === (rc.side === "N" || rc.side === "S" ? "x" : "z") && Math.abs(w.c - rc.wc) < .03 && w.b > rc.along[0] && w.a < rc.along[1]);
        if (F.h > 1.2 && winHit) return;
        let sc = -ri * 4; const c = { x: (rc.x0 + rc.x1) / 2, z: (rc.z0 + rc.z1) / 2 };
        if (rc.along) { const rl = rc.side === "N" || rc.side === "S" ? [r.x, r.x + r.w] : [r.z, r.z + r.d]; sc += 2 - Math.min(rc.along[0] - rl[0], rl[1] - rc.along[1]) * .8; }
        if (F.cat === "bed") sc += Math.min(...L.doors.map(d => Math.hypot(c.x - (d.axis === "x" ? d.m : d.c), c.z - (d.axis === "x" ? d.c : d.m)))) * 1.4;
        if (F.cat === "desk" && winHit) sc += opt.remote ? 9 : 2;
        if (F.cat === "tv_stand") sc += (winHit ? -4 : 1) + (rc.side === "E" || rc.side === "W" ? 2 : 0);
        if (F.cat === "sofa") { const tv = items.find(i => i.cat === "tv_stand" && i.room === r.id); if (tv) { const opp = { N: "S", S: "N", E: "W", W: "E" }[tv.side]; if (rc.side === opp) sc += 10; } }
        if (F.cat === "dining_table") sc += rc.center ? 3 : 0;
        if (!best || sc > best.sc) best = { sc, rc, room: r };
      });
    });
    if (!best) { skipped.push(id); continue; }
    const rc = best.rc;
    placed.push(rc);
    items.push({ uid: id + "_" + items.length, id, cat: F.cat, name: F.name, w: F.w, d: F.d, h: F.h, price: F.price, round: F.round, side: rc.side, rot: { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2, C: 0 }[rc.side], cx: (rc.x0 + rc.x1) / 2, cz: (rc.z0 + rc.z1) / 2, room: best.room.id });
  }
  return { items, skipped };
}
function footprint(it) { const sw = Math.abs(Math.sin(it.rot)) > .5; const hw = (sw ? it.d : it.w) / 2, hd = (sw ? it.w : it.d) / 2; return { x0: it.cx - hw, x1: it.cx + hw, z0: it.cz - hd, z1: it.cz + hd }; }
function validSpot(L, items, it) {
  const f = footprint(it);
  if (f.x0 < .07 || f.z0 < .07 || f.x1 > L.W - .07 || f.z1 > L.D - .07) return false;
  for (const s of L.collide) {
    const w = s.axis === "x" ? { x0: s.a, x1: s.b, z0: s.c - .075, z1: s.c + .075 } : { x0: s.c - .075, x1: s.c + .075, z0: s.a, z1: s.b };
    if (rectOverlap(f, w, -.005)) return false;
  }
  for (const q of L.fixed) if (!q.deco && rectOverlap(f, q, -.005)) return false;
  for (const o of items) if (o !== it && o.uid !== it.uid && rectOverlap(f, footprint(o), -.005)) return false;
  return true;
}
function findSpot(L, items, F) {
  const liv = L.rooms.filter(r => FROOMS[F.cat].includes(r.type)).concat(L.rooms.filter(r => r.type === "living"));
  for (const r of liv) for (let dz = 0; dz <= r.d; dz += .2) for (let dx = 0; dx <= r.w; dx += .2) {
    const it = { uid: "probe", w: F.w, d: F.d, rot: 0, cx: r.x + .2 + F.w / 2 + dx, cz: r.z + .2 + F.d / 2 + dz };
    if (validSpot(L, items, it)) return it;
  }
  return null;
}

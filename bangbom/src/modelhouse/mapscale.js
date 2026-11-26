/* ═══════ 지도 배율 (네이버 지도 동네 보기 비율에 가깝게) ═══════
   - 예전 지도: 1칸 ≈ 경도 1/160도(약 0.6km). MAP_K 배로 늘려 같은 화면에 더 자세히 보여요.
   - 모든 지도 좌표는 위경도에서 PX·PZ로 다시 계산해요. 그래서 단지·역·병원·백화점이 실제 위치에 놓여요. */
const MAP_K = 3;
const PX = lng => +((lng - 128.48) * 160 * MAP_K).toFixed(2), PZ = lat => +((35.93 - lat) * 200 * MAP_K).toFixed(2);
(function scaleMap() {
  const sp = p => [p[0] * MAP_K, p[1] * MAP_K];
  const polys = list => list.map(poly => poly.map(ring => ring.map(sp)));
  GEO.outline = polys(GEO.outline); GEO.urban = polys(GEO.urban);
  Object.keys(GEO.gu).forEach(k => { GEO.gu[k] = polys(GEO.gu[k]); });
  Object.keys(GEO.label).forEach(k => { GEO.label[k] = sp(GEO.label[k]); });
  GEO.rivers.forEach(r => { r.pts = r.pts.map(sp); r.w *= 1.8; });
  GEO.roads.forEach(r => { r.pts = r.pts.map(sp); r.w *= 1.5; });
  GEO.mounts = GEO.mounts.map(m => m.map(v => v * MAP_K));
  GEO.lakes = GEO.lakes.map(l => l.map(v => v * MAP_K));
  COMPLEXES.forEach(c => { if (c.lat != null && c.lng != null) { c.map_x = PX(c.lng); c.map_z = PZ(c.lat); } });
  /* 지도 위 시설: 실제 위치(OpenStreetMap)만. 예전 샘플 시설은 빼요 */
  INFRA.length = 0;
  REAL_POI.forEach((p, i) => INFRA.push({ id: "p" + i, name: p[1], category: p[0], lat: p[2], lng: p[3], map_x: PX(p[3]), map_z: PZ(p[2]) }));
  DISTRICTS.forEach(d => { d[1] *= MAP_K; d[2] *= MAP_K; });
})();

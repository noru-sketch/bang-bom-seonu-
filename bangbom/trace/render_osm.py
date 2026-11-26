r"""OpenStreetMap 데이터(© OpenStreetMap contributors, ODbL)로 단지 주변 바닥 지도를 직접 그린다. 글자 없음.
사용: python trace\render_osm.py            → trace\art\c01_sangin.png ... + img\map\c01.jpg ...
범위: 단지 위경도 중심, 지도 8x8 단위 (x=(경도-128.48)*160, z=(35.93-위도)*200 와 같은 선형 투영).
Overpass 응답은 trace\osm\에 저장해 두고 다시 받지 않는다.
"""
import json, os, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_refs import SITES  # noqa: E402  (c06 새 좌표 포함)

HALF_X, HALF_Z = 4 / 160, 4 / 200          # 반폭(도): 지도 4단위
S = 2048                                   # 그린 뒤 1024로 줄임(안티에일리어싱)
UA = {"User-Agent": "BangbomHackathonDemo/1.0 (student project, low volume)"}
C = dict(land="#f3f1eb", green="#cddcc6", wood="#c3d4bb", water="#8fb8bb", bld="#d3cec3",
         casing="#fbfaf7", major="#b9b3a7", minor="#d6d2c9")
ROAD = {"motorway": 13, "trunk": 12, "primary": 10, "secondary": 9, "tertiary": 7,
        "unclassified": 4, "residential": 4, "living_street": 3, "service": 2.2}
MAJOR = {"motorway", "trunk", "primary", "secondary"}


def overpass(name, lat, lng):
    path = os.path.join(HERE, "osm", name + ".json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    b = f"{lat - HALF_Z},{lng - HALF_X},{lat + HALF_Z},{lng + HALF_X}"
    q = f"""[out:json][timeout:120];(
way["highway"]({b}); way["building"]({b});
way["natural"~"^(water|wood)$"]({b}); rel["natural"="water"]({b}); rel["natural"="wood"]({b});
way["waterway"~"^(river|stream|canal)$"]({b}); way["waterway"="riverbank"]({b});
way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"]({b}); rel["landuse"="forest"]({b});
way["leisure"~"^(park|garden|pitch|golf_course)$"]({b}); rel["leisure"="park"]({b});
);out geom;"""
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
                "https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
                "https://overpass-api.de/api/interpreter"):
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
            j = json.loads(urllib.request.urlopen(req, timeout=180).read()); break
        except Exception as e:
            print("  overpass retry:", type(e).__name__, str(e)[:80]); time.sleep(30)
    else:
        raise RuntimeError("Overpass 실패: " + name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(j, open(path, "w", encoding="utf-8"))
    time.sleep(3)
    return j


def stitch(ways):
    """멀티폴리곤 outer 조각을 끝점끼리 이어 닫힌 고리로."""
    ways, rings = [w[:] for w in ways if len(w) > 1], []
    while ways:
        ring = ways.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]: ring += w[1:]
                elif w[-1] == ring[-1]: ring += w[::-1][1:]
                elif w[-1] == ring[0]: ring = w + ring[1:]
                elif w[0] == ring[0]: ring = w[::-1] + ring[1:]
                else: continue
                ways.pop(i); changed = True; break
        if ring[0] == ring[-1]: rings.append(ring)
    return rings


def render(name, lat, lng):
    j = overpass(name, lat, lng)
    P = lambda g: ((g["lon"] - lng + HALF_X) / (2 * HALF_X) * S, (lat + HALF_Z - g["lat"]) / (2 * HALF_Z) * S)
    im = Image.new("RGB", (S, S), C["land"]); d = ImageDraw.Draw(im)
    polys = {"green": [], "wood": [], "water": [], "bld": []}
    lines = {"water": [], "road": []}
    for e in j["elements"]:
        t = e.get("tags", {})
        if t.get("natural") == "water" or t.get("waterway") == "riverbank": k = "water"
        elif t.get("natural") == "wood" or t.get("landuse") == "forest": k = "wood"
        elif t.get("landuse") or t.get("leisure"): k = "green"
        elif "building" in t: k = "bld"
        else: k = None
        if e["type"] == "relation":
            if k: polys[k] += [[P(g) for g in r] for r in stitch(
                [list(m["geometry"]) for m in e.get("members", [])
                 if m.get("role") == "outer" and m.get("geometry")])]
            continue
        pts = [P(g) for g in e.get("geometry", [])]
        if len(pts) < 2: continue
        if k and pts[0] == pts[-1]: polys[k].append(pts)
        elif t.get("waterway") in ("river", "canal", "stream"): lines["water"].append((pts, 14 if t["waterway"] != "stream" else 4))
        elif t.get("highway") in ROAD and t.get("tunnel") != "yes": lines["road"].append((pts, t["highway"]))
    for k in ("green", "wood", "water"):
        for p in polys[k]:
            if len(p) > 2: d.polygon(p, fill=C[k])
    for pts, w in lines["water"]: d.line(pts, fill=C["water"], width=w, joint="curve")
    for p in polys["bld"]:
        if len(p) > 2: d.polygon(p, fill=C["bld"])
    roads = sorted(lines["road"], key=lambda r: ROAD[r[1]])
    for pts, h in roads: d.line(pts, fill=C["casing"], width=int(ROAD[h] + 4), joint="curve")
    for pts, h in roads: d.line(pts, fill=C["major"] if h in MAJOR else C["minor"], width=int(ROAD[h]), joint="curve")
    im = im.resize((1024, 1024), Image.LANCZOS)
    os.makedirs(os.path.join(HERE, "art"), exist_ok=True)
    im.save(os.path.join(HERE, "art", name + ".png"))
    out = os.path.join(HERE, "..", "img", "map"); os.makedirs(out, exist_ok=True)
    im.save(os.path.join(out, name.split("_")[0] + ".jpg"), quality=82, optimize=True)
    return im


if __name__ == "__main__":
    only = sys.argv[1:]
    tiles = []
    for name, lat, lng in SITES:
        if only and name not in only: continue
        tiles.append(render(name, lat, lng)); print("ok", name)
    if len(tiles) == 8:  # 2x4 미리보기
        pv = Image.new("RGB", (4 * 400, 2 * 400), "white")
        for i, t in enumerate(tiles): pv.paste(t.resize((400, 400)), (i % 4 * 400, i // 4 * 400))
        pv.save(os.path.join(HERE, "art", "_preview.jpg"), quality=85)

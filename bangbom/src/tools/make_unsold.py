r"""대구시 공개 미분양 목록 → src/modelhouse/unsold_list.js
사용: python src\tools\make_unsold.py
원천: docs/조사/결과_1_단지목록.md 표 + docs/조사/검증메모.md 수정(동구 배정, 9월 미분양 비공개, 오타, 전화번호 제거)
      원문 지번: docs/조사/data/단지좌표_60곳.csv
좌표 고르는 순서:
  1) 브이월드(국토교통부 공간정보 오픈플랫폼) 지번 좌표.
     키는 환경변수 VWORLD_API_KEY 나 저장소 맨 위 .env / .env.local 의 VWORLD_API_KEY 한 줄에서만 읽고, 화면에 찍지 않는다.
     지금 좌표(동 중심 근사)에서 3km 넘게 떨어지면 잘못 찾은 것으로 보고 버린다.
     결과는 src/tools/unsold_vworld.json 에 저장해 두고 다시 묻지 않는다.
  2) 지금 unsold_list.js 에 들어 있는 좌표 (키가 없거나 지번이 없는 단지)
  3) OpenStreetMap Nominatim (1초에 1건 이하). 결과는 src/tools/unsold_geo.json 에 저장해 두고 다시 묻지 않는다.
"""
import csv, json, math, os, re, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SRC = os.path.join(ROOT, "docs", "조사", "결과_1_단지목록.md")
OUT = os.path.join(ROOT, "src", "modelhouse", "unsold_list.js")
CACHE = os.path.join(HERE, "unsold_geo.json")
CSV = os.path.join(ROOT, "docs", "조사", "data", "단지좌표_60곳.csv")
VW_CACHE = os.path.join(HERE, "unsold_vworld.json")
DONG_GU = {"신암동", "용계동", "신기동", "효목동", "신천동", "율암동"}  # 검증메모: 표에 중구로 잘못 적힘
OPEN_SEP = {"나나바루아": 28, "대명 헤리티지": 25, "수성 골드클래스": 1}   # 9월 미분양이 공개된 3곳만 숫자
RAW_URL = "https://www.daegu.go.kr/build/index.do?menu_link=/icms/bbs/selectBoardArticle.do&menu_id=00001338&bbsId=BBS_00153&nttId=829484"
NAME_FIX = {"신암동 259-5 동대구역 엘크루 에비뉴원": "동대구역 엘크루 에비뉴원"}
SRC_NOTE = dict(source="대구시 2026년 9월말 공동주택 미분양 현황", as_of="2026-09-30")


def name_of(s):
    s = NAME_FIX.get(s.strip(), s.strip())
    m = re.search(r"\(([^()]*)\)\s*$", s)
    if m and not re.search(r"\d+(-\d+)?번지|일원|\d+$", m.group(1)):
        return m.group(1).strip()
    return re.sub(r"\s*\([^()]*\)\s*$", "", s).strip()  # "e편한세상 … (신천동 328-1번지 일원)" 꼴


def rows():
    for line in open(SRC, encoding="utf-8"):
        if not line.startswith("| ") or "---" in line or line.startswith("| 구·군"):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        gu, dong, site, _, total, _, _, done, move, builder = c[:10]
        if dong in DONG_GU: gu = "동구"
        dong = {"감상동": "감삼동", "연경지구": "연경동"}.get(dong, dong)
        name = name_of(site.replace("감상동", "감삼동")).replace("성창재건축정비사업 ", "")
        mv = re.match(r"(\d{4})-(\d{2})", move) or re.match(r"(\d{2})\.(\d{2})", move)
        move_in = (mv.group(1) if len(mv.group(1)) == 4 else "20" + mv.group(1)) + "-" + mv.group(2)
        builder = re.sub(r"\s*\(\s*0\d{1,2}-\d{3,4}-\d{4}\s*\)", "", builder)  # 전화번호 제거
        yield {"name": name, "gu": gu, "dong": dong, "total_units": int(total),
               "unsold_sep": next((v for k, v in OPEN_SEP.items() if k in name), None),
               "completed": done.startswith("준공"), "move_in": move_in, "builder": re.sub(r"\s+", " ", builder).strip()}


def nkey(s):
    return re.sub(r"\s+", "", s.replace("성창재건축정비사업", ""))


def jibun_of(r):
    """CSV 한 줄 → "대구광역시 구 동 번지". 지번이 비어 있으면 None"""
    j, gu = r["원문 지번"].strip(), r["구·군"].strip()
    if not j:
        return None
    j = re.sub(r"^대구광역시\s*" + gu + r"\s*", "", j).replace("감상동", "감삼동")
    j = re.sub(r"\s*외\s*\d+\s*필지", "", j)
    j = re.sub(r"번지|일원", "", j).strip()
    if not re.search(r"\s", j):                        # "대봉동590-395" → "대봉동 590-395"
        j = re.sub(r"^([가-힣0-9]+?(?:동|가|리))(\d)", r"\1 \2", j)
    if re.match(r"^\d", j):                            # "221-5" 처럼 동이 빠진 줄
        j = r["읍·면·동"].strip() + " " + j
    j = re.sub(r"-0$", "", j)                          # "1-0" → "1"
    return f"대구광역시 {gu} {j}"


def jibuns():
    if not os.path.exists(CSV):
        return {}
    return {nkey(r["단지명"]): jibun_of(r) for r in csv.DictReader(open(CSV, encoding="utf-8-sig"))}


def vworld_key():
    k = os.environ.get("VWORLD_API_KEY", "").strip()
    for f in (".env", ".env.local"):
        p = os.path.join(ROOT, "..", f)
        if k or not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            m = re.match(r"\s*VWORLD_API_KEY\s*=\s*(.+?)\s*$", line)
            if m:
                k = m.group(1).strip().strip('"').strip("'")
    return k


def vworld(addr, key):
    """지번 주소 → (위도, 경도). 못 찾으면 None. 오류를 찍을 때 주소창(키가 들어 있음)은 싣지 않는다"""
    url = "https://api.vworld.kr/req/address?" + urllib.parse.urlencode({
        "service": "address", "request": "getcoord", "version": "2.0", "crs": "epsg:4326",
        "address": addr, "refine": "true", "simple": "false", "format": "json", "type": "parcel", "key": key})
    time.sleep(0.2)
    try:
        j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bangbom-hackathon"}), timeout=30).read())
    except Exception as e:
        print(f"  브이월드 연결 실패({type(e).__name__}): {addr}")
        return None
    res = j.get("response", {})
    if res.get("status") != "OK":
        print(f"  브이월드에서 못 찾음({res.get('status')}): {addr}")
        return None
    pt = res["result"]["point"]
    return [round(float(pt["y"]), 5), round(float(pt["x"]), 5)]


def km(a, b):
    dy = (a[0] - b[0]) * 111.0
    dx = (a[1] - b[1]) * 111.0 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def current():
    """지금 unsold_list.js 의 단지 (이름 → 값)"""
    if not os.path.exists(OUT):
        return {}
    t = open(OUT, encoding="utf-8").read()
    i = t.index("const UNSOLD_LIST = ") + len("const UNSOLD_LIST = ")
    return {nkey(u["name"]): u for u in json.loads(t[i:t.rindex(";")])}


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "kr"})
    time.sleep(1.1)
    j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bangbom-hackathon"}), timeout=30).read())
    return (round(float(j[0]["lat"]), 5), round(float(j[0]["lon"]), 5)) if j else None


def main():
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    vcache = json.load(open(VW_CACHE, encoding="utf-8")) if os.path.exists(VW_CACHE) else {}
    jb, cur, key = jibuns(), current(), vworld_key()
    if not key:
        print("VWORLD_API_KEY 가 없어서 지번 좌표는 건너뛰어요. 원문 지번 칸만 더하고 좌표는 지금 것을 그대로 써요.")
    out, failed, rejected, exact = [], [], [], 0
    for r in rows():
        nk = nkey(r["name"]); addr = jb.get(nk)
        if addr:
            r["jibun"] = addr
        old = cur.get(nk)
        if addr and key and addr not in vcache:
            vcache[addr] = vworld(addr, key)
            json.dump(vcache, open(VW_CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        hit = vcache.get(addr) if addr else None
        if hit and old and km(hit, (old["lat"], old["lng"])) > 3:
            rejected.append(r["name"]); hit = None
        if hit:
            r.update(lat=hit[0], lng=hit[1], **SRC_NOTE); exact += 1
            out.append(r); continue
        if old:
            r.update(lat=old["lat"], lng=old["lng"])
            if old.get("approx"): r["approx"] = True
            r.update(**SRC_NOTE); out.append(r); continue
        k = f"{r['gu']}|{r['dong']}|{r['name']}"
        if k not in cache:
            hit = nominatim(f"대구 {r['gu']} {r['dong']} {r['name']}") or nominatim(f"{r['name']} 대구")
            approx = False
            if not hit:
                hit, approx = nominatim(f"대구 {r['gu']} {r['dong']}"), True
            cache[k] = {"ll": hit, "approx": approx}
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        g = cache[k]
        if not g["ll"]:
            failed.append(r["name"]); continue
        r.update(lat=g["ll"][0], lng=g["ll"][1])
        if g["approx"]: r["approx"] = True
        r.update(**SRC_NOTE); out.append(r)
    js = ("/* 대구시 공개 미분양 목록 (판정 없음 · 지도에 작은 점). make_unsold.py가 만든 파일, 직접 고치지 않기.\n"
          "   9월 미분양 null = 비공개(0 아님). 좌표: jibun 이 있고 approx 가 없으면 브이월드 지번 좌표, 아니면 OpenStreetMap Nominatim. approx=true는 동 중심 근사. 현재 계약 가능 여부는 확인 필요 */\n"
          f"const UNSOLD_SRC_URL = {json.dumps(RAW_URL)};\nconst UNSOLD_LIST = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n")
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"ok {len(out)}곳 · 지번 좌표 {exact}곳 · 동 중심 근사 {sum(1 for r in out if r.get('approx'))}곳 · "
          f"지번 있음 {sum(1 for r in out if r.get('jibun'))}곳 · 3km 넘어 버림 {rejected} · 실패 {len(failed)}곳 {failed}")


if __name__ == "__main__":
    main()

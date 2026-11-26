r"""대구시 공개 미분양 목록 → src/modelhouse/unsold_list.js
사용: python src\tools\make_unsold.py
원천: docs/조사/결과_1_단지목록.md 표 + docs/조사/검증메모.md 수정(동구 배정, 9월 미분양 비공개, 오타, 전화번호 제거)
좌표: OpenStreetMap Nominatim (1초에 1건 이하). 결과는 src/tools/unsold_geo.json 에 저장해 두고 다시 묻지 않는다.
"""
import json, os, re, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
SRC = os.path.join(ROOT, "docs", "조사", "결과_1_단지목록.md")
OUT = os.path.join(ROOT, "src", "modelhouse", "unsold_list.js")
CACHE = os.path.join(HERE, "unsold_geo.json")
DONG_GU = {"신암동", "용계동", "신기동", "효목동", "신천동", "율암동"}  # 검증메모: 표에 중구로 잘못 적힘
OPEN_SEP = {"나나바루아": 28, "대명 헤리티지": 25, "수성 골드클래스": 1}   # 9월 미분양이 공개된 3곳만 숫자
RAW_URL = "https://www.daegu.go.kr/build/index.do?menu_link=/icms/bbs/selectBoardArticle.do&menu_id=00001338&bbsId=BBS_00153&nttId=829484"
NAME_FIX = {"신암동 259-5 동대구역 엘크루 에비뉴원": "동대구역 엘크루 에비뉴원"}


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


def nominatim(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1, "countrycodes": "kr"})
    time.sleep(1.1)
    j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bangbom-hackathon"}), timeout=30).read())
    return (round(float(j[0]["lat"]), 5), round(float(j[0]["lon"]), 5)) if j else None


def main():
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    out, failed = [], []
    for r in rows():
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
        r.update(source="대구시 2026년 9월말 공동주택 미분양 현황", as_of="2026-09-30")
        out.append(r)
    js = ("/* 대구시 공개 미분양 목록 (판정 없음 · 지도에 작은 점). make_unsold.py가 만든 파일, 직접 고치지 않기.\n"
          "   9월 미분양 null = 비공개(0 아님). 좌표: OpenStreetMap Nominatim, approx=true는 동 중심 근사. 현재 계약 가능 여부는 확인 필요 */\n"
          f"const UNSOLD_SRC_URL = {json.dumps(RAW_URL)};\nconst UNSOLD_LIST = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n")
    open(OUT, "w", encoding="utf-8").write(js)
    print(f"ok {len(out)}곳 · 동 중심 근사 {sum(1 for r in out if r.get('approx'))}곳 · 실패 {len(failed)}곳 {failed}")


if __name__ == "__main__":
    main()

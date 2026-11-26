"""대구 미분양 단지에 국토교통부 실거래가를 붙인다 (Python 표준 라이브러리만 사용).

하는 일
1. .env의 DATA_GO_KR_KEY(공공데이터포털 일반 인증키, Decoding)를 읽는다.
   평문으로 들어 있으면 Windows DPAPI로 암호화해 DATA_GO_KR_KEY_ENC에 저장하고 원래 칸은 비운다.
   키는 화면·파일·로그 어디에도 쓰지 않는다.
2. 대구 9개 구·군의 최근 25개월 아파트 매매(상세)·분양권전매 실거래가를 받는다.
   받은 원자료는 .cache_rtms/ 에 저장한다(커밋하지 않음). 다시 실행하면 지난달 이전 자료는 재사용한다.
3. UNSOLD_LIST(대구시 공개 미분양 목록)와 단지명·법정동·지번으로 맞춘다.
4. 결과
   - src/modelhouse/unsold_price.js   : 화면이 쓰는 단지별 최근 실거래 요약
   - docs/조사/data/rtms_match.csv     : 어떤 실거래 단지명과 맞췄는지(사람이 검수)
   - trace/rtms_log.txt                : 실행 기록(키 없음)

실행: python src/tools/fetch_rtms.py        (bangbom 폴더에서)
"""
import base64
import csv
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]          # bangbom/
ENV_PATH = ROOT / ".env"
CACHE = ROOT / ".cache_rtms"
LOG_PATH = ROOT / "trace" / "rtms_log.txt"
OUT_JS = ROOT / "src" / "modelhouse" / "unsold_price.js"
OUT_CSV = ROOT / "docs" / "조사" / "data" / "rtms_match.csv"
JIBUN_CSV = ROOT / "docs" / "조사" / "data" / "unsold_jibun.csv"
UNSOLD_JS = ROOT / "src" / "modelhouse" / "unsold_list.js"

GU = {"중구": "27110", "동구": "27140", "서구": "27170", "남구": "27200", "북구": "27230",
      "수성구": "27260", "달서구": "27290", "달성군": "27710", "군위군": "27720"}
APIS = {
    "trade": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
    "silv": "https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade",
}
API_KO = {"trade": "아파트 매매 실거래가 상세", "silv": "아파트 분양권전매 실거래가"}
MONTHS = 25

LOG = []


def log(msg: str) -> None:
    print(msg)
    LOG.append(msg)


# ───────────────────────── 키 (Windows DPAPI) ─────────────────────────
IS_WIN = sys.platform.startswith("win")
if IS_WIN:
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(data: bytes):
        buf = ctypes.create_string_buffer(data, len(data))
        return _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    def _from_blob(blob) -> bytes:
        out = ctypes.string_at(blob.pbData, blob.cbData)
        ctypes.windll.kernel32.LocalFree(ctypes.cast(blob.pbData, ctypes.c_void_p))
        return out

    def protect(data: bytes) -> bytes:
        src, _k = _to_blob(data)
        dst = _BLOB()
        if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(src), ctypes.c_wchar_p("bangbom"),
                                                      None, None, None, 0x1, ctypes.byref(dst)):
            raise OSError("CryptProtectData 실패")
        return _from_blob(dst)

    def unprotect(data: bytes) -> bytes:
        src, _k = _to_blob(data)
        dst = _BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None,
                                                        0x1, ctypes.byref(dst)):
            raise OSError("CryptUnprotectData 실패 (다른 PC나 다른 Windows 계정에서 암호화한 키)")
        return _from_blob(dst)


def read_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def write_env_values(updates: dict) -> None:
    lines = ENV_PATH.read_text(encoding="utf-8-sig").splitlines() if ENV_PATH.exists() else []
    done = set()
    for i, line in enumerate(lines):
        m = re.match(r"\s*([A-Z0-9_]+)\s*=", line)
        if m and m.group(1) in updates:
            lines[i] = f"{m.group(1)}={updates[m.group(1)]}"
            done.add(m.group(1))
    for k, v in updates.items():
        if k not in done:
            lines.append(f"{k}={v}")
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_key() -> str:
    env = read_env()
    plain, enc = env.get("DATA_GO_KR_KEY", ""), env.get("DATA_GO_KR_KEY_ENC", "")
    if plain:
        if IS_WIN:
            token = "dpapi:" + base64.b64encode(protect(plain.encode("utf-8"))).decode("ascii")
            write_env_values({"DATA_GO_KR_KEY": "", "DATA_GO_KR_KEY_ENC": token})
            log("[실거래] 공공데이터포털 키를 암호화해서 .env에 저장했어요. (DATA_GO_KR_KEY 칸은 비웠어요)")
        # 인코딩 키를 넣었어도 동작하게: %가 있으면 한 번 풀어서 쓴다
        return urllib.parse.unquote(plain) if "%" in plain else plain
    if enc.startswith("dpapi:") and IS_WIN:
        key = unprotect(base64.b64decode(enc[6:])).decode("utf-8")
        return urllib.parse.unquote(key) if "%" in key else key
    return ""


# ───────────────────────── 실거래가 받기 ─────────────────────────
def months_back(n: int) -> list:
    t = date.today()
    y, m = t.year, t.month
    out = []
    for _ in range(n):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out


def _text(it, *names) -> str:
    for n in names:
        el = it.find(n)
        if el is not None and el.text and el.text.strip():
            return el.text.strip()
    return ""


class KeyProblem(Exception):
    pass


class Skipped(Exception):
    """한 달치가 끝내 응답이 없을 때. 그 달만 빼고 계속한다(다음 실행 때 다시 시도)."""


def fetch_one(key: str, api: str, lawd: str, ym: str, current: set) -> list:
    path = CACHE / f"{api}_{lawd}_{ym}.json"
    if path.exists() and ym not in current:
        return json.loads(path.read_text(encoding="utf-8"))
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({"LAWD_CD": lawd, "DEAL_YMD": ym, "pageNo": page, "numOfRows": 1000})
        url = f"{APIS[api]}?serviceKey={urllib.parse.quote(key, safe='')}&{q}"
        body = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=45) as r:
                    body = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise KeyProblem(f"HTTP {e.code}")
                time.sleep(2 * (attempt + 1))
            except Exception:
                time.sleep(2 * (attempt + 1))
        if body is None:
            raise Skipped(f"{API_KO[api]} {lawd} {ym} 응답 없음")
        root = ET.fromstring(body)
        code = _text(root, ".//resultCode", ".//returnReasonCode")
        msg = _text(root, ".//resultMsg", ".//returnAuthMsg", ".//errMsg")
        if code not in ("00", "000"):
            if "KEY" in msg.upper() or code in ("20", "22", "30", "31", "32"):
                raise KeyProblem(f"{code} {msg}")
            raise RuntimeError(f"{API_KO[api]} {lawd} {ym}: {code} {msg}")
        for it in root.iter("item"):
            amt = _text(it, "dealAmount", "거래금액").replace(",", "")
            if not amt.isdigit():
                continue
            if _text(it, "cdealType", "해제여부") in ("O", "o"):
                continue                      # 해제된 거래는 뺀다
            rows.append({
                "apt": _text(it, "aptNm", "단지", "아파트"),
                "umd": _text(it, "umdNm", "법정동"),
                "jibun": _text(it, "jibun", "지번"),
                "area": float(_text(it, "excluUseAr", "전용면적") or 0),
                "price": int(amt),
                "ym": f"{_text(it, 'dealYear', '년')}{int(_text(it, 'dealMonth', '월') or 0):02d}",
                "floor": _text(it, "floor", "층"),
            })
        total = int(_text(root, ".//totalCount") or 0)
        if page * 1000 >= total:
            break
        page += 1
    CACHE.mkdir(exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows


# ───────────────────────── 단지 맞추기 ─────────────────────────
ROMAN = {"Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4", "Ⅴ": "5"}


def norm(s: str) -> str:
    s = s.lower()
    for k, v in ROMAN.items():
        s = s.replace(k, v)
    s = re.sub(r"\(.*?\)", "", s)
    s = s.replace("아파트", "").replace("재건축정비사업", "").replace("대구광역시", "")
    return re.sub(r"[^0-9a-z가-힣]", "", s)


def bigrams(s: str) -> set:
    return {s[i:i + 2] for i in range(len(s) - 1)} or {s}


def dice(a: str, b: str) -> float:
    A, B = bigrams(a), bigrams(b)
    return 2 * len(A & B) / (len(A) + len(B)) if A and B else 0.0


def parse_jibun(raw: str, dong: str):
    """'삼덕동2가 5번지 일원' → ('삼덕동2가', '5')"""
    raw = (raw or "").replace("대구광역시", "").strip()
    raw = re.sub(r"^[가-힣]+[구군]\s+", "", raw)        # '남구 대명동 …' → '대명동 …'
    m = re.search(r"([가-힣]+(?:\d+가)?)?\s*(\d+)(?:-\d+)?", raw)
    if not m:
        return dong, ""
    return (m.group(1) or dong), m.group(2)


# 사람이 검수해서 '다른 단지'로 판단한 짝 (단지명, 자료) → 실거래 단지명. 2026-11-27 rtms_match.csv 검수
EXCLUDE = {
    ("힐스테이트 동인", "trade"): ("힐스테이트동인센트럴", "힐스테이트동인더스카이"),
    ("해링턴 플레이스 감삼 Ⅲ", "trade"): ("죽전역해링턴플레이스더원",),
}


def unit_no(name: str) -> str:
    m = re.search(r"(\d)\s*(단지|차)", name)
    return m.group(1) if m else ""


def load_unsold() -> list:
    src = UNSOLD_JS.read_text(encoding="utf-8")
    body = src[src.index("const UNSOLD_LIST"):]
    body = body[body.index("["): body.rindex("]") + 1]
    return json.loads(body)


def summarize(rows: list) -> dict:
    by = {}
    for r in rows:
        by.setdefault(round(r["area"]), []).append(r)
    bands = []
    for a, rs in sorted(by.items()):
        ps = [r["price"] for r in rs]
        bands.append({"area": a, "n": len(rs), "median": int(statistics.median(ps)),
                      "min": min(ps), "max": max(ps), "latest": max(r["ym"] for r in rs)})
    return {"n": len(rows), "latest": max(r["ym"] for r in rows), "bands": bands}


def main() -> int:
    key = load_key()
    if not key:
        log("[실거래] .env에 DATA_GO_KR_KEY가 없어요. 공공데이터포털 Decoding 키를 넣고 다시 실행해 주세요.")
        return 1
    yms = months_back(MONTHS)
    current = set(yms[:2])                      # 이번 달·지난달은 신고가 계속 들어오니 매번 새로 받는다
    jobs = [(api, lawd, ym) for api in APIS for lawd in GU.values() for ym in yms]
    log(f"[실거래] {len(GU)}개 구·군 × {MONTHS}개월({yms[-1]}~{yms[0]}) × {len(APIS)}종 = {len(jobs)}번 받아요...")
    data = {api: {} for api in APIS}
    try:
        skipped = []
        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = {ex.submit(fetch_one, key, *j, current): j for j in jobs}
            done = 0
            for f, j in futs.items():
                try:
                    data[j[0]].setdefault(j[1], []).extend(f.result())
                except Skipped as e:
                    skipped.append(str(e))
                done += 1
                if done % 50 == 0:
                    log(f"  {done}/{len(jobs)}")
        if skipped:
            log(f"[실거래] 응답이 없어 뺀 달 {len(skipped)}개 (다시 실행하면 그 달만 다시 받아요): " + ", ".join(skipped[:8]))
    except KeyProblem as e:
        log(f"[실거래] 키가 아직 동작하지 않아요 ({e}). 활용신청 직후면 1~2시간 뒤 다시 실행해 주세요.")
        return 2
    for api in APIS:
        log(f"[실거래] {API_KO[api]}: {sum(len(v) for v in data[api].values()):,}건")

    unsold = load_unsold()
    jib = {}
    if JIBUN_CSV.exists():
        for r in csv.DictReader(JIBUN_CSV.open(encoding="utf-8-sig")):
            jib[r["단지명"]] = parse_jibun(r["원문 지번"], r["읍·면·동"])

    result, report = {}, []
    for u in unsold:
        lawd = GU.get(u["gu"])
        umd, bon = jib.get(u["name"], (u["dong"], ""))
        nu, un = norm(u["name"]), unit_no(u["name"])
        entry = {}
        for api in APIS:
            groups = {}
            for r in data[api].get(lawd, []):
                groups.setdefault((r["apt"], r["umd"]), []).append(r)
            cands = []
            for (apt, rumd), rs in groups.items():
                s = dice(nu, norm(apt))
                same_umd = bool(rumd) and (umd in rumd or rumd in umd or u["dong"] in rumd)
                same_bon = bool(bon) and any(r["jibun"].split("-")[0] == bon for r in rs)
                ua = unit_no(apt)
                # 1단지/2단지, 1차/2차가 다르면 다른 단지다. 번호가 한쪽에만 있으면 '1'일 때만 같은 단지로 본다
                unit_ok = un == ua or (not ua and un == "1") or (not un and ua == "1")
                score = s + (0.25 if same_umd else 0) + (0.35 if same_bon else 0)
                ok = unit_ok and (apt not in EXCLUDE.get((u["name"], api), ())) and (
                    s >= 0.95 or (s >= 0.6 and same_umd) or (same_bon and same_umd and s >= 0.5))
                cands.append((score, ok, apt, rumd, s, same_umd, same_bon, rs))
            cands.sort(key=lambda c: -c[0])
            best = next((c for c in cands if c[1]), None)
            if best:
                entry[api] = summarize(best[7]) | {"name": best[2], "umd": best[3]}
            report.append({
                "단지": u["name"], "구": u["gu"], "동": umd, "지번": bon, "자료": API_KO[api],
                "맞춘 실거래 단지": f"{best[2]} ({best[3]})" if best else "",
                "건수": best and len(best[7]) or 0,
                "이름 유사도": f"{best[4]:.2f}" if best else "",
                "동 일치": ("O" if best[5] else "") if best else "",
                "지번 일치": ("O" if best[6] else "") if best else "",
                "다른 후보": " / ".join(f"{c[2]}({c[3]}) {c[4]:.2f}" for c in cands[:3] if c is not best),
            })
        if entry:
            result[u["name"]] = entry

    n_t = sum(1 for v in result.values() if "trade" in v)
    n_s = sum(1 for v in result.values() if "silv" in v)
    log(f"[실거래] 미분양 {len(unsold)}곳 중 매매 {n_t}곳 · 분양권 {n_s}곳 · 하나라도 {len(result)}곳 찾았어요.")

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(report[0].keys()))
        w.writeheader()
        w.writerows(report)
    meta = {"source": "국토교통부 아파트 매매 실거래가 상세 · 아파트 분양권전매 실거래가 (공공데이터포털)",
            "range": f"{yms[-1][:4]}.{yms[-1][4:]}~{yms[0][:4]}.{yms[0][4:]} 계약", "fetched": date.today().isoformat(),
            "unit": "만원", "note": "신고된 지난 거래 가격이에요. 지금 분양·할인 가격과 다를 수 있어요. 해제된 거래는 뺐어요."}
    OUT_JS.write_text(
        "/* 미분양 단지별 최근 실거래 요약. src/tools/fetch_rtms.py가 만든 파일, 직접 고치지 않기.\n"
        "   trade=아파트 매매, silv=분양권전매. bands=전용면적(㎡, 반올림)별 건수·중간값·최저·최고(만원) */\n"
        f"const UNSOLD_PRICE_META = {json.dumps(meta, ensure_ascii=False)};\n"
        f"const UNSOLD_PRICE = {json.dumps(result, ensure_ascii=False, indent=1)};\n", encoding="utf-8")
    log(f"[실거래] 저장: {OUT_JS.relative_to(ROOT)} · {OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception as e:
        log(f"[실거래] 실패: {type(e).__name__}: {e}")
        code = 3
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text("\n".join(LOG) + "\n", encoding="utf-8")
    sys.exit(code)

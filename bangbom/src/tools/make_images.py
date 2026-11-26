r"""홈 화면 예시 이미지 만들기 (팩트챗 BAZE 게이트웨이 · 나노바나나 프로)
사용: bangbom 폴더에서  python src\tools\make_images.py house_flow [check support ...]
- 키는 server.py 가 .env 에서 읽은 값(server.API_KEY)만 쓰고, 화면·파일에 찍지 않는다.
- 결과는 img/<이름>.jpg. 이미 있으면 덮어쓰지 않고 img/<이름>_new.jpg 로 저장한다.
- 만든 이미지는 화면에서 반드시 "예시 이미지"로 표시한다 (bangbom/CLAUDE.md 데이터 규칙).
"""
import base64, json, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)
import server  # noqa: E402  (.env 키를 DPAPI로 풀어 둔다)

MODEL = "gemini-3-pro-image-preview"  # 나노바나나 프로
COMMON = ("Style: calm, light, editorial architectural photography / visualization. Warm off-white tones (#f3f2ee), "
          "soft natural daylight, muted sage-green accents (#1f6b4f), no saturated colors, no purple, no gradients, "
          "no glossy CGI look. No text, no letters, no numbers, no logos, no watermarks, no brand-name furniture. "
          "Korean new-build apartment interior style. Wide 3:2 landscape image.")
PROMPTS = {
    # 3번째 시도로 고른 문장 (1·2번째는 평면도와 3D 방 배치가 달라 버림. reports/야간작업_결과.md)
    "house_flow": 'One wide horizontal image explaining a 3-step journey into the SAME small apartment, read left to right, with a thin dark-gray arrow between steps. The apartment is very simple: a rectangle divided into exactly four spaces. Top half: two bedrooms side by side (left bedroom and right bedroom). Bottom half: one large open living room with kitchen counter on the left wall. A small bathroom is NOT needed. One front door on the bottom wall. Step 1 (left): top-down 2D floor plan of exactly these four spaces, thin dark-gray lines on off-white paper, door swing arcs, thin dimension lines with small tick marks, no labels, no numbers. Step 2 (middle): the same floor plan extruded straight up into a matte white 3D model with no roof, viewed from the front and above at a gentle angle, NOT rotated, so every wall lines up with step 1. Light oak floors, a bed block in each bedroom, a sofa block in the living room. Step 3 (right): eye-level photo standing inside the right bedroom of this model: white walls, light oak floor, a bed with light linen bedding, one window with soft daylight. Equal size for the three steps, generous margins, clean off-white background.',
    "check": (
        "Overhead flat-lay photo on a light oak table: a blank lease contract document, a printed property register "
        "page with blurred unreadable text, a pen, a small house key, and a phone with a blank screen. Soft morning "
        "daylight from the left, gentle shadows, off-white and sage-green palette. All paper text blurred and "
        "unreadable. Calm, trustworthy, minimal."),
    "support": (
        "A young Korean adult in their late twenties sitting at a small desk by a window in a bright, simply furnished "
        "one-room apartment, looking at a laptop with a blank, softly glowing screen, seen from behind at a "
        "three-quarter angle so the face is not visible. Warm daylight, off-white walls, a small green plant. "
        "Calm and hopeful mood, realistic photo."),
}


def generate(name, out=None, prompt=None):
    """out 을 주면 그 경로에 저장(다시 만들어 보는 시도용), prompt 를 주면 PROMPTS 대신 그 문장을 쓴다"""
    body = {"model": MODEL, "prompt": (prompt or PROMPTS[name]) + " " + COMMON, "aspect_ratio": "3:2"}
    req = urllib.request.Request(server.BASE_URL + "/images/generate", data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Authorization": "Bearer " + server.API_KEY, "Content-Type": "application/json"})
    try:
        j = json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        print(f"{name}: 실패 {e.code} {e.read()[:300].decode('utf-8', 'replace').replace(server.API_KEY, '***')}")
        return
    url = j["data"][0].get("url") or ""
    raw = base64.b64decode(url.split(",", 1)[1] if url.startswith("data:") else j["data"][0]["b64_json"])
    if not out:
        out = os.path.join(ROOT, "img", name + ".jpg")
        if os.path.exists(out):
            out = os.path.join(ROOT, "img", name + "_new.jpg")
    open(out, "wb").write(raw)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({len(raw) // 1024}KB)")


if __name__ == "__main__":
    if not server.API_KEY:
        sys.exit(".env 에 BAZE_API_KEY 를 먼저 넣어 주세요.")
    args = sys.argv[1:]
    if "--out" in args:  # 시도용: python make_images.py house_flow --out <파일> [--prompt-file <파일>]
        o = args[args.index("--out") + 1]
        pf = args[args.index("--prompt-file") + 1] if "--prompt-file" in args else None
        generate(args[0], out=o, prompt=open(pf, encoding="utf-8").read().strip() if pf else None)
        sys.exit(0)
    names = args or ["house_flow"]
    for n in names:
        if n not in PROMPTS:
            sys.exit(f"모르는 이름이에요: {n} (있는 것: {', '.join(PROMPTS)})")
    for n in names:
        generate(n)

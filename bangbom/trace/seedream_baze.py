r"""참고 지도(trace/refs) → Seedream Pro 재해석 그림(trace/art).
사용: python trace\seedream_baze.py c01_sangin [c02_wolseong ...]   (없는 것만 생성, 실패 시 1번 재시도)
키는 server.API_KEY로만 쓰고 출력하지 않는다.
"""
import base64, json, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import server  # noqa: E402

MODEL = "bytedance/seedream-5-pro"
PROMPT = (HERE / "reinterpret_prompt.txt").read_text(encoding="utf-8").strip()


def generate(name: str) -> Path:
    src, out = HERE / "refs" / f"{name}.jpg", HERE / "art" / f"{name}.png"
    img = "data:image/jpeg;base64," + base64.b64encode(src.read_bytes()).decode()
    body = {"model": MODEL, "prompt": PROMPT, "image": img, "size": "2048x2048",
            "response_format": "url", "watermark": False}
    req = urllib.request.Request(f"{server.BASE_URL}/images/generate", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {server.API_KEY}"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as r:
        url = json.loads(r.read())["data"][0]["url"]
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    out.parent.mkdir(exist_ok=True)
    from PIL import Image
    import io
    Image.open(io.BytesIO(data)).save(out)
    return out


if __name__ == "__main__":
    calls = 0
    for name in sys.argv[1:]:
        if (HERE / "art" / f"{name}.png").exists():
            print("skip", name); continue
        for attempt in (1, 2):
            calls += 1
            try:
                print("ok", generate(name).name); break
            except urllib.error.HTTPError as e:
                msg = e.read()[:200].decode("utf-8", "replace").replace(server.API_KEY or "\0", "***")
                print("fail", name, e.code, msg)
            except Exception as e:  # 네트워크 등
                print("fail", name, type(e).__name__, str(e)[:120])
            if attempt == 1: time.sleep(5)
    print("calls", calls)

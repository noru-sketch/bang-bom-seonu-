"""방봄 로컬 서버 (Python 표준 라이브러리만 사용, pip 설치 필요 없음)

하는 일
1. index.html과 img/ vid/ fonts/ 를 http://localhost:8000 에서 보여 준다.
2. /api/chat : 화면의 상담 질문을 BAZE API Gateway의 소형 LLM에 전달한다.
   API 키는 이 서버 안에서만 쓰고 브라우저로는 절대 보내지 않는다.
3. .env의 BAZE_API_KEY에 키를 붙여 넣고 서버를 켜면, 키를 Windows 계정 암호화(DPAPI)로
   바꿔 BAZE_API_KEY_ENC에 저장하고 원래 칸은 비운다. (이 PC, 이 Windows 계정에서만 풀림)

실행:  python server.py            → 브라우저가 자동으로 열림 (기본 http://localhost:8765)
       python server.py --models   → BAZE에서 쓸 수 있는 모델 이름 목록
"""
import base64
import http.server
import json
import os
import re
import socketserver
import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass
ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
PORT = int(os.environ.get("PORT", "8765"))
MAX_BODY = 64 * 1024

# ───────────────────────── 키 암호화 (Windows DPAPI) ─────────────────────────
IS_WIN = sys.platform.startswith("win")
if IS_WIN:
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def _to_blob(data: bytes):
        buf = ctypes.create_string_buffer(data, len(data))
        return _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    def _from_blob(blob: _BLOB) -> bytes:
        out = ctypes.string_at(blob.pbData, blob.cbData)
        ctypes.windll.kernel32.LocalFree(ctypes.cast(blob.pbData, ctypes.c_void_p))
        return out

    def protect(data: bytes) -> bytes:
        src, _keep = _to_blob(data)
        dst = _BLOB()
        if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(src), ctypes.c_wchar_p("bangbom"),
                                                      None, None, None, 0x1, ctypes.byref(dst)):
            raise OSError("CryptProtectData 실패")
        return _from_blob(dst)

    def unprotect(data: bytes) -> bytes:
        src, _keep = _to_blob(data)
        dst = _BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(src), None, None, None, None,
                                                        0x1, ctypes.byref(dst)):
            raise OSError("CryptUnprotectData 실패 (다른 PC나 다른 Windows 계정에서 암호화한 키)")
        return _from_blob(dst)


def read_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def write_env_values(updates: dict) -> None:
    """주석과 순서를 유지한 채 값만 바꾼다."""
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
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


def load_key(env: dict) -> str:
    plain = env.get("BAZE_API_KEY", "")
    enc = env.get("BAZE_API_KEY_ENC", "")
    if plain:
        if IS_WIN:
            token = "dpapi:" + base64.b64encode(protect(plain.encode("utf-8"))).decode("ascii")
            write_env_values({"BAZE_API_KEY": "", "BAZE_API_KEY_ENC": token})
            print("[방봄] API 키를 암호화해서 .env에 저장했어요. (BAZE_API_KEY 칸은 비웠어요)")
        else:
            print("[방봄] Windows가 아니라서 키를 암호화하지 못했어요. .env를 공유하지 마세요.")
        return plain
    if enc.startswith("dpapi:"):
        if not IS_WIN:
            print("[방봄] 암호화된 키는 Windows에서만 풀 수 있어요.")
            return ""
        try:
            return unprotect(base64.b64decode(enc[6:])).decode("utf-8")
        except OSError as e:
            print(f"[방봄] {e} → .env의 BAZE_API_KEY에 키를 다시 넣어 주세요.")
            return ""
    return ""


if not ENV_PATH.exists() and (ROOT / "env.example").exists():
    ENV_PATH.write_text((ROOT / "env.example").read_text(encoding="utf-8"), encoding="utf-8")
    print("[방봄] .env 파일을 만들었어요. BAZE_API_KEY= 뒤에 키를 넣고 다시 실행하면 상담 AI가 켜져요.")

ENV = read_env()
API_KEY = load_key(ENV)
BASE_URL = ENV.get("BAZE_BASE_URL", "https://api.baze.co/v1/gateway").rstrip("/")
MODEL = ENV.get("BAZE_MODEL", "claude-haiku-5-5")
TIMEOUT = float(ENV.get("LLM_TIMEOUT", "12"))

# ───────────────────────── 상담 프롬프트 (CONSULT_SPEC 6장) ─────────────────────────
SYSTEM = """너는 대구로 이사 오며 처음 집을 알아보는 사람을 돕는 '방봄' 안내 도우미예요.
옆에서 차근차근 설명하듯, 다정하고 쉬운 존댓말(해요체)로 답해 주세요.

[답변 형식]
- 보통 3~4개의 짧은 문장. 휴대폰에서 읽기 쉽게 결론, 이유, 먼저 할 일을 빈 줄로 나눠요.
1. 결론: 첫 문장에서 질문에 바로 답해요.
2. 이유: 어떤 정보 때문에 그렇게 판단했는지, 무엇이 아직 판단되지 않았는지 설명해요. 어려운 용어는 쉬운 말로 풀어요.
3. 먼저 할 일: "먼저 할 일:"로 시작해서, 사용자가 바로 할 수 있는 행동 한 가지만 알려 줘요.

[판정 규칙 · 반드시 지킬 것]
- [판정 결과]와 [단지 계산]에 있는 상태와 숫자만 사실로 말해요. 판정을 바꾸거나 새 금액·금리를 계산하지 않아요.
- [규칙 기반 답변]은 서비스가 계산한 정답이에요. 어긋나게 말하지 말고 더 쉽게 풀어 줘요.
- 상태는 "요건 충족", "확인 필요", "미충족"으로만 말해요. '확인 필요'는 정보가 부족하다는 뜻이지 탈락이나 계약 불가가 아니에요.
- 계약해도 된다거나 대출이 승인된다고 단정하지 않아요. "가능", "승인", "확정", "보장"이라는 말을 쓰지 않아요.
- 모르는 내용은 추측하지 말고 "공고에서 확인이 필요해요"라고 말해요. 전달받지 않은 주소·문의처·기능은 지어내지 않아요.
- URL을 쓰지 않아요. 링크 버튼은 화면에 따로 나와요.
- 주민번호, 계좌번호, 비밀번호, 서류 사진을 요청하지 않아요. 질문과 관계없는 주의사항은 반복하지 않아요."""

BANNED = [(re.compile(r"대출\s*가능(합니다|해요)?"), "대출 요건 충족 기준이에요"),
          (re.compile(r"(승인|확정|보장)(됩니다|돼요|해요|합니다)"), "요건 충족 기준이에요. 최종 결정은 기관이 해요"),
          (re.compile(r"입주\s*(가능|불가)"), "입주 요건 판정")]


def build_messages(req: dict):
    ctx = (f"[판정 결과]\n{json.dumps(req.get('profile_result'), ensure_ascii=False) if req.get('profile_result') else '없음(사용자가 정보를 입력하지 않음)'}\n"
           f"[단지 계산]\n{json.dumps(req.get('complex'), ensure_ascii=False) if req.get('complex') else '없음'}\n"
           f"[규칙 기반 답변]\n{req.get('template_answer') or '없음'}")
    msgs = []
    for h in (req.get("history") or [])[-6:]:
        if h.get("role") in ("user", "assistant") and isinstance(h.get("text"), str):
            msgs.append({"role": h["role"], "content": h["text"][:1500]})
    msgs.append({"role": "user", "content": f"{ctx}\n\n[질문]\n{str(req.get('message', ''))[:800]}"})
    return msgs


def post_json(url: str, payload: dict, headers: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    r = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def call_llm(req: dict) -> str:
    msgs = build_messages(req)
    if MODEL.startswith("claude"):
        j = post_json(f"{BASE_URL}/claude/v1/messages",
                      {"model": MODEL, "max_tokens": 500, "system": SYSTEM, "messages": msgs},
                      {"x-api-key": API_KEY, "anthropic-version": "2023-06-01"})
        text = "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text")
    else:
        j = post_json(f"{BASE_URL}/chat/completions",
                      {"model": MODEL, "max_tokens": 500,
                       "messages": [{"role": "system", "content": SYSTEM}] + msgs},
                      {"Authorization": f"Bearer {API_KEY}"})
        text = j["choices"][0]["message"]["content"]
    return clean(text)


def clean(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text or "").strip()
    for pat, rep in BANNED:
        text = pat.sub(rep, text)
    return re.sub(r"[ \t]{2,}", " ", text)


# ───────────────────────── HTTP ─────────────────────────
BLOCK = re.compile(r"^/(\.|server\.py|src/|env\.example|.*\.py$|.*\.cmd$)", re.I)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        # 요청 로그는 조용히. 없는 파일(404)과 /api/ 요청만 한 줄로 남긴다.
        try:
            line = fmt % args
        except Exception:
            line = str(fmt)
        if "/api/" in line or "404" in line:
            sys.stderr.write("[방봄] " + line + "\n")

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            return self._json(200, {"status": "ok", "llm": bool(API_KEY), "model": MODEL if API_KEY else None})
        if BLOCK.match(path) or path.lower().endswith(".env"):
            return self._json(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/chat":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._json(413, {"error": "too large"})
        try:
            req = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            return self._json(400, {"error": "bad json"})
        if not API_KEY:
            return self._json(503, {"error": "no api key", "mode": "template"})
        try:
            import time
            t0 = time.time()
            reply = call_llm(req)
            print(f"[방봄] AI 답변 성공 · {MODEL} · {time.time() - t0:.1f}초")
            return self._json(200, {"reply": reply, "mode": "llm", "model": MODEL})
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            sys.stderr.write(f"[방봄] AI 호출 실패 (HTTP {e.code}) → 기본 답변으로 대체: {detail}\n")
            return self._json(502, {"error": f"llm http {e.code}", "mode": "template"})
        except Exception as e:  # 시간 초과, 네트워크 등 → 화면은 템플릿 답변으로 대체
            sys.stderr.write(f"[방봄] AI 호출 실패 ({type(e).__name__}) → 기본 답변으로 대체\n")
            return self._json(502, {"error": "llm failed", "mode": "template"})


def list_models():
    if not API_KEY:
        print(".env에 BAZE_API_KEY를 먼저 넣어 주세요.")
        return
    r = urllib.request.Request(f"{BASE_URL}/models/", headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(r, timeout=TIMEOUT) as resp:
        j = json.loads(resp.read().decode("utf-8"))
    for m in j.get("data", j if isinstance(j, list) else []):
        print(m.get("id") if isinstance(m, dict) else m)


if __name__ == "__main__":
    if "--models" in sys.argv:
        list_models()
        sys.exit(0)
    # Windows에서 포트를 같이 쓰지 않도록 재사용 옵션은 끈다. 쓰는 중이면 다음 포트로.
    socketserver.ThreadingTCPServer.allow_reuse_address = False
    httpd = None
    for port in range(PORT, PORT + 15):
        try:
            httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            print(f"[방봄] {port}번 포트는 다른 프로그램이 쓰고 있어요. 다음 포트를 시도해요.")
    if httpd is None:
        print("[방봄] 빈 포트를 찾지 못했어요. 다른 서버 창을 닫고 다시 실행해 주세요.")
        sys.exit(1)
    url = f"http://localhost:{port}/#home"
    print(f"[방봄] {url} 에서 열려 있어요. (끄려면 이 창을 닫거나 Ctrl+C)")
    print(f"[방봄] 상담: {'AI 안내 · ' + MODEL if API_KEY else '기본 안내 (API 키 없음)'}")
    if "--no-browser" not in sys.argv:
        import threading, webbrowser
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    with httpd:
        httpd.serve_forever()

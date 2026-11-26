r"""방봄 마스코트 기획 (팩트챗 BAZE 게이트웨이 · 글 모델)
사용: bangbom 폴더에서  python src\tools\mascot_plan.py
- 키는 server.py 가 .env 에서 읽은 값(server.API_KEY)만 쓰고, 화면·파일에 찍지 않는다.
- 1) 브리프 → 콘셉트 10개(기획_10개.md)  2) 같은 모델이 기준에 따라 5개 선정 + 이미지용 영문 외형 묘사(기획_선정5개.md, 선정5개.json)
- 결과는 저장소 맨 위 reports/마스코트시안/ 에 둔다 (배포 폴더에는 넣지 않는다)
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)
import server  # noqa: E402

MODEL = "claude-opus-5-5"
OUT = os.path.abspath(os.path.join(ROOT, "..", "reports", "마스코트시안"))
os.makedirs(OUT, exist_ok=True)

BRIEF = """방봄(BANGBOM) 마스코트 콘셉트를 기획해 주세요. 한국어로 답해 주세요.

[서비스] 방봄(BANGBOM). 대구에서 집을 구하는 청년이 내 조건(소득·모은 돈)을 넣으면 받을 수 있는 대출·지원을 따져 주고, 요건이 맞는 집에 지도에서 불이 켜지고, 평면도→3D→방 안까지 미리 살아 볼 수 있는 온라인 모델하우스. 범위는 대구 전체 매물(아파트·원룸·오피스텔)이고, 미분양 아파트는 조건 좋은 집으로 강조해요.
[슬로건] "따져 보고, 살아 보고, 고르는 집"
[대상] 20~30대 대구 청년, 첫 독립·첫 집.
[톤] 깔끔하고 감각적, 믿음직하지만 딱딱하지 않게. 유아용·학교 홍보물 느낌은 피하기.
[브랜드 색] 초록 #1f6b4f, 따뜻한 미색 #f3efe7, 포인트 호박색 #c7891d. 글꼴 Pretendard.
[쓰일 곳] 발표 영상 자막 카드(초록 배경), 사이트 로딩·빈 화면·결과 0곳 안내, 24시간 상담 아이콘.
[참고] 다른 팀 시연 영상(Reeper)은 3D 느낌 닭 마스코트가 장면마다 표정·소품을 바꿔 가며 나와요. 그런 쓰임새를 생각해 주세요.
[참고 후보] (더 좋은 게 있으면 안 써도 됨) 제비(봄에 돌아와 처마에 집 짓는 새), 소라게(맞는 집 찾아 옮겨 다님), 불 켜진 창문 집, 새싹 지붕 집, 열쇠.
[피할 것] 기존 유명 캐릭터와 닮은 것, 부동산 회사 마스코트 같은 뻔한 집 아저씨, 돈·금화 모티프.

콘셉트 10개를 주세요. 콘셉트마다 아래 항목을 빠짐없이:
- 이름(한글 2~3자)
- 소재
- 한 줄 설정
- 방봄과 연결되는 이유
- 생김새(형태·색·소품)
- 표정·포즈 3가지 예 (방봄 화면·영상의 어느 장면에 쓰는지 같이)
- 약점(솔직하게)
마크다운으로, "## 1. 이름 — 소재" 처럼 번호 제목을 붙여 주세요. 머리말·맺음말은 짧게."""

def ask(messages, max_tokens=9000):
    data = json.dumps({"model": MODEL, "max_tokens": max_tokens, "messages": messages}).encode("utf-8")
    req = urllib.request.Request(server.BASE_URL + "/claude/v1/messages", data=data, method="POST",
                                 headers={"Content-Type": "application/json", "x-api-key": server.API_KEY, "anthropic-version": "2023-06-01"})
    j = json.loads(urllib.request.urlopen(req, timeout=600).read().decode("utf-8"))
    return "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text").strip()

if __name__ == "__main__":
    if not server.API_KEY:
        sys.exit(".env 에 BAZE_API_KEY 를 먼저 넣어 주세요.")
    ten = ask([{"role": "user", "content": BRIEF}])
    open(os.path.join(OUT, "기획_10개.md"), "w", encoding="utf-8", newline="\r\n").write(
        f"# 방봄 마스코트 콘셉트 10개\n\n- 모델: `{MODEL}` (팩트챗 BAZE 게이트웨이)\n- 아래는 모델 답 원문 그대로예요.\n\n---\n\n{ten}\n")
    print("10개 받음", len(ten))
    PICK = """위 10개 중 5개를 골라 주세요. 기준: 방봄과의 연결, 기억에 남는 정도, 장면마다 쓰기 쉬움(표정·소품 바꾸기), 오리지널함(기존 캐릭터와 안 닮음).
1) 마크다운으로: 기준별로 짧게 따진 표(10개 모두, 기준마다 상/중/하) → 고른 5개와 고른 이유(각 2~3문장) → 빠진 5개가 왜 빠졌는지 한 줄씩 → 5개 중 추천 1개와 이유.
2) 맨 끝에 ```json 코드 블록 하나로, 고른 5개를 [{"no": 원래 번호, "name": "한글 이름", "subject": "소재", "look_en": "이미지 생성용 영문 외형 묘사(형태·비율·색은 브랜드 색 hex 로·소품·표정, 120단어 이내, 실존 캐릭터 이름 없이)"}] 형식으로 주세요."""
    five = ask([{"role": "user", "content": BRIEF}, {"role": "assistant", "content": ten}, {"role": "user", "content": PICK}])
    m = re.search(r"```json\s*(\[.*?\])\s*```", five, re.S)
    picks = json.loads(m.group(1)) if m else []
    open(os.path.join(OUT, "선정5개.json"), "w", encoding="utf-8").write(json.dumps(picks, ensure_ascii=False, indent=1))
    body = re.sub(r"```json.*?```", "", five, flags=re.S).strip()
    open(os.path.join(OUT, "기획_선정5개.md"), "w", encoding="utf-8", newline="\r\n").write(
        f"# 방봄 마스코트 5개 선정\n\n- 모델: `{MODEL}` (같은 대화에서 10개를 보고 고름)\n- 기준: 방봄과의 연결, 기억에 남는 정도, 장면마다 쓰기 쉬움, 오리지널함\n\n---\n\n{body}\n")
    print("5개 고름", [p.get("name") for p in picks])

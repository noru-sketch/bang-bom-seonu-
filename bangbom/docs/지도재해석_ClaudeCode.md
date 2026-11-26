# 지도 재해석 작업 (BAZE Seedream Pro) · Claude Code 지시서

목표: 미분양 단지 8곳 주변 지도를 저작권 걱정 없는 그림으로 다시 그려서, 대구 전체 지도(3D)의 각 단지 위치 바닥에 깐다.

- 참고 지도는 OpenStreetMap(공개 지도, ODbL)이다. 화면 데이터 출처에 "© OpenStreetMap contributors"를 남긴다.
- 네이버지도는 쓰지 않는다.
- 생성 이미지·참고 지도는 `trace/refs`, `trace/art`에 두고, `trace/`는 커밋하지 않는다. 앱에서 쓸 최종본만 `img/map/`에 넣는다.
- API 키는 `server.py`가 쓰는 방식 그대로 쓴다 (`import server` → `server.API_KEY`, `server.BASE_URL`). **키를 출력하거나 파일에 쓰지 않는다.**

아래 블록을 하나씩 Claude Code에 붙여 넣는다.

## 1. 참고 지도 만들기
```
docs/지도재해석_ClaudeCode.md를 읽고 1단계를 해줘.
python trace\make_refs.py 를 실행해서 trace\refs 에 8장(c01~c08)이 생기는지 확인해. Pillow가 없으면 pip install pillow.
한 장을 열어서 단지 위치가 가운데인지 보고 멈춰.
```

## 2. BAZE Seedream Pro 호출 확인
```
2단계: BAZE API Gateway(https://api.baze.co/v1/gateway)에서 Seedream Pro 이미지 생성(참고 이미지 넣는 편집 방식) 호출 방법을 찾아줘.
- python server.py --models 로 모델 목록에서 seedream 이름을 확인 (키 출력 금지)
- BAZE 문서(docs.factchat.kr)에서 이미지 생성/편집 엔드포인트와 요청 형식 확인
- trace\seedream_baze.py 를 만들어: import server 로 키를 쓰고, trace\refs\c01_sangin.jpg + trace\reinterpret_prompt.txt 로 1장만 생성해서 trace\art\c01_sangin.png 저장.
결과 이미지를 보여주고 멈춰. 글자가 남아 있거나 길 배치가 많이 바뀌었으면 프롬프트를 고칠 제안을 해줘.
```

## 3. 8장 생성
```
3단계: 1장이 괜찮으면 나머지 7장도 같은 설정으로 생성해서 trace\art 에 저장해줘. 실패한 건 1번만 다시 시도.
8장을 2x4로 이어 붙인 미리보기 trace\art\_preview.jpg 를 만들어 보여주고 멈춰.
```

## 4. 대구 지도에 배치
```
4단계: 생성한 8장을 3D 지도 바닥에 깔아줘.
- 1024px 이하 jpg로 줄여서 img/map/c01.jpg … c08.jpg 로 저장
- 각 이미지를 해당 단지의 map 좌표를 중심으로 하는 바닥 평면(약 8 x 8 지도 단위, 한 장이 실제 약 4.4km)으로 깔고, 가장자리는 둥글게 흐려지게(투명 그라데이션) 해서 대구 경계 지도와 자연스럽게 섞이게
- 가까운 단지(c01·c02·c06)는 겹치니 c01이 위에 오게
- 기존 자동 생성 건물 블록은 이미지가 깔린 범위에서는 빼거나 줄여서 겹쳐 보이지 않게
- c06(대곡 그린시티 샘플) 좌표를 위도 35.8085, 경도 128.5420으로 바꿔 (이전 좌표는 산 위였음)
- 데이터 출처 영역에 "지도: © OpenStreetMap contributors (재해석 이미지)" 추가
python src/shell/build.py 후 시연하기.cmd로 열어 지도 전체와 달서구 확대 화면이 어떤지 설명하고 멈춰.
```

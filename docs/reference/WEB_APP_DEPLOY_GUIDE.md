# WEB_APP_DEPLOY_GUIDE.md · 웹 공개 배포 & 모바일 앱(Capacitor) 스토어 출시 매뉴얼

> 기존 `PROJECT.md`는 "노트북 1대에서 프론트(5173) + 백엔드(8000) 실행"까지만 다루고 있습니다.
> 이 문서는 대회 당일 **PC 웹사이트 공개 URL + 모바일 앱(Google Play `.aab`/`.apk` · App Store/PWA)**까지 동시 완성하기 위한 추가 배포·패키징 매뉴얼입니다.

---

## 1. 전체 배포 아키텍처 (React+Vite+TS + FastAPI)
```text
[PC 웹 브라우저] ──┐
                   ├── HTTPS ──▶ [Vercel: frontend/] (공개 웹 URL + PWA)
[Capacitor 앱]  ───┘                    │
 (Android / iOS)                        ▼  VITE_API_BASE_URL
                            [Render 또는 Railway: backend/] (Python FastAPI)
```
- **오프라인 백업 유지:** 대회장 와이파이가 끊길 경우를 대비해, 노트북 로컬 실행(`5173` + `8000`)과 `VITE_USE_MOCK=true` 모드는 항상 함께 유지한다.

---

## 2. 백엔드(FastAPI) 5분 공개 배포 (Render / Railway)
1. `backend/requirements.txt` 확인 (`fastapi`, `uvicorn`, `pydantic` 등).
2. `backend/main.py`에 모바일 앱(`capacitor://localhost`, `https://localhost`)과 Vercel 도메인을 허용하는 CORS 미들웨어 추가:
   ```python
   from fastapi.middleware.cors import CORSMiddleware

   app.add_middleware(
       CORSMiddleware,
       allow_origins=["*"],  # 대회 시연용 전체 허용 (정식 운영 시 도메인 제한)
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```
3. Render(또는 Railway)에서 GitHub 저장소 연결 → Root Directory를 `backend`로 지정 → Start Command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. 배포 완료 후 발급된 공개 URL(예: `https://online-modelhouse-api.onrender.com`)의 `/api/health` 접속 확인.

---

## 3. 프론트엔드(React+TS) 공개 배포 (Vercel) & 모바일 반응형
1. `frontend/src/lib/api.ts`에서 API 기본 주소를 환경변수로 분리:
   ```ts
   const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
   ```
2. Vercel 프로젝트 생성 → Root Directory를 `frontend`로 지정 → 환경변수에 `VITE_API_BASE_URL` 등록 후 배포.
3. **모바일/앱 UX 필수 보정 (`MAP_STYLE_GUIDE.md` 10장 확장):**
   - PC에서는 지도 위 좌/우측에 떠 있는 카드들을, 모바일 폭(`< 768px`)에서는 **상단 콤팩트 요약 알약 + 화면 하단 드래그 바텀시트(Bottom Sheet)**로 전환해 2.5D 지도가 가려지지 않게 한다.
   - 노치·하단 홈 바 대응: `padding-top: env(safe-area-inset-top)`, `padding-bottom: env(safe-area-inset-bottom)`.

---

## 4. Capacitor로 모바일 앱(Android / iOS) 동시 빌드

`frontend/` 폴더 안에서 아래 명령어를 실행한다.

```bash
# 1. Capacitor 및 필수 네이티브 플러그인 설치
npm install @capacitor/core @capacitor/haptics @capacitor/share @capacitor/preferences @capacitor/status-bar
npm install -D @capacitor/cli @capacitor/android @capacitor/ios

# 2. 초기화 (웹 빌드 폴더 dist 연결)
npx cap init "온라인 모델하우스" "com.searim.modelhouse" --web-dir dist

# 3. 플랫폼 추가
npx cap add android
npx cap add ios

# 4. 프로덕션 빌드 및 네이티브 동기화 (수정 시마다 반복)
npm run build
npx cap sync
```

### Android (`.apk` 현장 시연용 / `.aab` Google Play 출시용)
1. `npx cap open android`로 Android Studio 실행.
2. **현장 설치용 `.apk`:** `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)` (`android/app/build/outputs/apk/debug/app-debug.apk`).
3. **Google Play 제출용 `.aab`:** `Build` → `Generate Signed Bundle / APK...` → **Android App Bundle (.aab)** 선택 → 키스토어 생성 및 서명 (`android/app/release/app-release.aab`).

### iOS (App Store / TestFlight) 및 PWA 대안
- **Mac + Xcode가 있는 경우:** `npx cap open ios` → Signing 설정 → `Product` → `Archive` → `App Store Connect` 업로드.
- **Mac이 없는 경우 (iOS 즉시 체험용 PWA):** `frontend/public/manifest.webmanifest` (`display: "standalone"`) + `index.html`의 `apple-mobile-web-app-capable` 메타 태그로 아이폰 Safari `[홈 화면에 추가]` 시 네이티브 앱처럼 실행.

---

## 5. 스토어 심사 통과(리젝 방지) 체크리스트
- [ ] **Apple Guideline 4.2 (단순 웹뷰 리젝 방지):** 단지 클릭·가구 스냅 시 `@capacitor/haptics` 진동, `@capacitor/share`로 단지 실부담 카드 네이티브 공유, `@capacitor/preferences` 로컬 저장, 오프라인 목업 모드 지원.
- [ ] **개인정보처리방침:** 비로그인·기기 로컬 저장 기반 정책 페이지(`/privacy.html`)를 앱 설정과 스토어 등록란에 연결.
- [ ] **스토어 필수 에셋:** 앱 아이콘(1024×1024 PNG, 투명 배경 금지), 스플래시(2732×2732 PNG), 모바일 세로 스크린샷 5장(S1 입력 / S2 클레이 2.5D 지도 / S2 인프라 선+카드 / S3 상세·체크리스트 / S4 3D 배치).
- [ ] **기관 비공식 고지:** 스토어 설명과 앱 하단에 `"샘플 데이터·참고용, 최종 판정과 승인은 각 기관"` 명시.

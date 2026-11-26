# Capacitor 스토어 출시 & 웹·앱 동시 빌드 매뉴얼 (무박 2일 현장용)

React + Vite로 개발한 **방꾸미 2.0** 웹사이트를 단 10~20분 만에 **Google Play(.aab/.apk)** 및 **App Store(Xcode/TestFlight) + PWA** 앱으로 패키징하기 위한 단계별 명령어 및 심사 통과 체크리스트입니다.

---

## 0. 사전 준비물 (대회장 출발 전/도착 직후 확인)
- **필수:** Node.js 20+, Git, Vercel 계정 (GitHub 연동)
- **Android 빌드용:** Android Studio 설치 (SDK & Gradle 포함)
- **iOS 빌드용:** Mac + Xcode (Mac이 없는 경우 GitHub Actions/Codemagic 클라우드 빌드 또는 iOS Safari 홈 화면 추가용 PWA로 대응)

---

## 1단계: Capacitor 및 네이티브 플러그인 설치 (5분)

프로젝트 루트 터미널(VS Code)에서 아래 명령어를 순서대로 실행합니다.

```bash
# 1. Capacitor 코어 및 CLI 설치
npm install @capacitor/core
npm install -D @capacitor/cli

# 2. Capacitor 프로젝트 초기화 (앱 이름, 패키지 ID 입력)
npx cap init "방꾸미" "com.searim.bangkkumi" --web-dir dist

# 3. 필수 네이티브 기능 플러그인 설치 (단순 웹뷰 리젝 방지 핵심)
npm install @capacitor/camera @capacitor/haptics @capacitor/share @capacitor/preferences @capacitor/status-bar

# 4. Android / iOS 플랫폼 추가
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
```

---

## 2단계: 모바일 앱에서 Vercel AI 서버 호출 설정 (중요!)

모바일 앱 내부에서는 상대 경로(`/api/advice`)가 로컬 파일(`capacitor://localhost`)을 가리켜 실패합니다. 반드시 **Vercel 공개 도메인**을 환경변수로 분리해야 합니다.

### 2.1 `.env.production` (또는 모바일 빌드용 `.env.mobile`)
```env
VITE_API_BASE_URL=https://your-bangkkumi-app.vercel.app
```

### 2.2 `src/lib/api.js` 호출 유틸 예시
```javascript
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function postApi(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
```

### 2.3 Vercel 서버 CORS 허용 (`vercel.json`)
모바일 앱(`capacitor://localhost`, `https://localhost`)에서 Vercel API를 호출할 수 있도록 프로젝트 루트에 `vercel.json`을 추가합니다.
```json
{
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type" }
      ]
    }
  ]
}
```

---

## 3단계: 웹 빌드 → 앱 동기화 (수정할 때마다 반복)

```bash
# 1. React 웹앱 프로덕션 빌드 (dist/ 생성)
npm run build

# 2. dist/ 결과물과 플러그인을 Android/iOS 프로젝트에 복사
npx cap sync
```

---

## 4단계: Android 스토어용(.aab) 및 현장 시연용(.apk) 추출

```bash
# Android Studio로 프로젝트 열기
npx cap open android
```

1. **카메라 권한 확인 (`android/app/src/main/AndroidManifest.xml`):**
   ```xml
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-permission android:name="android.permission.INTERNET" />
   ```
2. **현장 심사위원 즉시 설치용 `.apk` 추출:**
   - Android Studio 상단 메뉴: `Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
   - 생성 위치: `android/app/build/outputs/apk/debug/app-debug.apk`
3. **Google Play Console 출시용 서명된 `.aab` 추출:**
   - 상단 메뉴: `Build` → `Generate Signed Bundle / APK...` → **Android App Bundle (.aab)** 선택
   - `Create new...`로 키스토어(`.jks`) 생성 후 비밀번호 메모 → `release` 빌드 완료
   - 생성 위치: `android/app/release/app-release.aab` (이 파일을 Google Play Console에 바로 업로드!)

---

## 5단계: iOS (App Store / TestFlight) 및 PWA 세팅

### 5.1 Mac이 있는 경우 (Xcode)
```bash
npx cap open ios
```
1. `ios/App/App/Info.plist`에 카메라 권한 문구 추가:
   - `NSCameraUsageDescription`: `"평면도와 가구 사진을 촬영해 방 배치를 돕기 위해 카메라를 사용합니다."`
   - `NSPhotoLibraryUsageDescription`: `"저장된 평면도나 가구 사진을 불러오기 위해 사진 보관함에 접근합니다."`
2. Xcode 상단 `Signing & Capabilities`에서 Apple Developer Team 선택.
3. 상단 메뉴 `Product` → `Archive` → `Distribute App` → `App Store Connect` 업로드.

### 5.2 Mac이 없는 경우 (iOS 즉시 체험용 PWA 완벽 세팅)
- `public/manifest.webmanifest`에 `display: "standalone"`, `theme_color`, 192×192 / 512×512 아이콘 등록.
- `index.html`에 `<meta name="apple-mobile-web-app-capable" content="yes">` 및 `apple-touch-icon` 추가.
- 심사위원 아이폰 Safari에서 `[공유] → [홈 화면에 추가]` 시 네이티브 앱처럼 전체화면 실행 가능.

---

## 6단계: 스토어 심사 리젝 방지 최종 체크리스트

### Apple Guideline 4.2 (단순 웹뷰 리젝) 방어
- [ ] **네이티브 하드웨어 연동:** `@capacitor/camera`로 평면도·가구 직접 촬영 작동
- [ ] **햅틱 피드백:** 2D 평면도에서 가구 스냅·회전 시 `@capacitor/haptics` 미세 진동 적용
- [ ] **네이티브 UX:** 모바일 하단 고정 탭 바 + 드래그 가능한 바텀시트 + 안전한 노치 여백(`env(safe-area-inset-top/bottom)`)
- [ ] **오프라인 동작:** 비행기 모드에서도 2D·3D·배치·비용 계산 100% 작동

### 스토어 등록 필수 에셋 & 정책
- [ ] **개인정보처리방침 URL:** 앱 내 설정 화면 + 스토어 등록란에 공개 페이지(`/privacy.html`) 링크 연결 (비로그인·기기 로컬 저장 기반 명시)
- [ ] **앱 아이콘:** 1024×1024 PNG (투명 배경 금지, 모서리 둥글기 없이 정사각형 원본)
- [ ] **스플래시 화면:** 2732×2732 PNG (`@capacitor/assets`로 자동 생성 가능: `npx capacitor-assets generate`)
- [ ] **스토어 스크린샷:** 모바일 세로 화면 5장 (1. 시작/방설정, 2. 2D 평면도+3단계 피드백, 3. 3D PBR+1인칭 걷기, 4. 90cm 아이시선/채광, 5. AI 연출 이미지+예산표)
- [ ] **고지 문구 확인:** 시연용 예상 가격 / 참고값 / AI 연출 이미지 안내 문구 노출 여부 확인

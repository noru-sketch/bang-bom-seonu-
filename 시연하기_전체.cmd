@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 - 전체 시연 (지도 + 집 보기 + 가구 배치 + AI 상담)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js가 없어요. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo [처음 한 번] 필요한 도구를 내려받아요. 몇 분 걸려요...
  call npm install
  if errorlevel 1 goto FAIL
)
echo [1/2] 화면을 만들어요 (방봄 + 방꾸미)...
python bangbom\src\shell\build.py >nul 2>nul || py bangbom\src\shell\build.py >nul 2>nul
node scripts\sync-bangbom.mjs >nul
call npx vite build
if errorlevel 1 goto FAIL
echo [2/2] 시연 서버를 켜요. 끝낼 때는 이 창을 닫으세요.
python bangbom\server.py --root dist || py bangbom\server.py --root dist
pause
exit /b 0
:FAIL
echo 실패했어요. 화면을 캡처해서 보내 주세요. (지도·상담만 볼 때는 bangbom\시연하기.cmd)
pause
exit /b 1

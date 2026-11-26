@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 - 내 수정 올리기
where git >nul 2>nul
if errorlevel 1 goto NOGIT
if exist ".git" goto INREPO_OK
echo 이 파일은 저장소를 받은 프로젝트 폴더 맨 위에서 실행해야 해요.
echo 아직 프로젝트를 받지 않았다면 0_처음_받기.cmd 를 먼저 실행하세요.
pause
exit /b 1
:INREPO_OK
set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"
call :IDENT

git check-ignore -q .env
if errorlevel 1 goto ENVRISK

set "MSG="
set /p MSG=무엇을 고쳤는지 한 줄로 적어 주세요 (예: 지도 색 수정): 
if "%MSG%"=="" set "MSG=수정"

if exist "bangbom\src\shell\build.py" (
  python bangbom\src\shell\build.py >nul 2>nul || py bangbom\src\shell\build.py >nul 2>nul
  where node >nul 2>nul && (node scripts\sync-bangbom.mjs >nul 2>nul) || copy /y bangbom\index.html public\index.html >nul
)
git add -A
git commit -m "%MSG%"
echo.
echo 올리기 전에 팀원 수정을 먼저 받아요...
git pull --no-rebase origin main
if errorlevel 1 goto PULLFAIL
git push origin main
if errorlevel 1 goto PUSHFAIL
echo.
echo 올렸어요! 팀원들은 받기_pull.cmd 로 받으면 됩니다.
pause
exit /b 0

:ENVRISK
echo .env(API 키 파일)가 제외 목록에 없어서 멈췄어요. PM에게 알려 주세요.
pause
exit /b 1

:PULLFAIL
echo 팀원 수정과 충돌이 났어요. 받기_pull.cmd 를 먼저 실행해서 해결한 뒤 다시 올려 주세요.
pause
exit /b 1

:PUSHFAIL
echo 올리기에 실패했어요. 인터넷과 GitHub 로그인, 저장소 초대 수락 여부를 확인하세요.
pause
exit /b 1

:IDENT
set "GUN="
for /f "delims=" %%a in ('git config --global user.name 2^>nul') do set "GUN=%%a"
if defined GUN goto IDMAIL
set /p GUN=GitHub에 표시될 이름(예: 경동휘)을 입력하고 Enter: 
git config --global user.name "%GUN%"
:IDMAIL
set "GUE="
for /f "delims=" %%a in ('git config --global user.email 2^>nul') do set "GUE=%%a"
if defined GUE goto :eof
set /p GUE=GitHub 계정 이메일을 입력하고 Enter: 
git config --global user.email "%GUE%"
goto :eof

:NOGIT
echo Git이 설치되어 있지 않아요.
echo   1. https://git-scm.com/download/win 에서 설치 (설정은 전부 Next)
echo   2. 설치가 끝나면 이 파일을 다시 더블클릭하세요.
start "" https://git-scm.com/download/win
pause
exit /b 1

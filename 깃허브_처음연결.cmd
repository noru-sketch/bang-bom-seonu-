@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 - GitHub 처음 연결
where git >nul 2>nul
if errorlevel 1 goto NOGIT

set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"

if not exist ".git" git init
git branch -M main 2>nul

for /f "delims=" %%a in ('git config user.name') do set GUN=%%a
if defined GUN goto HAVENAME
set /p GUN=GitHub에 표시될 이름을 입력하세요: 
git config user.name "%GUN%"
:HAVENAME
for /f "delims=" %%a in ('git config user.email') do set GUE=%%a
if defined GUE goto HAVEMAIL
set /p GUE=GitHub 계정 이메일을 입력하세요: 
git config user.email "%GUE%"
:HAVEMAIL

echo.
echo [1/3] 비밀 파일이 올라가지 않는지 확인합니다...
git check-ignore -q .env
if errorlevel 1 (
  echo .env가 제외 목록에 없어요. 작업을 멈춥니다.
  pause
  exit /b 1
)
echo   .env, trace 폴더는 올라가지 않아요.

echo [2/3] 지금 상태를 저장합니다...
git add -A
git commit -m "방봄 현재 상태 저장" >nul 2>nul
git log --oneline -1

git remote get-url origin >nul 2>nul
if not errorlevel 1 goto PUSH

echo [3/3] GitHub 저장소를 연결합니다.
where gh >nul 2>nul
if not errorlevel 1 (
  gh auth status >nul 2>nul
  if not errorlevel 1 (
    gh repo create bangbom --private --source=. --remote=origin
    goto PUSH
  )
)
echo.
echo   1. 브라우저에서 https://github.com/new 를 엽니다
echo   2. Repository name: bangbom, Private 선택, 아무것도 추가하지 말고 Create repository
echo   3. 화면에 나온 주소를 복사합니다. 예: https://github.com/내아이디/bangbom.git
echo.
start "" https://github.com/new
set /p REPO=복사한 저장소 주소를 붙여 넣고 Enter: 
git remote add origin %REPO%

:PUSH
git push -u origin main
if errorlevel 1 (
  echo 올리기에 실패했어요. GitHub 로그인 창이 떴다면 로그인한 뒤 이 파일을 다시 실행하세요.
  pause
  exit /b 1
)
echo.
echo 완료! 팀원 초대: GitHub 저장소 화면 - Settings - Collaborators - Add people
for /f "delims=" %%a in ('git remote get-url origin') do echo 저장소 주소: %%a
pause
exit /b 0

:NOGIT
echo Git이 설치되어 있지 않아요. 아래 명령을 한 번 실행한 뒤 다시 더블클릭하세요.
echo   winget install --id Git.Git -e
pause
exit /b 1

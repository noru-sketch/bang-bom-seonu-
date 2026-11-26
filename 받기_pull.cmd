@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 - 팀원 수정 받기
where git >nul 2>nul
if errorlevel 1 goto NOGIT
if exist ".git" goto INREPO_OK
echo 이 파일은 bangbom 폴더 안에서 실행해야 해요.
echo 아직 프로젝트를 받지 않았다면 0_처음_받기.cmd 를 먼저 실행하세요.
pause
exit /b 1
:INREPO_OK
set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"
call :IDENT
echo 내 작업을 먼저 저장한 뒤 팀원 수정을 받아요...
git add -A
git commit -m "받기 전 내 작업 저장" >nul 2>nul
git pull --no-rebase origin main
if not errorlevel 1 goto DONE

rem 충돌 파일이 index.html 하나뿐이면 src에서 다시 빌드해서 자동 해결
set "OTHER="
for /f "delims=" %%f in ('git diff --name-only --diff-filter=U') do (
  if /i not "%%f"=="index.html" set OTHER=1
)
if defined OTHER goto CONFLICT
git diff --name-only --diff-filter=U | findstr /i "index.html" >nul
if errorlevel 1 goto NETFAIL
echo index.html 충돌은 src에서 다시 빌드해서 해결합니다...
git checkout --theirs index.html
python src\shell\build.py || py src\shell\build.py
git add index.html
git commit -m "받기: index.html 다시 빌드" >nul
goto DONE

:CONFLICT
echo.
echo 같은 부분을 팀원과 동시에 고쳐서 충돌이 났어요. 충돌 파일:
git diff --name-only --diff-filter=U
echo.
echo 혼자 고치지 말고 PM에게 이 화면을 캡처해서 보내 주세요.
echo (Claude Code가 있다면: "git 충돌을 양쪽 내용을 살려서 해결해줘")
pause
exit /b 1

:NETFAIL
echo 받기에 실패했어요. 인터넷 연결과 GitHub 로그인을 확인하세요.
pause
exit /b 1

:DONE
echo.
echo 팀원 수정 사항을 모두 받았어요. 최근 기록:
git log --oneline -5
pause
exit /b 0

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

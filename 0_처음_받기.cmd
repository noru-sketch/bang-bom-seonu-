@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 - 처음 받기 (한 번만)
where git >nul 2>nul
if errorlevel 1 goto NOGIT

if exist "bangbom\.git" goto ALREADY

echo ============================================
echo  방봄 프로젝트를 이 폴더 안에 bangbom 으로 받아요.
echo  먼저 GitHub 초대 메일(또는 알림)을 수락했는지 확인하세요.
echo ============================================
echo.
set "REPO="
set /p REPO=PM이 보낸 저장소 주소를 붙여 넣고 Enter: 
if "%REPO%"=="" goto NOREPO

echo.
echo GitHub 로그인 창이 뜨면 로그인해 주세요...
git clone "%REPO%" bangbom
if errorlevel 1 goto FAIL

call :IDENT
copy /y "%~dp0받기_pull.cmd" "bangbom\" >nul
copy /y "%~dp0올리기_push.cmd" "bangbom\" >nul
cd /d "%~dp0bangbom"
set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"

echo.
echo 완료! 앞으로는 bangbom 폴더 안에서
echo   작업 시작 전: 받기_pull.cmd
echo   작업 끝난 뒤: 올리기_push.cmd
echo   화면 확인:    시연하기.cmd
start "" explorer "%~dp0bangbom"
pause
exit /b 0

:ALREADY
echo 이미 받아 둔 bangbom 폴더가 있어요. 그 안의 받기_pull.cmd 를 쓰세요.
start "" explorer "%~dp0bangbom"
pause
exit /b 0

:NOREPO
echo 주소가 비어 있어요. 다시 실행해 주세요.
pause
exit /b 1

:FAIL
echo.
echo 받기에 실패했어요. 확인할 것:
echo   - GitHub 초대를 수락했나요? (수락 전에는 비공개 저장소가 안 보여요)
echo   - 주소가 https://github.com/아이디/bangbom.git 형태인가요?
echo   - 로그인한 GitHub 계정이 초대받은 계정인가요?
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

@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"
title 방봄 - 내 수정 올리기
set MSG=
set /p MSG=무엇을 고쳤는지 한 줄로 적어 주세요: 
if "%MSG%"=="" set MSG=수정
python src\shell\build.py >nul 2>nul || py src\shell\build.py >nul 2>nul
git add -A
git commit -m "%MSG%"
git pull --no-rebase origin main
if errorlevel 1 (
  echo 팀원 수정과 충돌이 났어요. 받기_pull.cmd 를 먼저 실행해서 해결한 뒤 다시 올려 주세요.
  pause
  exit /b 1
)
git push origin main
if errorlevel 1 (
  echo 올리기에 실패했어요. 인터넷과 GitHub 로그인을 확인해 주세요.
  pause
  exit /b 1
)
echo 올렸어요! 팀원들은 받기_pull.cmd 로 받으면 됩니다.
pause

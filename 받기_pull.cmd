@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "HERE=%CD:\=/%"
git config --global --get-all safe.directory 2>nul | findstr /x /c:"%HERE%" >nul || git config --global --add safe.directory "%HERE%"
title 방봄 - 팀원 수정 받기
git add -A
git commit -m "받기 전 내 작업 저장" >nul 2>nul
git pull --no-rebase origin main
if not errorlevel 1 goto DONE

rem 충돌 파일이 index.html 하나뿐이면 다시 빌드해서 자동 해결
set OTHER=
for /f "delims=" %%f in ('git diff --name-only --diff-filter=U') do (
  if /i not "%%f"=="index.html" set OTHER=1
)
if defined OTHER goto CONFLICT
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
echo Claude Code에 "git 충돌을 양쪽 내용을 살려서 해결해줘"라고 요청하세요.
pause
exit /b 1

:DONE
echo 팀원 수정 사항을 모두 받았어요.
git log --oneline -5
pause

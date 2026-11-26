@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 작업 1: 지도 재해석 (BAZE Seedream Pro)
where claude >nul 2>nul
if errorlevel 1 (
  echo Claude Code 명령어가 없어요. 아래 명령을 한 번 실행한 뒤 다시 더블클릭하세요.
  echo   npm install -g @anthropic-ai/claude-code
  pause
  exit /b 1
)
echo 방봄 작업 1: 지도 재해석 (BAZE Seedream Pro)
echo 권한을 물으면 1 또는 Enter로 허용하세요. 끝나면 이 창을 닫으면 됩니다.
claude --model claude-opus-5-5 "Read docs/task_map.txt and follow it exactly. Reply in Korean."
pause

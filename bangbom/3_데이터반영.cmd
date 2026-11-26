@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 방봄 작업 3: 조사 결과 앱 반영
if not exist "docs\task_data.txt" (
  echo docs\task_data.txt 가 없어요. zip을 bangbom 폴더에 그대로 풀었는지 확인하세요.
  pause
  exit /b 1
)
where claude >nul 2>nul
if errorlevel 1 (
  echo Claude Code 명령어가 없어요. 아래 명령을 한 번 실행한 뒤 다시 더블클릭하세요.
  echo   npm install -g @anthropic-ai/claude-code
  pause
  exit /b 1
)
echo ============================================
echo  방봄 작업 3: 조사 결과(1~4) 앱 반영
echo  - 권한을 물으면 1 또는 Enter로 허용하세요.
echo  - 끝나면 docs\조사\반영결과.md 를 확인하고
echo    시연하기.cmd 로 화면 확인 후 올리기_push.cmd 로 올리세요.
echo ============================================
claude --model claude-opus-5-5 "Read docs/task_data.txt and follow it exactly. Reply in Korean."
pause

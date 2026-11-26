@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 대구 실거래가를 받아 미분양 단지와 맞춰요. 2~3분 걸려요.
where python >/dev/null 2>/dev/null && (python src\tools\fetch_rtms.py) || (py src\tools\fetch_rtms.py)
echo.
echo 끝났어요. 이 창은 닫아도 돼요.
pause

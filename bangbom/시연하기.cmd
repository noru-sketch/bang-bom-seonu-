@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 방봄 시연 서버를 켭니다. 이 창을 닫으면 서버가 꺼져요.
where python >nul 2>nul && (python server.py) || (py server.py)
pause

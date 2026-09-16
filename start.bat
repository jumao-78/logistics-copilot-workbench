@echo off
rem ============================================================
rem  Logistics Copilot 一键启动（跨境物流智能客服工作台）
rem  双击本文件即可：自动检查环境 -> 启动服务 -> 就绪后打开浏览器
rem  关闭演示：关掉标题为 "Logistics Copilot Server" 的窗口
rem ============================================================
cd /d "%~dp0"

echo.
echo ============ Logistics Copilot 一键启动 ============
echo.

echo [1/4] 检查 Python 环境 ...
where python >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未找到 python 命令。
  echo   请安装 Python 3.10+ 并在安装时勾选 Add python.exe to PATH。
  echo.
  pause
  exit /b 1
)
python --version
echo   Python 环境正常。
echo.

echo [2/4] 检查 8010 端口是否已有服务 ...
netstat -ano | findstr ":8010" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo   [提示] 检测到服务已在运行，直接为你打开浏览器。
  start "" http://127.0.0.1:8010
  timeout /t 3 /nobreak >nul
  exit /b 0
)

echo [3/4] 启动服务（将弹出服务窗口，请勿关闭它）...
start "Logistics Copilot Server (do not close)" "%~dp0server.bat"
echo.

echo [4/4] 等待服务就绪 ...
set /a WAIT_N=0
:wait_loop
timeout /t 2 /nobreak >nul
netstat -ano | findstr ":8010" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto ready
set /a WAIT_N+=1
if %WAIT_N% lss 15 goto wait_loop
echo.
echo   [错误] 服务在 30 秒内没有启动成功。
echo   请查看弹出的 "Logistics Copilot Server" 窗口里的报错信息，
echo   把该窗口截图发给开发者即可快速定位。
echo.
pause
exit /b 1

:ready
start "" http://127.0.0.1:8010
echo.
echo ============================================================
echo   启动成功！浏览器已打开： http://127.0.0.1:8010
echo.
echo   · 演示结束后：关掉 "Logistics Copilot Server" 窗口即可
echo   · 若"今日工单"为 0：运行  python scripts/mock_data.py --force
echo ============================================================
timeout /t 6 /nobreak >nul

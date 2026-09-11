@echo off
rem ============================================================
rem  Logistics Copilot 一键启动（跨境物流智能客服工作台）
rem  双击运行：先启动后端服务，就绪后自动打开浏览器
rem  关闭方法：关掉名为 "Logistics Copilot Server" 的那个窗口
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

echo [1/3] 启动后端服务中（会弹出新窗口，请勿关闭它）...
start "Logistics Copilot Server (do not close)" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8010"

echo [2/3] 等待服务就绪（约 4 秒）...
timeout /t 4 /nobreak >nul

echo [3/3] 打开浏览器...
start "" http://127.0.0.1:8010

echo.
echo ================================================
echo  已启动，浏览器地址： http://127.0.0.1:8010
echo.
echo  · 演示结束后：关掉 "Logistics Copilot Server" 窗口即可
echo  · 若页面显示"今日工单为 0"：运行 python scripts/mock_data.py --force 刷新数据
echo  · 若提示端口被占用：先关掉旧的 Server 窗口再双击本脚本
echo ================================================
timeout /t 5 >nul

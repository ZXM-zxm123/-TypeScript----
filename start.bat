@echo off
echo ========================================
echo 实时协作白板系统 - 快速启动
echo ========================================
echo.

echo [1/3] 检查并创建后端recordings目录...
if not exist "server\recordings" mkdir "server\recordings"

echo.
echo [2/3] 安装后端依赖...
cd server
call npm install
cd ..

echo.
echo [3/3] 安装前端依赖...
cd frontend
call npm install
cd ..

echo.
echo ========================================
echo 依赖安装完成！
echo 请按以下步骤启动服务：
echo.
echo 1. 后端: cd server && npm start
echo 2. 前端: cd frontend && npm start
echo.
echo 后端运行在 http://localhost:3001
echo 前端运行在 http://localhost:3000
echo ========================================
pause

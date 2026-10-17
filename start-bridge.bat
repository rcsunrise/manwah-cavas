@echo off
chcp 65001 >nul
title Manwah Cavas · Local Asset Bridge (本地素材连接器)
cls
echo ======================================================
echo    Manwah Cavas · Local Asset Bridge 本地连接器
echo ======================================================
echo.
echo 正在启动连接器环境...
echo.
npx tsx scripts/localBridgeRunner.ts %1
pause

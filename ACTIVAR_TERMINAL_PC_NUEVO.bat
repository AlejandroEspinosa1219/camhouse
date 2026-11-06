@echo off
chcp 65001 >nul
title Activar Terminal CamHouse en PC Nuevo
echo =======================================================
echo    ACTIVANDO COMPATIBILIDAD DE RUTA EN PC NUEVO
echo =======================================================
echo.
echo Creando enlace simbolico para que Antigravity funcione...
mkdir "C:\Users\aespi\Automatizaciones" 2>nul
mklink /J "C:\Users\aespi\Automatizaciones\camhouse" "C:\Automatizaciones\camhouse"
echo.
echo =======================================================
echo    LISTO! RUTA ENLAZADA CORRECTAMENTE
echo =======================================================
echo.
pause

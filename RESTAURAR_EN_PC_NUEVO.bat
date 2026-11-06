@echo off
chcp 65001 >nul
title CamHouse - Restaurar en PC Nuevo
color 0a

echo =====================================================================
echo    👑 CAMHOUSE BY C^&A - RESTAURAR EN TU NUEVO PC GAMER 👑
echo =====================================================================
echo.
echo Este asistente restaurara automaticamente en este nuevo PC:
echo   1. Toda la conversacion e historial de Antigravity (.gemini)
echo   2. Tu proyecto CamHouse listo para usar
echo.
echo =====================================================================
echo.

set "BACKUP_DIR=%~dp0"

echo [1/2] Restaurando historial de Antigravity en tu usuario actual (%USERPROFILE%)...
if exist "%BACKUP_DIR%\.gemini" (
    robocopy "%BACKUP_DIR%\.gemini" "%USERPROFILE%\.gemini" /E /MT:8 /R:1 /W:1 /NP /NFL /NDL
    echo [OK] Historial de Antigravity restaurado correctamente.
) else (
    echo [AVISO] No se encontro la carpeta .gemini en %BACKUP_DIR%
)

echo.
echo [2/2] ¿Donde deseas colocar la carpeta del proyecto CamHouse?
echo Presiona ENTER para guardarla en: C:\Automatizaciones\camhouse
set /p DEST_PROYECTO="O escribe otra ruta: "
if "%DEST_PROYECTO%"=="" set "DEST_PROYECTO=C:\Automatizaciones\camhouse"

if exist "%BACKUP_DIR%\camhouse" (
    robocopy "%BACKUP_DIR%\camhouse" "%DEST_PROYECTO%" /E /MT:8 /R:1 /W:1 /NP /NFL /NDL
    echo [OK] Proyecto restaurado en %DEST_PROYECTO%.
) else (
    echo [AVISO] No se encontro la carpeta camhouse en %BACKUP_DIR%
)

echo.
echo =====================================================================
echo   ¡TODO HA SIDO RESTAURADO CON EXITO EN TU NUEVO PC!
echo =====================================================================
echo.
echo Ahora solo abre Antigravity y abre la carpeta de tu proyecto.
echo.
pause

@echo off
chcp 65001 >nul
title CamHouse - Copia de Seguridad para PC Nuevo
color 0b

echo =====================================================================
echo    👑 CAMHOUSE BY C^&A - COPIA DE SEGURIDAD PARA TU PC NUEVO 👑
echo =====================================================================
echo.
echo Este asistente copiara automaticamente:
echo   1. Toda la conversacion, memoria y cerebro de Antigravity (.gemini)
echo   2. Todo tu proyecto CamHouse (codigo, .env y sesiones de WhatsApp)
echo.
echo =====================================================================
echo.

set /p DESTINO="Escribe la letra de tu Disco Duro (por ejemplo D o E) o presiona ENTER para usar D: "
if "%DESTINO%"=="" set DESTINO=D

set "TARGET_DIR=%DESTINO%:\RESPALDO_CAMHOUSE_PC_NUEVO"

echo.
echo Destino seleccionado: %TARGET_DIR%
echo.
echo [1/2] Copiando historial y cerebro de Antigravity...
robocopy "%USERPROFILE%\.gemini" "%TARGET_DIR%\.gemini" /E /XD "tmp" "antigravity-browser-profile" "cache" /MT:8 /R:1 /W:1 /NP /NFL /NDL

echo.
echo [2/2] Copiando proyecto CamHouse (codigo, llaves .env y sesiones WhatsApp)...
robocopy "C:\Users\aespi\Automatizaciones\camhouse" "%TARGET_DIR%\camhouse" /E /XD "build\stage" /MT:8 /R:1 /W:1 /NP /NFL /NDL

copy /Y "C:\Users\aespi\Automatizaciones\camhouse\RESTAURAR_EN_PC_NUEVO.bat" "%TARGET_DIR%\RESTAURAR_EN_PC_NUEVO.bat" >nul

echo.
echo =====================================================================
echo   ¡COPIA DE SEGURIDAD COMPLETADA CON EXITO EN %TARGET_DIR%!
echo =====================================================================
echo.
echo En tu nuevo PC Gamer solo tendras que:
echo   1. Instalar Antigravity.
echo   2. Copiar la carpeta .gemini en tu nueva carpeta de usuario.
echo   3. Copiar la carpeta camhouse donde desees.
echo.
pause

@echo off
title Subir Actualizacion v1.2.0 a GitHub - CamHouse
color 0B
echo ======================================================================
echo   SUBIENDO ACTUALIZACION v1.2.0 A GITHUB (CamHouse By C&A)
echo ======================================================================
echo.
set "PATH=C:\Users\Usuario\AppData\Local\Programs\Git\cmd;%PATH%"
cd /d "C:\Automatizaciones\camhouse"

echo Rama actual: main
echo Destino: https://github.com/AlejandroEspinosa1219/camhouse.git
echo.
echo Conectando con GitHub...
echo (Si tu navegador abre una pestana de GitHub, haz clic en "Sign In" o "Authorize").
echo.

git push origin main

echo.
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo ======================================================================
    echo   EXITO TOTAL: Version 1.2.0 publicada en GitHub!
    echo   El banner de actualizacion ya aparecera en la aplicacion.
    echo ======================================================================
) else (
    color 0C
    echo [!] Hubo un error al conectar con GitHub. Revisa la autorizacion.
)
echo.
pause

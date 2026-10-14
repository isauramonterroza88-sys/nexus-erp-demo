@echo off
chcp 65001 >nul
title NEXUS ERP CORE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No tienes Node.js instalado. Instala la version LTS desde https://nodejs.org
  echo  y vuelve a abrir este archivo.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando el servidor, solo la primera vez...
  call npm install
)
if not exist client\dist\index.html (
  echo Preparando la interfaz para computador y celular, solo la primera vez...
  call npm run build
)
echo.
echo  NEXUS ERP CORE listo. NO cierres esta ventana mientras lo uses.
echo  En este computador: http://localhost:5000
echo  En un celular conectado al mismo Wi-Fi usa la direccion "Desde un celular" que aparece abajo.
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5000"
call npm start
pause

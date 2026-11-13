@echo off
chcp 65001 >nul
title MPC Touch Studio installeren
cd /d "%~dp0"
echo.
echo   ============================================
echo     MPC Touch Studio wordt geinstalleerd...
echo   ============================================
echo.
set "SETUP="
for %%F in ("MPC-Touch-Studio-Setup-*.exe") do set "SETUP=%%~fF"
if not defined SETUP (
  echo   De installer staat niet naast dit bestand.
  echo   Klik met rechts op de zip, kies "Alles uitpakken" en start Installeren.bat opnieuw.
  echo.
  pause
  exit /b 1
)
rem Stil installeren (geen vragen), voor jouw Windows-account
start "" /wait "%SETUP%" /S
if errorlevel 1 (
  echo   Installatie is afgebroken. Probeer het nog eens of start de installer zelf:
  echo   %SETUP%
  pause
  exit /b 1
)
set "APP="
for %%D in ("%LOCALAPPDATA%\Programs\mpc-touch-studio" "%LOCALAPPDATA%\Programs\MPC Touch Studio" "%ProgramFiles%\MPC Touch Studio") do (
  if exist "%%~D\MPC Touch Studio.exe" set "APP=%%~D\MPC Touch Studio.exe"
)
if defined APP (
  echo   Klaar! MPC Touch Studio wordt gestart.
  echo   Je vindt de app ook op je bureaublad en in het Startmenu.
  start "" "%APP%"
  timeout /t 4 >nul
) else (
  echo   Klaar! Start MPC Touch Studio via het bureaublad of het Startmenu.
  echo.
  pause
)

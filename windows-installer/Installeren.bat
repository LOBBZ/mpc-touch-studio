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
echo   Bezig met installeren, even geduld...
set "APP="
set /a N=0
:wacht
for %%D in ("%LOCALAPPDATA%\Programs\MPC Touch Studio" "%LOCALAPPDATA%\Programs\mpc-touch-studio" "%ProgramFiles%\MPC Touch Studio") do (
  if exist "%%~D\MPC Touch Studio.exe" set "APP=%%~D\MPC Touch Studio.exe"
)
if defined APP goto klaar
set /a N+=1
if %N% geq 90 goto handmatig
ping -n 2 127.0.0.1 >nul
goto wacht

:klaar
rem nog even wachten tot alle bestanden staan
ping -n 4 127.0.0.1 >nul
echo   Klaar! MPC Touch Studio wordt gestart.
echo   Je vindt de app ook op je bureaublad en in het Startmenu.
start "" "%APP%"
ping -n 4 127.0.0.1 >nul
exit /b 0

:handmatig
echo   De installatie duurt langer dan verwacht.
echo   Start MPC Touch Studio straks via het bureaublad of het Startmenu.
echo.
pause
exit /b 0

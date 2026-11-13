@echo off
rem MPC Touch Studio bridge - dubbelklik om te starten (Windows)
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Eerste keer: installeren...
  py -3 -m venv .venv 2>nul || python -m venv .venv
  .venv\Scripts\pip install -q -r requirements.txt
)
.venv\Scripts\python mpc_bridge.py %*
pause

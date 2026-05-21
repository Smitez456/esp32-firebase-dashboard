@echo off
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Virtual environment not found. Run: python -m venv .venv
  exit /b 1
)
.venv\Scripts\python.exe setup_port_forwarding.py
pause

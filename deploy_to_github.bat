@echo off
cd /d %~dp0
if not exist .venv\Scripts\python.exe (
  echo Virtual environment not found. Run: python -m venv .venv
  exit /b 1
)
if "%1" == "" (
  echo Usage: deploy_to_github.bat REPO_NAME
  exit /b 1
)
set GITHUB_TOKEN=%GITHUB_TOKEN%
.venv\Scripts\python.exe deploy_to_github.py %1

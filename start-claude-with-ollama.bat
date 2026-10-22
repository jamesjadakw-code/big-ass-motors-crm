@echo off
title Claude Code with Local Ollama
echo ============================================================
echo   BIG ASS MOTORS - Claude Code with Local Ollama
echo ============================================================
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set ANTHROPIC_BASE_URL=http://localhost:8000
set ANTHROPIC_API_KEY=sk-ollama

echo Connecting Claude Code to LiteLLM Proxy (http://localhost:8000)...
echo Working Directory: %CD%
echo.
"C:\Users\daley\.local\bin\claude.exe"
pause

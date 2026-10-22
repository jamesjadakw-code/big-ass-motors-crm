@echo off
title BAM LiteLLM Proxy for Ollama
echo ============================================================
echo   BIG ASS MOTORS - Ollama LiteLLM Proxy
echo   Connecting Claude Code & Antigravity to Local Ollama
echo ============================================================
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set ANTHROPIC_BASE_URL=http://localhost:8000
set ANTHROPIC_API_KEY=sk-ollama

echo Starting LiteLLM proxy on port 8000...
"C:\Users\daley\AppData\Local\Programs\Python\Python314\Scripts\litellm.exe" --config "C:\Users\daley\Documents\antigravity\goofy-shannon\ollama_proxy_config.yaml" --port 8000
pause

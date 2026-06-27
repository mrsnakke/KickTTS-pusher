@echo off
title Kick-TTS App
if /i "%1"=="/silent" (
    start "" /b node kick-tts.js
) else (
    echo Iniciando Kick-TTS App...
    node kick-tts.js
    pause
)

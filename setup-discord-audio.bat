@echo off
echo ================================================
echo SoundPad Pro - Discord Audio Setup
echo ================================================
echo.
echo This will help you configure VoiceMeeter Banana
echo for routing SoundPad Pro audio to Discord.
echo.
echo IMPORTANT: You must run this as Administrator!
echo.
pause

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-voicemeeter-simple.ps1"

pause

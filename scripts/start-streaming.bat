@echo off
REM ============================================
REM Start Streaming - Launches SoundPad Pro + OBS
REM ============================================
REM This script starts SoundPad Pro first, waits
REM for it to load, then launches OBS Studio.
REM ============================================

echo Starting SoundPad Pro...

REM Try common install locations for SoundPad Pro
if exist "%LOCALAPPDATA%\Programs\SoundPad Pro\SoundPad Pro.exe" (
    start "" "%LOCALAPPDATA%\Programs\SoundPad Pro\SoundPad Pro.exe"
    goto :soundpad_started
)

if exist "%PROGRAMFILES%\SoundPad Pro\SoundPad Pro.exe" (
    start "" "%PROGRAMFILES%\SoundPad Pro\SoundPad Pro.exe"
    goto :soundpad_started
)

REM Fallback: try to find it
for /f "delims=" %%i in ('where /r "%LOCALAPPDATA%" "SoundPad Pro.exe" 2^>nul') do (
    start "" "%%i"
    goto :soundpad_started
)

echo WARNING: Could not find SoundPad Pro installation.
echo Please edit this script with the correct path.
pause
goto :start_obs

:soundpad_started
echo SoundPad Pro starting...
echo Waiting 4 seconds for app to initialize...
timeout /t 4 /nobreak >nul

:start_obs
echo Starting OBS Studio...

REM Try common OBS install locations
if exist "%PROGRAMFILES%\obs-studio\bin\64bit\obs64.exe" (
    start "" "%PROGRAMFILES%\obs-studio\bin\64bit\obs64.exe"
    goto :done
)

if exist "%PROGRAMFILES(x86)%\obs-studio\bin\64bit\obs64.exe" (
    start "" "%PROGRAMFILES(x86)%\obs-studio\bin\64bit\obs64.exe"
    goto :done
)

REM Try Steam installation
if exist "%PROGRAMFILES(x86)%\Steam\steamapps\common\OBS Studio\bin\64bit\obs64.exe" (
    start "" "%PROGRAMFILES(x86)%\Steam\steamapps\common\OBS Studio\bin\64bit\obs64.exe"
    goto :done
)

echo WARNING: Could not find OBS Studio installation.
echo Please edit this script with the correct path.
pause

:done
echo.
echo Ready to stream!

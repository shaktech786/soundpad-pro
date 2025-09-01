@echo off
setlocal EnableDelayedExpansion
title SoundPad Pro Uninstaller

:: Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ========================================
    echo This uninstaller requires Administrator
    echo privileges. Please run as Administrator
    echo ========================================
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo     SoundPad Pro Complete Uninstaller
echo ==========================================
echo.
echo This will completely remove SoundPad Pro
echo from your system including:
echo - Application files
echo - Registry entries  
echo - Start Menu shortcuts
echo - Desktop shortcuts
echo.

choice /C YN /M "Do you want to continue"
if errorlevel 2 goto :cancelled

echo.
echo [1/7] Stopping running processes...
:: Kill any running instances
taskkill /F /IM "SoundPad Pro.exe" >nul 2>&1
if %errorLevel% equ 0 (
    echo       - SoundPad Pro process terminated
    timeout /t 2 /nobreak >nul
) else (
    echo       - No running processes found
)

echo.
echo [2/7] Removing installed application files...
:: Remove from common installation locations
set removed=0

if exist "%LOCALAPPDATA%\Programs\soundpad-pro" (
    echo       - Removing from LocalAppData...
    rmdir /S /Q "%LOCALAPPDATA%\Programs\soundpad-pro" 2>nul
    if not exist "%LOCALAPPDATA%\Programs\soundpad-pro" (
        echo         [OK] LocalAppData cleaned
        set /a removed+=1
    ) else (
        echo         [WARN] Could not remove some files
    )
)

if exist "%PROGRAMFILES%\SoundPad Pro" (
    echo       - Removing from Program Files...
    rmdir /S /Q "%PROGRAMFILES%\SoundPad Pro" 2>nul
    if not exist "%PROGRAMFILES%\SoundPad Pro" (
        echo         [OK] Program Files cleaned
        set /a removed+=1
    ) else (
        echo         [WARN] Could not remove some files
    )
)

if exist "%PROGRAMFILES(x86)%\SoundPad Pro" (
    echo       - Removing from Program Files x86...
    rmdir /S /Q "%PROGRAMFILES(x86)%\SoundPad Pro" 2>nul
    if not exist "%PROGRAMFILES(x86)%\SoundPad Pro" (
        echo         [OK] Program Files x86 cleaned
        set /a removed+=1
    ) else (
        echo         [WARN] Could not remove some files
    )
)

if %removed% equ 0 (
    echo       - No installation directories found
)

echo.
echo [3/7] Cleaning user data...
choice /C YN /M "Do you want to keep your sound mappings and settings"
if errorlevel 2 (
    if exist "%APPDATA%\soundpad-pro" (
        echo       - Removing AppData folder...
        rmdir /S /Q "%APPDATA%\soundpad-pro" 2>nul
        if not exist "%APPDATA%\soundpad-pro" (
            echo         [OK] User settings removed
        ) else (
            echo         [WARN] Some settings may remain
        )
    )
    
    if exist "%LOCALAPPDATA%\soundpad-pro" (
        echo       - Removing LocalAppData settings...
        rmdir /S /Q "%LOCALAPPDATA%\soundpad-pro" 2>nul
        if not exist "%LOCALAPPDATA%\soundpad-pro" (
            echo         [OK] Cache data removed
        )
    )
) else (
    echo       - Settings preserved for future use
)

echo.
echo [4/7] Removing Start Menu shortcuts...
set shortcuts_removed=0

if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" (
    del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro\*.lnk" 2>nul
    rmdir /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" 2>nul
    if not exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" (
        echo       [OK] User Start Menu cleaned
        set /a shortcuts_removed+=1
    )
)

if exist "%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" (
    del /Q "%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro\*.lnk" 2>nul
    rmdir /Q "%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" 2>nul
    if not exist "%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\SoundPad Pro" (
        echo       [OK] All Users Start Menu cleaned
        set /a shortcuts_removed+=1
    )
)

if %shortcuts_removed% equ 0 (
    echo       - No Start Menu shortcuts found
)

echo.
echo [5/7] Removing Desktop shortcuts...
if exist "%USERPROFILE%\Desktop\SoundPad Pro.lnk" (
    del /Q "%USERPROFILE%\Desktop\SoundPad Pro.lnk" 2>nul
    echo       [OK] Desktop shortcut removed
) else (
    echo       - No Desktop shortcut found
)

if exist "%PUBLIC%\Desktop\SoundPad Pro.lnk" (
    del /Q "%PUBLIC%\Desktop\SoundPad Pro.lnk" 2>nul
    echo       [OK] Public Desktop shortcut removed
)

echo.
echo [6/7] Cleaning registry entries...
:: Define the application GUID
set APP_GUID={a8c4e9d5-7b3f-4e8a-9c2d-1f6e8b9a7c5d}

:: Remove uninstall registry entries (HKCU)
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\%APP_GUID%" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo       [OK] HKCU uninstall entry removed
) else (
    echo       - No HKCU uninstall entry found
)

:: Remove uninstall registry entries (HKLM)
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\%APP_GUID%" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo       [OK] HKLM uninstall entry removed
) else (
    echo       - No HKLM uninstall entry found
)

:: Remove application registry keys
reg delete "HKCU\Software\soundpad-pro" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo       [OK] User registry settings removed
)

reg delete "HKLM\Software\SoundPad Pro" /f >nul 2>&1
if %errorLevel% equ 0 (
    echo       [OK] System registry settings removed
)

:: Remove file associations
reg delete "HKCU\Software\Classes\.spp" /f >nul 2>&1
reg delete "HKCU\Software\Classes\SoundPadPro.Pack" /f >nul 2>&1

echo.
echo [7/7] Final cleanup...
:: Clear any temporary files
if exist "%TEMP%\soundpad-pro*" (
    del /Q "%TEMP%\soundpad-pro*" 2>nul
    echo       [OK] Temporary files cleaned
)

:: Clear icon cache to remove any lingering icons
ie4uinit.exe -show >nul 2>&1

echo.
echo ==========================================
echo     Uninstall Complete!
echo ==========================================
echo.
echo SoundPad Pro has been successfully removed
echo from your system.
echo.

goto :end

:cancelled
echo.
echo Uninstall cancelled by user.
echo.

:end
pause
exit /b 0
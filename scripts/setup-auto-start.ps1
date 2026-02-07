# ============================================
# Setup Auto-Start for SoundPad Pro
# ============================================
# This script creates a shortcut in Windows
# Startup folder to launch SoundPad Pro
# automatically when Windows starts.
# ============================================

$AppName = "SoundPad Pro"
$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder "$AppName.lnk"

# Find SoundPad Pro executable
$PossiblePaths = @(
    "$env:LOCALAPPDATA\Programs\SoundPad Pro\SoundPad Pro.exe",
    "$env:PROGRAMFILES\SoundPad Pro\SoundPad Pro.exe",
    "${env:PROGRAMFILES(x86)}\SoundPad Pro\SoundPad Pro.exe"
)

$ExePath = $null
foreach ($Path in $PossiblePaths) {
    if (Test-Path $Path) {
        $ExePath = $Path
        break
    }
}

if (-not $ExePath) {
    Write-Host "ERROR: Could not find SoundPad Pro installation." -ForegroundColor Red
    Write-Host "Please install SoundPad Pro first, or manually create a startup shortcut."
    pause
    exit 1
}

Write-Host "Found SoundPad Pro at: $ExePath" -ForegroundColor Green

# Create shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = Split-Path $ExePath
$Shortcut.Description = "SoundPad Pro - Professional Soundboard"
$Shortcut.Save()

Write-Host ""
Write-Host "SUCCESS: Startup shortcut created!" -ForegroundColor Green
Write-Host "Location: $ShortcutPath"
Write-Host ""
Write-Host "SoundPad Pro will now start automatically when Windows boots."
Write-Host ""
Write-Host "To remove auto-start, delete the shortcut from:"
Write-Host "  $StartupFolder"
Write-Host ""
pause

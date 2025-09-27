# PowerShell script to create a desktop shortcut to the latest SoundPad Pro installer
# This script should be run after building the Windows installer

param(
    [string]$DistPath = "dist",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "SoundPad Pro - Desktop Shortcut Creator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the project root directory
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$distFolder = Join-Path $projectRoot $DistPath

# Check if dist folder exists
if (-not (Test-Path $distFolder)) {
    Write-Host "[ERROR] Distribution folder not found at: $distFolder" -ForegroundColor Red
    Write-Host "Please run 'npm run build:win' first to create the installer." -ForegroundColor Yellow
    exit 1
}

# Find the latest Setup installer (not portable)
$setupFiles = Get-ChildItem -Path $distFolder -Filter "SoundPad Pro-Setup-*.exe" | Sort-Object LastWriteTime -Descending

if ($setupFiles.Count -eq 0) {
    Write-Host "[ERROR] No installer files found in: $distFolder" -ForegroundColor Red
    Write-Host "Please run 'npm run build:win' first to create the installer." -ForegroundColor Yellow
    exit 1
}

# Get the latest installer
$latestInstaller = $setupFiles[0]
Write-Host "[OK] Found latest installer: $($latestInstaller.Name)" -ForegroundColor Green
Write-Host "   Path: $($latestInstaller.FullName)" -ForegroundColor Gray
Write-Host "   Size: $([math]::Round($latestInstaller.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host "   Created: $($latestInstaller.LastWriteTime)" -ForegroundColor Gray
Write-Host ""

# Desktop path
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "SoundPad Pro Installer.lnk"

# Check if shortcut already exists
if (Test-Path $shortcutPath) {
    if ($Force) {
        Write-Host "[INFO] Removing existing shortcut..." -ForegroundColor Yellow
        Remove-Item $shortcutPath -Force
    } else {
        $response = Read-Host "Shortcut already exists. Replace it? (Y/N)"
        if ($response -ne "Y" -and $response -ne "y") {
            Write-Host "[CANCELLED] Operation cancelled." -ForegroundColor Red
            exit 0
        }
        Remove-Item $shortcutPath -Force
    }
}

# Create the shortcut
try {
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut($shortcutPath)
    $Shortcut.TargetPath = $latestInstaller.FullName
    $Shortcut.WorkingDirectory = $distFolder
    $Shortcut.Description = "Install or update SoundPad Pro - Professional Soundboard"
    $Shortcut.IconLocation = $latestInstaller.FullName + ",0"
    $Shortcut.Save()

    Write-Host "[OK] Desktop shortcut created successfully!" -ForegroundColor Green
    Write-Host "Location: $shortcutPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Installer Details:" -ForegroundColor Cyan
    Write-Host "Name: $($latestInstaller.Name)" -ForegroundColor White
    Write-Host "Version: $($latestInstaller.Name -replace '.*Setup-(\d+\.\d+\.\d+)\.exe', '$1')" -ForegroundColor White
    Write-Host ""
    Write-Host "You can now double-click the shortcut on your desktop to install/update SoundPad Pro!" -ForegroundColor Green

} catch {
    Write-Host "[ERROR] Error creating shortcut: $_" -ForegroundColor Red
    exit 1
}

# Optional: Show in Explorer
$response = Read-Host "Would you like to open the desktop folder? (Y/N)"
if ($response -eq "Y" -or $response -eq "y") {
    explorer.exe $desktopPath
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
# SoundPad Pro - Simple VoiceMeeter Setup
# Run as Administrator

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SoundPad Pro - VoiceMeeter Banana Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "Please right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Paths
$vmBananaPath = "${env:ProgramFiles(x86)}\VB\Voicemeeter\voicemeeterpro.exe"

Write-Host "[1/3] Checking VoiceMeeter Banana installation..." -ForegroundColor Yellow

if (Test-Path $vmBananaPath) {
    Write-Host "[OK] VoiceMeeter Banana is installed!" -ForegroundColor Green
} else {
    Write-Host "" -ForegroundColor Yellow
    Write-Host "VoiceMeeter Banana not found." -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
    Write-Host "Please install manually:" -ForegroundColor White
    Write-Host "1. Download from: https://vb-audio.com/Voicemeeter/banana.htm" -ForegroundColor Cyan
    Write-Host "2. Run the installer" -ForegroundColor Cyan
    Write-Host "3. Restart your computer" -ForegroundColor Cyan
    Write-Host "4. Run this script again" -ForegroundColor Cyan
    Write-Host ""
    $openBrowser = Read-Host "Open download page in browser? (Y/N)"
    if ($openBrowser -eq "Y" -or $openBrowser -eq "y") {
        Start-Process "https://vb-audio.com/Voicemeeter/banana.htm"
    }
    Read-Host "Press Enter to exit"
    exit 0
}

Write-Host ""
Write-Host "[2/3] Starting VoiceMeeter Banana..." -ForegroundColor Yellow

# Stop if already running
Stop-Process -Name "voicemeeter*" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start VoiceMeeter
Start-Process -FilePath $vmBananaPath
Start-Sleep -Seconds 3
Write-Host "[OK] VoiceMeeter Banana started!" -ForegroundColor Green

Write-Host ""
Write-Host "[3/3] Configuration Instructions" -ForegroundColor Yellow
Write-Host ""
Write-Host "In VoiceMeeter Banana, configure these settings:" -ForegroundColor White
Write-Host ""
Write-Host "HARDWARE INPUTS:" -ForegroundColor Cyan
Write-Host "  Strip 1: MOTU M Series (In 1-2)" -ForegroundColor White
Write-Host "    - Click B1 button (routes to headphones)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Strip 2: Razer Ripsaw HD HDMI Microphone" -ForegroundColor White
Write-Host "    - Click A1 and B1 buttons" -ForegroundColor Gray
Write-Host "    - Click A3 button (routes to Discord)" -ForegroundColor Gray
Write-Host ""
Write-Host "VIRTUAL INPUTS:" -ForegroundColor Cyan
Write-Host "  Strip 3 (VAIO): General PC Audio" -ForegroundColor White
Write-Host "    - Label: 'PC Audio'" -ForegroundColor Gray
Write-Host "    - Click A1 and B1 buttons" -ForegroundColor Gray
Write-Host ""
Write-Host "  Strip 4 (VAIO3): SoundPad Pro" -ForegroundColor White
Write-Host "    - Label: 'SoundPad Pro'" -ForegroundColor Gray
Write-Host "    - Click A1, A3, and B1 buttons" -ForegroundColor Gray
Write-Host ""
Write-Host "HARDWARE OUTPUTS:" -ForegroundColor Cyan
Write-Host "  A1: Your Headphones/Speakers" -ForegroundColor White
Write-Host "  A2: MOTU M Series (Out 3-4)" -ForegroundColor White
Write-Host "  A3: CABLE Input (install VB-Cable first)" -ForegroundColor White
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Install VB-Cable (for Discord routing):" -ForegroundColor White
Write-Host "   https://vb-audio.com/Cable/" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Configure Discord:" -ForegroundColor White
Write-Host "   Settings -> Voice & Video" -ForegroundColor Gray
Write-Host "   Input Device: CABLE Output" -ForegroundColor Gray
Write-Host ""
Write-Host "3. In SoundPad Pro:" -ForegroundColor White
Write-Host "   Audio Output: VoiceMeeter Aux Input" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Toggle SoundPad Pro to Discord:" -ForegroundColor White
Write-Host "   Click A3 button on Strip 4 in VoiceMeeter" -ForegroundColor Gray
Write-Host ""

$openVBCable = Read-Host "Open VB-Cable download page? (Y/N)"
if ($openVBCable -eq "Y" -or $openVBCable -eq "y") {
    Start-Process "https://vb-audio.com/Cable/"
}

Write-Host ""
Write-Host "Setup Complete!" -ForegroundColor Green
Read-Host "Press Enter to exit"

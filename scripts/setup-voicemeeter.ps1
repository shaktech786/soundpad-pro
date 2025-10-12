# SoundPad Pro - VoiceMeeter Banana Setup Script
# This script automatically configures VoiceMeeter Banana for Discord + OBS routing

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
$tempDir = "$env:TEMP\VoiceMeeterSetup"
$vmBananaInstaller = "$tempDir\VoicemeeterProSetup.exe"
$vbCableInstaller = "$tempDir\VBCABLE_Driver_Pack.zip"
$vmInstallPath = "${env:ProgramFiles(x86)}\VB\Voicemeeter"
$vmBananaPath = "$vmInstallPath\voicemeeterpro.exe"

# URLs
$vmBananaUrl = "https://download.vb-audio.com/Download_CABLE/VoicemeeterProSetup.exe"
$vbCableUrl = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip"

# Create temp directory
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host "[1/6] Checking VoiceMeeter Banana installation..." -ForegroundColor Yellow

# Check if VoiceMeeter Banana is installed
$vmBananaInstalled = Test-Path $vmBananaPath

if ($vmBananaInstalled) {
    Write-Host "✓ VoiceMeeter Banana is already installed!" -ForegroundColor Green
} else {
    Write-Host "⚠ VoiceMeeter Banana not found. Installing..." -ForegroundColor Yellow

    # Download VoiceMeeter Banana
    Write-Host "  Downloading VoiceMeeter Banana..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $vmBananaUrl -OutFile $vmBananaInstaller -UseBasicParsing
        Write-Host "  ✓ Downloaded successfully!" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Download failed: $_" -ForegroundColor Red
        Write-Host "  Please download manually from: https://vb-audio.com/Voicemeeter/banana.htm" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Install VoiceMeeter Banana
    Write-Host "  Installing VoiceMeeter Banana..." -ForegroundColor Cyan
    Start-Process -FilePath $vmBananaInstaller -ArgumentList "/S" -Wait
    Write-Host "  ✓ Installation complete!" -ForegroundColor Green

    Write-Host ""
    Write-Host "⚠ IMPORTANT: You must restart your computer for VoiceMeeter Banana to work properly!" -ForegroundColor Yellow
    Write-Host "After restart, run this script again to continue setup." -ForegroundColor Yellow
    $restart = Read-Host "Restart now? (Y/N)"
    if ($restart -eq "Y" -or $restart -eq "y") {
        Restart-Computer -Force
        exit 0
    } else {
        Write-Host "Please restart manually and run this script again." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 0
    }
}

Write-Host ""
Write-Host "[2/6] Checking VB-Cable installation..." -ForegroundColor Yellow

# Check if VB-Cable is installed
$vbCableInstalled = Get-AudioDevice -List | Where-Object { $_.Name -like "*CABLE*" }

if ($vbCableInstalled) {
    Write-Host "✓ VB-Cable is already installed!" -ForegroundColor Green
} else {
    Write-Host "⚠ VB-Cable not found. Installing..." -ForegroundColor Yellow

    # Download VB-Cable
    Write-Host "  Downloading VB-Cable..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $vbCableUrl -OutFile $vbCableInstaller -UseBasicParsing
        Write-Host "  ✓ Downloaded successfully!" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Download failed: $_" -ForegroundColor Red
        Write-Host "  Please download manually from: https://vb-audio.com/Cable/" -ForegroundColor Yellow
        Read-Host "Press Enter to continue without VB-Cable"
    }

    # Extract and install VB-Cable
    if (Test-Path $vbCableInstaller) {
        Write-Host "  Extracting VB-Cable..." -ForegroundColor Cyan
        Expand-Archive -Path $vbCableInstaller -DestinationPath "$tempDir\VBCABLE" -Force

        Write-Host "  Installing VB-Cable driver..." -ForegroundColor Cyan
        $vbCableSetup = Get-ChildItem "$tempDir\VBCABLE" -Filter "VBCABLE_Setup_x64.exe" -Recurse | Select-Object -First 1
        if ($vbCableSetup) {
            Start-Process -FilePath $vbCableSetup.FullName -ArgumentList "/i" -Wait
            Write-Host "  ✓ VB-Cable installation complete!" -ForegroundColor Green
        } else {
            Write-Host "  ✗ VB-Cable installer not found in archive" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "[3/6] Stopping VoiceMeeter if running..." -ForegroundColor Yellow
Stop-Process -Name "voicemeeter*" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "✓ Done!" -ForegroundColor Green

Write-Host ""
Write-Host "[4/6] Creating VoiceMeeter Banana configuration..." -ForegroundColor Yellow

# Create VoiceMeeter configuration XML
$vmConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<VoicemeeterBanana>
    <!-- Hardware Input Strips -->
    <Strip0>
        <Label>MOTU Input</Label>
        <Device>wdm:In 1-2 (MOTU M Series)</Device>
        <A1>0</A1>
        <A2>0</A2>
        <A3>0</A3>
        <B1>1</B1>
        <B2>0</B2>
        <B3>0</B3>
        <Mono>0</Mono>
        <Solo>0</Solo>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Strip0>

    <Strip1>
        <Label>Ripsaw Mic</Label>
        <Device>wdm:Microphone (Razer Ripsaw HD HDMI)</Device>
        <A1>1</A1>
        <A2>0</A2>
        <A3>1</A3>
        <B1>1</B1>
        <B2>0</B2>
        <B3>0</B3>
        <Mono>0</Mono>
        <Solo>0</Solo>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Strip1>

    <Strip2>
        <Label>Unused</Label>
        <Device></Device>
        <A1>0</A1>
        <A2>0</A2>
        <A3>0</A3>
        <B1>0</B1>
        <B2>0</B2>
        <B3>0</B3>
        <Mono>0</Mono>
        <Solo>0</Solo>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Strip2>

    <!-- Virtual Input Strips -->
    <Strip3>
        <Label>PC Audio</Label>
        <A1>1</A1>
        <A2>0</A2>
        <A3>0</A3>
        <B1>1</B1>
        <B2>0</B2>
        <B3>0</B3>
        <Mono>0</Mono>
        <Solo>0</Solo>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Strip3>

    <Strip4>
        <Label>SoundPad Pro</Label>
        <A1>1</A1>
        <A2>0</A2>
        <A3>1</A3>
        <B1>1</B1>
        <B2>0</B2>
        <B3>0</B3>
        <Mono>0</Mono>
        <Solo>0</Solo>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Strip4>

    <!-- Output Buses -->
    <Bus0>
        <Label>Headphones</Label>
        <Device></Device>
        <Mono>0</Mono>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Bus0>

    <Bus1>
        <Label>MOTU Out</Label>
        <Device>wdm:Out 3-4 (MOTU M Series)</Device>
        <Mono>0</Mono>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Bus1>

    <Bus2>
        <Label>Discord</Label>
        <Device>wdm:CABLE Input (VB-Audio Virtual Cable)</Device>
        <Mono>0</Mono>
        <Mute>0</Mute>
        <Gain>0.0</Gain>
    </Bus2>
</VoicemeeterBanana>
"@

$vmConfigPath = "$env:USERPROFILE\Documents\VoiceMeeter\SoundPadProConfig.xml"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\Documents\VoiceMeeter" | Out-Null
Set-Content -Path $vmConfigPath -Value $vmConfig -Encoding UTF8
Write-Host "✓ Configuration file created at: $vmConfigPath" -ForegroundColor Green

Write-Host ""
Write-Host "[5/6] Starting VoiceMeeter Banana and applying configuration..." -ForegroundColor Yellow

# Start VoiceMeeter Banana
Start-Process -FilePath $vmBananaPath
Start-Sleep -Seconds 3
Write-Host "✓ VoiceMeeter Banana started!" -ForegroundColor Green

Write-Host ""
Write-Host "[6/6] Applying configuration via API..." -ForegroundColor Yellow

# Apply configuration using VoiceMeeter Remote API
$vmDll = "$vmInstallPath\VoicemeeterRemote64.dll"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class VoiceMeeterAPI {
    [DllImport("$vmDll", EntryPoint = "VBVMR_Login")]
    public static extern int Login();

    [DllImport("$vmDll", EntryPoint = "VBVMR_Logout")]
    public static extern int Logout();

    [DllImport("$vmDll", EntryPoint = "VBVMR_SetParameterFloat", CharSet = CharSet.Ansi)]
    public static extern int SetParameterFloat(string parameter, float value);

    [DllImport("$vmDll", EntryPoint = "VBVMR_SetParameterStringA", CharSet = CharSet.Ansi)]
    public static extern int SetParameterString(string parameter, string value);
}
"@

try {
    # Login to VoiceMeeter API
    $result = [VoiceMeeterAPI]::Login()
    if ($result -eq 0) {
        Write-Host "  ✓ Connected to VoiceMeeter API" -ForegroundColor Green

        # Configure Strip 0 (MOTU)
        [VoiceMeeterAPI]::SetParameterString("Strip[0].Label", "MOTU Input")
        [VoiceMeeterAPI]::SetParameterFloat("Strip[0].B1", 1.0)

        # Configure Strip 1 (Ripsaw Mic)
        [VoiceMeeterAPI]::SetParameterString("Strip[1].Label", "Ripsaw Mic")
        [VoiceMeeterAPI]::SetParameterFloat("Strip[1].A1", 1.0)
        [VoiceMeeterAPI]::SetParameterFloat("Strip[1].A3", 1.0)
        [VoiceMeeterAPI]::SetParameterFloat("Strip[1].B1", 1.0)

        # Configure Strip 3 (PC Audio - VAIO)
        [VoiceMeeterAPI]::SetParameterString("Strip[3].Label", "PC Audio")
        [VoiceMeeterAPI]::SetParameterFloat("Strip[3].A1", 1.0)
        [VoiceMeeterAPI]::SetParameterFloat("Strip[3].B1", 1.0)

        # Configure Strip 4 (SoundPad Pro - VAIO3)
        [VoiceMeeterAPI]::SetParameterString("Strip[4].Label", "SoundPad Pro")
        [VoiceMeeterAPI]::SetParameterFloat("Strip[4].A1", 1.0)
        [VoiceMeeterAPI]::SetParameterFloat("Strip[4].A3", 1.0)
        [VoiceMeeterAPI]::SetParameterFloat("Strip[4].B1", 1.0)

        # Configure Bus Labels
        [VoiceMeeterAPI]::SetParameterString("Bus[0].Label", "Headphones")
        [VoiceMeeterAPI]::SetParameterString("Bus[1].Label", "MOTU Out")
        [VoiceMeeterAPI]::SetParameterString("Bus[2].Label", "Discord")

        Write-Host "  ✓ Configuration applied successfully!" -ForegroundColor Green

        # Logout
        [VoiceMeeterAPI]::Logout()
    } else {
        Write-Host "  ⚠ Could not connect to VoiceMeeter API (code: $result)" -ForegroundColor Yellow
        Write-Host "  Please configure manually using the VoiceMeeter Banana interface" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠ API configuration failed: $_" -ForegroundColor Yellow
    Write-Host "  Please configure manually using the VoiceMeeter Banana interface" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. In VoiceMeeter Banana, set your devices in the top dropdowns:" -ForegroundColor White
Write-Host "   - Hardware Input 1: MOTU M Series" -ForegroundColor Gray
Write-Host "   - Hardware Input 2: Razer Ripsaw Mic" -ForegroundColor Gray
Write-Host "   - Hardware Out A1: Your Headphones/Speakers" -ForegroundColor Gray
Write-Host "   - Hardware Out A2: MOTU M Series Out 3-4" -ForegroundColor Gray
Write-Host "   - Hardware Out A3: CABLE Input" -ForegroundColor Gray
Write-Host ""
Write-Host "2. In Discord Settings -> Voice & Video:" -ForegroundColor White
Write-Host "   - Input Device: CABLE Output" -ForegroundColor Gray
Write-Host "   - Output Device: Your Headphones" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Run the SoundPad Pro app - it will auto-route to VoiceMeeter!" -ForegroundColor White
Write-Host ""
Write-Host "4. Toggle SoundPad Pro to Discord:" -ForegroundColor White
Write-Host "   - Click 'A3' button on Strip 4 in VoiceMeeter" -ForegroundColor Gray
Write-Host ""
Write-Host "VoiceMeeter config saved to: $vmConfigPath" -ForegroundColor Cyan
Write-Host ""

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Read-Host "Press Enter to exit"

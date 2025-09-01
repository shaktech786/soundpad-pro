# SoundPad Pro PowerShell Uninstaller
# Run with: PowerShell -ExecutionPolicy Bypass -File uninstall-soundpad.ps1

param(
    [switch]$Silent = $false,
    [switch]$KeepSettings = $false
)

# Check for Administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    
    if (-not $Silent) {
        Read-Host "Press Enter to exit"
    }
    exit 1
}

# Application details
$AppName = "SoundPad Pro"
$AppGUID = "{a8c4e9d5-7b3f-4e8a-9c2d-1f6e8b9a7c5d}"
$ProcessName = "SoundPad Pro"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    SoundPad Pro Complete Uninstaller    " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

if (-not $Silent) {
    Write-Host "This will completely remove SoundPad Pro from your system including:" -ForegroundColor Yellow
    Write-Host "  • Application files"
    Write-Host "  • Registry entries"
    Write-Host "  • Start Menu shortcuts"
    Write-Host "  • Desktop shortcuts"
    Write-Host ""
    
    $confirm = Read-Host "Do you want to continue? (Y/N)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host "Uninstall cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "[1/7] Stopping running processes..." -ForegroundColor Green

# Stop all running instances
$processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
if ($processes) {
    foreach ($proc in $processes) {
        try {
            $proc | Stop-Process -Force
            Write-Host "  ✓ Stopped process: $($proc.Id)" -ForegroundColor Gray
        }
        catch {
            Write-Host "  ⚠ Could not stop process: $($proc.Id)" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "  • No running processes found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[2/7] Removing application files..." -ForegroundColor Green

$installPaths = @(
    "$env:LOCALAPPDATA\Programs\soundpad-pro",
    "$env:PROGRAMFILES\SoundPad Pro",
    "${env:PROGRAMFILES(x86)}\SoundPad Pro",
    "$env:LOCALAPPDATA\soundpad-pro"
)

$removed = 0
foreach ($path in $installPaths) {
    if (Test-Path $path) {
        try {
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "  ✓ Removed: $path" -ForegroundColor Gray
            $removed++
        }
        catch {
            Write-Host "  ⚠ Could not fully remove: $path" -ForegroundColor Yellow
            Write-Host "    Error: $_" -ForegroundColor DarkYellow
            
            # Try to schedule deletion on reboot
            try {
                $null = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
                    'SYSTEM\CurrentControlSet\Control\Session Manager',
                    $true
                ).SetValue('PendingFileRenameOperations', 
                    (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue).PendingFileRenameOperations + @("\??\$path", $null),
                    [Microsoft.Win32.RegistryValueKind]::MultiString
                )
                Write-Host "    → Scheduled for deletion on next reboot" -ForegroundColor DarkGray
            }
            catch {
                Write-Host "    → Manual removal may be required" -ForegroundColor DarkGray
            }
        }
    }
}

if ($removed -eq 0) {
    Write-Host "  • No installation directories found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[3/7] Cleaning user data..." -ForegroundColor Green

if (-not $KeepSettings -and -not $Silent) {
    $keepData = Read-Host "Do you want to keep your sound mappings and settings? (Y/N)"
    if ($keepData -eq 'Y' -or $keepData -eq 'y') {
        $KeepSettings = $true
    }
}

if ($KeepSettings) {
    Write-Host "  • Settings preserved for future use" -ForegroundColor Gray
} else {
    $userDataPaths = @(
        "$env:APPDATA\soundpad-pro",
        "$env:LOCALAPPDATA\soundpad-pro"
    )
    
    foreach ($path in $userDataPaths) {
        if (Test-Path $path) {
            try {
                Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
                Write-Host "  ✓ Removed user data: $path" -ForegroundColor Gray
            }
            catch {
                Write-Host "  ⚠ Could not remove: $path" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host ""
Write-Host "[4/7] Removing Start Menu shortcuts..." -ForegroundColor Green

$startMenuPaths = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\SoundPad Pro",
    "$env:PROGRAMDATA\Microsoft\Windows\Start Menu\Programs\SoundPad Pro"
)

$shortcutsRemoved = 0
foreach ($path in $startMenuPaths) {
    if (Test-Path $path) {
        try {
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "  ✓ Removed Start Menu folder: $path" -ForegroundColor Gray
            $shortcutsRemoved++
        }
        catch {
            Write-Host "  ⚠ Could not remove: $path" -ForegroundColor Yellow
        }
    }
}

if ($shortcutsRemoved -eq 0) {
    Write-Host "  • No Start Menu shortcuts found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[5/7] Removing Desktop shortcuts..." -ForegroundColor Green

$desktopPaths = @(
    "$env:USERPROFILE\Desktop\SoundPad Pro.lnk",
    "$env:PUBLIC\Desktop\SoundPad Pro.lnk"
)

$desktopRemoved = 0
foreach ($path in $desktopPaths) {
    if (Test-Path $path) {
        try {
            Remove-Item -Path $path -Force -ErrorAction Stop
            Write-Host "  ✓ Removed desktop shortcut: $path" -ForegroundColor Gray
            $desktopRemoved++
        }
        catch {
            Write-Host "  ⚠ Could not remove: $path" -ForegroundColor Yellow
        }
    }
}

if ($desktopRemoved -eq 0) {
    Write-Host "  • No Desktop shortcuts found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[6/7] Cleaning registry entries..." -ForegroundColor Green

# Registry paths to clean
$registryPaths = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppGUID",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppGUID",
    "HKCU:\Software\soundpad-pro",
    "HKLM:\Software\SoundPad Pro",
    "HKCU:\Software\Classes\.spp",
    "HKCU:\Software\Classes\SoundPadPro.Pack"
)

foreach ($regPath in $registryPaths) {
    if (Test-Path $regPath) {
        try {
            Remove-Item -Path $regPath -Recurse -Force -ErrorAction Stop
            Write-Host "  ✓ Removed registry key: $regPath" -ForegroundColor Gray
        }
        catch {
            Write-Host "  ⚠ Could not remove registry key: $regPath" -ForegroundColor Yellow
        }
    }
}

# Clean up any Run entries
try {
    $runKey = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -ErrorAction SilentlyContinue
    if ($runKey."SoundPad Pro") {
        Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "SoundPad Pro" -Force
        Write-Host "  ✓ Removed startup entry" -ForegroundColor Gray
    }
}
catch {
    # Ignore if not found
}

Write-Host ""
Write-Host "[7/7] Final cleanup..." -ForegroundColor Green

# Clear temporary files
$tempFiles = Get-ChildItem -Path $env:TEMP -Filter "soundpad-pro*" -ErrorAction SilentlyContinue
if ($tempFiles) {
    foreach ($file in $tempFiles) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction Stop
        }
        catch {
            # Ignore temp file errors
        }
    }
    Write-Host "  ✓ Temporary files cleaned" -ForegroundColor Gray
}

# Refresh icon cache
try {
    ie4uinit.exe -show | Out-Null
    Write-Host "  ✓ Icon cache refreshed" -ForegroundColor Gray
}
catch {
    # Ignore if command fails
}

# Clear thumbnail cache
try {
    Remove-Item -Path "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache_*.db" -Force -ErrorAction SilentlyContinue
}
catch {
    # Ignore thumbnail cache errors
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "       Uninstall Complete!               " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "SoundPad Pro has been successfully removed from your system." -ForegroundColor Cyan

# Check if reboot is recommended
$pendingRenames = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
if ($pendingRenames) {
    Write-Host ""
    Write-Host "⚠ Some files are scheduled for deletion on next reboot." -ForegroundColor Yellow
    Write-Host "  A restart is recommended to complete the cleanup." -ForegroundColor Yellow
}

Write-Host ""

if (-not $Silent) {
    Read-Host "Press Enter to exit"
}
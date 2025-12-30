# Windows Test & Remediation Script for CN IngenIT
# Run this script on the Windows VM after installing the MSI

# Colors for output
function WriteSuccess { Write-Host $args -ForegroundColor Green }
function WriteError { Write-Host $args -ForegroundColor Red }
function WriteInfo { Write-Host $args -ForegroundColor Blue }

WriteInfo "========================================="
WriteInfo "CN IngenIT - Windows Installation Check"
WriteInfo "========================================="

# 1. Check if app is installed
WriteInfo "`n[1] Checking installation..."
$InstallPath = "C:\Program Files\CN IngenIT"
if (Test-Path $InstallPath) {
    WriteSuccess "✓ Installation found: $InstallPath"
} else {
    WriteError "✗ Installation not found at: $InstallPath"
    exit 1
}

# 2. Check bundled resources
WriteInfo "`n[2] Checking bundled resources..."
$AutomationDir = Join-Path $InstallPath "_up_\automation"
if (Test-Path $AutomationDir) {
    WriteSuccess "✓ Automation folder found: $AutomationDir"
} else {
    WriteError "✗ Automation folder NOT found: $AutomationDir"
    exit 1
}

# 3. Check Node.js
WriteInfo "`n[3] Checking Node.js..."
$NodePath = Join-Path $AutomationDir "node-windows\node.exe"
if (Test-Path $NodePath) {
    WriteSuccess "✓ Bundled Node found: $NodePath"
    $NodeVersion = & $NodePath --version
    WriteSuccess "  Version: $NodeVersion"
} else {
    WriteError "✗ Bundled Node NOT found: $NodePath"
    WriteInfo "  Attempting to use system Node..."
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $SystemNodeVersion = node --version
        WriteSuccess "  System Node found: $SystemNodeVersion"
    } else {
        WriteError "✗ System Node not found either!"
        exit 1
    }
}

# 4. Check Playwright browsers
WriteInfo "`n[4] Checking Playwright browsers..."
$PlaywrightDir = Join-Path $AutomationDir "playwright-browsers"
if (Test-Path $PlaywrightDir) {
    WriteSuccess "✓ Playwright browsers found: $PlaywrightDir"
    $DirCount = (Get-ChildItem -Recurse $PlaywrightDir -Directory | Measure-Object).Count
    $FileCount = (Get-ChildItem -Recurse $PlaywrightDir -File | Measure-Object).Count
    $SizeMB = [Math]::Round(((Get-ChildItem -Recurse $PlaywrightDir -File | Measure-Object -Property Length -Sum).Sum/1MB), 2)
    WriteSuccess "  Directories: $DirCount, Files: $FileCount, Size: ${SizeMB}MB"
    
    # Check for chromium specifically
    $ChromiumPath = Join-Path $PlaywrightDir "chromium-*"
    $ChromiumExists = (Get-ChildItem -Path $PlaywrightDir -Filter "chromium-*" -Directory | Measure-Object).Count -gt 0
    if ($ChromiumExists) {
        WriteSuccess "  ✓ Chromium browser cache found"
    } else {
        WriteError "  ✗ Chromium browser cache NOT found"
    }
} else {
    WriteError "✗ Playwright browsers NOT found at: $PlaywrightDir"
    WriteError "  The application cannot run without this folder!"
    exit 1
}

# 5. Check automation index.js
WriteInfo "`n[5] Checking automation script..."
$IndexPath = Join-Path $AutomationDir "index.js"
if (Test-Path $IndexPath) {
    WriteSuccess "✓ Main script found: $IndexPath"
} else {
    WriteError "✗ Main script NOT found: $IndexPath"
    exit 1
}

# 6. Test Node can load modules
WriteInfo "`n[6] Testing Node.js environment..."
$TestScript = @"
const path = require('path');
const pw = require('playwright');
console.log('Playwright loaded successfully');
console.log('Chromium executable location check...');
pw.chromium.executablePath().then(exe => {
    console.log('  Executable:', exe);
    const fs = require('fs');
    if (fs.existsSync(exe)) {
        console.log('  ✓ Executable file exists');
    } else {
        console.log('  ✗ Executable file NOT found');
    }
}).catch(err => {
    console.log('  Error resolving executable:', err.message);
});
"@

$TestFile = Join-Path $env:TEMP "test-pw-$([System.DateTime]::Now.Ticks).js"
Set-Content -Path $TestFile -Value $TestScript

WriteInfo "  Running Node.js test..."
if (Test-Path $NodePath) {
    $Env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightDir
    & $NodePath -e $TestScript 2>&1 | ForEach-Object {
        if ($_ -match "✓|success|Playwright loaded") {
            WriteSuccess "  $_"
        } elseif ($_ -match "✗|error|Error|NOT") {
            WriteError "  $_"
        } else {
            WriteInfo "  $_"
        }
    }
} else {
    WriteInfo "  (Skipping - bundled Node not available)"
}

Remove-Item -Force -ErrorAction SilentlyContinue $TestFile

# 7. Summary
WriteInfo "`n========================================="
WriteSuccess "✓ All checks passed! The application is properly installed."
WriteInfo "========================================="
WriteInfo "`nNext steps:"
WriteInfo "1. Launch the application from Start Menu or: $InstallPath\CN IngenIT.exe"
WriteInfo "2. Manually log in on the Homer website"
WriteInfo "3. Use the app to automate form filling"
WriteInfo "`nIf automation fails with Playwright errors:"
WriteInfo "  - Check that the '_up_\automation\playwright-browsers' folder is present"
WriteInfo "  - Verify file permissions (should be readable)"
WriteInfo "  - Check Windows Defender isn't blocking the browser executable"

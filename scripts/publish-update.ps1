# Sends the current app code to every installed preview app (Expo Updates) — no reinstall needed.
# The phone downloads it the next time the app opens and uses it from the launch after that.
#
#   powershell -ExecutionPolicy Bypass -File scripts\publish-update.ps1 -Message "Simpler Home"
#
# Only JavaScript / screens / text changes travel this way. A new native library (or a change to app.json's
# native settings) needs a new build: scripts\build-android.ps1.
# Asks once for your Expo access token (expo.dev/settings/access-tokens), kept only in this window.

param([string]$Message = 'Muntej update', [ValidateSet('preview', 'production')][string]$Channel = 'preview')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NODE_OPTIONS = '--use-system-ca'   # trust the company network's certificate

# a real token is long; a placeholder or a failed paste (Ctrl+V in the old console types one character) is not
$env:EXPO_TOKEN = "$env:EXPO_TOKEN".Trim()
while ($env:EXPO_TOKEN.Length -lt 20 -or $env:EXPO_TOKEN -match '\s|your-|PASTE') {
  Write-Host ''
  Write-Host 'Paste your Expo access token and press Enter (it stays hidden).' -ForegroundColor Cyan
  Write-Host 'To paste here: RIGHT-CLICK inside this window (Ctrl+V does not work in this prompt).' -ForegroundColor Yellow
  $secure = Read-Host -AsSecureString
  $env:EXPO_TOKEN = ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))).Trim()
  if ($env:EXPO_TOKEN.Length -lt 20) { Write-Host "That was $($env:EXPO_TOKEN.Length) characters, not a token. Try again." -ForegroundColor Red }
}

Write-Host "Publishing an update to the $Channel app..." -ForegroundColor Cyan
npx -y eas-cli@latest update --channel $Channel --environment $Channel --message $Message --non-interactive

# Builds the Muntej Android app in Expo's cloud (EAS) and prints a link/QR to install it on the phone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1                    # preview: works anywhere
#   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1 -Profile development  # dev client (needs this PC)
#
# preview  = the standalone app: the whole app inside, talks straight to Supabase, gets updates with
#            scripts\publish-update.ps1 (no reinstall). Works on any network, PC off.
# development = loads the code live from this PC (same Wi-Fi + `npx expo start` running).
#
# Asks once for your Expo access token (expo.dev/settings/access-tokens → Create token). Needed because the Expo
# account signs in with Google (no password). The token is only kept in this window.

param([ValidateSet('preview', 'development')][string]$Profile = 'preview')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NODE_OPTIONS = '--use-system-ca'   # trust the company network's certificate (else: "self-signed certificate")

if (-not $env:EXPO_TOKEN) {
  Write-Host ''
  Write-Host 'Paste your Expo access token (it stays hidden) and press Enter:' -ForegroundColor Cyan
  $secure = Read-Host -AsSecureString
  $env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

# The app's public settings (EXPO_PUBLIC_* from .env) aren't in git, so the cloud build gets them from EAS.
# Only EXPO_PUBLIC_* values are sent: they end up inside the app anyway (Supabase URL + publishable key).
if (Test-Path "$root\.env") {
  Write-Host "Sending the app's public settings to Expo ($Profile)..." -ForegroundColor Cyan
  foreach ($line in Get-Content "$root\.env") {
    if ($line -match '^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=\s*(.+?)\s*$') {
      $name = $Matches[1]
      $value = $Matches[2].Trim('"').Trim("'")
      npx -y eas-cli@latest env:create --name $name --value $value --environment $Profile --visibility plaintext --scope project --force --non-interactive | Out-Null
      Write-Host "  $name ok"
    }
  }
}

Write-Host ''
Write-Host "Starting the $Profile build. If it asks a question, answer Y." -ForegroundColor Cyan
npx -y eas-cli@latest build --platform android --profile $Profile

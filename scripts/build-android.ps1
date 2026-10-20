# Builds the Muntej Android development app in Expo's cloud (EAS) and prints a link/QR to install it on the phone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1
#
# Asks once for your Expo access token (expo.dev → avatar → Account settings → Access tokens → Create token).
# Needed because the Expo account signs in with Google (no password). The token is only kept in this window.

$env:NODE_OPTIONS = '--use-system-ca'   # trust the company network's certificate (else: "self-signed certificate")

if (-not $env:EXPO_TOKEN) {
  Write-Host ''
  Write-Host 'Paste your Expo access token (it stays hidden) and press Enter:' -ForegroundColor Cyan
  $secure = Read-Host -AsSecureString
  $env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

Write-Host ''
Write-Host 'Starting the build. If it asks "Generate a new Android Keystore?" or about credentials, answer Y.' -ForegroundColor Cyan
npx -y eas-cli@latest build --platform android --profile development

# Intercom support chat (Saree3 → "Talk to the Muntej team"): saves the keys where they belong, typed hidden.
#   - Android / iOS API keys (Intercom > Settings > Installation > Android / iOS): EAS build env, so the next app build
#     includes Intercom's Messenger (app.config.js reads them)
#   - Identity verification secret (Intercom > Settings > Security / Messenger): Supabase secret only, used by
#     supabase/functions/support-identity so nobody can pose as someone else in support
#   powershell -ExecutionPolicy Bypass -File scripts\set-intercom-keys.ps1
# Needs SUPABASE_ACCESS_TOKEN (user env var) and an Expo token (asked, kept only in this window).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NODE_OPTIONS = '--use-system-ca'
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

function Hidden($label) {
  Write-Host "   $label (it stays hidden; RIGHT-CLICK to paste):" -ForegroundColor Cyan
  $s = Read-Host -AsSecureString
  return ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))).Trim()
}

Write-Host ''
Write-Host 'Intercom > Settings > Installation' -ForegroundColor Cyan
$android = Hidden 'Android API key'
$ios = Hidden 'iOS API key (Enter to skip)'
Write-Host 'Intercom > Settings > Security (Messenger identity verification)' -ForegroundColor Cyan
$secret = Hidden 'Identity verification secret'
if ($android.Length -lt 10 -or $secret.Length -lt 10) {
  Write-Host '   Something is missing. Nothing saved.' -ForegroundColor Red
  exit 1
}

# 1. the identity secret: Supabase only
$body = ConvertTo-Json -Compress @(@{ name = 'INTERCOM_IDENTITY_SECRET'; value = $secret })
Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body | Out-Null
Write-Host '   Saved the identity secret in Supabase.' -ForegroundColor Green

# 2. the mobile keys: EAS build env (preview + production)
$env:EXPO_TOKEN = "$env:EXPO_TOKEN".Trim()
while ($env:EXPO_TOKEN.Length -lt 20) { $env:EXPO_TOKEN = Hidden 'Expo access token' }
foreach ($k in @(@{ n = 'INTERCOM_ANDROID_KEY'; v = $android }, @{ n = 'INTERCOM_IOS_KEY'; v = $ios })) {
  if (-not $k.v) { continue }
  npx -y eas-cli@latest env:create --name $k.n --value $k.v --environment preview --environment production --visibility sensitive --force --non-interactive | Out-Null
  Write-Host "   Saved $($k.n) for app builds." -ForegroundColor Green
}
Remove-Variable android, ios, secret
Write-Host ''
Write-Host 'Done. Next: build the app once (scripts\build-android.ps1) and install it: support chat comes with that build.' -ForegroundColor Cyan

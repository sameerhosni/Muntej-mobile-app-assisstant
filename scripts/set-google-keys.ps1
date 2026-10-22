# Saves the Google OAuth client (Google Cloud) as Supabase Edge Function secrets, so people can connect Gmail and
# Google Calendar on the Sources screen. The client secret is typed hidden and never printed.
#   powershell -ExecutionPolicy Bypass -File scripts\set-google-keys.ps1
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts/set-supabase-secrets.ps1).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

Write-Host ''
Write-Host 'Google OAuth client (Google Cloud console > APIs & Services > Credentials > your OAuth 2.0 Client ID)' -ForegroundColor Cyan
$client = (Read-Host '   Client ID (ends with .apps.googleusercontent.com)').Trim()
Write-Host '   Client secret (it stays hidden):' -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if (-not $client.EndsWith('.apps.googleusercontent.com') -or $secret.Length -lt 10) {
  Write-Host '   Something is missing or not a Google client ID. Nothing saved.' -ForegroundColor Red
  exit 1
}

$body = ConvertTo-Json -Compress @(
  @{ name = 'GOOGLE_CLIENT_ID'; value = $client },
  @{ name = 'GOOGLE_CLIENT_SECRET'; value = $secret }
)
$r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
Remove-Variable secret, secure
Write-Host "   Saved (status $($r.StatusCode)). Gmail + Google Calendar can now be connected on the Sources screen. Go back to Claude and type: done" -ForegroundColor Green

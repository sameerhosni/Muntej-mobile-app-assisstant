# "The Muntej team replied" pushes: saves the Intercom developer app's Client secret (typed hidden) as the Supabase
# secret INTERCOM_CLIENT_SECRET, which supabase/functions/intercom-webhook uses to check that a call really comes from
# Intercom. Get it in Intercom > Settings > Integrations > Developer Hub > your app > Basic information > Client secret.
#   powershell -ExecutionPolicy Bypass -File scripts\set-intercom-webhook-secret.ps1
# Needs SUPABASE_ACCESS_TOKEN (user env var).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

Write-Host ''
Write-Host 'Intercom > Developer Hub > your app > Basic information > Client secret' -ForegroundColor Cyan
Write-Host '   Client secret (it stays hidden; RIGHT-CLICK to paste):' -ForegroundColor Cyan
$s = Read-Host -AsSecureString
$secret = ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))).Trim()
if ($secret.Length -lt 10) {
  Write-Host '   That looks too short. Nothing saved.' -ForegroundColor Red
  exit 1
}
$body = ConvertTo-Json -Compress @(@{ name = 'INTERCOM_CLIENT_SECRET'; value = $secret })
Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body | Out-Null
Write-Host '   Saved. Replies from the team now reach people as a push from Saree3.' -ForegroundColor Green

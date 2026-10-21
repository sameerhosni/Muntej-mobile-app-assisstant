# TEMPORARY: turns on the shared sign-in code (123456) for every existing Muntej person until a date, while sign-in
# emails can't reach everyone. Anyone who knows a colleague's email can then sign in as them — use only while needed.
#   powershell -ExecutionPolicy Bypass -File scripts\enable-quick-login.ps1             # on for 30 days
#   powershell -ExecutionPolicy Bypass -File scripts\enable-quick-login.ps1 -Off        # off now
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts/set-supabase-secrets.ps1).

param([switch]$Off, [int]$Days = 30, [string]$Code = '123456')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }
$headers = @{ Authorization = "Bearer $token" }

if ($Off) {
  $body = ConvertTo-Json -Compress @('QUICK_LOGIN_CODE', 'QUICK_LOGIN_UNTIL')
  Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "https://api.supabase.com/v1/projects/$ref/secrets" -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
  Write-Host 'Shared sign-in code is OFF. Everyone needs the code from their email again.' -ForegroundColor Green
  exit 0
}

$until = (Get-Date).ToUniversalTime().AddDays($Days).ToString('yyyy-MM-ddTHH:mm:ssZ')
Write-Host ''
Write-Host "This lets ANY existing Muntej person sign in with the code $Code until $until (UTC)." -ForegroundColor Yellow
Write-Host 'Anyone who knows a colleague''s email could sign in as them. Every use is logged.' -ForegroundColor Yellow
$ok = Read-Host 'Type YES to turn it on'
if ($ok -ne 'YES') { Write-Host 'Nothing changed.'; exit 1 }

$body = ConvertTo-Json -Compress @(@{ name = 'QUICK_LOGIN_CODE'; value = $Code }, @{ name = 'QUICK_LOGIN_UNTIL'; value = $until })
Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" -Headers $headers -ContentType 'application/json' -Body $body | Out-Null

$env:SUPABASE_ACCESS_TOKEN = $token
$env:NODE_OPTIONS = '--use-system-ca'
npx supabase functions deploy quick-login --project-ref $ref --use-api
Write-Host "Shared sign-in code is ON until $until. Turn it off early with: -Off" -ForegroundColor Green

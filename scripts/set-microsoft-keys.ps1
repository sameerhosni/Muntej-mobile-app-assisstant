# Saves the Microsoft 365 app registration (Azure) as Supabase Edge Function secrets, so people can connect
# Outlook / Teams / Calendar on the Sources screen. The client secret is typed hidden and never printed.
#   powershell -ExecutionPolicy Bypass -File scripts\set-microsoft-keys.ps1
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts/set-supabase-secrets.ps1).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

Write-Host ''
Write-Host 'Microsoft 365 app registration (Azure portal > Microsoft Entra ID > App registrations > your app > Overview)' -ForegroundColor Cyan
$tenant = (Read-Host '   Directory (tenant) ID').Trim()
$client = (Read-Host '   Application (client) ID').Trim()
Write-Host '   Client secret VALUE (Certificates & secrets > the Value column; it stays hidden):' -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if (-not $tenant -or -not $client -or $secret.Length -lt 10) {
  Write-Host '   Something is missing. Nothing saved.' -ForegroundColor Red
  exit 1
}

$body = ConvertTo-Json -Compress @(
  @{ name = 'MS_TENANT'; value = $tenant },
  @{ name = 'MS_CLIENT_ID'; value = $client },
  @{ name = 'MS_CLIENT_SECRET'; value = $secret }
)
$r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
Remove-Variable secret, secure
Write-Host "   Saved (status $($r.StatusCode)). Microsoft 365 can now be connected on the Sources screen. Go back to Claude and type: done" -ForegroundColor Green

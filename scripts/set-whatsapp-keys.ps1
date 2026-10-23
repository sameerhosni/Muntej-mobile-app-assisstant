# Saves Muntej's WhatsApp Business (Meta Cloud API) keys as Supabase Edge Function secrets, so voice notes and
# messages sent to Muntej's WhatsApp number become tasks. Secrets are typed hidden and never printed.
# It also makes the webhook "verify token" and prints it once: paste it into Meta (WhatsApp → Configuration).
#   powershell -ExecutionPolicy Bypass -File scripts\set-whatsapp-keys.ps1
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts/set-supabase-secrets.ps1).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ref = (Get-Content (Join-Path $root 'supabase\.temp\project-ref') -Raw).Trim()
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

function Hidden($label) {
  Write-Host "   $label (it stays hidden):" -ForegroundColor Cyan
  $s = Read-Host -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

Write-Host ''
Write-Host 'Meta for Developers > your app > WhatsApp > API Setup' -ForegroundColor Cyan
$phoneId = (Read-Host '   Phone number ID').Trim()
$number = (Read-Host '   The WhatsApp number itself, with country code (e.g. 966115209855)').Trim() -replace '\D', ''
$access = Hidden 'Permanent access token (System user token with whatsapp_business_messaging)'
$appSecret = Hidden 'App secret (App settings > Basic > App secret)'
if (-not $phoneId -or -not $number -or $access.Length -lt 20 -or $appSecret.Length -lt 10) {
  Write-Host '   Something is missing. Nothing saved.' -ForegroundColor Red
  exit 1
}
$verify = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

$body = ConvertTo-Json -Compress @(
  @{ name = 'WHATSAPP_PHONE_ID'; value = $phoneId },
  @{ name = 'WHATSAPP_NUMBER'; value = $number },
  @{ name = 'WHATSAPP_TOKEN'; value = $access },
  @{ name = 'WHATSAPP_APP_SECRET'; value = $appSecret },
  @{ name = 'WHATSAPP_VERIFY_TOKEN'; value = $verify }
)
$r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/secrets" `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body
Remove-Variable access, appSecret
Write-Host "   Saved (status $($r.StatusCode))." -ForegroundColor Green
Write-Host ''
Write-Host '   Now in Meta: WhatsApp > Configuration > Webhook > Edit, and paste:' -ForegroundColor Yellow
Write-Host "     Callback URL:  https://$ref.supabase.co/functions/v1/whatsapp"
Write-Host "     Verify token:  $verify"
Write-Host '   Then under Webhook fields, Subscribe to: messages' -ForegroundColor Yellow
Write-Host '   Go back to Claude and type: done' -ForegroundColor Green

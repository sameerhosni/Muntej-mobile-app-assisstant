# Makes Supabase send sign-in codes and invitations from sales@muntej.app through Gmail SMTP, with Muntej's email
# templates (supabase/templates/otp-code.html for codes, invite.html for invitations).
#   powershell -ExecutionPolicy Bypass -File scripts\set-smtp.ps1
#
# Asks for the Gmail APP password of sales@muntej.app (Google account > Security > App passwords). It is typed here,
# hidden, sent straight to Supabase's auth settings and never saved on this PC or in the code.
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts\set-supabase-secrets.ps1).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$ref = (Get-Content "$root\supabase\.temp\project-ref" -Raw).Trim()
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User') }
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

Write-Host ''
Write-Host 'Gmail app password for sales@muntej.app (16 letters, spaces are fine). It stays hidden:' -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$pass = ($pass -replace '\s', '')
if ($pass.Length -lt 16) { Write-Host 'That does not look like a Gmail app password (16 letters). Nothing changed.' -ForegroundColor Red; exit 1 }

$otp = Get-Content "$root\supabase\templates\otp-code.html" -Raw -Encoding UTF8
$invite = Get-Content "$root\supabase\templates\invite.html" -Raw -Encoding UTF8
# the Arabic subjects live in a UTF-8 file: Windows PowerShell misreads non-English text inside a script file
$words = Get-Content "$root\supabase\templates\email-subjects.json" -Raw -Encoding UTF8 | ConvertFrom-Json

$body = @{
  external_email_enabled                = $true
  smtp_host                             = 'smtp.gmail.com'
  smtp_port                             = '587'
  smtp_user                             = 'sales@muntej.app'
  smtp_pass                             = $pass
  smtp_admin_email                      = 'sales@muntej.app'
  smtp_sender_name                      = $words.sender_name
  smtp_max_frequency                    = 30
  rate_limit_email_sent                 = 100
  mailer_otp_length                     = 6
  mailer_subjects_magic_link            = $words.code_subject
  mailer_templates_magic_link_content   = $otp
  mailer_subjects_confirmation          = $words.code_subject
  mailer_templates_confirmation_content = $otp
  mailer_subjects_invite                = $words.invite_subject
  mailer_templates_invite_content       = $invite
} | ConvertTo-Json -Depth 3

$pass = $null
$env:NODE_OPTIONS = '--use-system-ca'
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json; charset=utf-8' }
Invoke-RestMethod -Method Patch -Uri "https://api.supabase.com/v1/projects/$ref/config/auth" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
Write-Host ''
Write-Host 'Done: sign-in codes and invitations now go out from sales@muntej.app.' -ForegroundColor Green
Write-Host 'Go back to Claude and type: done' -ForegroundColor Green

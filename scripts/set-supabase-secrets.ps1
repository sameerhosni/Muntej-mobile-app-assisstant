# Saves your Supabase CLI credentials as Windows user environment variables.
# Run it yourself in PowerShell. Values are read from the clipboard (no pasting into the console),
# never printed, and never written to the project.
#   powershell -ExecutionPolicy Bypass -File scripts\set-supabase-secrets.ps1

Add-Type -AssemblyName System.Windows.Forms

function Read-FromClipboard([string]$what) {
  Read-Host "   Copy the $what (Ctrl+C), then come back here and press Enter" | Out-Null
  $v = [System.Windows.Forms.Clipboard]::GetText()
  if ($null -eq $v) { $v = '' }
  return $v.Trim()
}

Write-Host ""
Write-Host "1) Database password (Supabase > Project Settings > Database)" -ForegroundColor Cyan
$pw = Read-FromClipboard "database password"
if ($pw.Length -lt 6) { Write-Host "   Clipboard text is too short - nothing saved." -ForegroundColor Red; exit 1 }
Write-Host "   Got it ($($pw.Length) characters)." -ForegroundColor Green

Write-Host ""
Write-Host "2) Access token (supabase.com/dashboard/account/tokens > Generate new token)" -ForegroundColor Cyan
$tk = Read-FromClipboard "access token (starts with sbp_)"
if (-not $tk.StartsWith('sbp_') -or $tk.Length -lt 30) {
  Write-Host "   Clipboard doesn't hold a token (should start with sbp_ and be ~44 chars). Nothing saved." -ForegroundColor Red
  exit 1
}
Write-Host "   Got it ($($tk.Length) characters)." -ForegroundColor Green

[Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', $pw, 'User')
[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', $tk, 'User')
[System.Windows.Forms.Clipboard]::Clear()
Write-Host ""
Write-Host "Saved (clipboard cleared). Go back to Claude and type: done" -ForegroundColor Green

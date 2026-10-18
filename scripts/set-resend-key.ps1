# Saves your Resend API key as a Windows user environment variable (read from the clipboard, never printed).
#   powershell -ExecutionPolicy Bypass -File scripts\set-resend-key.ps1

Add-Type -AssemblyName System.Windows.Forms

Write-Host ""
Write-Host "Resend API key (resend.com > API Keys > Create API key, permission: Sending access)" -ForegroundColor Cyan
Read-Host "   Copy the key (Ctrl+C), then come back here and press Enter" | Out-Null
$key = [System.Windows.Forms.Clipboard]::GetText()
if ($null -eq $key) { $key = '' }
$key = $key.Trim()

if (-not $key.StartsWith('re_') -or $key.Length -lt 20) {
  Write-Host "   Clipboard doesn't hold a Resend key (should start with re_). Nothing saved." -ForegroundColor Red
  exit 1
}

[Environment]::SetEnvironmentVariable('RESEND_API_KEY', $key, 'User')
[System.Windows.Forms.Clipboard]::Clear()
Write-Host "   Saved ($($key.Length) characters, clipboard cleared). Go back to Claude and type: done" -ForegroundColor Green

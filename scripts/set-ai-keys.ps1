# Saves your Anthropic and OpenAI API keys as Windows user environment variables.
# Keys are read from the clipboard (no pasting into the console), never printed in full, never written to the project.
# Claude then copies them into Supabase Edge Function secrets.
#   powershell -ExecutionPolicy Bypass -File scripts\set-ai-keys.ps1

Add-Type -AssemblyName System.Windows.Forms

function Read-Key([string]$what, [string]$expectedPrefix) {
  Read-Host "   Copy the $what (Ctrl+C), then come back here and press Enter" | Out-Null
  $v = [System.Windows.Forms.Clipboard]::GetText()
  if ($null -eq $v) { $v = '' }
  $v = $v.Trim()
  $peek = if ($v.Length -ge 7) { $v.Substring(0, 7) } else { $v }
  if ($v.Length -lt 30 -or $v -match '\s') {
    Write-Host "   Clipboard has $($v.Length) characters starting with '$peek' - that is not an API key. Nothing saved." -ForegroundColor Red
    exit 1
  }
  if (-not $v.StartsWith($expectedPrefix)) {
    Write-Host "   Note: key starts with '$peek' (expected '$expectedPrefix'). Saving it anyway." -ForegroundColor Yellow
  }
  Write-Host "   Got it ($($v.Length) characters, starts with '$peek')." -ForegroundColor Green
  return $v
}

Write-Host ""
Write-Host "1) Anthropic API key (console.anthropic.com > API Keys)" -ForegroundColor Cyan
$anthropic = Read-Key 'Anthropic key' 'sk-ant-'

Write-Host ""
Write-Host "2) OpenAI API key (platform.openai.com > API keys)" -ForegroundColor Cyan
$openai = Read-Key 'OpenAI key' 'sk-'

[Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', $anthropic, 'User')
[Environment]::SetEnvironmentVariable('OPENAI_API_KEY', $openai, 'User')
[System.Windows.Forms.Clipboard]::Clear()
Write-Host ""
Write-Host "Saved (clipboard cleared). Go back to Claude and type: done" -ForegroundColor Green

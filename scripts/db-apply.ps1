# Applies pending supabase/migrations/*.sql to the cloud project through the Supabase Management API
# (no database password needed). Applied versions are recorded in supabase_migrations.schema_migrations,
# the same table the Supabase CLI uses.
#
#   powershell -ExecutionPolicy Bypass -File scripts\db-apply.ps1            # pending migrations
#   powershell -ExecutionPolicy Bypass -File scripts\db-apply.ps1 -Seed      # + supabase/seed.sql
#   powershell -ExecutionPolicy Bypass -File scripts\db-apply.ps1 -Sql "select 1"
#
# Needs SUPABASE_ACCESS_TOKEN (user env var, see scripts/set-supabase-secrets.ps1).

param(
  [switch]$Seed,
  [string]$Sql,
  [string]$SqlFile,
  [hashtable]$Vars = @{},
  [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $ProjectRef) {
  $refFile = Join-Path $root 'supabase\.temp\project-ref'
  if (Test-Path $refFile) { $ProjectRef = (Get-Content $refFile -Raw).Trim() }
}
if (-not $ProjectRef) { throw 'Project ref not found. Run: npx supabase link --project-ref <ref>' }

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User') }
if (-not $token) { throw 'SUPABASE_ACCESS_TOKEN is not set. Run scripts\set-supabase-secrets.ps1' }

function Invoke-Sql([string]$query) {
  $body = [Text.Encoding]::UTF8.GetBytes((@{ query = $query } | ConvertTo-Json -Compress))
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method Post `
      -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
      -Headers @{ Authorization = "Bearer $token" } `
      -ContentType 'application/json; charset=utf-8' -Body $body
    $text = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    return ($text | ConvertFrom-Json)
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    throw "SQL failed: $msg"
  }
}

function Escape([string]$s) { return $s.Replace("'", "''") }

if ($SqlFile) {
  $Sql = Get-Content $SqlFile -Raw -Encoding UTF8
  foreach ($k in $Vars.Keys) { $Sql = $Sql.Replace(":$k", [string]$Vars[$k]) }
}
if ($Sql) {
  Invoke-Sql $Sql | ConvertTo-Json -Depth 10
  exit 0
}

Invoke-Sql @"
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);
"@ | Out-Null

$applied = @((Invoke-Sql 'select version from supabase_migrations.schema_migrations') | ForEach-Object { $_.version })

$files = Get-ChildItem (Join-Path $root 'supabase\migrations') -Filter '*.sql' | Sort-Object Name
$count = 0
foreach ($f in $files) {
  if ($f.BaseName -notmatch '^(\d+)_(.+)$') { continue }
  $version = $Matches[1]; $name = $Matches[2]
  if ($applied -contains $version) { continue }
  Write-Host "Applying $($f.Name) ..."
  $content = Get-Content $f.FullName -Raw -Encoding UTF8
  # migration + bookkeeping run as one implicit transaction
  Invoke-Sql ($content + "`n;insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$(Escape $name)');") | Out-Null
  $count++
}
Write-Host "Migrations applied: $count (already applied: $($applied.Count))" -ForegroundColor Green

if ($Seed) {
  Write-Host 'Seeding ...'
  Invoke-Sql (Get-Content (Join-Path $root 'supabase\seed.sql') -Raw -Encoding UTF8) | Out-Null
  Write-Host 'Seed applied.' -ForegroundColor Green
}

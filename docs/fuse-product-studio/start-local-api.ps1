$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$values = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $repo '.env')) {
  if ($line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
    $values[$matches[1]] = $matches[2].Trim('"')
  }
}
foreach ($key in $values.Keys) {
  Set-Item -Path "Env:$key" -Value $values[$key]
}
$env:DATABASE_URL = 'postgresql://' + [uri]::EscapeDataString($values.POSTGRES_USER) + ':' + [uri]::EscapeDataString($values.POSTGRES_PASSWORD) + '@127.0.0.1:' + $values.POSTGRES_PORT + '/' + $values.POSTGRES_DB + '?schema=public'
$env:STORAGE_PROVIDER = 'disk'
$env:STORAGE_PUBLIC_URL = 'http://localhost:3001/files'
$env:COOKIE_DOMAIN = 'localhost'
$env:COOKIE_SECURE = 'false'
$env:CORS_ORIGINS = 'http://localhost:3100'
$env:NODE_ENV = 'development'
Set-Location $repo
node portal/apps/api/dist/main.js

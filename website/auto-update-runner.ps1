$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoDir '.tmp\auto-update'
$logFile = Join-Path $logDir 'run.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-RunLog {
  param([string]$Message)

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

Push-Location $scriptDir

try {
  Write-RunLog 'auto-update start'
  & node auto-update.js *>> $logFile
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "node auto-update.js exited with code $exitCode"
  }
  Write-RunLog 'auto-update done'
  exit 0
} catch {
  Write-RunLog ("auto-update failed: " + $_.Exception.Message)
  throw
} finally {
  Pop-Location
}

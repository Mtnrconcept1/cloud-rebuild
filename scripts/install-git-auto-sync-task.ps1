param(
  [string]$RepoPath = "",
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [int]$IntervalMinutes = 5,
  [string]$TaskName = "TOK Cloud Rebuild Git Auto Sync",
  [string]$TaskPath = "\TOK\",
  [string]$LogPath = "",
  [switch]$Uninstall
)

# Usage: powershell -File ./scripts/install-git-auto-sync-task.ps1 -Uninstall

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-RepoPath {
  if ($RepoPath.Trim().Length -gt 0) {
    return (Resolve-Path -LiteralPath $RepoPath).Path
  }

  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Get-InstallRoot {
  return (Join-Path $env:LOCALAPPDATA "TOK\git-auto-sync")
}

$installRoot = Get-InstallRoot
$installedScriptPath = Join-Path $installRoot "git-auto-sync.ps1"

if ($LogPath.Trim().Length -eq 0) {
  $LogPath = Join-Path $installRoot "git-auto-sync.log"
}

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $installedScriptPath -Force -ErrorAction SilentlyContinue
  Write-Host "Removed scheduled task '$TaskPath$TaskName'."
  exit 0
}

if ($IntervalMinutes -lt 1) {
  throw "IntervalMinutes must be at least 1."
}

$resolvedRepoPath = Resolve-RepoPath
$sourceScriptPath = Join-Path $PSScriptRoot "git-auto-sync.ps1"

if (-not (Test-Path -LiteralPath $sourceScriptPath)) {
  throw "Cannot find $sourceScriptPath."
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceScriptPath -Destination $installedScriptPath -Force

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$installedScriptPath`"",
  "-Once",
  "-RepoPath", "`"$resolvedRepoPath`"",
  "-Remote", "`"$Remote`"",
  "-Branch", "`"$Branch`"",
  "-LogPath", "`"$LogPath`""
) -join " "

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $arguments `
  -WorkingDirectory $resolvedRepoPath

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -TaskPath $TaskPath `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Safely fast-forwards the local TOK repository when the configured remote branch changes." `
  -Force | Out-Null

Write-Host "Installed scheduled task '$TaskPath$TaskName'."
Write-Host "Repository : $resolvedRepoPath"
Write-Host "Remote ref : $Remote/$Branch"
Write-Host "Interval   : every $IntervalMinutes minute(s)"
Write-Host "Script     : $installedScriptPath"
Write-Host "Log        : $LogPath"

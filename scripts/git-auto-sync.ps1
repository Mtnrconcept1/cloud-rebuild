param(
  [string]$RepoPath = "",
  [string]$Remote = "origin",
  [string]$Branch = "",
  [int]$IntervalSeconds = 300,
  [string]$LogPath = "",
  [switch]$Loop,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-DefaultRepoPath {
  if ($RepoPath.Trim().Length -gt 0) {
    return (Resolve-Path -LiteralPath $RepoPath).Path
  }

  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Write-SyncLog {
  param(
    [string]$Message,
    [string]$Level = "INFO"
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] [$Level] $Message"
  Write-Host $line

  if ($LogPath.Trim().Length -gt 0) {
    $logDirectory = Split-Path -Parent $LogPath
    if ($logDirectory -and -not (Test-Path -LiteralPath $logDirectory)) {
      New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    Add-Content -LiteralPath $LogPath -Value $line
  }
}

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GitArgs
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & git @GitArgs 2>&1 | ForEach-Object { $_.ToString() }
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $command = "git $($GitArgs -join ' ')"
    throw "$command failed with exit code $exitCode. $($output -join [Environment]::NewLine)"
  }

  return (($output -join [Environment]::NewLine).Trim())
}

function Test-GitAncestor {
  param(
    [string]$Ancestor,
    [string]$Descendant
  )

  & git merge-base --is-ancestor $Ancestor $Descendant 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Invoke-AutoSyncOnce {
  $resolvedRepoPath = Resolve-DefaultRepoPath
  Push-Location -LiteralPath $resolvedRepoPath

  try {
    $root = Invoke-Git rev-parse --show-toplevel
    Write-SyncLog "Checking repository $root"

    $currentBranch = Invoke-Git branch --show-current
    if ($currentBranch.Trim().Length -eq 0) {
      Write-SyncLog "Detached HEAD detected; skipping auto-sync." "WARN"
      return
    }

    if ($Branch.Trim().Length -gt 0 -and $currentBranch -ne $Branch) {
      Write-SyncLog "Current branch '$currentBranch' does not match configured branch '$Branch'; skipping auto-sync." "WARN"
      return
    }

    # Uses: git fetch --prune
    Invoke-Git fetch --prune $Remote | Out-Null

    # Uses: git status --porcelain
    $dirty = Invoke-Git status --porcelain
    if ($dirty.Trim().Length -gt 0) {
      Write-SyncLog "Working tree is not clean; skipping auto-sync." "WARN"
      return
    }

    $upstreamRef = ""
    if ($Branch.Trim().Length -gt 0) {
      $upstreamRef = "$Remote/$Branch"
      Invoke-Git rev-parse --verify $upstreamRef | Out-Null
    } else {
      try {
        $upstreamRef = Invoke-Git rev-parse --abbrev-ref "$currentBranch@{upstream}"
      } catch {
        Write-SyncLog "Branch '$currentBranch' has no upstream; skipping auto-sync." "WARN"
        return
      }
    }

    $localHead = Invoke-Git rev-parse HEAD
    $remoteHead = Invoke-Git rev-parse $upstreamRef

    if ($localHead -eq $remoteHead) {
      Write-SyncLog "Branch '$currentBranch' is already up to date with '$upstreamRef'."
      return
    }

    $localCanFastForward = Test-GitAncestor "HEAD" $upstreamRef
    $remoteIsBehindLocal = Test-GitAncestor $upstreamRef "HEAD"

    if ($localCanFastForward) {
      Write-SyncLog "Remote changed; running git merge --ff-only $upstreamRef."
      Invoke-Git merge --ff-only $upstreamRef | Out-Null
      $newHead = Invoke-Git rev-parse --short HEAD
      Write-SyncLog "Auto-sync completed on '$currentBranch' at $newHead."
      return
    }

    if ($remoteIsBehindLocal) {
      Write-SyncLog "Local branch '$currentBranch' is ahead of '$upstreamRef'; skipping auto-sync." "WARN"
      return
    }

    Write-SyncLog "Local branch '$currentBranch' and '$upstreamRef' branch has diverged; skipping auto-sync." "ERROR"
  } finally {
    Pop-Location
  }
}

if ($IntervalSeconds -lt 30) {
  throw "IntervalSeconds must be at least 30 to avoid hammering the remote."
}

if (-not $Loop -and -not $Once) {
  $Once = $true
}

do {
  try {
    Invoke-AutoSyncOnce
  } catch {
    Write-SyncLog $_.Exception.Message "ERROR"
    if (-not $Loop) {
      exit 1
    }
  }

  if ($Loop) {
    Start-Sleep -Seconds $IntervalSeconds
  }
} while ($Loop)

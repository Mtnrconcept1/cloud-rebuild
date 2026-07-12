[CmdletBinding()]
param(
  [switch]$Foreground,
  [string]$NodePath = "",
  [ValidateRange(10, 600)]
  [int]$ReadyTimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkerDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvironmentFile = Join-Path $WorkerDirectory ".env"
$EntryPoint = Join-Path $WorkerDirectory "index.js"
$LogDirectory = Join-Path $env:LOCALAPPDATA "TOK\image-ai-worker"
$StandardOutputLog = Join-Path $LogDirectory "worker.stdout.log"
$StandardErrorLog = Join-Path $LogDirectory "worker.stderr.log"
$PidFile = Join-Path $LogDirectory "worker.pid"

function Get-EnvironmentValue([string]$Name, [string]$Fallback) {
  $pattern = "^\s*" + [regex]::Escape($Name) + "=(.*)$"
  foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
    if ($line -match $pattern) {
      return $Matches[1].Trim()
    }
  }
  return $Fallback
}

function Get-WorkerHealth([string]$Url) {
  try {
    return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 3
  }
  catch {
    return $null
  }
}

function Test-TokHealth([object]$Health) {
  return $null -ne $Health `
    -and $null -ne $Health.PSObject.Properties["ready"] `
    -and $null -ne $Health.PSObject.Properties["supabase"] `
    -and $null -ne $Health.PSObject.Properties["ollama"] `
    -and $null -ne $Health.PSObject.Properties["started_at"]
}

function Test-OllamaModels([string]$Url, [string[]]$ExpectedModels) {
  try {
    $payload = Invoke-RestMethod -Method Get -Uri "$Url/api/tags" -TimeoutSec 5
    $names = @($payload.models | ForEach-Object {
      $nameProperty = $_.PSObject.Properties["name"]
      $modelProperty = $_.PSObject.Properties["model"]
      if ($nameProperty) { [string]$nameProperty.Value }
      elseif ($modelProperty) { [string]$modelProperty.Value }
    })
    foreach ($expected in $ExpectedModels) {
      $present = $false
      foreach ($name in $names) {
        if ($name -eq $expected -or $name.StartsWith("${expected}:")) {
          $present = $true
          break
        }
      }
      if (-not $present) {
        return $false
      }
    }
    return $true
  }
  catch {
    return $false
  }
}

function Rotate-Log([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  $file = Get-Item -LiteralPath $Path
  if ($file.Length -lt 10MB) {
    return
  }
  $archive = "$Path.1"
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $Path -Destination $archive -Force
}

if ($env:OS -ne "Windows_NT") {
  throw "Ce script est exclusivement prévu pour Windows."
}
if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
  throw "Configuration absente : exécute d'abord setup-windows.ps1."
}
if (-not (Test-Path -LiteralPath $EntryPoint)) {
  throw "Worker introuvable : $EntryPoint"
}
if (-not (Test-Path -LiteralPath (Join-Path $WorkerDirectory "node_modules"))) {
  throw "Dépendances absentes : exécute d'abord setup-windows.ps1."
}

$nodeExecutable = $NodePath
if (-not $nodeExecutable) {
  $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
  }
}
if (-not $nodeExecutable -or -not (Test-Path -LiteralPath $nodeExecutable)) {
  throw "Node.js 22 est introuvable."
}

$healthPort = Get-EnvironmentValue "HEALTH_PORT" "8080"
if ($healthPort -notmatch "^\d{1,5}$") {
  throw "HEALTH_PORT est invalide."
}
$healthUrl = "http://127.0.0.1:$healthPort/healthz"
$readyUrl = "http://127.0.0.1:$healthPort/readyz"

$existing = Get-WorkerHealth $healthUrl
if ((Test-TokHealth $existing) -and $existing.ok) {
  $existingDeadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
  do {
    $existingReady = Get-WorkerHealth $readyUrl
    if ((Test-TokHealth $existingReady) -and $existingReady.ready -and $existingReady.supabase -and $existingReady.ollama) {
      Write-Host "Le worker TOK est déjà actif et prêt sur le port $healthPort."
      exit 0
    }
    Start-Sleep -Seconds 3
  } while ([DateTime]::UtcNow -lt $existingDeadline)
  throw "Un worker TOK est actif mais n'est pas prêt. Consulte les logs avant de le relancer."
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
Rotate-Log $StandardOutputLog
Rotate-Log $StandardErrorLog

$ollamaUrl = Get-EnvironmentValue "OLLAMA_URL" "http://127.0.0.1:11434"
$visionModel = Get-EnvironmentValue "OLLAMA_VISION_MODEL" "qwen2.5vl:3b"
$embeddingModel = Get-EnvironmentValue "OLLAMA_EMBEDDING_MODEL" "all-minilm"
$dependencyDeadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
do {
  if (Test-OllamaModels $ollamaUrl @($visionModel, $embeddingModel)) {
    break
  }
  Start-Sleep -Seconds 3
} while ([DateTime]::UtcNow -lt $dependencyDeadline)

if (-not (Test-OllamaModels $ollamaUrl @($visionModel, $embeddingModel))) {
  throw "Ollama ou les modèles $visionModel / $embeddingModel ne sont pas prêts."
}

Push-Location $WorkerDirectory
try {
  & $nodeExecutable check.mjs 1>> $StandardOutputLog 2>> $StandardErrorLog
  if ($LASTEXITCODE -ne 0) {
    throw "Le contrôle Supabase + Ollama a échoué. Consulte $StandardErrorLog."
  }
}
finally {
  Pop-Location
}

if ($Foreground) {
  Push-Location $WorkerDirectory
  try {
    & $nodeExecutable $EntryPoint 1>> $StandardOutputLog 2>> $StandardErrorLog
    exit $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}

$processParameters = @{
  FilePath = $nodeExecutable
  ArgumentList = @("`"$EntryPoint`"")
  WorkingDirectory = $WorkerDirectory
  WindowStyle = "Hidden"
  RedirectStandardOutput = $StandardOutputLog
  RedirectStandardError = $StandardErrorLog
  PassThru = $true
}
$process = Start-Process @processParameters

[IO.File]::WriteAllText($PidFile, "$($process.Id)`n", [Text.UTF8Encoding]::new($false))

$deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
do {
  Start-Sleep -Seconds 2
  if ($process.HasExited) {
    $lastErrors = if (Test-Path -LiteralPath $StandardErrorLog) {
      (Get-Content -LiteralPath $StandardErrorLog -Tail 20) -join [Environment]::NewLine
    }
    else {
      "Aucun log d'erreur disponible."
    }
    throw "Le worker s'est arrêté avec le code $($process.ExitCode).`n$lastErrors"
  }

  $ready = Get-WorkerHealth $readyUrl
  if ((Test-TokHealth $ready) -and $ready.ready -and $ready.supabase -and $ready.ollama) {
    Write-Host "TOK Image AI est prêt (PID $($process.Id))." -ForegroundColor Green
    Write-Host "État : $readyUrl"
    Write-Host "Logs : $LogDirectory"
    exit 0
  }
} while ([DateTime]::UtcNow -lt $deadline)

Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
throw "Le worker n'est pas devenu prêt en $ReadyTimeoutSeconds secondes. Consulte $StandardErrorLog."

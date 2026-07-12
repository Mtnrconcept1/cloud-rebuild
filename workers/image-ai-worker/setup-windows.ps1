[CmdletBinding()]
param(
  [string]$SupabaseUrl = "https://wwcrtyoueexyxkkikaos.supabase.co",
  [string]$OllamaUrl = "http://127.0.0.1:11434",
  [string]$VisionModel = "qwen2.5vl:3b",
  [string]$EmbeddingModel = "all-minilm",
  [ValidateRange(1, 3)]
  [int]$BatchSize = 1,
  [switch]$InstallAutoStart,
  [switch]$NoStart,
  [switch]$ForceEnvironment,
  [switch]$RefreshModels,
  [switch]$RemoveAutoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TaskName = "TOK Image AI Worker"
$WorkerDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvironmentFile = Join-Path $WorkerDirectory ".env"
$RunnerScript = Join-Path $WorkerDirectory "run-windows-worker.ps1"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-RequiredCommand([string]$Name, [string]$InstallHint) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "$Name est requis. $InstallHint"
  }
  return $command
}

function Assert-MinimumVersion(
  [string]$Label,
  [string]$RawVersion,
  [version]$MinimumVersion
) {
  $match = [regex]::Match($RawVersion, "(?<version>\d+\.\d+\.\d+)")
  if (-not $match.Success) {
    Write-Warning "Version de $Label non reconnue : $RawVersion"
    return
  }

  $version = [version]$match.Groups["version"].Value
  if ($version -lt $MinimumVersion) {
    throw "$Label $MinimumVersion ou plus récent est requis (version détectée : $version)."
  }
}

function Get-EnvironmentValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
    return ""
  }

  $pattern = "^\s*" + [regex]::Escape($Name) + "=(.*)$"
  foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
    if ($line -match $pattern) {
      return $Matches[1].Trim()
    }
  }
  return ""
}

function Test-TokHealth([object]$Health) {
  return $null -ne $Health `
    -and $null -ne $Health.PSObject.Properties["ready"] `
    -and $null -ne $Health.PSObject.Properties["supabase"] `
    -and $null -ne $Health.PSObject.Properties["ollama"] `
    -and $null -ne $Health.PSObject.Properties["started_at"]
}

function Read-ServiceRoleKey {
  $secureValue = Read-Host `
    -Prompt "Colle la Secret key Supabase du projet TOK (elle restera invisible)" `
    -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Test-ServiceRoleKey([string]$Key) {
  if ($Key -match "^sb_secret_[A-Za-z0-9_-]{20,}$") {
    return $true
  }
  if ($Key -notmatch "^eyJ" -or $Key -match "\s") {
    return $false
  }

  try {
    $parts = $Key.Split(".")
    if ($parts.Count -ne 3) {
      return $false
    }
    $payload = $parts[1].Replace("-", "+").Replace("_", "/")
    switch ($payload.Length % 4) {
      2 { $payload += "==" }
      3 { $payload += "=" }
      0 { }
      default { return $false }
    }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    return $json.role -eq "service_role"
  }
  catch {
    return $false
  }
}

function Test-OllamaModel([object[]]$Models, [string]$Expected) {
  foreach ($model in $Models) {
    $nameProperty = $model.PSObject.Properties["name"]
    $modelProperty = $model.PSObject.Properties["model"]
    $name = if ($nameProperty) { [string]$nameProperty.Value } elseif ($modelProperty) { [string]$modelProperty.Value } else { "" }
    if ($name -eq $Expected -or $name.StartsWith("${Expected}:")) {
      return $true
    }
  }
  return $false
}

function Protect-SecretFile([string]$Path) {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $localSystem = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
  $acl = [System.Security.AccessControl.FileSecurity]::new()
  $acl.SetOwner($identity.User)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $identity.User,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$acl.AddAccessRule($rule)
  $systemRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $localSystem,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$acl.AddAccessRule($systemRule)
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function Remove-AutoStartTask {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Démarrage automatique supprimé."
  }
  else {
    Write-Host "Aucune tâche de démarrage automatique TOK n'était installée."
  }
}

function Install-AutoStartTask([string]$NodePath) {
  $powerShell = Get-RequiredCommand "powershell.exe" "Active Windows PowerShell."
  Get-RequiredCommand "Register-ScheduledTask" "Le module ScheduledTasks de Windows est requis." | Out-Null

  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$RunnerScript`" -Foreground -NodePath `"$NodePath`""
  $action = New-ScheduledTaskAction -Execute $powerShell.Source -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
  $trigger.Delay = "PT30S"
  $principalParameters = @{
    UserId = $identity.Name
    LogonType = "Interactive"
    RunLevel = "Limited"
  }
  $principal = New-ScheduledTaskPrincipal @principalParameters
  $settingsParameters = @{
    AllowStartIfOnBatteries = $true
    DontStopIfGoingOnBatteries = $true
    StartWhenAvailable = $true
    RestartCount = 20
    RestartInterval = (New-TimeSpan -Minutes 1)
    ExecutionTimeLimit = [TimeSpan]::Zero
    MultipleInstances = "IgnoreNew"
  }
  $settings = New-ScheduledTaskSettingsSet @settingsParameters

  $registrationParameters = @{
    TaskName = $TaskName
    Description = "Analyse locale Ollama des images Actualités TOK"
    Action = $action
    Trigger = $trigger
    Principal = $principal
    Settings = $settings
    Force = $true
  }
  Register-ScheduledTask @registrationParameters | Out-Null

  Write-Host "Démarrage automatique installé pour l'utilisateur $($identity.Name)."
}

if ($env:OS -ne "Windows_NT") {
  throw "Ce script est exclusivement prévu pour Windows."
}

if ($RemoveAutoStart) {
  Remove-AutoStartTask
  exit 0
}

Write-Step "Vérification de Windows, Node.js et Ollama"
$nodeCommand = Get-RequiredCommand "node.exe" "Installe Node.js 22 LTS depuis https://nodejs.org/."
$npmCommand = Get-RequiredCommand "npm.cmd" "Réinstalle Node.js 22 LTS avec npm."
$ollamaCommand = Get-RequiredCommand "ollama.exe" "Installe Ollama depuis https://ollama.com/download/windows."

$nodeVersion = (& $nodeCommand.Source --version | Out-String).Trim()
$ollamaVersion = (& $ollamaCommand.Source --version | Out-String).Trim()
Assert-MinimumVersion "Node.js" $nodeVersion ([version]"22.0.0")
Assert-MinimumVersion "Ollama" $ollamaVersion ([version]"0.7.0")

$supabaseUri = [uri]$SupabaseUrl
if ($supabaseUri.Scheme -ne "https" -or -not $supabaseUri.Host.EndsWith(".supabase.co")) {
  throw "SUPABASE_URL doit être une URL HTTPS Supabase valide."
}

$ollamaUri = [uri]$OllamaUrl
if ($ollamaUri.Scheme -ne "http" -or $ollamaUri.Host -notin @("127.0.0.1", "localhost") -or $ollamaUri.AbsolutePath -ne "/" -or $ollamaUri.Query -or $ollamaUri.Fragment -or $ollamaUri.UserInfo) {
  throw "Ce programme d'installation accepte uniquement un Ollama local sur localhost."
}

try {
  $tags = Invoke-RestMethod -Method Get -Uri "$OllamaUrl/api/tags" -TimeoutSec 15
}
catch {
  throw "Ollama n'est pas joignable sur $OllamaUrl. Ouvre l'application Ollama puis relance ce script."
}

Write-Step "Téléchargement ou mise à jour des modèles locaux"
$previousOllamaHost = [Environment]::GetEnvironmentVariable("OLLAMA_HOST", "Process")
$env:OLLAMA_HOST = $OllamaUrl
try {
  if ($RefreshModels -or -not (Test-OllamaModel @($tags.models) $VisionModel)) {
    & $ollamaCommand.Source pull $VisionModel
    if ($LASTEXITCODE -ne 0) {
      throw "Le téléchargement du modèle visuel $VisionModel a échoué."
    }
  }
  if ($RefreshModels -or -not (Test-OllamaModel @($tags.models) $EmbeddingModel)) {
    & $ollamaCommand.Source pull $EmbeddingModel
    if ($LASTEXITCODE -ne 0) {
      throw "Le téléchargement du modèle d'embeddings $EmbeddingModel a échoué."
    }
  }
}
finally {
  if ($null -eq $previousOllamaHost) {
    Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue
  }
  else {
    $env:OLLAMA_HOST = $previousOllamaHost
  }
}

Write-Step "Création sécurisée de la configuration locale"
$serviceRoleKey = ""
if (-not $ForceEnvironment) {
  $serviceRoleKey = [Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY", "Process")
  if (-not $serviceRoleKey) {
    $serviceRoleKey = Get-EnvironmentValue "SUPABASE_SERVICE_ROLE_KEY"
  }
}

if (-not $serviceRoleKey) {
  $serviceRoleKey = Read-ServiceRoleKey
}

if (-not (Test-ServiceRoleKey $serviceRoleKey)) {
  throw "La clé doit être une sb_secret_ ou une ancienne clé JWT portant le rôle service_role. Aucun fichier n'a été créé."
}

$workerId = "tok-image-worker-$($env:COMPUTERNAME.ToLowerInvariant())"
$environmentLines = @(
  "# Local uniquement. Ne jamais committer ni partager ce fichier.",
  "SUPABASE_URL=$SupabaseUrl",
  "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey",
  "WORKER_ID=$workerId",
  "",
  "OLLAMA_URL=$OllamaUrl",
  "OLLAMA_API_KEY=",
  "OLLAMA_VISION_MODEL=$VisionModel",
  "OLLAMA_EMBEDDING_MODEL=$EmbeddingModel",
  "OLLAMA_KEEP_ALIVE=10m",
  "",
  "ALLOWED_STORAGE_BUCKETS=restaurant-images,social-post-media",
  "MAX_IMAGE_BYTES=8388608",
  "EMBEDDING_DIMENSIONS=384",
  "",
  "POLL_INTERVAL_MS=5000",
  "BATCH_SIZE=$BatchSize",
  "DOWNLOAD_TIMEOUT_MS=30000",
  "OLLAMA_VISION_TIMEOUT_MS=300000",
  "OLLAMA_EMBEDDING_TIMEOUT_MS=60000",
  "SUPABASE_TIMEOUT_MS=20000",
  "HTTP_RETRY_ATTEMPTS=3",
  "RETRY_BASE_MS=1000",
  "JOB_RETRY_BASE_MS=5000",
  "HEALTH_HOST=127.0.0.1",
  "HEALTH_PORT=18080"
)

$temporaryEnvironmentFile = "$EnvironmentFile.$PID.tmp"
try {
  New-Item -ItemType File -Path $temporaryEnvironmentFile -Force | Out-Null
  Protect-SecretFile $temporaryEnvironmentFile
  [IO.File]::WriteAllText(
    $temporaryEnvironmentFile,
    ($environmentLines -join [Environment]::NewLine) + [Environment]::NewLine,
    [Text.UTF8Encoding]::new($false)
  )
  Move-Item -LiteralPath $temporaryEnvironmentFile -Destination $EnvironmentFile -Force
}
catch {
  Remove-Item -LiteralPath $temporaryEnvironmentFile -Force -ErrorAction SilentlyContinue
  throw
}
$serviceRoleKey = $null

$gitCommand = Get-Command "git.exe" -ErrorAction SilentlyContinue
if ($gitCommand) {
  Push-Location $WorkerDirectory
  try {
    & $gitCommand.Source check-ignore --quiet .env
    if ($LASTEXITCODE -ne 0) {
      throw "Le fichier workers/image-ai-worker/.env n'est pas ignoré par Git."
    }
  }
  finally {
    Pop-Location
  }
}

Write-Step "Installation reproductible du worker"
Push-Location $WorkerDirectory
try {
  & $npmCommand.Source ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci a échoué."
  }

  & $npmCommand.Source run syntax
  if ($LASTEXITCODE -ne 0) {
    throw "La validation syntaxique du worker a échoué."
  }

  & $npmCommand.Source test
  if ($LASTEXITCODE -ne 0) {
    throw "Les tests unitaires du worker ont échoué."
  }

  & $nodeCommand.Source check.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Le contrôle Supabase + Ollama a échoué."
  }
}
finally {
  Pop-Location
}

if ($InstallAutoStart) {
  Write-Step "Installation du démarrage automatique"
  Install-AutoStartTask $nodeCommand.Source
}

if (-not $NoStart) {
  Write-Step "Démarrage du worker TOK"
  if ($InstallAutoStart) {
    Start-ScheduledTask -TaskName $TaskName
    $deadline = [DateTime]::UtcNow.AddSeconds(150)
    $ready = $null
    $workerReady = $false
    do {
      Start-Sleep -Seconds 2
      try {
        $ready = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:18080/readyz" -TimeoutSec 3
        if ((Test-TokHealth $ready) -and $ready.ready -and $ready.supabase -and $ready.ollama) {
          $workerReady = $true
          break
        }
      }
      catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $workerReady) {
      throw "La tâche planifiée n'a pas rendu le worker prêt. Consulte les logs locaux."
    }
  }
  else {
    & $RunnerScript -NodePath $nodeCommand.Source
    if ($LASTEXITCODE -ne 0) {
      throw "Le worker n'a pas démarré correctement."
    }
  }
}

Write-Host "`nTOK Image AI est installé et prêt sans API d'IA payante." -ForegroundColor Green
Write-Host "État : http://127.0.0.1:18080/readyz"
Write-Host "Logs : $env:LOCALAPPDATA\TOK\image-ai-worker"

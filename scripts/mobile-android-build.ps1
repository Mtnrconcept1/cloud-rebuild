param(
  [ValidateSet("Debug", "Release")]
  [string]$Variant = "Debug"
)

$ErrorActionPreference = "Stop"

npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npx cap sync android
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$tmp = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$env:GRADLE_USER_HOME = Join-Path $tmp "gradle-home"
$env:ANDROID_USER_HOME = Join-Path $tmp "android-home"
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME | Out-Null
Remove-Item Env:\ANDROID_PREFS_ROOT -ErrorAction SilentlyContinue

$sdkCandidates = @(
  @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA "Android\Sdk")
  ) | Where-Object { $_ -and (Test-Path $_) }
)

if (-not $sdkCandidates.Count) {
  throw "Android SDK introuvable. Configure ANDROID_HOME ou installe Android Studio SDK."
}

$env:ANDROID_HOME = $sdkCandidates[0]
$env:ANDROID_SDK_ROOT = $sdkCandidates[0]

& android\gradlew.bat -p android ":app:assemble$Variant" --no-daemon
exit $LASTEXITCODE

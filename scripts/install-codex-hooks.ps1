$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$codexDir = Join-Path $repoRoot ".codex"
$hooksFile = Join-Path $codexDir "hooks.json"

New-Item -ItemType Directory -Force -Path $codexDir | Out-Null

$hooks = @{
  hooks = @{
    PreToolUse = @(
      @{
        matcher = "^(apply_patch|Edit|Write)$"
        hooks = @(
          @{
            type = "command"
            command = "sh -lc 'root=`$(git rev-parse --show-toplevel) && node `"`$root/scripts/codex-auto-pre-edit.mjs`"'"
            commandWindows = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = git rev-parse --show-toplevel; node (Join-Path $root ''scripts/codex-auto-pre-edit.mjs'')"'
            timeout = 120
            statusMessage = "Snapshot Git avant modification"
          }
        )
      }
    )
    PostToolUse = @(
      @{
        matcher = "^(apply_patch|Edit|Write)$"
        hooks = @(
          @{
            type = "command"
            command = "sh -lc 'root=`$(git rev-parse --show-toplevel) && node `"`$root/scripts/codex-auto-post-edit-validation.mjs`"'"
            commandWindows = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = git rev-parse --show-toplevel; node (Join-Path $root ''scripts/codex-auto-post-edit-validation.mjs'')"'
            timeout = 1200
            statusMessage = "Lint et tests apres modification"
          }
        )
      }
    )
  }
}

$json = $hooks | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($hooksFile, $json + [Environment]::NewLine, $utf8NoBom)

Write-Host "Hooks Codex installes dans $hooksFile"
Write-Host "Dans Codex, ouvre /hooks et approuve les hooks si une revue est demandee."

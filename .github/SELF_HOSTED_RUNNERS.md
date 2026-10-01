# Local GitHub Actions runners

This repository is currently configured to execute all Linux and Windows
GitHub Actions jobs on the local runners while the GitHub-hosted Actions budget
is exhausted.

## Runner mapping

- Linux jobs: `self-hosted`, `Linux`, `X64`, `cloud-rebuild-linux`
- Local Linux runner: `RAPH-cloud-linux`
- Windows jobs: `self-hosted`, `X64`, `Windows`, `cloud-rebuild-windows`
- Local Windows runner: `RAPH-cloud-windows`
- macOS/iOS jobs remain on `macos-26`, because this Windows PC cannot provide
  an Apple build environment. Those jobs can still consume hosted minutes.

The Linux runner service is configured to start with the WSL distribution and
the Windows runner is configured as a scheduled task. Closing PowerShell does
not stop either runner. Workflows that explicitly start containers require a
Docker engine; the Ubuntu-24.04 WSL runner currently has one enabled, while
Docker Desktop remains available for Windows-managed containers.

## Pull requests from forks

Jobs triggered by `pull_request` run locally only when the pull request branch
belongs to this repository. External fork pull requests are skipped so that
untrusted code cannot execute on the persistent machine or access its local
runner environment.

Each workflow installs the runtime it needs explicitly (Node.js, pnpm, or the
other tools it declares). The runners must still be online when a workflow is
dispatched.

When the hosted budget is restored, replace the repository-specific self-hosted
label with the desired GitHub-hosted label if hosted execution is preferred
again. The local runners can remain registered without being selected.

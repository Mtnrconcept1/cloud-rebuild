import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("local git auto sync scripts", () => {
  it("keeps remote sync safe by using fetch plus fast-forward only pulls", () => {
    expect(existsSync(resolve(process.cwd(), "scripts/git-auto-sync.ps1"))).toBe(true);

    const script = read("scripts/git-auto-sync.ps1");

    expect(script).toContain("git fetch --prune");
    expect(script).toContain("git merge --ff-only");
    expect(script).toContain("git status --porcelain");
    expect(script).toContain("Working tree is not clean");
    expect(script).toContain("Current branch '$currentBranch' does not match configured branch '$Branch'");
    expect(script).toContain("branch has diverged");
    expect(script).toContain("Start-Sleep -Seconds $IntervalSeconds");
  });

  it("installs an independent Windows scheduled task wrapper without changing secrets", () => {
    expect(existsSync(resolve(process.cwd(), "scripts/install-git-auto-sync-task.ps1"))).toBe(true);

    const installer = read("scripts/install-git-auto-sync-task.ps1");

    expect(installer).toContain("Register-ScheduledTask");
    expect(installer).toContain("New-ScheduledTaskTrigger");
    expect(installer).toContain("New-ScheduledTaskAction");
    expect(installer).toContain("$env:LOCALAPPDATA");
    expect(installer).toContain("Copy-Item");
    expect(installer).toContain("-Uninstall");
    expect(installer).not.toContain(".env");
    expect(installer).not.toContain("SUPABASE");
    expect(installer).not.toContain("STRIPE");
  });

  it("exposes npm scripts for one-shot sync, watch mode and scheduled task install", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

    expect(pkg.scripts["git:auto-sync"]).toContain("scripts/git-auto-sync.ps1");
    expect(pkg.scripts["git:auto-sync:watch"]).toContain("-Loop");
    expect(pkg.scripts["git:auto-sync:install"]).toContain("scripts/install-git-auto-sync-task.ps1");
    expect(pkg.scripts["git:auto-sync:uninstall"]).toContain("-Uninstall");
  });
});

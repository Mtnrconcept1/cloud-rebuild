import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// This command is used only by the explicitly requested branch-preview workflow.
// Production builds never call it; fixtures are rendered in a test process and
// only static HTML is copied into the preview build output.
const staticRoot = path.resolve(process.env.TOK_DASHBOARD_PREVIEW_STATIC_ROOT || ".vercel/output/static");
if (!existsSync(path.join(staticRoot, "assets"))) {
  throw new Error("Build the application before exporting the visual review pages.");
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "src/test/dashboard-design-preview-export.test.tsx"], {
  stdio: "inherit", env: { ...process.env, TOK_DASHBOARD_PREVIEW_EXPORT: "1", TOK_DASHBOARD_PREVIEW_STATIC_ROOT: staticRoot },
});
process.exit(result.status ?? 1);

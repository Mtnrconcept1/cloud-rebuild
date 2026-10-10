import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const entrypoints = [
  ["api/marketing/agent.ts", "../../server/marketingBff.js"],
  ["api/marketing/launch.ts", "../../server/marketingBff.js"],
  ["api/marketing/login.ts", "../../server/marketingBff.js"],
  ["api/marketing/logout.ts", "../../server/marketingBff.js"],
  ["api/marketing/orchestrator.ts", "../../server/marketingBff.js"],
  ["api/marketing/rpc.ts", "../../server/marketingBff.js"],
  ["api/marketing/session.ts", "../../server/marketingBff.js"],
  ["api/marketing/mfa/enroll.ts", "../../../server/marketingBff.js"],
  ["api/marketing/mfa/verify.ts", "../../../server/marketingBff.js"],
] as const;

describe("marketing BFF Vercel entrypoints", () => {
  it.each(entrypoints)("uses a NodeNext-safe import in %s", (relativePath, expectedImport) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

    expect(source).toContain(`from "${expectedImport}";`);
    expect(source).not.toMatch(/from\s+["'][^"']*server\/marketingBff["']/);
  });
});


it("imports the emitted BFF with the root TypeScript configuration, without missing .ts modules", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { spawnSync } = await import("node:child_process");
  const ts = (await import("typescript")).default;
  const root = process.cwd();
  fs.mkdirSync(path.join(root, ".tmp"), { recursive: true });
  const output = fs.mkdtempSync(path.join(root, ".tmp", "marketing-node-emit-"));
  try {
    const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
    const options = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root).options;
    const files = [
      "server/marketingBff.ts",
      "supabase/functions/_shared/marketing-ai-plan.ts",
      "supabase/functions/_shared/marketing-campaign-validation.ts",
      "supabase/functions/_shared/meta-publishing.ts",
    ];
    fs.writeFileSync(path.join(output, "package.json"), JSON.stringify({ type: "module" }));
    for (const file of files) {
      const emitted = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
        compilerOptions: { ...options, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: path.join(root, file),
      });
      const destination = path.join(output, file.replace(/\.ts$/, ".js"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, emitted.outputText);
    }
    const url = pathToFileURL(path.join(output, "server/marketingBff.js")).href;
    const code = "const m = await import(" + JSON.stringify(url) + "); console.log(typeof m.marketingAgentHandler);";
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 10000 });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

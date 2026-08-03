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

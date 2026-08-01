import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-production.yml"),
  "utf8",
);
const keyWriter = readFileSync(
  resolve(process.cwd(), "scripts/write-production-supabase-keys-env.mjs"),
  "utf8",
);

describe("production deployment credential wiring", () => {
  it("resolves elevated Supabase credentials from the existing management token", () => {
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain(
      "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/api-keys?reveal=true",
    );
    expect(workflow).toContain(
      "node ./scripts/write-production-supabase-keys-env.mjs",
    );
    expect(workflow).not.toContain(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}",
    );
    expect(keyWriter).toContain("::add-mask::${value}");
  });

  it("injects the resolved server values only into the Vercel runtime", () => {
    expect(workflow).toContain(
      '--env "SUPABASE_URL=$PRODUCTION_SUPABASE_URL"',
    );
    expect(workflow).toContain(
      '--env "SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY"',
    );
    expect(workflow).toContain(
      '--env "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"',
    );
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);
const unsubscribe = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-unsubscribe/index.ts"),
  "utf8",
);
const secretHelper = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/marketing-unsubscribe-secrets.ts"),
  "utf8",
);
const unsubscribeToken = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/marketing-unsubscribe-token.ts"),
  "utf8",
);
const secretWriterPath = resolve(process.cwd(), "scripts/write-supabase-secrets-env.mjs");

describe("marketing unsubscribe secret isolation", () => {
  const unsubscribeSources = `${orchestrator}\n${unsubscribe}\n${secretHelper}\n${unsubscribeToken}`;

  it("uses a dedicated primary secret and never reuses the provider webhook secret", () => {
    expect(unsubscribeSources).toContain('Deno.env.get("MARKETING_UNSUBSCRIBE_SECRET")');
    expect(unsubscribeSources).not.toContain("MARKETING_WEBHOOK_SECRET");
    expect(unsubscribeToken).not.toContain("The secret is the one the provider webhook already uses");
  });

  it("accepts an explicit legacy secret only for rotation and fails closed without the primary", () => {
    expect(secretHelper).toContain('Deno.env.get("MARKETING_UNSUBSCRIBE_LEGACY_SECRET")');
    expect(secretHelper).toContain('return { signingSecret: "", verificationSecrets: [] };');
    expect(secretHelper).toContain("? [primary, legacy]");
    expect(orchestrator).toContain("const { signingSecret } = readMarketingUnsubscribeSecrets()");
    expect(unsubscribe).toContain("for (const secret of verificationSecrets)");
  });

  it("blocks an invalid primary secret before any provider send without a mailto-only fallback", () => {
    const processStart = orchestrator.indexOf("async function processEmailDelivery");
    const processEnd = orchestrator.indexOf("async function attachDelegatedAdminIdentity", processStart);
    const processEmailDelivery = orchestrator.slice(processStart, processEnd);

    expect(processEmailDelivery).toContain("const { signingSecret } = readMarketingUnsubscribeSecrets()");
    expect(processEmailDelivery).toContain('p_status: "blocked_configuration"');
    expect(processEmailDelivery).toContain('p_error_code: "unsubscribe_secret_missing"');
    expect(processEmailDelivery.indexOf("if (!signingSecret)"))
      .toBeLessThan(processEmailDelivery.indexOf("sendViaResend("));
    expect(orchestrator).not.toContain('return { "List-Unsubscribe": mailto };');
    expect(orchestrator).toContain("sendViaResend(prepared, delivery.id, signingSecret)");
  });

  it("provisions primary and legacy rotation secrets without printing their values", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "tok-marketing-secrets-"));
    const outFile = join(tempRoot, "supabase.functions.env");
    const primary = `primary-${"a".repeat(40)}`;
    const legacy = `legacy-${"b".repeat(40)}`;

    try {
      const stdout = execFileSync(
        process.execPath,
        [secretWriterPath, `--out=${outFile}`],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            MARKETING_UNSUBSCRIBE_SECRET: primary,
            MARKETING_UNSUBSCRIBE_LEGACY_SECRET: legacy,
          },
        },
      );
      const provisioned = readFileSync(outFile, "utf8");

      expect(provisioned).toContain(`MARKETING_UNSUBSCRIBE_SECRET=${primary}`);
      expect(provisioned).toContain(`MARKETING_UNSUBSCRIBE_LEGACY_SECRET=${legacy}`);
      expect(stdout).toContain("MARKETING_UNSUBSCRIBE_SECRET");
      expect(stdout).toContain("MARKETING_UNSUBSCRIBE_LEGACY_SECRET");
      expect(stdout).not.toContain(primary);
      expect(stdout).not.toContain(legacy);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("marketing delivery lease budget", () => {
  it("bounds sequential provider work below the lease with a material safety margin", () => {
    const timeout = Number(orchestrator.match(/const RESEND_TIMEOUT_MS = ([\d_]+);/)?.[1].replaceAll("_", ""));
    const leaseSeconds = Number(orchestrator.match(/const DELIVERY_LEASE_SECONDS = ([\d_]+);/)?.[1].replaceAll("_", ""));
    const batch = Number(orchestrator.match(/const MAX_DELIVERIES_PER_RUN = ([\d_]+);/)?.[1].replaceAll("_", ""));

    expect(timeout).toBe(20_000);
    expect(leaseSeconds).toBe(180);
    expect(batch).toBe(5);
    expect(batch * timeout).toBeLessThanOrEqual((leaseSeconds * 1_000) - 60_000);
    expect(orchestrator).toContain("p_limit: Math.min(MAX_DELIVERIES_PER_RUN, limit)");
    expect(orchestrator).toContain("p_lease_seconds: DELIVERY_LEASE_SECONDS");
    expect(orchestrator).not.toContain("Math.min(500, limit * 20)");
  });
});

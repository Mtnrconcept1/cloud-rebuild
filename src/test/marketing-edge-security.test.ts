import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);
const webhook = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-provider-webhook/index.ts"),
  "utf8",
);
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("marketing Edge Function security", () => {
  it("uses custom admin/scheduler authentication and audit logging", () => {
    expect(orchestrator).toContain("allowSchedulerSecret: true");
    expect(orchestrator).toContain("allowServiceRole: true");
    expect(orchestrator).toContain('requireRole(actor, ["admin"])');
    expect(orchestrator).toContain("writeAuditLog");
  });

  it("verifies a timestamped HMAC before recording provider events", () => {
    expect(webhook).toContain("verifyMarketingWebhookSignature");
    expect(webhook).toContain("x-marketing-timestamp");
    expect(webhook).toContain("x-marketing-signature");
    expect(webhook).toContain("MARKETING_WEBHOOK_SECRET");
    expect(webhook.indexOf("verifyMarketingWebhookSignature")).toBeLessThan(
      webhook.indexOf('adminClient.rpc("record_marketing_provider_event"'),
    );
  });

  it("declares verify_jwt false only because both functions authenticate in code", () => {
    expect(config).toContain("[functions.marketing-orchestrator]");
    expect(config).toContain("[functions.marketing-provider-webhook]");
    expect(config.match(/verify_jwt = false/g)).toHaveLength(2);
  });
});

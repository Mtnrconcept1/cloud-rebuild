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

  it("attributes BFF-triggered runs only to a revalidated admin identity", () => {
    expect(orchestrator).toContain('actor.authMode !== "service_role"');
    expect(orchestrator).toContain('req.headers.get("x-marketing-actor-user-id")');
    expect(orchestrator).toContain('.from("user_roles")');
    expect(orchestrator).toContain('.eq("role", "admin")');
    expect(orchestrator).toContain("actor = await attachDelegatedAdminIdentity(actor, req)");
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
    expect(config).toMatch(
      /\[functions\.marketing-orchestrator\]\s+verify_jwt = false/,
    );
    expect(config).toMatch(
      /\[functions\.marketing-provider-webhook\]\s+verify_jwt = false/,
    );
  });
});

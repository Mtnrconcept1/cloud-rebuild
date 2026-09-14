import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914090000_marketing_outreach_assistance.sql"),
  "utf8",
);
const bff = readFileSync(resolve(process.cwd(), "server/marketingBff.ts"), "utf8");
const client = readFileSync(resolve(process.cwd(), "src/marketing/marketingClient.ts"), "utf8");
const types = readFileSync(resolve(process.cwd(), "src/marketing/types.ts"), "utf8");
const chrome = readFileSync(
  resolve(process.cwd(), "src/components/marketing/MarketingWorkspaceChrome.tsx"),
  "utf8",
);
const workspace = readFileSync(resolve(process.cwd(), "src/pages/marketing/MarketingWorkspace.tsx"), "utf8");
const view = readFileSync(
  resolve(process.cwd(), "src/components/marketing/views/MarketingOutreachView.tsx"),
  "utf8",
);

describe("marketing outreach assistance", () => {
  it("creates bounded review queues with strict RLS and no direct table access", () => {
    for (const table of [
      "marketing_outreach_targets",
      "marketing_outreach_opportunities",
      "marketing_outreach_drafts",
      "marketing_backlinks",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(
        `REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated, service_role`,
      );
    }

    expect(migration).toContain("LIMIT v_limit + 1");
    expect(migration).toContain("Marketing outreach list limit is invalid");
    expect(migration).toContain("service_execute_marketing_outreach_operation");
  });

  it("blocks unsafe targets and restricts backlink destinations to TheTOK", () => {
    expect(migration).toContain("marketing_validate_outreach_url");
    expect(migration).toContain("localhost");
    expect(migration).toContain("127.");
    expect(migration).toContain("Private or local outreach target is not allowed");
    expect(migration).toContain("^https://(www[.])?thetok[.]ch(/|$)");
    expect(migration).toContain("rel IN ('follow','nofollow','sponsored','ugc')");
    expect(migration).toContain("Publication automatique désactivée");
  });

  it("keeps the service boundary closed to the six outreach operations", () => {
    const names = [
      "admin_list_marketing_outreach",
      "admin_upsert_marketing_outreach_target",
      "admin_upsert_marketing_outreach_opportunity",
      "admin_upsert_marketing_outreach_draft",
      "admin_approve_marketing_outreach_draft",
      "admin_record_marketing_outreach_result",
      "admin_upsert_marketing_backlink",
    ];
    expect(names.every((name) => bff.includes(`"${name}"`))).toBe(true);
    expect(migration).toContain("Marketing outreach operation is not allowlisted");
    expect(client).toContain("invokeOutreachRpc");
    expect(client).toContain("admin_list_marketing_outreach");
  });

  it("wires the guarded workflow into the isolated admin workspace", () => {
    expect(types).toContain('"outreach"');
    expect(chrome).toContain('id: "outreach"');
    expect(workspace).toContain("MarketingOutreachView");
    expect(view).toContain("validation humaine obligatoire");
    expect(view).toContain("Aucune publication automatique");
    expect(view).toContain("onApproveDraft");
  });
});

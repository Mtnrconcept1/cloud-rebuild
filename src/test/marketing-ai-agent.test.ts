import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MarketingPlanError,
  buildPlanSchema,
  stripEmptySelectors,
  toBundlePayload,
  validatePlan,
  type MarketingPlan,
} from "../../supabase/functions/_shared/marketing-ai-plan";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260802230000_marketing_ai_agent.sql"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);
const agent = readFileSync(
  resolve(process.cwd(), "supabase/functions/ai-marketing-agent/index.ts"),
  "utf8",
);
const bff = readFileSync(resolve(process.cwd(), "server/marketingBff.ts"), "utf8");

function validPlan(): MarketingPlan {
  return {
    campaign: {
      name: "Rentrée des indépendants",
      objective: "Recruter des restaurants indépendants",
      summary: "Trois prises de contact réparties sur deux semaines.",
      channels: ["in_app"],
      starts_at: "2026-09-01T07:00:00.000Z",
      ends_at: "2026-09-15T16:00:00.000Z",
      audience_name: "Restaurants Genève",
      audience_definition: { audience_kind: "restaurant", canton: "GE" },
    },
    items: [
      {
        title: "Annonce d'ouverture",
        channel: "in_app",
        scheduled_at: "2026-09-02T07:00:00.000Z",
        audience_name: "Restaurants Genève",
        targeting: { audience_kind: "restaurant", canton: "GE" },
        content: {
          subject: null,
          headline: "Rejoignez Tok",
          body: "Un message sobre et informatif.",
          call_to_action: "Découvrir",
          hashtags: [],
        },
        visual_prompt: null,
      },
    ],
  };
}

describe("marketing AI plan contract", () => {
  it("accepts a coherent plan and unions the channels actually used", () => {
    const plan = validPlan();
    plan.items.push({
      ...plan.items[0],
      channel: "email",
      content: { ...plan.items[0].content, subject: "Objet" },
    });

    const validated = validatePlan(plan, ["in_app", "email"]);

    expect(validated.campaign.channels).toEqual(expect.arrayContaining(["in_app", "email"]));
  });

  it("refuses a channel the operator never requested", () => {
    const plan = validPlan();
    plan.items[0].channel = "instagram";

    expect(() => validatePlan(plan, ["in_app"])).toThrowError(MarketingPlanError);
    try {
      validatePlan(plan, ["in_app"]);
    } catch (error) {
      expect((error as MarketingPlanError).reason).toBe("channel_not_allowed");
    }
  });

  it("refuses an item whose audience filter has no effective selector", () => {
    const plan = validPlan();
    plan.items[0].targeting = {};

    try {
      validatePlan(plan, ["in_app"]);
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as MarketingPlanError).reason).toBe("empty_item_targeting");
    }
  });

  it("refuses an empty plan and an unparsable campaign window", () => {
    const empty = validPlan();
    empty.items = [];
    expect(() => validatePlan(empty, ["in_app"])).toThrowError(/no_items/);

    const broken = validPlan();
    broken.campaign.starts_at = "pas une date";
    expect(() => validatePlan(broken, ["in_app"])).toThrowError(/invalid_campaign_window/);
  });

  it("restricts the generated schema to the requested channels", () => {
    const schema = buildPlanSchema(["in_app", "email"]) as unknown as {
      schema: { properties: { items: { items: { properties: { channel: { enum: string[] } } } } } };
    };

    expect(schema.schema.properties.items.items.properties.channel.enum).toEqual([
      "in_app",
      "email",
    ]);
  });
});

describe("marketing AI bundle payload", () => {
  it("drops null selectors so Postgres only ever sees string filters", () => {
    expect(
      stripEmptySelectors({ audience_kind: "restaurant", canton: null, city: "  ", category: 3 }),
    ).toEqual({ audience_kind: "restaurant" });
  });

  it("never proposes a status, leaving the database to force draft", () => {
    const bundle = toBundlePayload(validatePlan(validPlan(), ["in_app"]), new Map()) as {
      campaign: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
    };

    expect(bundle.campaign).not.toHaveProperty("status");
    expect(bundle.campaign).not.toHaveProperty("approval_status");
    for (const item of bundle.items) {
      expect(item).not.toHaveProperty("status");
      expect(item).not.toHaveProperty("approval_status");
    }
  });

  it("carries a subject only on the email channel and attaches visuals by index", () => {
    const plan = validPlan();
    plan.items[0].content.subject = "Objet ignoré hors e-mail";
    plan.items.push({
      ...plan.items[0],
      channel: "email",
      content: { ...plan.items[0].content, subject: "Objet retenu" },
    });

    const bundle = toBundlePayload(validatePlan(plan, ["in_app", "email"]), new Map([[1, "https://cdn/x.png"]])) as {
      items: Array<{ channel: string; content: { subject: string | null; visual_url: string | null } }>;
    };

    expect(bundle.items[0].content.subject).toBeNull();
    expect(bundle.items[0].content.visual_url).toBeNull();
    expect(bundle.items[1].content.subject).toBe("Objet retenu");
    expect(bundle.items[1].content.visual_url).toBe("https://cdn/x.png");
  });
});

describe("marketing AI agent migration", () => {
  it("stores runs in a deny-all table reachable only through service helpers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.marketing_ai_runs");
    expect(migration).toContain("ALTER TABLE public.marketing_ai_runs ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toContain("CREATE POLICY");
  });

  it("grants the new helpers to service_role only, after revoking the default", () => {
    for (const fn of [
      "service_start_marketing_ai_run",
      "service_complete_marketing_ai_run",
      "service_list_marketing_ai_runs",
      "service_prepare_marketing_email_delivery",
      "service_record_marketing_email_sent",
    ]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
      expect(migration).toContain(`public.${fn}(`);
    }
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO service_role");
    expect(migration).toMatch(/SECURITY DEFINER\nSET search_path = ''/);
  });

  it("only starts a run for a confirmed administrator", () => {
    expect(migration).toContain("WHERE ur.user_id = p_actor_user_id AND ur.role::text = 'admin'");
    expect(migration).toContain("RAISE EXCEPTION 'Administrator role required'");
  });

  it("re-runs the full consent and pacing gate chain before revealing a recipient", () => {
    for (const gate of [
      "marketing_runtime_enabled",
      "quiet_hours",
      "marketing_contact_is_eligible",
      "marketing_contact_matches_filter",
      "frequency_cap",
      "daily_cap",
      "notification_preference_blocked",
      "parent_invalidated",
      "campaign_invalidated",
    ]) {
      expect(migration).toContain(gate);
    }
    // The address is only ever returned once every gate above has passed.
    expect(migration).toContain("'status', 'ready'");
    expect(migration).toContain("UPDATE public.marketing_deliveries SET status = 'processing'");
  });

  it("escapes generated copy before it becomes email HTML", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.marketing_html_escape");
    expect(migration).toContain("'&', '&amp;'");
    expect(migration).toContain("public.marketing_html_escape(v_body)");
    expect(migration).toContain("public.marketing_html_escape(v_headline)");
  });

  it("declares the Resend adapter without promoting the integration to connected", () => {
    expect(migration).toContain("secret_ref = 'RESEND_API_KEY'");
    expect(migration).toContain("'adapter_deployed', true");
    expect(migration).not.toContain("status = 'connected'");
  });
});

describe("marketing orchestrator delivery adapters", () => {
  it("sends approved email deliveries through Resend with an unsubscribe path", () => {
    expect(orchestrator).toContain('delivery.channel === "email"');
    expect(orchestrator).toContain("service_prepare_marketing_email_delivery");
    expect(orchestrator).toContain("service_record_marketing_email_sent");
    expect(orchestrator).toContain("List-Unsubscribe");
    expect(orchestrator).toContain("Idempotency-Key");
  });

  it("stays fail-closed when the provider key is absent", () => {
    expect(orchestrator).toContain("resend_key_missing");
    expect(orchestrator).toContain('p_status: "blocked_configuration"');
  });

  it("only treats a transient provider failure as retryable", () => {
    expect(orchestrator).toContain("response.status >= 500 || response.status === 429");
  });

  it("names the missing credential for each dormant channel", () => {
    for (const channel of ["instagram", "facebook", "linkedin", "tiktok", "youtube"]) {
      expect(orchestrator).toContain(`["${channel}", "${channel}_credentials_missing"]`);
    }
  });

  it("fans approved email items out into per-contact deliveries", () => {
    expect(orchestrator).toContain('["email", "manual_call", "manual_email"].includes(item.channel)');
  });
});

describe("marketing AI agent boundary", () => {
  it("refuses a browser token and revalidates the delegated administrator", () => {
    expect(agent).toContain('actor.authMode === "user_jwt"');
    expect(agent).toContain('req.headers.get("x-marketing-actor-user-id")');
    expect(agent).toContain('requireRole(actor, ["admin"])');
    expect(agent).toContain("writeAuditLog");
  });

  it("owns no write path of its own beyond its run record", () => {
    expect(agent).not.toContain("admin_create_marketing_campaign_bundle");
    expect(agent).not.toContain("admin_upsert_marketing_calendar_item");
  });

  it("persists the plan through the allowlisted operation with the live session proof", () => {
    expect(bff).toContain('p_operation: "admin_create_marketing_campaign_bundle"');
    expect(bff).toContain("p_sid_hash: session.sessionHash");
    expect(bff).toContain("p_csrf_hash: session.csrfHash");
    expect(bff).toContain("ensureServiceAdmin(config, session.userId)");
  });

  it("rejects an unknown channel and an inverted window before calling the model", () => {
    expect(bff).toContain("MARKETING_CHANNEL_VALUES.has(channel)");
    expect(bff).toContain("Date.parse(endsAt) <= Date.parse(startsAt)");
  });

  it("marks the run failed when persistence fails instead of leaving it running", () => {
    expect(bff).toContain('p_status: "failed"');
    expect(bff).toContain("Campaign bundle persistence failed");
  });
});

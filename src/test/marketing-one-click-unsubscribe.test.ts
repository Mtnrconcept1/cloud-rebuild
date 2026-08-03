import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260803140000_marketing_one_click_unsubscribe.sql"),
  "utf8",
);
const endpoint = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-unsubscribe/index.ts"),
  "utf8",
);
const token = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/marketing-unsubscribe-token.ts"),
  "utf8",
);
const orchestrator = readFileSync(
  resolve(process.cwd(), "supabase/functions/marketing-orchestrator/index.ts"),
  "utf8",
);
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("one-click unsubscribe suppression", () => {
  it("suppresses the contact across every channel, not just the campaign", () => {
    expect(migration).toContain("lawful_basis = 'none'");
    expect(migration).toContain("lifecycle_status = 'opted_out'");
    expect(migration).toContain("'email_suppressed', true");
  });

  it("cancels whatever was still queued for that contact", () => {
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).toContain("'queued','leased','processing','retrying','manual_required','blocked_configuration'");
  });

  it("is idempotent, because mail clients prefetch links", () => {
    expect(migration).toContain("IF v_contact.opted_out_at IS NOT NULL THEN");
    expect(migration).toContain("'already', true");
  });

  it("records the evidence the lawful-basis trigger demands", () => {
    expect(migration).toContain("app.marketing_lawful_basis_context");
    expect(migration).toContain("'quality', 'system_event'");
  });

  it("never reveals whether an identifier exists", () => {
    expect(migration).toContain("RETURN jsonb_build_object('ok', true, 'applied', false)");
  });

  it("stays service-role only", () => {
    expect(migration).toContain("PERFORM public.marketing_require_service_role()");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO service_role");
  });
});

describe("unsubscribe token", () => {
  it("signs the delivery id rather than exposing it bare", () => {
    expect(token).toContain('{ name: "HMAC", hash: "SHA-256" }');
    expect(token).toContain("export async function buildUnsubscribeToken");
    expect(token).toContain("export async function verifyUnsubscribeToken");
  });

  it("compares signatures in constant time", () => {
    expect(token).toContain("mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index)");
    expect(token).toContain("return mismatch === 0 ? deliveryId : null");
  });

  it("rejects a malformed identifier before doing any work", () => {
    expect(token).toContain("/^[0-9a-f-]{36}$/i.test(deliveryId)");
  });

  it("refuses to sign when no secret is configured", () => {
    expect(token).toContain('if (!secret) return ""');
  });
});

describe("unsubscribe endpoint", () => {
  it("answers the provider's one-click POST as RFC 8058 expects", () => {
    expect(endpoint).toContain('req.method === "POST"');
    expect(endpoint).toContain("new Response(null, { status: 200");
  });

  it("also serves a human following the link", () => {
    expect(endpoint).toContain('req.method !== "GET"');
    expect(endpoint).toContain("Désabonnement enregistré");
  });

  it("answers identically whether or not the token was valid", () => {
    // An endpoint that differs would let anyone enumerate delivery identifiers.
    const failure = endpoint.slice(endpoint.indexOf("catch (error)"));
    expect(failure).toContain("status: 200");
    expect(failure).toContain("htmlResponse()");
  });

  it("is not indexable and not framable", () => {
    expect(endpoint).toContain('"X-Robots-Tag": "noindex, nofollow"');
    expect(endpoint).toContain('"X-Frame-Options": "DENY"');
  });

  it("is deployed without JWT verification, since the caller is a mail provider", () => {
    expect(config).toContain("[functions.marketing-unsubscribe]\nverify_jwt = false");
  });
});

describe("orchestrator unsubscribe headers", () => {
  it("sends both the one-click URL and the mailto fallback", () => {
    expect(orchestrator).toContain('"List-Unsubscribe": `<${url}>, ${mailto}`');
    expect(orchestrator).toContain('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"');
  });

  it("degrades to mailto rather than publishing a forgeable link", () => {
    expect(orchestrator).toContain("if (!token || !UNSUBSCRIBE_BASE.startsWith(\"https://\"))");
    expect(orchestrator).toContain('return { "List-Unsubscribe": mailto };');
  });
});

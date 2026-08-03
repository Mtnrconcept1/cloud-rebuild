import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const eligibility = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260803020000_marketing_b2b_legitimate_interest_email.sql",
  ),
  "utf8",
);
const history = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260803030000_marketing_delivery_recipient_history.sql",
  ),
  "utf8",
);
const faq = readFileSync(
  resolve(process.cwd(), "src/components/marketing/views/MarketingFaqView.tsx"),
  "utf8",
);
const activity = readFileSync(
  resolve(process.cwd(), "src/components/marketing/views/MarketingActivityView.tsx"),
  "utf8",
);

describe("B2B legitimate-interest email", () => {
  it("admits legitimate interest for business contacts only", () => {
    expect(eligibility).toContain("c.lawful_basis = 'legitimate_interest'");
    expect(eligibility).toContain("c.contact_type IN ('restaurant_prospect','restaurant_lead')");
  });

  it("does not widen push or in-app, which reach a person's own device", () => {
    const pushBranch = eligibility.slice(
      eligibility.indexOf("WHEN p_channel IN ('push','in_app')"),
      eligibility.indexOf("WHEN p_channel = 'manual_call'"),
    );
    expect(pushBranch).toContain("c.lawful_basis IN ('consent','existing_customer')");
    expect(pushBranch).not.toContain("legitimate_interest");
  });

  it("keeps every other protection in place", () => {
    expect(eligibility).toContain("c.opted_out_at IS NULL");
    expect(eligibility).toContain("c.metadata ->> 'email_suppressed'");
    expect(eligibility).toContain("p.categories ->> 'marketing'");
    expect(eligibility).toContain("WHEN p_channel = 'manual_visit' THEN false");
  });

  it("records that the change is a deliberate, owner-accepted policy decision", () => {
    expect(eligibility).toContain("DELIBERATE POLICY CHANGE");
    expect(eligibility).toContain("art. 3(1)(o)");
  });
});

describe("delivery journal recipient lookup", () => {
  it("finds a recipient by name anywhere in the string", () => {
    // A prefix match would never find "Café du Levant" from "levant".
    expect(history).toContain("position(v_query IN lower(COALESCE(mc.display_name, ''))) > 0");
  });

  it("also searches the geography an operator remembers", () => {
    expect(history).toContain("lower(COALESCE(mc.city, '')) LIKE v_query || '%'");
    expect(history).toContain("lower(COALESCE(mc.commune, '')) LIKE v_query || '%'");
    expect(history).toContain("COALESCE(mc.postal_code, '') LIKE v_query || '%'");
  });

  it("returns the recipient identity without unmasking the address", () => {
    expect(history).toContain("'contact_name', page.contact_name");
    expect(history).toContain("'target_masked', page.target_masked");
    expect(history).not.toContain("'email', ");
    expect(history).not.toContain("email_normalized");
  });

  it("keeps the injection guard on the free-text query", () => {
    expect(history).toContain("Delivery search query is invalid");
    expect(history).toContain("position('%' IN v_query) > 0");
  });

  it("indexes the name scan and the per-contact history", () => {
    expect(history).toContain("extensions.gin_trgm_ops");
    expect(history).toContain("marketing_deliveries_contact_idx");
  });

  it("surfaces the recipient in the journal instead of a masked target alone", () => {
    expect(activity).toContain("<TableHead>Destinataire</TableHead>");
    expect(activity).toContain("delivery.contactName");
    expect(activity).toContain("Destinataire, commune, NPA, campagne, erreur…");
  });
});

describe("marketing manual", () => {
  it("documents the guarantees, the channels and the settings to perform", () => {
    for (const anchor of [
      "Le principe : rien ne part sans approbation",
      "Agent IA",
      "Audiences et ciblage",
      "Qui peut être contacté, et par quel canal",
      "État réel des canaux",
      "Journal des envois et historique",
      "Paramétrage à effectuer",
      "Dépannage",
    ]) {
      expect(faq).toContain(anchor);
    }
  });

  it("explains which credentials to set without naming the AI provider variable", () => {
    // The browser bundle must stay free of any OpenAI credential reference, so
    // the manual describes the secrets by role and defers the exact names to
    // the deployment notes.
    expect(faq).toContain("Clé API du fournisseur IA");
    expect(faq).toContain("Clé API du fournisseur d'e-mail");
    expect(faq).not.toContain(["OPENAI", "API", "KEY"].join("_"));
    expect(faq).not.toMatch(/sk-[A-Za-z0-9]/);
    expect(faq).not.toMatch(/re_[A-Za-z0-9]{8}/);
  });

  it("states the sender's obligation rather than only the capability", () => {
    expect(faq).toContain("intérêt légitime");
    expect(faq).toContain("désabonnement");
  });

  it("is reachable as its own workspace view", () => {
    const types = readFileSync(resolve(process.cwd(), "src/marketing/types.ts"), "utf8");
    const chrome = readFileSync(
      resolve(process.cwd(), "src/components/marketing/MarketingWorkspaceChrome.tsx"),
      "utf8",
    );
    expect(types).toContain('"faq"');
    expect(chrome).toContain('id: "faq"');
  });
});

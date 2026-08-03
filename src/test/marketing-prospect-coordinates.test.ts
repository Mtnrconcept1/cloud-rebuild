import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260803010000_marketing_prospect_coordinates.sql"),
  "utf8",
);
const script = readFileSync(
  resolve(process.cwd(), "scripts/import-marketing-prospect-coordinates.mjs"),
  "utf8",
);

describe("marketing prospect coordinates schema", () => {
  it("adds the columns a fine-grained campaign needs to aim", () => {
    for (const column of [
      "postal_code",
      "commune",
      "street_address",
      "company_size",
      "branch",
      "website",
      "latitude",
      "longitude",
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it("constrains the imported values rather than trusting the registry", () => {
    expect(migration).toContain("postal_code ~ '^[0-9]{4}$'");
    expect(migration).toContain("website ~ '^https?://'");
    expect(migration).toContain("latitude BETWEEN -90 AND 90");
    expect(migration).toContain("longitude BETWEEN -180 AND 180");
  });

  it("indexes the new selectors so targeting stays cheap", () => {
    expect(migration).toContain("marketing_contacts_postal_code_idx");
    expect(migration).toContain("marketing_contacts_commune_idx");
    expect(migration).toContain("marketing_contacts_company_size_idx");
  });
});

describe("marketing audience selectors", () => {
  it("allowlists the new keys and keeps rejecting everything else", () => {
    for (const key of [
      "postal_code",
      "commune",
      "company_size",
      "branch",
      "has_email",
      "has_phone",
      "has_website",
    ]) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain("Unsupported audience filter key: %");
    expect(migration).toContain("Audience filter values must be strings");
  });

  it("refuses reachability as the only selector", () => {
    // "everyone with an email" is the whole database; the guard must still
    // demand a real segment before a campaign can target anyone.
    const guard = migration.slice(
      migration.indexOf("Audience filter requires an effective selector") - 900,
      migration.indexOf("Audience filter requires an effective selector"),
    );
    expect(guard).toContain("'postal_code'");
    expect(guard).toContain("'commune'");
    expect(guard).toContain("'company_size'");
    expect(guard).not.toContain("'has_email'");
  });

  it("validates the shape of the new selectors", () => {
    expect(migration).toContain("Invalid postal_code filter");
    expect(migration).toContain('Reachability filter % must be "true" or "false"');
  });

  it("matches registry text case-insensitively but sizes exactly", () => {
    expect(migration).toContain("lower(COALESCE(c.commune, '')) = lower(btrim(p_filter ->> 'commune'))");
    expect(migration).toContain("lower(COALESCE(c.branch, '')) = lower(btrim(p_filter ->> 'branch'))");
    expect(migration).toContain("c.company_size = btrim(p_filter ->> 'company_size')");
  });

  it("reads reachability from the normalized columns the dispatcher trusts", () => {
    expect(migration).toContain("(c.email_normalized IS NOT NULL) = (v_has_email = 'true')");
    expect(migration).toContain("(c.phone_normalized IS NOT NULL) = (v_has_phone = 'true')");
  });
});

describe("marketing prospect import", () => {
  it("only fills gaps and never overwrites a qualified value", () => {
    expect(migration).toContain("email = COALESCE(c.email, NULLIF(btrim(v_row ->> 'email'), ''))");
    expect(migration).toContain("phone = COALESCE(c.phone, NULLIF(btrim(v_row ->> 'phone'), ''))");
  });

  it("leaves an administrator's lawful basis untouched", () => {
    // A public registry may propose a basis where none exists; it may never
    // replace one a human recorded.
    expect(migration).toContain("WHEN c.lawful_basis = 'none' THEN 'legitimate_interest'");
    expect(migration).toContain("ELSE c.lawful_basis");
  });

  it("never resurrects a suppressed or opted-out contact", () => {
    expect(migration).toContain("AND c.opted_out_at IS NULL");
    expect(migration).toContain("AND c.suppression_reason IS NULL");
  });

  it("stays service-role only and bounded per batch", () => {
    expect(migration).toContain("PERFORM public.marketing_require_service_role()");
    expect(migration).toContain("Prospect import batch is limited to 500 rows");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO service_role");
  });

  it("does not loosen who may receive electronic marketing", () => {
    // Importing an address must never become a right to write to it: eligibility
    // still requires consent or an existing customer relationship, so this
    // migration may name that rule but must not redefine it.
    expect(migration).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.marketing_contact_is_eligible/i,
    );
  });
});

describe("marketing prospect import script", () => {
  it("reads both registry exports that feed the commercial map", () => {
    expect(script).toContain("public/data/geneva-commercial-prospects.json");
    expect(script).toContain("public/data/thefork-geneva-commercial-prospects.json");
  });

  it("merges a duplicate identifier without letting the poorer row win", () => {
    expect(script).toContain("if (existing[key] === null && value !== null) existing[key] = value;");
  });

  it("drops an address that is not a single plausible mailbox", () => {
    expect(script).toContain("if (/[;,\\s]/.test(text)) return null;");
  });

  it("batches within the limit the database enforces", () => {
    expect(script).toContain("const BATCH_SIZE = 500;");
  });

  it("supports a dry run so the operator can size the import first", () => {
    expect(script).toContain("--dry-run");
    expect(script).toContain("dry run: nothing was sent");
  });
});

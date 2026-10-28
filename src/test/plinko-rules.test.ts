import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PLINKO_OUTCOME_WEIGHTS,
  PLINKO_RULE_VERSION,
  PLINKO_TOTAL_WEIGHT,
  createPlinkoToken,
  hashPlinkoToken,
  normalizePlinkoEmail,
  pickPlinkoOutcome,
  readPlinkoRequestId,
  secureRandomTicket,
} from "../../supabase/functions/plinko-play/rules";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe("welcome Plinko draw", () => {
  it("maps every integer ticket to the exact per-drop probabilities", () => {
    const counts: Record<string, number> = {};
    for (let ticket = 0; ticket < PLINKO_TOTAL_WEIGHT; ticket++) {
      const outcome = pickPlinkoOutcome(() => ticket);
      counts[outcome] = (counts[outcome] || 0) + 1;
    }

    expect(PLINKO_RULE_VERSION).toBe("welcome-v1");
    expect(PLINKO_TOTAL_WEIGHT).toBe(10_000);
    expect(PLINKO_OUTCOME_WEIGHTS.reduce((sum, rule) => sum + rule.weight, 0)).toBe(10_000);
    expect(counts).toEqual({
      free_meal: 50,
      half_price: 50,
      tok_one_month: 3300,
      replay: 3300,
      lost: 3300,
    });
  });

  it.each([
    [0, "free_meal"], [49, "free_meal"],
    [50, "half_price"], [99, "half_price"],
    [100, "tok_one_month"], [3399, "tok_one_month"],
    [3400, "replay"], [6699, "replay"],
    [6700, "lost"], [9999, "lost"],
  ])("maps boundary ticket %s to %s", (ticket, outcome) => {
    expect(pickPlinkoOutcome(() => Number(ticket))).toBe(outcome);
  });

  it.each([-1, 10_000, 0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid ticket %s", (ticket) => {
      expect(() => pickPlinkoOutcome(() => ticket)).toThrow("invalid_plinko_ticket");
    },
  );

  it("rejects the uint32 tail before reducing a secure sample to a ticket", () => {
    const samples = [4_294_967_295, 4_294_960_000, 4_294_959_999];
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
      (buffer as Uint32Array)[0] = samples.shift()!;
      return buffer;
    });

    expect(secureRandomTicket()).toBe(9999);
    expect(random).toHaveBeenCalledTimes(3);
  });
});

describe("anonymous Plinko credentials and claims", () => {
  it("uses 32 secure random bytes for a visitor bearer token", () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
      const bytes = buffer as Uint8Array;
      expect(bytes).toHaveLength(32);
      bytes.forEach((_byte, index) => { bytes[index] = index; });
      return buffer;
    });

    expect(createPlinkoToken()).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("hashes the token before persistence with SHA-256", async () => {
    expect(await hashPlinkoToken("0".repeat(64))).toBe("60e05bd1b195af2f94112fa7197a5c88289058840ce7c6df9693756bc6250f55");
    const token = createPlinkoToken();
    const hash = await hashPlinkoToken(token);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
  });

  it.each(["", "0".repeat(63), "0".repeat(65), "G".repeat(64), "A".repeat(64)])(
    "rejects malformed visitor bearer token %j", async (token) => {
      await expect(hashPlinkoToken(token)).rejects.toThrow("invalid_plinko_token");
    },
  );

  it("normalizes email only for prize claiming", () => {
    expect(normalizePlinkoEmail("  Winner.Example+TOK@Example.CH  ")).toBe("winner.example+tok@example.ch");
  });

  it.each(["", "   ", "winner", "winner@", "@example.ch", "winner@example", "win ner@example.ch", "winner\n@example.ch", "winner@example.ch\n", "winner\u0000@example.ch", `${"a".repeat(250)}@example.ch`])(
    "rejects malformed claim email %j", (email) => {
      expect(() => normalizePlinkoEmail(email)).toThrow();
    },
  );

  it.each([null, undefined, 42, {}, ["winner@example.ch"]])("rejects non-text email %j", (email) => {
    expect(() => normalizePlinkoEmail(email)).toThrow("invalid_plinko_email");
  });

  it("requires a stable UUID idempotency key and normalizes its case", () => {
    expect(readPlinkoRequestId(new Request("https://tok.test/plinko", {
      headers: { "Idempotency-Key": "A5A90696-4CE1-47E8-8D95-AB369D6F73CD" },
    }))).toBe("a5a90696-4ce1-47e8-8d95-ab369d6f73cd");

    for (const key of [null, "", "not-a-uuid", "a5a90696-4ce1-07e8-8d95-ab369d6f73cd"]) {
      const headers = key === null ? {} : { "Idempotency-Key": key };
      expect(() => readPlinkoRequestId(new Request("https://tok.test/plinko", { headers }))).toThrow("invalid_idempotency_key");
    }
  });
});

describe("anonymous Plinko security boundaries", () => {
  const readEndpoint = () => readFileSync("supabase/functions/plinko-play/index.ts", "utf8");
  const readMigration = () => readFileSync("supabase/migrations/20261028132220_tok_welcome_plinko.sql", "utf8");

  it("keeps visitor play independent of account login and outcomes server-side", () => {
    const endpoint = readEndpoint();
    const rules = readFileSync("supabase/functions/plinko-play/rules.ts", "utf8");
    expect(endpoint).not.toContain("authenticateRequest");
    expect(endpoint).toContain("createAdminClient");
    expect(endpoint).toContain("pickPlinkoOutcome()");
    expect(endpoint).toContain("hashPlinkoToken");
    expect(endpoint).toContain("readPlinkoRequestId");
    expect(endpoint).not.toMatch(/payload\.(?:outcome|landing|reward)/);
    expect(rules).toContain("crypto.getRandomValues");
    expect(rules).not.toContain("Math.random");
    expect(endpoint).not.toContain("Math.random");
  });

  it("stores token hashes and confines all private data and RPC mutation to the server", () => {
    const migration = readMigration();
    expect(migration).toContain("token_hash");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+TABLE[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*?ON\s+TABLE[^;]*TO\s+(?:anon|authenticated)/i);
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[^;]*FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
    expect(migration).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[^;]*TO\s+service_role/i);
    expect(migration).toMatch(/service_role_required/);
    expect(migration).toMatch(/SET\s+search_path\s+TO\s+'public'/i);
  });

  it("enforces one claimed benefit per normalized email and campaign", () => {
    const migration = readMigration();
    expect(migration).toMatch(/UNIQUE\s*\(\s*(?:campaign_id\s*,\s*email|email\s*,\s*campaign_id)\s*\)/i);
    expect(migration).toContain("pending_fulfillment");
    expect(migration).not.toMatch(/(?:INSERT\s+INTO|UPDATE)\s+public\.(?:tok_one_subscriptions|payment_transactions|promo_codes)/i);
  });

  it("creates sessions and plays before collecting email, then claims only real prizes", () => {
    const endpoint = readEndpoint();
    const migration = readMigration();
    const createSession = migration.match(/CREATE OR REPLACE FUNCTION public\.create_plinko_session\b[\s\S]*?\$function\$;/i)?.[0] || "";
    const recordPlay = migration.match(/CREATE OR REPLACE FUNCTION public\.record_plinko_play\b[\s\S]*?\$function\$;/i)?.[0] || "";
    const claimReward = migration.match(/CREATE OR REPLACE FUNCTION public\.claim_plinko_reward\b[\s\S]*?\$function\$;/i)?.[0] || "";

    expect(createSession).toContain("INSERT INTO public.plinko_sessions");
    expect(recordPlay).toContain("INSERT INTO public.plinko_plays");
    expect(createSession).not.toMatch(/\bp_email\b/i);
    expect(recordPlay).not.toMatch(/\bp_email\b/i);
    expect(recordPlay).toContain("'free_meal', 'half_price', 'tok_one_month'");
    expect(claimReward).toContain("plinko_no_prize");
    expect(claimReward).toContain("plinko_email_already_used");
    expect(claimReward).toContain("pending_fulfillment");
    expect(claimReward).toContain("COALESCE(p_marketing_consent, false)");
    expect(endpoint.indexOf("normalizePlinkoEmail(payload.email)")).toBeGreaterThan(endpoint.indexOf('if (action === "claim")'));
    expect(endpoint).toContain("payload.marketingConsent === true");
  });

  it("bounds anonymous payloads and applies persistent visitor/session rate limits", () => {
    const endpoint = readEndpoint();
    expect(endpoint).toContain("request_too_large");
    expect(endpoint).toContain("createRateLimiter");
    expect(endpoint).toContain("await limiter.consume");
    expect(endpoint).toContain("hashIp(req)");
    expect(endpoint).toContain("session:${tokenHash}");
    expect(endpoint).not.toMatch(/console\.(?:log|info|error)\([^;]*(?:payload|token|email)/);
  });
});

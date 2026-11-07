import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const restaurantId = "00000000-0000-4000-8000-000000000111";
const fakeStripeAccount = "acct_tok_sandbox_fake_restaurant";
const onboardingUrl = "https://connect.stripe.com/setup/s/fake-sandbox-link";
const returnUrl = "https://www.thetok.ch/dashboard/restaurant?stripe_connect=returned";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function setupStripeConnectFixture({
  functionName = "stripe-connect-onboard",
  alreadyConnected = false,
  ready = false,
  isDemo = false,
}: {
  functionName?: "stripe-connect-onboard" | "stripe-connect-status";
  alreadyConnected?: boolean;
  ready?: boolean;
  isDemo?: boolean;
} = {}) {
  const writes: Array<Record<string, unknown>> = [];
  const from = vi.fn(() => ({
    update: vi.fn((patch: Record<string, unknown>) => {
      writes.push(patch);
      return {
        eq: vi.fn(() => ({
          error: null,
          select: vi.fn(() => ({
            single: async () => ({
              error: null,
              data: { id: restaurantId, stripe_account_id: patch.stripe_account_id },
            }),
          })),
        })),
      };
    }),
  }));

  const actor = {
    userId: "00000000-0000-4000-8000-000000000222",
    adminClient: { from },
    userClient: {
      auth: {
        getUser: async () => ({ data: { user: { email: "sandbox-restaurant@example.test" } } }),
      },
    },
  };
  const restaurant = {
    id: restaurantId,
    name: "Restaurant fictif TOK",
    phone: null,
    website_url: null,
    is_demo: isDemo,
    stripe_account_id: alreadyConnected ? fakeStripeAccount : null,
    stripe_connect_onboarding_completed_at: null,
  };
  const stripeAccount = {
    id: fakeStripeAccount,
    details_submitted: ready,
    charges_enabled: ready,
    payouts_enabled: ready,
    requirements: {
      currently_due: ready ? [] : ["external_account"],
      disabled_reason: ready ? null : "requirements.past_due",
    },
  };
  const stripe = {
    accounts: {
      create: vi.fn(async () => ({ id: fakeStripeAccount })),
      retrieve: vi.fn(async () => stripeAccount),
    },
    accountLinks: {
      create: vi.fn(async () => ({ url: onboardingUrl })),
    },
  };
  const writeAuditLog = vi.fn(async () => undefined);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deps = {
    HttpError,
    Deno: {
      env: { get: (name: string) => name === "SITE_URL" ? "https://www.thetok.ch" : "" },
      serve: (fn: (req: Request) => Promise<Response>) => { handler = fn; },
    },
    buildCorsHeaders: () => ({}),
    handleCorsPreflight: () => null,
    authenticateRequest: async () => actor,
    assertProductionFlowAllowed: async () => undefined,
    assertSentinelAllowed: async () => undefined,
    createAdminClient: () => actor.adminClient,
    jsonResponse: (payload: unknown, status: number) => Response.json(payload, { status }),
    requireRestaurantAccess: async () => restaurant,
    getStripeRuntimeForCheckoutKind: () => ({ stripe }),
    writeAuditLog,
    makeLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
    normalizeCheckoutReturnUrl: () => returnUrl,
    isStripeConnectPlatformProfileRequired: () => false,
    STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED: "stripe_connect_platform_profile_required",
  };
  const source = readFileSync("supabase/functions/" + functionName + "/index.ts", "utf8");
  const script = ts.transpileModule(
    source.replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  new Function(...Object.keys(deps), script)(...Object.values(deps));
  if (!handler) throw new Error("Stripe Connect Edge function was not registered");

  const invoke = async () => handler!(new Request(
    "https://example.test/functions/v1/" + functionName,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurant_id: restaurantId, return_url: returnUrl }),
    },
  ));

  return { invoke, stripe, writes, from, writeAuditLog, restaurant };
}

describe("TOK Stripe Connect — fictitious Swiss restaurant test flow", () => {
  it("creates an Express CH connected account, persists its ID and issues hosted onboarding for a missing bank", async () => {
    const fixture = setupStripeConnectFixture();
    const response = await fixture.invoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      url: onboardingUrl,
      account_id: fakeStripeAccount,
      ready: false,
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      requirements_due: ["external_account"],
    });
    expect(fixture.stripe.accounts.create).toHaveBeenCalledTimes(1);
    expect(fixture.stripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        country: "CH",
        email: "sandbox-restaurant@example.test",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: expect.objectContaining({ restaurant_id: restaurantId, platform: "TOK" }),
      }),
      { idempotencyKey: "stripe-connect-account:" + restaurantId },
    );
    expect(fixture.writes[0]).toEqual({ stripe_account_id: fakeStripeAccount });
    expect(fixture.stripe.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({
      account: fakeStripeAccount,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: returnUrl,
    }));
    expect(fixture.writes[1]).toMatchObject({
      stripe_connect_details_submitted: false,
      stripe_connect_charges_enabled: false,
      stripe_connect_payouts_enabled: false,
      stripe_connect_requirements_due: ["external_account"],
    });
  });

  it("reuses an existing verified Express account and does not restart onboarding", async () => {
    const fixture = setupStripeConnectFixture({ alreadyConnected: true, ready: true });
    const response = await fixture.invoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      account_id: fakeStripeAccount,
      ready: true,
      charges_enabled: true,
      payouts_enabled: true,
      requirements_due: [],
    });
    expect(fixture.stripe.accounts.create).not.toHaveBeenCalled();
    expect(fixture.stripe.accountLinks.create).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(1);
    expect(fixture.writes[0]).toMatchObject({
      stripe_connect_details_submitted: true,
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: true,
      stripe_connect_requirements_due: [],
    });
  });

  it("synchronizes payout readiness from Stripe after fake bank verification", async () => {
    const fixture = setupStripeConnectFixture({
      functionName: "stripe-connect-status",
      alreadyConnected: true,
      ready: true,
    });
    const response = await fixture.invoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      account_id: fakeStripeAccount,
      ready: true,
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
      requirements_due: [],
    });
    expect(fixture.stripe.accounts.retrieve).toHaveBeenCalledWith(fakeStripeAccount);
    expect(fixture.writes[0]).toMatchObject({
      stripe_connect_details_submitted: true,
      stripe_connect_charges_enabled: true,
      stripe_connect_payouts_enabled: true,
      stripe_connect_requirements_due: [],
    });
  });

  it("blocks any Stripe side effects for a commercial demo restaurant", async () => {
    const fixture = setupStripeConnectFixture({ isDemo: true });
    const response = await fixture.invoke();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("DEMO_SIDE_EFFECT_BLOCKED");
    expect(fixture.stripe.accounts.create).not.toHaveBeenCalled();
    expect(fixture.stripe.accountLinks.create).not.toHaveBeenCalled();
    expect(fixture.writes).toHaveLength(0);
  });
});

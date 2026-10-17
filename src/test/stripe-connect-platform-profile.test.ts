import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import {
  isStripeConnectPlatformProfileRequired,
  STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
} from "../../supabase/functions/_shared/stripe-connect-platform-profile";
import {
  getStripeConnectOnboardingIssue,
  TOK_STRIPE_CONNECT_PLATFORM_PROFILE_URL,
} from "../lib/stripeConnectOnboarding";

const stripeProfileMessage =
  "Please review the responsibilities of managing losses for connected accounts at https://dashboard.stripe.com/settings/connect/platform-profile.";
const edgeSource = readFileSync("supabase/functions/stripe-connect-onboard/index.ts", "utf8");
const pageSource = readFileSync("src/pages/dashboard/DashboardRestaurant.tsx", "utf8");

describe("Stripe Connect platform liability onboarding blocker", () => {
  it("classifies the exact Stripe Live failure without exposing raw Stripe wording", () => {
    expect(isStripeConnectPlatformProfileRequired(new Error(stripeProfileMessage))).toBe(true);
    expect(isStripeConnectPlatformProfileRequired({ message: stripeProfileMessage })).toBe(true);
    expect(isStripeConnectPlatformProfileRequired(stripeProfileMessage)).toBe(true);
    expect(isStripeConnectPlatformProfileRequired(
      "Please review the responsibilities of managing losses and collecting requirements for connected accounts",
    )).toBe(true);
    expect(isStripeConnectPlatformProfileRequired(
      "You must complete your platform profile to use Connect and create live connected accounts.",
    )).toBe(true);
  });

  it("does not mistake unrelated provider/security errors for platform onboarding", () => {
    for (const input of [
      null, {}, { message: 42 }, new Error("No such account: acct_example"),
      new Error("Unauthorized API key"), new Error("The payment_intent could not be found"),
    ]) expect(isStripeConnectPlatformProfileRequired(input)).toBe(false);
  });

  it("identifies safe server codes or a legacy Stripe blocker, not arbitrary URLs", () => {
    expect(getStripeConnectOnboardingIssue({
      code: "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED",
      error: STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
    })).toBe("platform_profile_required");
    expect(getStripeConnectOnboardingIssue({ error: stripeProfileMessage }))
      .toBe("platform_profile_required");
    expect(getStripeConnectOnboardingIssue({ error: "unknown" })).toBeNull();
    expect(getStripeConnectOnboardingIssue(null)).toBeNull();
    expect(getStripeConnectOnboardingIssue({
      code: "OTHER_ERROR", action_url: "https://phishing.example",
    })).toBeNull();
    expect(TOK_STRIPE_CONNECT_PLATFORM_PROFILE_URL)
      .toBe("https://dashboard.stripe.com/settings/connect/platform-profile");
  });

  it("returns actionable HTTP 409 without persisting a restaurant or financial change", async () => {
    const source = ts.transpileModule(
      edgeSource.replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, ""),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    ).outputText;
    let handler: ((req: Request) => Promise<Response>) | undefined;
    class HttpError extends Error {
      constructor(public status: number, message: string) { super(message); }
    }
    const createAccount = vi.fn(async () => { throw new Error(stripeProfileMessage); });
    const databaseMutation = vi.fn();
    const writeAuditLog = vi.fn(async () => undefined);
    const actor = {
      userId: "e68cda98-442f-4d0c-95df-47413a1dfc48",
      adminClient: { from: databaseMutation },
      userClient: { auth: { getUser: async () => ({
        data: { user: { email: "restaurant@example.test" } },
      }) } },
    };
    const deps = {
      HttpError,
      Deno: {
        env: { get: () => "https://www.thetok.ch" },
        serve: (fn: (req: Request) => Promise<Response>) => { handler = fn; },
      },
      buildCorsHeaders: () => ({}),
      handleCorsPreflight: () => null,
      authenticateRequest: async () => actor,
      assertProductionFlowAllowed: async () => undefined,
      createAdminClient: () => actor.adminClient,
      jsonResponse: (payload: unknown, status: number) => Response.json(payload, { status }),
      requireRestaurantAccess: async () => ({
        id: "fe046974-2945-4cf5-89cb-9c52ff354b93",
        name: "Les Brasseurs", stripe_account_id: null, is_demo: false,
      }),
      getStripeRuntimeForCheckoutKind: () => ({ stripe: { accounts: { create: createAccount } } }),
      writeAuditLog,
      makeLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
      normalizeCheckoutReturnUrl: () => null,
      isStripeConnectPlatformProfileRequired,
      STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
    };
    new Function(...Object.keys(deps), source)(...Object.values(deps));
    expect(handler).toBeTypeOf("function");

    const req = new Request("https://example.test/functions/v1/stripe-connect-onboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurant_id: "fe046974-2945-4cf5-89cb-9c52ff354b93" }),
    });
    const response = await handler!(req);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED,
      code: "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED",
    });
    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(databaseMutation).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "stripe-connect-onboard",
      status: "failure",
    }));
  });

  it("shows the trusted Stripe profile link in a persistent dashboard notice", () => {
    expect(pageSource).toContain('getStripeConnectOnboardingIssue(data) === "platform_profile_required"');
    expect(pageSource).toContain('setConnectIssue("platform_profile_required")');
    expect(pageSource).toContain('role="alert"');
    expect(pageSource).toContain("TOK_STRIPE_CONNECT_PLATFORM_PROFILE_URL");
    expect(pageSource).toContain('target="_blank"');
    expect(pageSource).toContain('rel="noopener noreferrer"');
    expect(pageSource).toContain("if (data.ready === true)");
    expect(pageSource).toContain("redirectToTrustedCheckoutUrl(data.url)");
    expect(pageSource).not.toContain("redirectToTrustedCheckoutUrl(data.error)");
  });
});

import { describe, expect, it } from "vitest";
import { getPostAuthTargetForRole } from "@/lib/authPostLogin";
import { buildSanitizedAuthRedirectUrl } from "@/lib/authRedirect";
import { launchRouteAllowed } from "@/lib/launchGate";
import { buildAuthRedirectTarget } from "@/lib/stripeReturn";
import {
  buildWorkforceConfirmationRedirect,
  getWorkforceContinuationTarget,
  WORKFORCE_SELF_PATH,
} from "@/lib/workforceContinuation";

const restaurantId = "10000000-0000-4000-8000-000000000001";
const invitationTarget = WORKFORCE_SELF_PATH + "?restaurant=" + restaurantId;
const callbackHref = "https://www.thetok.ch/auth/callback";

describe("employee invitation authentication continuation", () => {
  it("accepts only the employee portal or the internal management destination", () => {
    expect(getWorkforceContinuationTarget(WORKFORCE_SELF_PATH)).toBe(WORKFORCE_SELF_PATH);
    expect(getWorkforceContinuationTarget("/equipe/gestion")).toBe("/equipe/gestion");
    expect(getWorkforceContinuationTarget(invitationTarget)).toBe(invitationTarget);
    expect(getWorkforceContinuationTarget("/equipe/gestion?restaurant=" + restaurantId)).toBe("/equipe/gestion?restaurant=" + restaurantId);
    const upperId = "ABCDEFAB-1234-5678-9ABC-ABCDEF123456";
    expect(getWorkforceContinuationTarget(WORKFORCE_SELF_PATH + "?restaurant=" + upperId))
      .toBe(WORKFORCE_SELF_PATH + "?restaurant=" + upperId.toLowerCase());
  });

  it.each([
    null, undefined, "", "/dashboard", "/equipe", "/equipe/mon-espace/",
    "/equipe/mon-espace/settings", "/equipe/gestion?restaurant=invalid", "/equipe/gestion?restaurant=" + restaurantId + "&admin=1",
    "https://attacker.example" + invitationTarget,
    "https://www.thetok.ch" + invitationTarget,
    "//attacker.example" + invitationTarget,
    "javascript:alert(1)", "/other/../equipe/mon-espace",
    "/equipe/mon-espace?", "/equipe/mon-espace?restaurant=",
    "/equipe/mon-espace?restaurant=not-a-uuid",
    invitationTarget + "&restaurant=" + restaurantId,
    invitationTarget + "&redirect=https://attacker.example",
    invitationTarget + "#", invitationTarget + "#fragment",
    invitationTarget + "\n", invitationTarget + "\u0000",
    "/equipe\\mon-espace?restaurant=" + restaurantId,
  ])("rejects malformed, foreign or ambiguous destinations: %s", (target) => {
    expect(getWorkforceContinuationTarget(target)).toBeNull();
  });

  it("preserves the signup operation and the employee destination for confirmation and resend", () => {
    const callback = new URL(buildWorkforceConfirmationRedirect(callbackHref, "signup-operation", invitationTarget));
    expect(callback.origin + callback.pathname).toBe(callbackHref);
    expect(callback.searchParams.get("confirmed")).toBe("1");
    expect(callback.searchParams.get("signup_operation_id")).toBe("signup-operation");
    expect(callback.searchParams.get("redirect")).toBe(invitationTarget);
    const resend = new URL(buildWorkforceConfirmationRedirect(callbackHref, null, callback.searchParams.get("redirect")));
    expect(resend.searchParams.get("redirect")).toBe(invitationTarget);
    expect(resend.searchParams.has("signup_operation_id")).toBe(false);
  });

  it.each(["/panier", "/admin", "https://attacker.example/equipe/mon-espace", invitationTarget + "&admin=1"])(
    "does not forward an arbitrary signup continuation: %s",
    (target) => {
      const callback = new URL(buildWorkforceConfirmationRedirect(callbackHref, "existing-operation", target));
      expect(callback.searchParams.has("redirect")).toBe(false);
      expect(callback.searchParams.get("signup_operation_id")).toBe("existing-operation");
    },
  );

  it("preserves the callback selected by authDomains, including native and local development", () => {
    for (const href of ["tok://auth/callback", "http://localhost:8080/auth/callback", callbackHref]) {
      const original = new URL(href);
      const callback = new URL(buildWorkforceConfirmationRedirect(href, null, invitationTarget));
      expect(callback.protocol).toBe(original.protocol);
      expect(callback.host).toBe(original.host);
      expect(callback.pathname).toBe(original.pathname);
      expect(callback.searchParams.get("redirect")).toBe(invitationTarget);
    }
  });

  it("resumes the same restaurant through the protected route, confirmation callback and launch gate", () => {
    const authLocation = new URL(buildAuthRedirectTarget(WORKFORCE_SELF_PATH, "?restaurant=" + restaurantId), callbackHref);
    const emailCallback = new URL(buildWorkforceConfirmationRedirect(
      callbackHref, null, authLocation.searchParams.get("redirect"),
    ));
    emailCallback.searchParams.set("code", "test-confirmation-code");
    const sanitized = new URL(buildSanitizedAuthRedirectUrl(emailCallback.href), callbackHref);
    expect(sanitized.searchParams.has("code")).toBe(false);
    const target = getPostAuthTargetForRole("client", sanitized.searchParams.get("redirect"), { launchEnabled: true });
    expect(target).toBe(invitationTarget);
    expect(launchRouteAllowed(new URL(target, callbackHref).pathname, {
      authenticated: true, role: "client", roles: ["client"], rolesResolved: true,
    })).toBe(true);
  });
});

describe("employee launch access stays limited to resolved account routes", () => {
  const actor = { authenticated: true, role: "client" as const, roles: ["client" as const], rolesResolved: true };

  it.each(["/equipe/mon-espace", "/equipe/gestion"])("allows the exact employee page %s after role resolution", (path) => {
    expect(launchRouteAllowed(path, actor)).toBe(true);
    expect(launchRouteAllowed(path, { ...actor, rolesResolved: false })).toBe(false);
  });

  it.each(["/", "/panier", "/profil", "/dashboard", "/admin", "/equipe", "/equipe/mon-espace/private", "/equipe/gestion/private"])(
    "keeps the other customer and privileged routes closed: %s",
    (path) => expect(launchRouteAllowed(path, actor)).toBe(false),
  );
});

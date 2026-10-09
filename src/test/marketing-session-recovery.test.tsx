import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketingSessionProvider from "@/marketing/MarketingSessionProvider";
import { useMarketingSession } from "@/marketing/MarketingSessionContext";
import { MarketingBffError } from "@/marketing/marketingBffClient";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/marketing/marketingBffClient")>(),
  marketingBffRequest: request,
}));

describe("marketing MFA recovery", () => {
  beforeEach(() => request.mockReset());
  afterEach(cleanup);

  async function startChallenge() {
    request.mockResolvedValueOnce({ authenticated: false });
    const hook = renderHook(useMarketingSession, { wrapper: MarketingSessionProvider });
    await waitFor(() => expect(hook.result.current.status).toBe("unauthenticated"));
    request.mockResolvedValueOnce({ status: "mfa_required" });
    await act(async () => { await hook.result.current.login("admin@example.com", "password123"); });
    expect(hook.result.current.status).toBe("challenge-mfa");
    return hook;
  }

  it("returns to credentials when the pending challenge expires", async () => {
    const { result } = await startChallenge();
    request.mockRejectedValueOnce(new MarketingBffError("ignored", 401, "authentication_required"));
    await act(async () => { expect(await result.current.verifyTotp("123456")).toBe(false); });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.error).toContain("identifiants");
  });

  it.each([
    [401, "mfa_failed", "Code invalide"],
    [429, undefined, "Trop de tentatives"],
    [503, undefined, "Service de vérification indisponible"],
  ])("preserves the MFA form and explains status %s", async (status, code, message) => {
    const { result } = await startChallenge();
    request.mockRejectedValueOnce(new MarketingBffError("ignored", status, code));
    await act(async () => { await result.current.verifyTotp("123456"); });
    expect(result.current.status).toBe("challenge-mfa");
    expect(result.current.error).toContain(message);
  });

  it("rechecks the session after successful MFA without resubmitting a consumed challenge", async () => {
    const { result } = await startChallenge();
    request.mockResolvedValueOnce({ status: "authenticated" });
    request.mockRejectedValueOnce(new MarketingBffError("unavailable", 503));
    await act(async () => { await result.current.verifyTotp("123456"); });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("vérifier la session");
    request.mockResolvedValueOnce({ authenticated: true, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await act(async () => { await result.current.refreshSession(); });
    expect(result.current.status).toBe("authenticated");
    expect(request.mock.calls.filter(([path]) => path === "/api/marketing/mfa/verify")).toHaveLength(1);
  });
});

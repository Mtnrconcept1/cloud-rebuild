import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OptionalAnalytics from "@/components/legal/OptionalAnalytics";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { DEFAULT_CONSENT, saveConsent } from "@/lib/consent";

const sdk = vi.hoisted(() => ({ render: vi.fn(), position: vi.fn(), permission: vi.fn() }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: (props: unknown) => { sdk.render(props); return null; } }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({
  auth: { getSession: async () => ({ data: { session: null } }) },
  from: () => ({ insert: async () => ({ error: null }) }),
}) }));
beforeEach(() => {
  window.localStorage.clear(); vi.clearAllMocks();
  sdk.permission.mockResolvedValue({ state: "granted" });
  vi.stubGlobal("navigator", { userAgent: "test", permissions: { query: sdk.permission }, geolocation: { getCurrentPosition: sdk.position } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("optional browser services", () => {
  it("loads analytics after acceptance and rejects events through old callbacks after withdrawal", async () => {
    render(<OptionalAnalytics />);
    expect(sdk.render).not.toHaveBeenCalled();
    await act(async () => { await saveConsent({ analytics: true }); });
    await waitFor(() => expect(sdk.render).toHaveBeenCalled());
    const callback = sdk.render.mock.calls.at(-1)![0].beforeSend as (event: object) => unknown;
    const event = { type: "pageview", url: "/" };
    expect(callback(event)).toBe(event);
    await act(async () => { await saveConsent(DEFAULT_CONSENT); });
    expect(callback(event)).toBeNull();
  });
  it("does not read a previously granted GPS permission before the TOK location choice", async () => {
    render(<AddressAutocomplete value="" onAddressSelect={vi.fn()} />);
    await act(async () => undefined);
    expect(sdk.permission).not.toHaveBeenCalled();
    expect(sdk.position).not.toHaveBeenCalled();
    await act(async () => { await saveConsent({ geolocation: true }); });
    await waitFor(() => expect(sdk.position).toHaveBeenCalledOnce());
    await act(async () => { await saveConsent({ geolocation: false }); });
    expect(sdk.position).toHaveBeenCalledOnce();
  });
  it("does not start GPS after a delayed permission response if the choice was withdrawn", async () => {
    let finish!: (value: { state: string }) => void;
    sdk.permission.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<AddressAutocomplete value="" onAddressSelect={vi.fn()} />);
    await act(async () => { await saveConsent({ geolocation: true }); });
    await act(async () => { await saveConsent({ geolocation: false }); });
    await act(async () => { finish({ state: "granted" }); });
    expect(sdk.position).not.toHaveBeenCalled();
  });
});

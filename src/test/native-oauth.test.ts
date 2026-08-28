import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  browserClose: vi.fn(),
  browserOpen: vi.fn(),
  exitApp: vi.fn(),
  isNative: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mocks.addListener,
    exitApp: mocks.exitApp,
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    close: mocks.browserClose,
    open: mocks.browserOpen,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

vi.mock("@/lib/platform", () => ({
  isNative: mocks.isNative,
}));

import {
  getOAuthAuthCallbackHref,
  TOK_NATIVE_AUTH_CALLBACK_HREF,
} from "@/lib/authDomains";
import { cleanupDeepLinks, setupDeepLinks } from "@/lib/deep-links";
import { startOAuthSignIn } from "@/lib/nativeOAuth";

describe("native OAuth", () => {
  const listeners = new Map<string, (event: { url: string }) => void>();

  beforeEach(() => {
    cleanupDeepLinks();
    listeners.clear();
    vi.clearAllMocks();

    mocks.isNative.mockReturnValue(true);
    mocks.browserOpen.mockResolvedValue(undefined);
    mocks.browserClose.mockResolvedValue(undefined);
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://supabase.example/auth/v1/authorize" },
      error: null,
    });
    mocks.addListener.mockImplementation((eventName: string, callback: (event: { url: string }) => void) => {
      listeners.set(eventName, callback);
      return Promise.resolve({ remove: vi.fn() });
    });
  });

  afterEach(() => {
    cleanupDeepLinks();
  });

  it("selects the custom callback only for a native app", () => {
    expect(getOAuthAuthCallbackHref(true, "www.thetok.ch"))
      .toBe(TOK_NATIVE_AUTH_CALLBACK_HREF);
    expect(getOAuthAuthCallbackHref(false, "www.thetok.ch"))
      .toBe("https://www.thetok.ch/auth/callback");
  });

  it("opens the Supabase Google authorization URL in the native browser", async () => {
    await startOAuthSignIn("google");

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "tok://auth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(mocks.browserOpen).toHaveBeenCalledWith({
      url: "https://supabase.example/auth/v1/authorize",
    });
  });

  it("keeps the existing web redirect flow outside Capacitor", async () => {
    mocks.isNative.mockReturnValue(false);

    await startOAuthSignIn("apple");

    const oauthRequest = mocks.signInWithOAuth.mock.calls[0]?.[0];
    expect(oauthRequest.provider).toBe("apple");
    expect(oauthRequest.options.redirectTo).toMatch(/\/auth\/callback$/);
    expect(oauthRequest.options).not.toHaveProperty("skipBrowserRedirect");
    expect(mocks.browserOpen).not.toHaveBeenCalled();
  });

  it("closes the OAuth browser and preserves the PKCE code on return", () => {
    const navigate = vi.fn();
    setupDeepLinks(navigate);

    const handleAppUrlOpen = listeners.get("appUrlOpen");
    expect(handleAppUrlOpen).toBeTypeOf("function");

    handleAppUrlOpen?.({ url: "tok://auth/callback?code=pkce-code" });

    expect(mocks.browserClose).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/auth/callback?code=pkce-code");
  });
});

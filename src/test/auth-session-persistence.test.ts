import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform, secure } = vi.hoisted(() => ({
  platform: { native: false },
  secure: {
    setKeyPrefix: vi.fn(),
    setDefaultKeychainAccess: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("@/lib/platform", () => ({ isNative: () => platform.native }));
vi.mock("@aparajita/capacitor-secure-storage", () => ({
  KeychainAccess: { whenUnlockedThisDeviceOnly: "device-only" },
  SecureStorage: secure,
}));

const key = "sb-test-auth-token";
const cookiePrefix = "tok_shared_auth_sb-test-auth-token";
const cookies = new Map<string, string>();
const writes: string[] = [];

async function adapter(hostname = "www.thetok.ch") {
  vi.stubGlobal("window", { location: { hostname } });
  return import("@/integrations/supabase/authStorage");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  platform.native = false;
  localStorage.clear();
  sessionStorage.clear();
  cookies.clear();
  writes.length = 0;
  vi.spyOn(document, "cookie", "get").mockImplementation(() =>
    [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
  );
  vi.spyOn(document, "cookie", "set").mockImplementation((value) => {
    writes.push(value);
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    if (/; Max-Age=0(?:;|$)/.test(value)) cookies.delete(name);
    else cookies.set(name, pair.slice(separator + 1));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TOK auth session persistence", () => {
  it.each([true, false])("keeps remember=%s across token refreshes and subdomains", async (remember) => {
    const { authStorage, setAuthSessionPersistence } = await adapter();
    setAuthSessionPersistence(remember);
    authStorage.setItem(key, "synthetic-session");
    expect(authStorage.getItem(key)).toBe("synthetic-session");
    expect(localStorage.getItem(key)).toBeNull();

    const chunk = writes.find((value) => value.startsWith(`${cookiePrefix}_0=`) && !value.includes("Max-Age=0;"));
    expect(chunk).toContain("Domain=.thetok.ch");
    expect(chunk).toContain("SameSite=Lax; Secure");
    expect(chunk?.includes("Max-Age=31536000")).toBe(remember);

    vi.stubGlobal("window", { location: { hostname: "admin.thetok.ch" } });
    expect(authStorage.getItem(key)).toBe("synthetic-session");
    authStorage.setItem(key, "refreshed-session");
    expect(writes.at(-1)?.includes("Max-Age=31536000")).toBe(remember);
    authStorage.removeItem(key);
    expect(authStorage.getItem(key)).toBeNull();
  });

  it("preserves the existing lifetime for sessions with no explicit choice", async () => {
    const { authStorage } = await adapter();
    authStorage.setItem(key, "legacy-session");
    expect(writes.at(-1)).toContain("Max-Age=31536000");
  });

  it("uses tab storage off-domain for an unchecked login without retaining a persistent token", async () => {
    const { authStorage, setAuthSessionPersistence } = await adapter("localhost");
    localStorage.setItem(key, "old-session");
    setAuthSessionPersistence(false);
    authStorage.setItem(key, "temporary-session");
    expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(key)).toBe("temporary-session");
    expect(authStorage.getItem(key)).toBe("temporary-session");
    authStorage.removeItem(key);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("does not create a shared Supabase credential or preference on the isolated marketing host", async () => {
    const { authStorage, setAuthSessionPersistence } = await adapter("marketing.thetok.ch");
    setAuthSessionPersistence(true);
    authStorage.setItem(key, "must-not-persist");
    expect(authStorage.getItem(key)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("leaves native secure storage unchanged", async () => {
    platform.native = true;
    const { authStorage, setAuthSessionPersistence } = await adapter();
    setAuthSessionPersistence(false);
    await authStorage.setItem(key, "native-session");
    expect(secure.setItem).toHaveBeenCalledWith(key, "native-session");
    expect(writes).toEqual([]);
  });
});

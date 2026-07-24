import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}));

import {
  CONSENT_STORAGE_KEY,
  DEFAULT_CONSENT,
  readConsent,
  saveConsent,
} from "@/lib/consent";
import { TRACKER_INVENTORY } from "@/lib/cookieInventory";

describe("granular legal consent", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults every optional category to refused", () => {
    expect(DEFAULT_CONSENT).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      personalization: false,
      geolocation: false,
    });
  });

  it("always keeps necessary technologies enabled", async () => {
    await saveConsent({ necessary: false, analytics: true }, "banner");
    expect(readConsent()?.preferences).toMatchObject({ necessary: true, analytics: true });
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toContain('"necessary":true');
  });

  it("documents every required category in the inventory", () => {
    const categories = new Set(TRACKER_INVENTORY.map((item) => item.category));
    expect(categories).toEqual(new Set(["necessary", "analytics", "marketing", "personalization", "geolocation"]));
    expect(TRACKER_INVENTORY.every((item) => item.provider && item.duration && item.activation)).toBe(true);
  });
});

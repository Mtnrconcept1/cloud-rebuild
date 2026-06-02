import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_SETTINGS, detectServiceFromTime, getServicePeriodFromMetadata, getServicePeriodLabel, getServiceSettings } from "@/lib/serviceSettings";

describe("service settings helpers", () => {
  it("detects lunch and dinner from time", () => {
    expect(detectServiceFromTime("12:15")).toBe("lunch");
    expect(detectServiceFromTime("19:30")).toBe("dinner");
  });

  it("prefers metadata service when available", () => {
    expect(getServicePeriodFromMetadata({ service: "lunch" }, "20:00")).toBe("lunch");
    expect(getServicePeriodFromMetadata({ service: "dinner" }, "12:00")).toBe("dinner");
  });

  it("falls back to time when metadata is absent", () => {
    expect(getServicePeriodFromMetadata({}, "13:00")).toBe("lunch");
    expect(getServicePeriodFromMetadata(null, "21:00")).toBe("dinner");
  });

  it("returns french-friendly labels", () => {
    expect(getServicePeriodLabel("lunch")).toBe("Midi");
    expect(getServicePeriodLabel("dinner")).toBe("Soir");
  });

  it("parses reservation confirmation and optional deposit controls", () => {
    const settings = getServiceSettings({
      service_settings: {
        dinner: {
          ...DEFAULT_SERVICE_SETTINGS.dinner,
          restaurant_confirmation_required: false,
          confirmation_deadline_minutes: 30,
          deposit_amount_chf: 12.5,
        },
      },
    });

    expect(settings.dinner.restaurant_confirmation_required).toBe(false);
    expect(settings.dinner.confirmation_deadline_minutes).toBe(30);
    expect(settings.dinner.deposit_amount_chf).toBe(12.5);
    expect(settings.lunch.restaurant_confirmation_required).toBe(true);
    expect(settings.lunch.deposit_amount_chf).toBe(0);
  });
});

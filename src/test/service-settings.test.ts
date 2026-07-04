import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_SETTINGS,
  detectServiceFromTime,
  getConfiguredServiceSettings,
  getServicePeriodFromMetadata,
  getServicePeriodLabel,
  getServiceSettings,
} from "@/lib/serviceSettings";

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

  it("does not invent customer-facing service slots when profile hours are absent", () => {
    expect(getConfiguredServiceSettings(null)).toBeNull();
    expect(getConfiguredServiceSettings({ service_settings: {} })).toBeNull();
  });

  it("only returns explicitly configured customer-facing service windows", () => {
    const settings = getConfiguredServiceSettings({
      service_settings: {
        dinner: {
          start_time: "18:30",
          end_time: "21:30",
          last_reservation_time: "21:00",
          online_booking_enabled: true,
          service_closed: false,
        },
      },
    });

    expect(settings?.dinner.start_time).toBe("18:30");
    expect(settings?.dinner.last_reservation_time).toBe("21:00");
    expect(settings?.lunch.service_closed).toBe(true);
    expect(settings?.lunch.online_booking_enabled).toBe(false);
  });
});

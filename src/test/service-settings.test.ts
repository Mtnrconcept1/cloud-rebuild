import { describe, expect, it } from "vitest";
import { detectServiceFromTime, getServicePeriodFromMetadata, getServicePeriodLabel } from "@/lib/serviceSettings";

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
});

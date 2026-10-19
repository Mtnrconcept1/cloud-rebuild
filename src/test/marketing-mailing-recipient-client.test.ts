import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareMarketingMailingRecipients } from "@/marketing/marketingClient";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { agent: "/api/marketing/agent" }, marketingBffRequest: request }));
const response = () => ({ ok: true, recipient_count: 2, created_count: 1, existing_count: 1,
  estimate: { total: 2, eligible: 1, eligible_count: 1, channels: [{ channel: "email", eligible: 1, availability: "available" }] } });
beforeEach(() => { request.mockReset(); request.mockResolvedValue(response()); });

describe("mailing recipient preparation client", () => {
  it("normalizes and deduplicates the exclusive list without granting consent", async () => {
    const signal = new AbortController().signal;
    await expect(prepareMarketingMailingRecipients([" A@Example.test ", "a@example.test", "b@example.test"], signal)).resolves.toEqual({
      createdCount: 1, estimate: { total: 2, eligible: 1, byChannel: { email: 1 }, availabilityByChannel: { email: "available" } },
    });
    expect(request).toHaveBeenCalledWith("/api/marketing/agent", { method: "POST", timeoutMs: 60_000, signal,
      body: { action: "prepare_mailing_recipients", recipientEmails: ["a@example.test", "b@example.test"] } });
  });
  it.each([[], ["broken"], ["a@example.test\r\nBcc: b@example.test"], Array.from({ length: 501 }, (_, i) => `r${i}@example.test`)])(
    "rejects invalid lists before any request", async (...args) => {
      const emails = args as string[];
      await expect(prepareMarketingMailingRecipients(emails)).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ok: false }, { recipient_count: 3 }, { created_count: -1 }, { created_count: 0 },
    { existing_count: 1.5 }, { estimate: {} }, { estimate: { total: 2, channels: [] } },
    { estimate: { total: "2", channels: [{ channel: "email", eligible: 1 }] } },
  ])("rejects incomplete or mismatched preparation responses: %j", async (invalid) => {
    request.mockResolvedValue({ ...response(), ...invalid });
    await expect(prepareMarketingMailingRecipients(["a@example.test", "b@example.test"])).rejects.toThrow("incomplète");
  });
  it("retains a successful zero-eligibility estimate for draft preparation", async () => {
    request.mockResolvedValue({ ...response(), created_count: 2, existing_count: 0, estimate: {
      total: 2, eligible: 0, eligible_count: 0, channels: [{ channel: "email", eligible: 0, availability: "disconnected" }],
    } });
    await expect(prepareMarketingMailingRecipients(["a@example.test", "b@example.test"])).resolves.toMatchObject({
      createdCount: 2, estimate: { total: 2, eligible: 0, byChannel: { email: 0 } },
    });
  });
});

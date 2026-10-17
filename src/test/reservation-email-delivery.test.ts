import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { buildReservationConfirmationEmail } from "../../supabase/functions/_shared/transactional-emails";

// Execute production worker functions, mocking only provider/database boundaries.
const source = readFileSync("supabase/functions/send-email/index.ts", "utf8")
  .replace(/import\s[\s\S]*?from\s["'][^"']+["'];/g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function harness(response: Response = Response.json({ id: "provider-acceptance-1" })) {
  const fetch = vi.fn(async () => response.clone());
  const dependencies = {
    fetch, AbortSignal, buildReservationConfirmationEmail,
    Deno: { env: { get: () => undefined }, serve: () => {} },
  };
  const handlers = new Function(...Object.keys(dependencies),
    `${compiled};return {sendEmailMessage,buildNotificationEmailBody,settleNotificationDelivery};`)(...Object.values(dependencies));
  return { ...handlers, fetch };
}

describe("reservation email provider delivery", () => {
  it("reuses the stable provider key and returns an acceptance reference", async () => {
    const h = harness();
    const message = { to: "client@example.test", subject: "Réservation", text: "En attente", idempotencyKey: "tok:notification:delivery-1" };
    await expect(h.sendEmailMessage("test-only-key", message)).resolves.toBe("provider-acceptance-1");
    await h.sendEmailMessage("test-only-key", message);
    const requests = h.fetch.mock.calls as unknown as [string, RequestInit][];
    expect(requests[0][1].headers).toMatchObject({ "Idempotency-Key": message.idempotencyKey });
    expect(requests[1][1].headers).toMatchObject({ "Idempotency-Key": message.idempotencyKey });
    expect(requests[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("does not claim success without credentials or a provider reference", async () => {
    const h = harness(Response.json({ accepted: true }));
    const message = { to: "client@example.test", subject: "Réservation", idempotencyKey: "delivery-1" };
    await expect(h.sendEmailMessage(null, message)).rejects.toThrow("not configured");
    expect(h.fetch).not.toHaveBeenCalled();
    await expect(h.sendEmailMessage("test-only-key", message)).rejects.toThrow("reference missing");
    const failed = harness(new Response("sensitive provider payload", { status: 503 }));
    await expect(failed.sendEmailMessage("test-only-key", message)).rejects.toThrow(/^Resend API error: 503$/);
  });

  it("renders the committed pending snapshot without announcing acceptance", () => {
    const h = harness();
    const pending = h.buildNotificationEmailBody({ title: "Demande enregistrée", body: "En attente", data: {
      reservation_event_key: "reservation:1:created:1", event: "created", status: "pending",
      reservation_id: "booking-1", recipient_role: "customer", restaurant_name: "Gazelle <test>",
      date: "2027-01-02", time: "19:00:00", party_size: 7, url: "/reservations",
    } });
    expect(pending.text).toContain("7");
    expect(pending.text).toContain("en attente de la réponse du restaurant");
    expect(pending.html).toContain("Gazelle &lt;test&gt;");
    expect(pending.html).not.toContain("est confirmée");
    const cancellation = h.buildNotificationEmailBody({ title: "Annulée", body: "Réservation annulée <script>bad</script>", data: { url: "/reservations" } });
    expect(cancellation.text).toContain("Réservation annulée");
    expect(cancellation.html).not.toContain("<script>");
    expect(cancellation.html).toContain("https://www.thetok.ch/reservations");
  });

  it("stores acceptance reference under the active lease before settling sent", async () => {
    const h = harness();
    const filters: unknown[] = [];
    const update = vi.fn();
    const query = {
      update: (patch: unknown) => { update(patch); return query; },
      eq: (...args: unknown[]) => { filters.push(args); return query; },
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const rpc = vi.fn(async () => ({ error: null }));
    await h.settleNotificationDelivery({ from: () => query, rpc }, {
      id: "delivery-1", leaseToken: "lease-1", success: true, providerMessageId: "provider-1",
    });
    expect(update).toHaveBeenCalledWith({ provider_message_id: "provider-1" });
    expect(filters).toContainEqual(["lease_token", "lease-1"]);
    expect(filters).toContainEqual(["status", "leased"]);
    expect(rpc).toHaveBeenCalledWith("settle_notification_delivery", expect.objectContaining({ p_success: true, p_lease_token: "lease-1" }));
  });
});

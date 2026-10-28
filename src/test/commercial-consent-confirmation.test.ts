import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildConsentMail, confirmationToken, deliverConsentEmail, createConfirmationHandler } from "../../supabase/functions/_shared/commercial-consent-confirmation";

const id = "00000000-0000-4000-8000-000000000111";
const token = "a".repeat(64);
const proof = {
  receipt_id: id, queue_id: id, email: "owner@example.com", restaurant_name: "Restaurant <test>",
  signer_name: "Personne Test", signer_role: "Gérant", signed_at: "2026-10-27T12:00:00Z",
  signature_data: "data:image/png;base64,iVBORw0KGgo" + "A".repeat(220),
  document: { version: "test-v3", controller: "Exploitant test", address: "Rue de test 1", contact: "contact@example.com", text: "J’accepte uniquement les e-mails TOK.", privacy: "Données privées." },
  proof_hash: "b".repeat(64), expires_at: "2026-10-29T12:00:00Z",
};
describe("e-mail transactionnel du consentement", () => {
  it("inclut le texte signé, l’identité, le PNG CID et JE CONSENS, jamais une image publique de signature", () => {
    const mail = buildConsentMail(proof, token, "TOK <contact@mailing.thetok.ch>");
    expect(mail.to).toEqual([proof.email]); expect(mail.html).toContain("JE CONSENS");
    expect(mail.html).toContain("cid:tok-signature"); expect(mail.html).not.toContain("data:image/png");
    expect(mail.html).toContain("Restaurant &lt;test&gt;"); expect(mail.html).toContain(proof.document.text);
    expect(mail.html).toContain(proof.document.privacy); expect(mail.text).toContain(proof.proof_hash);
    expect(mail.html).toContain("consentement-email.html#token=" + token);
    expect(mail.html).not.toContain("?token="); expect(mail.html).toContain("Retirer mon autorisation");
    expect(mail.attachments).toEqual([{ filename: "signature-TOK.png", content: proof.signature_data.slice(22), content_type: "image/png", content_id: "tok-signature" }]);
  });
  it("annonce la signature déjà valable sans exiger le clic pour les campagnes", () => {
    const mail = buildConsentMail(proof, token, "TOK <test@example.com>");
    expect(mail.text).toContain("Votre signature autorise déjà");
    expect(mail.text).toContain("confirmation complémentaire");
    expect(mail.text).not.toContain("Sans confirmation");
  });
  it("envoie un accusé final distinct avec les deux dates, sans demander de troisième confirmation", () => {
    const confirmed = { ...proof, mail_kind: "acknowledgement" as const, confirmed_at: "2026-10-27T13:00:00Z" };
    const mail = buildConsentMail(confirmed, token, "TOK <test@example.com>");
    expect(mail.subject).toBe("TOK — Votre double confirmation est enregistrée");
    expect(mail.text).toContain(confirmed.confirmed_at.replace("Z", ".000Z"));
    expect(mail.text).toContain("Signature enregistrée");
    expect(mail.html).toContain("CONSULTER MON REÇU");
    expect(mail.html).not.toContain(">JE CONSENS</a>");
    expect(mail.attachments[0].content_id).toBe("tok-signature");
  });
  it("refuse un autre format de signature et une capacité malformée", () => {
    expect(() => buildConsentMail({ ...proof, signature_data: "data:image/svg+xml,<svg>" }, token, "TOK <test@example.com>")).toThrow();
    expect(() => buildConsentMail(proof, "broken", "TOK <test@example.com>")).toThrow();
  });
  it("dérive un jeton de boîte stable, séparé par finalité et par reçu", async () => {
    const a = await confirmationToken("server-secret-only", id);
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(a).toBe(await confirmationToken("server-secret-only", id));
    expect(a).not.toBe(await confirmationToken("different-secret", id));
    expect(a).not.toBe(await confirmationToken("server-secret-only", "00000000-0000-4000-8000-000000000112"));
  });
  function harness(options: { claim?: unknown; status?: number; settleFails?: boolean } = {}) {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "commercial_consent_email_payload") return { data: proof, error: null };
      if (name === "commercial_claim_consent_email") return { data: options.claim === undefined ? { lease_token: id } : options.claim, error: null };
      return options.settleFails ? { data: null, error: { message: "SECRET raw server error" } } : { data: true, error: null };
    });
    const send = vi.fn(async () => new Response(JSON.stringify({ id: "provider-acceptance", secret: "NEVER LOG" }), { status: options.status || 200 }));
    return { calls, rpc, send, deliver: () => deliverConsentEmail({ rpc, queueId: id, secret: "server-secret-only", apiKey: "provider-secret", from: "TOK <test@example.com>", fetcher: send }) };
  }
  it("ne soumet au fournisseur qu’un mail issu de la preuve, après claim atomique", async () => {
    const h = harness(); expect(await h.deliver()).toBe("sent"); expect(h.send).toHaveBeenCalledTimes(1);
    const [url, init] = h.send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails"); expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("tok:commercial-consent:" + id);
    const mail = JSON.parse(String(init.body)); expect(mail.to).toEqual([proof.email]); expect(mail.attachments[0].content_id).toBe("tok-signature");
    expect(h.calls[1].args.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(h.calls.at(-1)?.args).toMatchObject({ p_lease_token: id, p_provider_id: "provider-acceptance", p_error: null });
  });
  it("l’accusé final garde le lien initial mais possède sa propre clé d’envoi", async () => {
    const ackId = "00000000-0000-4000-8000-000000000222";
    const ackProof = { ...proof, queue_id: ackId, confirmation_queue_id: id, mail_kind: "acknowledgement", confirmed_at: "2026-10-27T13:00:00Z" };
    const rpc = vi.fn(async (name: string) => ({ data: name === "commercial_consent_email_payload" ? ackProof : name === "commercial_claim_consent_email" ? { lease_token: id } : true, error: null }));
    const send = vi.fn(async () => new Response(JSON.stringify({ id: "ack-provider" })));
    expect(await deliverConsentEmail({ rpc, queueId: ackId, secret: "server-secret-only", apiKey: "provider-secret", from: "TOK <test@example.com>", fetcher: send })).toBe("sent");
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    const mail = JSON.parse(String(init.body));
    expect(mail.subject).toContain("double confirmation");
    expect(mail.html).toContain("#token=" + await confirmationToken("server-secret-only", id));
    expect((init.headers as Record<string,string>)["Idempotency-Key"]).toBe("tok:commercial-consent:" + ackId);
    expect(rpc.mock.calls.some(call => call[0] === "commercial_consent_public_action")).toBe(false);
  });
  it("refuse un accusé final sans date de confirmation réelle", () => {
    expect(() => buildConsentMail({ ...proof, mail_kind: "acknowledgement" }, token, "TOK <test@example.com>")).toThrow();
  });
  it("ne double pas un mail déjà réclamé et ne contourne pas un refus serveur", async () => {
    const h = harness({ claim: null }); expect(await h.deliver()).toBe("skipped"); expect(h.send).not.toHaveBeenCalled();
  });
  it("enregistre les échecs sans réponse fournisseur privée ni fausse confirmation", async () => {
    const h = harness({ status: 422 }); expect(await h.deliver()).toBe("failed");
    expect(h.calls.at(-1)?.args).toMatchObject({ p_provider_id: null, p_error: "provider_http_422" });
    expect(JSON.stringify(h.calls)).not.toContain("NEVER LOG");
  });
  it("un échec de règlement ne déclenche jamais un second envoi", async () => {
    const h = harness({ settleFails: true }); await expect(h.deliver()).rejects.toThrow("consent_delivery_unsettled");
    expect(h.send).toHaveBeenCalledTimes(1);
  });
});

describe("confirmation publique avec capacité privée", () => {
  function harness(error: string | null = null) {
    const rpc = vi.fn(async () => ({ data: { state: "confirmed", email_eligible: true }, error: error ? { message: error } : null }));
    return { rpc, handler: createConfirmationHandler({ rpc, originAllowed: req => !req.headers.get("origin") || req.headers.get("origin") === "https://www.thetok.ch" }) };
  }
  const post = (data: unknown, headers = {}) => new Request("https://www.thetok.ch/functions/v1/commercial-consent-confirmation", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data) });
  it("GET et aperçus ne valident jamais", async () => {
    const h = harness(); expect((await h.handler(new Request("https://www.thetok.ch/functions/v1/commercial-consent-confirmation?token=" + token))).status).toBe(405);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("consulter n’est pas consentir et le jeton brut ne va pas dans la RPC", async () => {
    const h = harness(); const r = await h.handler(post({ action: "view", token })); expect(r.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("commercial_consent_public_action", { p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_action: "view" });
    expect(JSON.stringify(h.rpc.mock.calls)).not.toContain(token);
    expect(r.headers.get("Cache-Control")).toBe("no-store"); expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("exige une confirmation positive distincte et ne fait confiance à aucun destinataire fourni", async () => {
    const h = harness(); expect((await h.handler(post({ action: "confirm", token }))).status).toBe(400);
    expect(h.rpc).not.toHaveBeenCalled();
    expect((await h.handler(post({ action: "confirm", token, agree: true, email: "attacker@example.com" }))).status).toBe(200);
    expect(h.rpc.mock.calls[0][1]).not.toHaveProperty("email");
  });
  it("rejette token malformé, origine externe, corps surdimensionné et action inconnue", async () => {
    const h = harness();
    for (const body of [{ action: "confirm", token: "bad", agree: true }, { action: "configure", token }]) expect((await h.handler(post(body))).status).toBe(400);
    expect((await h.handler(post({ action: "view", token }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await h.handler(post({ action: "view", token, padding: "x".repeat(6000) }))).status).toBe(413);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each(["consent_link_invalid", "consent_link_expired", "consent_link_revoked", "SECRET database error"]) ("échoue sans fuite pour %s", async error => {
    const h = harness(error); const r = await h.handler(post({ action: "confirm", token, agree: true })); expect(r.status).toBeGreaterThanOrEqual(400);
    const text = await r.text(); expect(text).not.toContain("SECRET"); expect(text).not.toContain(token);
  });
});

it("isole la file de consentement des anciens workers et conserve la branche spéciale", () => {
  const worker = readFileSync("supabase/functions/send-email/index.ts", "utf8");
  expect(worker).toContain('.in("status", ["queued", "consent_pending"])');
  const start = worker.indexOf("if (email.metadata?.kind === CONSENT_EMAIL_KIND)");
  const end = worker.indexOf("// Concurrent scheduled workers", start);
  expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
  expect(worker.slice(start, end)).toContain("continue;");
});

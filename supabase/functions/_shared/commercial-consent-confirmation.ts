/** Pure/testable confirmation boundary. No public signature URL or raw token in database/audit. */
export const CONSENT_EMAIL_KIND = "commercial_email_consent_confirmation";
export type ConsentRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message?: string } | null }>;
type MailProof = {
  receipt_id: string; queue_id: string; email: string; restaurant_name: string; signer_name: string; signer_role: string;
  signed_at: string; signature_data: string; proof_hash: string; expires_at: string;
  mail_kind?: "acknowledgement"; confirmed_at?: string; confirmation_queue_id?: string;
  document: { version: string; controller: string; address: string; contact: string; text: string; privacy: string };
};
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
export const consentHash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
export async function confirmationToken(secret: string, queueId: string): Promise<string> {
  if (!secret || !UUID.test(queueId)) throw new Error("consent_delivery_configuration");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tok-commercial-confirmation/v1:${queueId}`)));
}
export function buildConsentMail(proof: MailProof, token: string, from: string) {
  if (!proof || !UUID.test(proof.receipt_id) || !TOKEN.test(token) || !from || /[\r\n]/.test(from)
    || typeof proof.signature_data !== "string" || proof.signature_data.length > 180000 || proof.signature_data.length < 200
    || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(proof.signature_data)) throw new Error("consent_delivery_invalid");
  const link = `https://www.thetok.ch/consentement-email.html#token=${token}`;
  const d = proof.document;
  const acknowledged = proof.mail_kind === "acknowledgement";
  if (proof.mail_kind !== undefined && !acknowledged) throw new Error("consent_delivery_invalid");
  if (acknowledged && (!proof.confirmed_at || !Number.isFinite(Date.parse(proof.confirmed_at)))) throw new Error("consent_delivery_invalid");
  const confirmedDate = acknowledged ? new Date(proof.confirmed_at!).toISOString() : null;
  const heading = acknowledged ? "Votre double confirmation est enregistrée." : "Votre consentement signé est enregistré.";
  const action = acknowledged ? "CONSULTER MON REÇU" : "JE CONSENS";
  const instruction = acknowledged
    ? "Votre approbation par e-mail ajoute une seconde preuve à votre consentement signé. Cet accusé ne demande aucune nouvelle validation et n’envoie aucune campagne."
    : "Votre signature autorise déjà les e-mails TOK décrits ci-dessus, sous réserve de vos préférences et oppositions. JE CONSENS ajoute une confirmation complémentaire depuis votre boîte et déclenche un e-mail récapitulatif. Cette étape est facultative.";
  // Fixed formatting, independent of delivery/retry time: Resend idempotency binds the exact payload.
  const date = new Date(proof.signed_at).toISOString();
  const deadline = new Date(proof.expires_at).toISOString();
  const text = [`TOK — ${heading}`, `Pour : ${proof.restaurant_name}`, `Signataire : ${proof.signer_name} — ${proof.signer_role}`,
    `Adresse : ${proof.email}`, `Signature enregistrée : ${date}`, ...(confirmedDate ? [`Confirmation par e-mail : ${confirmedDate}`] : []), "",
    `${d.controller} — ${d.address}`, `Contact et retrait : ${d.contact}`, "", d.text, "", d.privacy,
    "", "La signature manuscrite enregistrée est jointe à cet e-mail.",
    `${action} : ${link}`, instruction,
    "La simple ouverture du lien n’ajoute aucune confirmation. Aucun abonnement ou achat. Si vous n’êtes pas à l’origine de cette demande, retirez l’autorisation depuis le reçu ou contactez TOK.",
    ...(acknowledged ? [] : [`Confirmation complémentaire possible jusqu’au ${deadline}. L’expiration de ce lien ne retire pas le consentement signé.`]),
    "Lien personnel et confidentiel : ne le transférez pas.",
    `Version : ${d.version}`, `Référence : ${proof.receipt_id}`, `Empreinte : ${proof.proof_hash}`, "", `Retirer mon autorisation / me désabonner : ${link}`].join("\n");
  const paragraph = (s: string) => `<p style="margin:0 0 16px;line-height:1.65;overflow-wrap:anywhere">${escape(s).replace(/\n/g, "<br>")}</p>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Votre autorisation TOK</title></head>
<body style="margin:0;background:#FFF7EB;color:#211C19;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e8dfd5"><tr><td style="padding:28px">
<img src="https://www.thetok.ch/logotok.png" alt="TOK" width="96" style="display:block;border:0;height:auto;margin-bottom:24px">
<h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.15;margin:0 0 24px">${heading}</h1>
${paragraph(`${proof.restaurant_name}\n${proof.signer_name} — ${proof.signer_role}\n${proof.email}\nSignature enregistrée : ${date}${confirmedDate ? "\nConfirmation par e-mail : " + confirmedDate : ""}`)}
${paragraph(`${d.controller}\n${d.address}\nContact et retrait : ${d.contact}`)}
${paragraph(d.text)}${paragraph(d.privacy)}
<p style="font-weight:bold">Votre signature enregistrée</p><img src="cid:tok-signature" alt="Votre signature manuscrite enregistrée, également jointe à cet e-mail" width="540" style="display:block;width:100%;max-width:540px;height:auto;border:1px solid #e8dfd5;background:white">
<p style="margin:28px 0"><a href="${link}" style="display:inline-block;padding:16px 28px;background:#F4551E;color:#211C19;text-decoration:none;font-weight:900;font-size:18px">${action}</a></p>
${paragraph(instruction)}
${paragraph("Aucun abonnement, aucun achat. La simple ouverture du lien n’ajoute aucune confirmation. Si vous n’êtes pas à l’origine de cette demande, retirez l’autorisation depuis le reçu ou contactez TOK. Ce lien est personnel : ne le transférez pas.")}
${acknowledged ? "" : paragraph(`Confirmation complémentaire possible jusqu’au ${deadline}. Son expiration ne retire pas votre consentement signé.`)}
<p style="font-size:11px;overflow-wrap:anywhere;word-break:break-word">Version : ${escape(d.version)}<br>Référence : ${escape(proof.receipt_id)}<br>Empreinte : ${escape(proof.proof_hash)}</p>
<hr style="border:0;border-top:1px solid #e8dfd5;margin:24px 0"><p style="font-size:13px"><a href="${link}" style="color:#9d350c">Retirer mon autorisation / me désabonner</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { from, to: [proof.email], subject: acknowledged ? "TOK — Votre double confirmation est enregistrée" : "TOK — Votre consentement signé et sa confirmation complémentaire", html, text,
    attachments: [{ filename: "signature-TOK.png", content: proof.signature_data.slice(22), content_type: "image/png", content_id: "tok-signature" }] };
}
export async function deliverConsentEmail(input: { rpc: ConsentRpc; queueId: string; secret: string; apiKey: string | null; from: string; fetcher?: typeof fetch }): Promise<"sent" | "failed" | "skipped"> {
  const { rpc, queueId } = input;
  const payload = await rpc("commercial_consent_email_payload", { p_queue_id: queueId });
  if (payload.error) throw new Error("consent_delivery_unavailable");
  if (!payload.data) return "skipped";
  const token = await confirmationToken(input.secret, payload.data.confirmation_queue_id || queueId);
  const mail = buildConsentMail(payload.data, token, input.from);
  const claim = await rpc("commercial_claim_consent_email", { p_queue_id: queueId, p_token_hash: await consentHash(token), p_payload_hash: await consentHash(JSON.stringify(mail)) });
  if (claim.error) throw new Error("consent_delivery_unavailable");
  if (!claim.data) return "skipped";
  let providerId: string | null = null;
  let error: string | null = null;
  try {
    if (!input.apiKey) error = "provider_not_configured";
    else {
      const response = await (input.fetcher || fetch)("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `tok:commercial-consent:${queueId}` }, body: JSON.stringify(mail), signal: AbortSignal.timeout(20000) });
      if (!response.ok) error = `provider_http_${response.status}`;
      else { const result = await response.json(); if (typeof result.id === "string" && result.id.length <= 200 && result.id.length > 0) providerId = result.id; else error = "provider_reference_missing"; }
    }
  } catch { error = "provider_network_error"; }
  // Never retry the provider inside the catch for a failed database settlement.
  // Recovery reclaims the same queue/idempotency key, within the provider's 24h window.
  const settled = await rpc("commercial_settle_consent_email", { p_queue_id: queueId, p_lease_token: claim.data.lease_token, p_provider_id: providerId, p_error: error });
  if (settled.error || settled.data !== true) throw new Error("consent_delivery_unsettled");
  return providerId ? "sent" : "failed";
}

class BoundaryError extends Error { constructor(public status: number, message: string) { super(message); } }
async function smallBody(req: Request): Promise<any> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new BoundaryError(415, "Requête non valide.");
  if (Number(req.headers.get("content-length")) > 4096) throw new BoundaryError(413, "Requête trop volumineuse.");
  const reader = req.body?.getReader(); if (!reader) throw new BoundaryError(400, "Requête vide.");
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 4096) { await reader.cancel(); throw new BoundaryError(413, "Requête trop volumineuse."); } chunks.push(part.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; } catch { throw new BoundaryError(400, "Requête non valide."); }
}
export function createConfirmationHandler(input: { rpc: ConsentRpc; originAllowed: (req: Request) => boolean; cors?: (req: Request) => Record<string, string> }) {
  return async (req: Request): Promise<Response> => {
    const headers = { ...input.cors?.(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (!input.originAllowed(req)) throw new BoundaryError(403, "Origine non autorisée.");
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (req.method !== "POST") throw new BoundaryError(405, "La confirmation nécessite une action explicite.");
      const data = await smallBody(req);
      if (typeof data.token !== "string" || !TOKEN.test(data.token) || !["view", "confirm", "withdraw"].includes(data.action)
        || (data.action !== "view" && data.agree !== true)) throw new BoundaryError(400, "Lien ou confirmation non valide.");
      const result = await input.rpc("commercial_consent_public_action", { p_token_hash: await consentHash(data.token), p_action: data.action });
      if (result.error) {
        const errors: Record<string, [number, string]> = {
          consent_link_invalid: [404, "Ce lien est invalide ou n’est plus accessible."],
          consent_link_expired: [410, "Le délai de confirmation complémentaire est dépassé. Votre consentement signé reste inchangé ; vous pouvez toujours le retirer."],
          consent_link_revoked: [409, "Ce lien ne peut plus autoriser de campagnes : retrait, opposition ou nouvelle demande."],
        };
        const mapped = errors[result.error.message || ""];
        if (mapped) throw new BoundaryError(mapped[0], mapped[1]);
        throw new Error("consent_unavailable");
      }
      return respond(result.data);
    } catch (error) { return respond({ error: error instanceof BoundaryError ? error.message : "La vérification est momentanément indisponible. Réessayez." }, error instanceof BoundaryError ? error.status : 503); }
  };
}

/**
 * Signed unsubscribe tokens.
 *
 * The unsubscribe endpoint is called by the recipient's mail provider, so it
 * cannot be authenticated. A raw delivery identifier in the URL would let
 * anyone enumerate identifiers and suppress contacts at will, so the link
 * carries an HMAC the endpoint verifies before acting.
 *
 * Callers provide a secret dedicated to unsubscribe links. Keeping that key
 * separate from provider webhook credentials avoids coupling two independent
 * trust boundaries; rotation policy lives in marketing-unsubscribe-secrets.ts.
 */

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(deliveryId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(deliveryId));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function buildUnsubscribeToken(deliveryId: string, secret: string) {
  if (!secret) return "";
  return `${deliveryId}.${await sign(deliveryId, secret)}`;
}

/**
 * Returns the delivery id only when the signature matches. Comparison is
 * constant-time so a caller cannot narrow the signature byte by byte.
 */
export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  if (!secret || typeof token !== "string") return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const deliveryId = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId) || !provided) return null;

  const expected = await sign(deliveryId, secret);
  if (expected.length !== provided.length) return null;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0 ? deliveryId : null;
}

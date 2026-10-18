/** Server-only envelope encryption. Native Auth credentials never leave the broker. */
const VERSION = "tokb1";
const MAX_SECRET_BYTES = 32_768;
const FAILURE = "tok_broker_crypto_unavailable";
const encoder = new TextEncoder();

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function decode(value: string, maxBytes: number): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1 || value.length > Math.ceil(maxBytes * 4 / 3)) {
    throw new Error(FAILURE);
  }
  const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (bytes.length > maxBytes || encode(bytes) !== value) throw new Error(FAILURE);
  return ownedBuffer(bytes);
}

function additionalData(purpose: string): ArrayBuffer {
  // The row ID and credential kind bind ciphertext to its exact storage slot.
  if (typeof purpose !== "string" || !purpose || purpose.length > 256
    || [...purpose].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(FAILURE);
  }
  return ownedBuffer(encoder.encode(`tok-connect-broker/${VERSION}\0${purpose}`));
}

async function key(): Promise<CryptoKey> {
  const configured = Deno.env.get("TOK_CONNECT_BROKER_ENCRYPTION_KEY");
  if (!configured || !/^[0-9a-f]{64}$/i.test(configured)) throw new Error(FAILURE);
  const bytes = Uint8Array.from(configured.match(/../g)!, (pair) => Number.parseInt(pair, 16));
  try {
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    bytes.fill(0);
  }
}

export async function encryptTokBrokerSecret(plaintext: string, purpose: string): Promise<string> {
  try {
    if (typeof plaintext !== "string" || !plaintext || plaintext.length > MAX_SECRET_BYTES) throw new Error(FAILURE);
    const bytes = encoder.encode(plaintext);
    if (bytes.length > MAX_SECRET_BYTES) throw new Error(FAILURE);
    const aad = additionalData(purpose);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, await key(), bytes);
    return `${VERSION}.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
  } catch {
    // Do not include provider tokens, ciphertext, key configuration or native errors.
    throw new Error(FAILURE);
  }
}

export async function decryptTokBrokerSecret(envelope: string, purpose: string): Promise<string> {
  try {
    if (typeof envelope !== "string" || envelope.length > 44_000) throw new Error(FAILURE);
    const parts = envelope.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) throw new Error(FAILURE);
    const iv = decode(parts[1], 12);
    const ciphertext = decode(parts[2], MAX_SECRET_BYTES + 16);
    if (iv.byteLength !== 12 || ciphertext.byteLength <= 16) throw new Error(FAILURE);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: additionalData(purpose), tagLength: 128 },
      await key(), ciphertext);
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new Error(FAILURE);
  }
}

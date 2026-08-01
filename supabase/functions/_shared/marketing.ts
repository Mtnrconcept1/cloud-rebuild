import { HttpError } from "./auth.ts";

export type MarketingAction = "run_due" | "run_item";

export function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function parseMarketingAction(value: unknown): MarketingAction {
  if (value === "run_due" || value === "run_item") return value;
  throw new HttpError(400, "Action marketing invalide");
}

export function safeMarketingError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur interne";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyMarketingWebhookSignature(input: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret: string;
  now?: number;
}) {
  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    return false;
  }
  const supplied = input.signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied) || !input.secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${input.timestamp}.${input.rawBody}`),
  );
  return safeEqual(supplied, bytesToHex(digest));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${field} est requis`);
  }
  return value.trim();
}

import { HttpError } from "../auth.ts";
import type { PrintAddress, PrintProviderFile } from "./types.ts";

const MD5_PATTERN = /^[a-f0-9]{32}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function requireHttpsUrl(value: unknown, field = "url") {
  const raw = String(value || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `${field} invalide`);
  }
  if (url.protocol !== "https:") throw new HttpError(400, `${field} doit utiliser HTTPS`);
  if (url.username || url.password) throw new HttpError(400, `${field} ne doit pas contenir d’identifiants URL`);
  return url.toString();
}

export function validatePrintProviderFile(file: PrintProviderFile) {
  const url = requireHttpsUrl(file.url, "file.url");
  const md5sum = String(file.md5sum || "").trim().toLowerCase();
  if (!MD5_PATTERN.test(md5sum)) throw new HttpError(400, "MD5 de fichier invalide");
  return { ...file, url, md5sum };
}

function requiredAddressValue(value: unknown, field: string, maxLength: number) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) throw new HttpError(400, `Adresse invalide: ${field}`);
  return normalized;
}

export function validatePrintAddress(address: PrintAddress): PrintAddress {
  const country = requiredAddressValue(address.country, "country", 2).toUpperCase();
  if (!COUNTRY_PATTERN.test(country)) throw new HttpError(400, "Pays de livraison invalide");
  return {
    company: String(address.company || "").trim().slice(0, 120) || null,
    firstname: requiredAddressValue(address.firstname, "firstname", 80),
    lastname: requiredAddressValue(address.lastname, "lastname", 80),
    street1: requiredAddressValue(address.street1, "street1", 160),
    street2: String(address.street2 || "").trim().slice(0, 160) || null,
    zip: requiredAddressValue(address.zip, "zip", 32),
    city: requiredAddressValue(address.city, "city", 100),
    state: String(address.state || "").trim().slice(0, 80) || null,
    country,
    phone: String(address.phone || "").trim().slice(0, 40) || null,
  };
}

export function assertSha256(value: string) {
  if (!SHA256_PATTERN.test(value)) throw new HttpError(500, "SHA-256 interne invalide");
  return value.toLowerCase();
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function verifyCloudprinterWebhookApiKey(provided: string, configured: string) {
  const left = String(provided || "").trim();
  const right = String(configured || "").trim();
  return Boolean(left && right && constantTimeEqual(left, right));
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

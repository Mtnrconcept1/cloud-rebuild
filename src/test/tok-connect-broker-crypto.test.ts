import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptTokBrokerSecret, encryptTokBrokerSecret } from "../../supabase/functions/_shared/tok-connect-broker-crypto";

const purpose = "client:aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa:client-secret";
const plaintext = "synthetic-confidential-secret-été-🔒";
let configuredKey: string | undefined;

beforeEach(() => {
  configuredKey = "a1".repeat(32);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { env: { get: (name: string) => name === "TOK_CONNECT_BROKER_ENCRYPTION_KEY" ? configuredKey : undefined } });
});
afterEach(() => vi.unstubAllGlobals());

describe("TOK broker authenticated encryption", () => {
  it("round-trips UTF-8 and gives identical secrets independent random IVs", async () => {
    const first = await encryptTokBrokerSecret(plaintext, purpose);
    const second = await encryptTokBrokerSecret(plaintext, purpose);
    expect(first).toMatch(/^tokb1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(first).not.toContain(plaintext);
    expect(first).not.toBe(second);
    expect(first.split(".")[1]).not.toBe(second.split(".")[1]);
    expect(await decryptTokBrokerSecret(first, purpose)).toBe(plaintext);
    expect(await decryptTokBrokerSecret(second, purpose)).toBe(plaintext);
  });
  it("rejects ciphertext moved between clients or credential kinds", async () => {
    const encrypted = await encryptTokBrokerSecret(plaintext, purpose);
    for (const other of [purpose.replace("aaaaaaaa", "bbbbbbbb"), purpose.replace("client-secret", "refresh"), ""]) {
      await expect(decryptTokBrokerSecret(encrypted, other)).rejects.toThrow("tok_broker_crypto_unavailable");
    }
  });
  it("authenticates both the IV and encrypted payload", async () => {
    const encrypted = await encryptTokBrokerSecret(plaintext, purpose);
    for (const index of [1, 2]) {
      const parts = encrypted.split(".");
      const bytes = Buffer.from(parts[index], "base64url");
      bytes[0] ^= 1;
      parts[index] = bytes.toString("base64url");
      await expect(decryptTokBrokerSecret(parts.join("."), purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
    }
  });
  it("does not decrypt under a different key or retain a stale cached key", async () => {
    const encrypted = await encryptTokBrokerSecret(plaintext, purpose);
    configuredKey = "b2".repeat(32);
    await expect(decryptTokBrokerSecret(encrypted, purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
    configuredKey = "A1".repeat(32);
    expect(await decryptTokBrokerSecret(encrypted, purpose)).toBe(plaintext);
  });
  it.each([undefined, "", "a1".repeat(31), "a1".repeat(33), "z1".repeat(32), " a1".repeat(32)])(
    "fails closed for invalid or absent key configuration (%s)", async (invalidKey) => {
      const encrypted = await encryptTokBrokerSecret(plaintext, purpose);
      configuredKey = invalidKey;
      await expect(encryptTokBrokerSecret(plaintext, purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
      await expect(decryptTokBrokerSecret(encrypted, purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
    },
  );
  it("rejects malformed, truncated, oversized and non-canonical envelopes", async () => {
    const encrypted = await encryptTokBrokerSecret(plaintext, purpose);
    const parts = encrypted.split(".");
    for (const value of ["", encrypted + ".suffix", encrypted.replace("tokb1", "tokb2"), encrypted.slice(0, -4),
      `tokb1.${parts[1]}=.${parts[2]}`, `tokb1.${parts[1].slice(1)}.${parts[2]}`, `tokb1.${parts[1]}.AAAA`, "x".repeat(44_001)]) {
      await expect(decryptTokBrokerSecret(value, purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
    }
  });
  it("bounds plaintext bytes and requires an unambiguous storage purpose", async () => {
    for (const value of ["", "x".repeat(32_769), "é".repeat(16_385)]) {
      await expect(encryptTokBrokerSecret(value, purpose)).rejects.toThrow("tok_broker_crypto_unavailable");
    }
    for (const value of ["", "x".repeat(257), purpose + "\0other"]) {
      await expect(encryptTokBrokerSecret(plaintext, value)).rejects.toThrow("tok_broker_crypto_unavailable");
    }
    const max = "x".repeat(32_768);
    expect(await decryptTokBrokerSecret(await encryptTokBrokerSecret(max, purpose), purpose)).toBe(max);
  });
});

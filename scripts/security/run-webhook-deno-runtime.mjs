#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Generates disposable local certificates; no private key is committed and no
// remote webhook is contacted. TLS verification is never disabled.
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), "tok-webhook-tls-"));
const file = (name) => join(directory, name);
const openssl = (args) => execFileSync("openssl", args, { cwd: directory, stdio: "ignore", timeout: 15_000 });
try {
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "2", "-subj", "/CN=TOK Webhook Disposable Test CA",
    "-keyout", file("ca.key"), "-out", file("ca.pem"), "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  openssl(["req", "-newkey", "rsa:2048", "-sha256", "-nodes", "-subj", "/CN=webhook-runtime.test", "-keyout", file("server.key"), "-out", file("server.csr")]);
  writeFileSync(file("server.ext"), "subjectAltName=DNS:webhook-runtime.test\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n");
  openssl(["x509", "-req", "-in", file("server.csr"), "-CA", file("ca.pem"), "-CAkey", file("ca.key"), "-CAcreateserial", "-days", "2", "-sha256", "-extfile", file("server.ext"), "-out", file("server.pem")]);
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "2", "-subj", "/CN=webhook-runtime.test",
    "-keyout", file("untrusted.key"), "-out", file("untrusted.pem"), "-addext", "subjectAltName=DNS:webhook-runtime.test"]);
  const result = spawnSync(process.env.DENO_BIN || "deno", [
    "test", "--no-config", "--no-lock", "--cert=" + file("ca.pem"),
    "--allow-net=127.0.0.1,webhook-runtime.test,wrong-webhook-runtime.test",
    "--allow-read=" + directory,
    "--allow-env=TOK_WEBHOOK_TLS_CERT,TOK_WEBHOOK_TLS_KEY,TOK_WEBHOOK_UNTRUSTED_TLS_CERT,TOK_WEBHOOK_UNTRUSTED_TLS_KEY",
    "scripts/security/test-webhook-deno-runtime.ts",
  ], {
    cwd: root,
    env: { ...process.env, TOK_WEBHOOK_TLS_CERT: file("server.pem"), TOK_WEBHOOK_TLS_KEY: file("server.key"),
      TOK_WEBHOOK_UNTRUSTED_TLS_CERT: file("untrusted.pem"), TOK_WEBHOOK_UNTRUSTED_TLS_KEY: file("untrusted.key") },
    stdio: "inherit", timeout: 45_000,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}

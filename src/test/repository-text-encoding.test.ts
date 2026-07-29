import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const GENERATED_PREFIXES = [
  "android/app/build/",
  "android/app/src/main/assets/public/",
  "ios/App/App/public/",
];

const COMMON_MOJIBAKE_PATTERN = /[\u00c2\u00c3\ufffd]|\u00e2[\u0080-\u00bf\u20ac]/;

/**
 * Fichiers qui contiennent legitimement les majuscules A-circonflexe et
 * A-tilde (U+00C2 et U+00C3).
 *
 * Le motif ci-dessus les signale parce qu'elles ouvrent presque tout mojibake
 * latin-1 : un « é » mal decode donne la paire U+00C3 U+00A9. Une table de
 * repli d'accents doit pourtant les enumerer comme n'importe quelle autre
 * lettre accentuee ; les retirer reviendrait a ne plus desaccentuer ces deux
 * majuscules, donc a casser la recherche insensible aux accents.
 *
 * L'exemption est nominative et doit le rester : elle desactive l'heuristique
 * sur la totalite du fichier vise. La detection d'octets UTF-8 reellement
 * invalides, elle, reste appliquee partout.
 */
const LEGITIMATE_ACCENT_TABLES = new Set([
  "supabase/migrations/20260728173450_immutable_unaccent_lower.sql",
]);

function trackedTextFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))
    .filter((file) => !GENERATED_PREFIXES.some((prefix) => file.replace(/\\/g, "/").startsWith(prefix)))
    .filter((file) => existsSync(join(root, file)));
}

describe("repository text encoding", () => {
  it("keeps tracked text files UTF-8 readable without mojibake markers", () => {
    const offenders = trackedTextFiles().flatMap((file) => {
      const buffer = readFileSync(join(root, file));
      const firstBytes = buffer.subarray(0, Math.min(buffer.length, 4096));
      if (firstBytes.includes(0)) return [`${file}: contains NUL bytes near the start`];

      const text = buffer.toString("utf8");
      // Un octet invalide se décode en U+FFFD : le contrôle reste actif partout,
      // y compris sur les fichiers exemptés de la détection de mojibake.
      if (text.includes("\ufffd")) return [`${file}: contains invalid UTF-8 bytes`];
      if (LEGITIMATE_ACCENT_TABLES.has(file.replace(/\\/g, "/"))) return [];

      const lines = text.split(/\r?\n/);
      const badLine = lines.findIndex((line) => COMMON_MOJIBAKE_PATTERN.test(line));
      if (badLine < 0) return [];

      return [`${file}:${badLine + 1}: contains mojibake marker`];
    });

    expect(offenders).toEqual([]);
  });
});

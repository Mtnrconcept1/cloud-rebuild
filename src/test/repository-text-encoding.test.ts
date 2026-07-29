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

// U+00C2/U+00C3 are valid standalone letters in restaurant names and in the
// immutable accent-normalization table. They signal mojibake only when followed
// by a Latin-1 or Windows-1252 continuation character from a mis-decoded UTF-8
// byte sequence.
const COMMON_MOJIBAKE_PATTERN = /\ufffd|[\u00c2\u00c3\u00e2][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/;

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
  it("distinguishes standalone accented letters from Windows-1252 mojibake", () => {
    expect(COMMON_MOJIBAKE_PATTERN.test("\u00c2 \u00c3")).toBe(false);
    for (const corrupted of [
      "\u00c3\u2030",
      "\u00c3\u20ac",
      "\u00e2\u201a\u00ac",
    ]) {
      expect(COMMON_MOJIBAKE_PATTERN.test(corrupted)).toBe(true);
    }
  });

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

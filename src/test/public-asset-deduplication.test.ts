import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const PUBLIC_RASTER_EXTENSIONS = new Set([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp"]);

function publicFile(name: string) {
  return join(root, "public", name);
}

function collectPublicFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return collectPublicFiles(absolutePath);
    if (!entry.isFile()) return [];
    return [absolutePath];
  });
}

function publicRelativePath(absolutePath: string) {
  return relative(join(root, "public"), absolutePath).replace(/\\/g, "/");
}

describe("public asset deduplication", () => {
  it("keeps canonical menu image names without legacy duplicate filenames", () => {
    const imageRoot = join(root, "public", "images");
    const aliases = [
      ["fondue moiti\u00e9 moiti\u00e9.jpg", "fondue-moitie-moitie.jpg"],
      ["meringue double.webp", "meringue-double.webp"],
      ["milshake oreo.jpg", "milkshake-oreo.jpg"],
      ["milshake vanille.jpeg", "milkshake-vanille.jpeg"],
      ["moshi glac\u00e9s.jpg", "mochi-glaces.jpg"],
      ["r\u00f6sti bernois.jpg", "rosti-bernois.jpg"],
      ["salade du march\u00e9.jpg", "salade-du-marche.jpg"],
      ["taboul\u00e9.webp", "taboule.webp"],
    ];

    for (const [legacyName, canonicalName] of aliases) {
      expect(existsSync(join(imageRoot, legacyName))).toBe(false);
      expect(existsSync(join(imageRoot, canonicalName))).toBe(true);
    }
  });

  it("does not keep exact duplicate public raster files", () => {
    const publicRoot = join(root, "public");
    const rasterPaths = collectPublicFiles(publicRoot)
      .filter((absolutePath) => PUBLIC_RASTER_EXTENSIONS.has(extname(absolutePath).toLowerCase()));

    // Deux fichiers identiques ont necessairement la meme taille. Regrouper par
    // taille d'abord laisse donc passer exactement les memes doublons, mais ne
    // lit que les fichiers qui ont un homologue possible — aujourd'hui aucun,
    // sur 349 images et 96 Mo. Hacher l'integralite du dossier a chaque
    // execution frolait le delai de 5 s et faisait echouer le test au hasard
    // selon la charge de la machine, sans qu'aucun doublon n'existe.
    const pathsBySize = new Map<number, string[]>();
    for (const absolutePath of rasterPaths) {
      const { size } = statSync(absolutePath);
      pathsBySize.set(size, [...(pathsBySize.get(size) ?? []), absolutePath]);
    }

    const duplicated = new Map<string, string[]>();
    for (const [size, candidates] of pathsBySize) {
      if (candidates.length < 2) continue;
      for (const absolutePath of candidates) {
        const key = `${createHash("sha256").update(readFileSync(absolutePath)).digest("hex")}:${size}`;
        duplicated.set(key, [...(duplicated.get(key) ?? []), publicRelativePath(absolutePath)]);
      }
    }

    const duplicateGroups = [...duplicated.values()].filter((names) => names.length > 1);

    expect(duplicateGroups).toEqual([]);
  });

  it("keeps one canonical public copy for repeated TOK logo artwork", () => {
    const publicRoot = join(root, "public");
    const logoCandidates = readdirSync(publicRoot)
      .filter((name) => /^logo.*\.(png|jpe?g|webp|svg)$/i.test(name))
      .map((name) => {
        const absolutePath = publicFile(name);
        return {
          hash: createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
          name,
          size: statSync(absolutePath).size,
        };
      });

    const duplicated = new Map<string, string[]>();
    for (const asset of logoCandidates) {
      const key = `${asset.hash}:${asset.size}`;
      duplicated.set(key, [...(duplicated.get(key) ?? []), asset.name]);
    }

    const duplicateGroups = [...duplicated.values()].filter((names) => names.length > 1);

    expect(duplicateGroups).toEqual([]);
    expect(existsSync(publicFile("logotok.png"))).toBe(true);
    expect(existsSync(publicFile("favicon.ico.png"))).toBe(false);
    expect(logoCandidates.some((asset) => /copie/i.test(asset.name))).toBe(false);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_DIRS = ["src/components", "src/lib", "src/pages"];

const FORBIDDEN_COPY_SNIPPETS = [
  "Session expiree",
  "Selectionnez",
  "Parametres",
  "Demandes speciales",
  "capacite",
  "gerer",
  "desactive",
  "apres paiement",
  "reessayez",
  "rafraichissement",
  "Facture adressee",
  "Coordonnees",
  "Selectionnez une operation.",
  "operations clients",
  "par operation",
  "Suggerer",
  "separateurs",
  "Desactive",
  "Desactiver",
  "Paiement echoue",
  "Details de",
  "Detail de commande",
  "Verification des",
  "Jusqu'a",
  "sponsorisee",
  "sponsorisees",
  "payee et active",
  "vérifiéd",
  "VérificationDocument",
  "vérification-documents",
  "recharts-référence-line",
  "récenterCanvas",
  " a ${SUPPORT_EMAIL}",
  "5 a 10",
  "48h ouvrees",
  "endommage",
  "superieur a",
  "demarche",
  "commence la préparation",
  "concernee",
  "Decrivez",
];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) return collectSourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

describe("French product copy", () => {
  it("keeps visible French copy accented in source files", () => {
    const offenders = SOURCE_DIRS.flatMap((dir) => collectSourceFiles(dir))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_COPY_SNIPPETS
          .filter((snippet) => source.includes(snippet))
          .map((snippet) => `${relative(process.cwd(), file)}: ${snippet}`);
      });

    expect(offenders).toEqual([]);
  });
});

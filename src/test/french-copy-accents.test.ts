import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_DIRS = ["src/components", "src/lib", "src/pages"];

const FORBIDDEN_COPY_SNIPPETS = [
  "Session expiree",
  "Session expirÃ",
  "contrÃ",
  "Assignee",
  "Acceptee",
  "Commande recuperee",
  "Livree",
  "Annulee",
  "Expiree",
  'label: "Approuve"',
  "Refusee",
  'label: "Refuse"',
  "Velo",
  "A pied",
  "Penalite",
  "Apercu public",
  "Restaurants associes",
  "URL media controlee",
  "Media requis recommande",
  "Systeme",
  "Planifiee",
  "Planifiees",
  "Envoyee",
  "Envoyees",
  "Echouee",
  "Piece d'identite",
  "sejour",
  "vehicule",
  "Corrections demandees",
  "A revoir",
  "refusee(s)",
  "Valeur concrete",
  "Avis publie !",
  "contenus masques",
  "Publies",
  "Aucun post publie",
  "offres epuisees",
  "s'engage a publier",
  "règles de moderation",
  "Aucune cuisine definie",
  "Collections a la une",
  "associe(s)",
  "Aucune collection definie",
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
  "Post sponsorise Actualites",
  "Personnes touchees",
  "Fin estimee",
  "Preparation...",
  "Paiement confirme",
  "Paiement annule",
  "Creneau invalide",
  "Aucun creneau",
  "Creneau fixe",
  "Sauvegarder les parametres",
  "Compte supprime",
  "Abonnement resilie",
  "Resilier Tok One",
  "Cout hebdo",
  "Mission refusee",
  "Confirmee",
  "Periode",
  "Gerer mon restaurant",
  "Actualites sponsorisees",
  "mots-cles",
  "A proximite",
  "Cuisine preferee",
  "Fidelisation",
  "Presence digitale",
  "Edition exclusive",
  "nouveautes",
  "a choisir",
  "preferez",
  "recemment",
  "resume simple",
  "Paye:",
  "Observe:",
  "n est pas",
  "reglement manuel",
  "Especes",
  "especes",
  "Ideal pour",
  "Definie",
  "Resume des",
  "a utiliser pour les virements",
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

  it("normalizes visible AI support copy on Assistant IA", () => {
    const visibleSources = [
      readFileSync("src/components/SupportChat.tsx", "utf8"),
      readFileSync("src/components/support/TokAiSupportChat.tsx", "utf8"),
      readFileSync("src/lib/featureCatalog.ts", "utf8"),
    ].join("\n");

    expect(visibleSources).not.toMatch(/\bagent IA\b/i);
    expect(visibleSources).toContain("Assistant IA");
  });
});

#!/usr/bin/env node
/**
 * Refuse une migration dont la version est deja prise sur la branche par defaut.
 *
 * Le test de la suite verifie que les versions sont uniques dans l'arbre, mais
 * il ne peut le constater qu'une fois les deux migrations reunies, donc apres la
 * fusion : main devient rouge et la seconde migration n'est jamais appliquee,
 * Supabase ayant deja enregistre cette version.
 *
 * Deux PR ouvertes en parallele le meme jour choisissent volontiers le meme
 * horodatage a la seconde pres. Chacune est pourtant unique dans son propre
 * arbre : la collision n'existe qu'entre elles. La seule comparaison utile est
 * donc celle des versions ajoutees par la branche face au main courant, pas
 * face a la base sur laquelle la branche a ete ouverte.
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MIGRATIONS_DIR = "supabase/migrations";
const VERSION_PATTERN = /^(\d{14})_.+\.sql$/;

/** Indexe une sortie `git ls-tree --name-only` par version de migration. */
export function collectVersions(listing) {
  const found = new Map();
  for (const path of String(listing ?? "").split("\n").filter(Boolean)) {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith(`${MIGRATIONS_DIR}/`)) continue;
    const name = normalized.slice(MIGRATIONS_DIR.length + 1);
    const match = VERSION_PATTERN.exec(name);
    if (!match) continue;
    const [, version] = match;
    if (!found.has(version)) found.set(version, []);
    found.get(version).push(name);
  }
  return found;
}

/** Versions portees par plusieurs fichiers dans un meme arbre. */
export function findDuplicates(head) {
  return [...head.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }));
}

/**
 * Versions que la branche reutilise sous un autre nom de fichier.
 *
 * La comparaison porte sur les noms plutot que sur une base de fusion : le job
 * clone en profondeur 1, donc `merge-base` y echoue et le controle serait
 * silencieusement ignore. Un nom identique des deux cotes est une migration
 * heritee ; un nom inedit sur une version deja prise est la collision qu'on
 * cherche. Renommer sa propre migration reste donc accepte.
 */
export function findCollisions({ head, base }) {
  const collisions = [];
  for (const [version, ours] of head) {
    const theirs = base.get(version);
    if (!theirs) continue;
    const introduced = ours.filter((name) => !theirs.includes(name));
    if (introduced.length > 0) collisions.push({ version, ours: introduced, theirs });
  }
  return collisions;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function versionsAt(ref) {
  try {
    return collectVersions(git(["ls-tree", "-r", "--name-only", ref, "--", MIGRATIONS_DIR]));
  } catch {
    return null;
  }
}

function fail(lines) {
  for (const line of lines) console.log(`::error::${line}`);
  process.exit(1);
}

function main() {
  const baseRef = process.env.CI_MIGRATION_BASE_REF || "origin/main";

  const head = versionsAt("HEAD");
  if (!head) fail(["Impossible de lire les migrations de HEAD."]);

  // Unicite dans l'arbre courant : verifiable sans aucune reference distante,
  // donc toujours bloquant.
  const duplicates = findDuplicates(head);
  if (duplicates.length > 0) {
    fail(duplicates.map(({ version, files }) =>
      `Version de migration ${version} utilisee par ${files.length} fichiers : ${files.join(", ")}. `
      + "Renommez-en un avec un horodatage libre.",
    ));
  }

  // Sans reference de comparaison on previent sans bloquer : une reference
  // absente est un probleme de CI, pas une faute de la PR.
  const base = versionsAt(baseRef);
  if (!base) {
    console.log(`::warning::${baseRef} indisponible : collision avec la branche par defaut non verifiee.`);
    return;
  }

  const collisions = findCollisions({ head, base });
  if (collisions.length > 0) {
    fail(collisions.map(({ version, ours, theirs }) =>
      `La migration ${version} (${ours.join(", ")}) porte une version deja presente sur ${baseRef} `
      + `sous le nom ${theirs.join(", ")}. Supabase indexe les migrations par version : la seconde `
      + "ne serait jamais appliquee. Renommez la votre avec un horodatage libre.",
    ));
  }

  console.log(`${head.size} versions de migration, aucune collision avec ${baseRef}.`);
}

// N'execute rien a l'import : le test importe les fonctions pures ci-dessus.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

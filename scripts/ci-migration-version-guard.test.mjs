import assert from "node:assert/strict";
import test from "node:test";

import {
  collectVersions,
  findCollisions,
  findDuplicates,
} from "./ci-migration-version-guard.mjs";

const listing = (...names) => names.map((name) => `supabase/migrations/${name}`).join("\n");

test("n'indexe que les migrations horodatees du bon dossier", () => {
  const versions = collectVersions([
    "supabase/migrations/20260728173500_boost.sql",
    "supabase/migrations/README.md",
    "supabase/migrations/sans_horodatage.sql",
    "supabase/demo-migrations/20260728173500_demo.sql",
    "",
  ].join("\n"));

  assert.deepEqual([...versions.keys()], ["20260728173500"]);
  assert.deepEqual(versions.get("20260728173500"), ["20260728173500_boost.sql"]);
});

test("repere deux fichiers qui partagent un horodatage", () => {
  const duplicates = findDuplicates(collectVersions(listing(
    "20260728173500_atomic_media.sql",
    "20260728173500_harden_boosts.sql",
    "20260728173600_image_index.sql",
  )));

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].version, "20260728173500");
  assert.deepEqual(duplicates[0].files, [
    "20260728173500_atomic_media.sql",
    "20260728173500_harden_boosts.sql",
  ]);
});

test("ne signale rien quand chaque horodatage est unique", () => {
  const duplicates = findDuplicates(collectVersions(listing(
    "20260728173500_atomic_media.sql",
    "20260728173650_harden_boosts.sql",
  )));

  assert.deepEqual(duplicates, []);
});

test("detecte la collision entre deux PR paralleles", () => {
  // Le cas reel : chaque branche est unique dans son propre arbre, la collision
  // n'apparait qu'en comparant au main courant, ou la premiere a deja fusionne.
  const base = collectVersions(listing(
    "20260728173450_unaccent.sql",
    "20260728173500_atomic_media.sql",
  ));
  const head = collectVersions(listing(
    "20260728173450_unaccent.sql",
    "20260728173500_harden_boosts.sql",
  ));

  const collisions = findCollisions({ head, base });

  assert.equal(collisions.length, 1);
  assert.deepEqual(collisions[0], {
    version: "20260728173500",
    ours: ["20260728173500_harden_boosts.sql"],
    theirs: ["20260728173500_atomic_media.sql"],
  });
});

test("ne reproche pas a une branche les migrations heritees de sa base", () => {
  // Meme version, meme nom : la migration vient de la base, pas de la branche.
  const base = collectVersions(listing("20260728173500_atomic_media.sql"));
  const head = collectVersions(listing(
    "20260728173500_atomic_media.sql",
    "20260728173650_harden_boosts.sql",
  ));

  assert.deepEqual(findCollisions({ head, base }), []);
});

test("accepte une branche qui renomme sa propre migration en conflit", () => {
  // Le correctif lui-meme : la branche retire son fichier de la version prise
  // et le repose sur une version libre. Rien d'inedit ne subsiste sur 173500.
  const base = collectVersions(listing(
    "20260728173500_atomic_media.sql",
    "20260728173500_harden_boosts.sql",
  ));
  const head = collectVersions(listing(
    "20260728173500_atomic_media.sql",
    "20260728173650_harden_boosts.sql",
  ));

  assert.deepEqual(findCollisions({ head, base }), []);
});

test("laisse passer une version libre sur la branche par defaut", () => {
  const base = collectVersions(listing(
    "20260728173450_unaccent.sql",
    "20260728173500_atomic_media.sql",
  ));
  const head = collectVersions(listing(
    "20260728173450_unaccent.sql",
    "20260728173650_harden_boosts.sql",
  ));

  assert.deepEqual(findCollisions({ head, base }), []);
});

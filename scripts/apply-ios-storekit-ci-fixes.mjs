import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [label, from, to] of replacements) {
    if (!source.includes(from)) throw new Error(`${path}: missing fragment for ${label}`);
    source = source.replace(from, to);
  }
  await writeFile(path, source, "utf8");
  console.log(`Patched ${path}`);
}

await patch("supabase/config.toml", [[
  "StoreKit function JWT policies",
  '[functions.marketing-provider-webhook]\nverify_jwt = false\n',
  '[functions.marketing-provider-webhook]\nverify_jwt = false\n\n# StoreKit purchase sync authenticates the current Supabase user inside the handler.\n[functions.sync-apple-storekit]\nverify_jwt = false\n\n# Apple calls this endpoint without a Supabase JWT; the signedPayload JWS is the authentication boundary.\n[functions.apple-storekit-webhook]\nverify_jwt = false\n',
]]);

await patch("src/lib/admin/auditLogNarrative.ts", [[
  "StoreKit function business names",
  '  "manage-tok-one-subscription": "la gestion d’un abonnement TOK One",\n',
  '  "manage-tok-one-subscription": "la gestion d’un abonnement TOK One",\n  "sync-apple-storekit": "la validation et la synchronisation d’un abonnement Tok One acheté via Apple",\n  "apple-storekit-webhook": "la réception des renouvellements, résiliations et remboursements Tok One envoyés par Apple",\n',
]]);

await patch("src/test/social-post-actions.test.tsx", [[
  "UGC report dialog accessible name",
  'screen.getByRole("dialog", { name: "Signaler ce post" })',
  'screen.getByRole("dialog", { name: "Signaler et bloquer ce compte" })',
]]);

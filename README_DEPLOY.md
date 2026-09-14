# Déploiement TOK

Projet Vercel officiel = cloud-rebuild-recovered

Domaines officiels :

- `https://www.thetok.ch`
- `https://thetok.ch`
- `https://admin.thetok.ch`
- URL projet Vercel: `https://cloud-rebuild-recovered.vercel.app`

Le projet historique `cloud-rebuild` ne doit plus être utilisé comme cible de production TOK tant qu'il n'a pas été explicitement réactivé et documenté. Les variables d'environnement de production doivent être vérifiées sur `cloud-rebuild-recovered` avant toute livraison.

## Procédure locale avant merge

1. `pnpm run lint`
2. `pnpm run test`
3. `pnpm run build`
4. `pnpm run build:prod` si la modification touche SEO, sitemap, robots ou pré-rendu.

## Procédure production

Le frontend de production est déployé par l’intégration Git native de Vercel sur le dépôt `Mtnrconcept1/cloud-rebuild` :

1. ouvrir une PR vers `main` ;
2. attendre que les checks obligatoires soient verts ;
3. merger la PR ;
4. Vercel détecte le nouveau commit sur `main`, exécute `pnpm install --frozen-lockfile` puis `pnpm run build:prod` et publie la version complète ;
5. vérifier les domaines officiels et exécuter `pnpm run deploy:postcheck`.

Le workflow GitHub Actions de production reste disponible pour les migrations Supabase et les Edge Functions lorsque nécessaire. Il ne doit pas lancer un second déploiement frontend en parallèle de Vercel Git.

## Secrets Edge Functions

- `SPONSORED_EVENT_SIGNING_SECRET` : optionnel tant que le tracking sponsorise n'a pas de fournisseur de jetons signes. Si ce secret est configure dans Supabase Edge Functions, `track-sponsored-event` exige `eventSignature` et `signedAt` sur chaque impression, clic ou conversion sponsorisee.

Après un déploiement production, exécuter :

```bash
pnpm run deploy:postcheck
```

Ce check vérifie :

- home publique `www.thetok.ch` ;
- manifest PWA ;
- robots ;
- sitemap ;
- page B2B `/restaurateurs/geneve`.

## DNS

La zone `thetok.ch` est gérée côté Vercel DNS. Les records publics et admin ne doivent pas être modifiés chez Hostinger DNS tant que la délégation reste sur :

- `ns1.vercel-dns.com`
- `ns2.vercel-dns.com`

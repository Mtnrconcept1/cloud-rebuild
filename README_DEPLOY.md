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

La production doit passer par le workflow GitHub Actions du dépôt. Ne pas déclencher de déploiement manuel Vercel depuis une session locale sans décision explicite.

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

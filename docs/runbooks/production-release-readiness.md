# Runbook release production securisee

## Objectif
Mettre Tok en production uniquement quand les secrets reels, les domaines, le signing mobile et les services externes sont verifies. Les placeholders ne doivent pas etre acceptes.

## Gates obligatoires
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run release:readiness`
- `npm run supabase:doctor:prod`

## Variables et secrets requis
- Supabase production: URL, anon key, service role key, JWT secret, project ref.
- Stripe live: secret key, publishable key, webhook secret, Connect client id, comptes restaurants onboarding termines.
- Resend: API key live et domaine expediteur verifie.
- Firebase/APNs: configuration push Android, cle APNs ou auth key Apple, topic iOS.
- Sentry: DSN production web/mobile et release upload configure.
- Vercel: domaines Tok production, CORS allowlist stricte, variables d'environnement synchronisees.

## Mobile release
- Android: `android/app/release.keystore` disponible hors git, alias/mots de passe fournis par CI, `assetlinks.json` publie sur le domaine production.
- iOS: Apple Team ID configure, bundle id production, provisioning profile release, `apple-app-site-association` publie sans redirection.
- Liens universels: verifier ouverture app depuis email, notification push et navigateur mobile.
- Stockage session: verifier persistance native chiffree et absence de token dans URL/logs.

## Checklist avant migration production
1. Lancer `npm run supabase:doctor:prod` et corriger tout warning de RLS, RPC ou grants.
2. Relire les nouvelles migrations SQL pour `SECURITY DEFINER`, `GRANT EXECUTE`, triggers et policies.
3. Appliquer sur staging, executer les tests cross-tenant RPC et webhook Stripe falsifie.
4. Executer un paiement live bas montant, remboursement, reservation confirmee, commande livree et dispatch coursier.
5. Verifier Sentry, logs Edge Functions, alertes finance et alertes dispatch.

## Rollback
- Web: rollback Vercel vers le dernier deploiement sain.
- Supabase: preparer migration inverse pour chaque migration destructive; ne jamais supprimer de colonne sans phase de compatibilite.
- Mobile: garder la version precedente publiee, ne promouvoir la release qu'apres verification deep links et push.


# Plinko de bienvenue TOK

Le Plinko s’adresse aux visiteurs **non authentifiés**. Sur l’accueil et les pages de découverte, une fenêtre centrée apparaît après cinq secondes. Si une autre boîte de dialogue est ouverte, le Plinko attend sa fermeture. Il ne s’ouvre automatiquement qu’une fois par session de navigateur ; son bouton permet de retrouver la partie. Le jeu quotidien Miamz des clients connectés est conservé intégralement.

## Parcours

1. Le visiteur joue gratuitement, sans compte ni e-mail préalable.
2. Le serveur choisit et enregistre le résultat avant l’animation.
3. « Rejouer » offre exactement une nouvelle bille gratuite. « Perdu » termine la partie.
4. Pour un gain, le visiteur indique son e-mail. L’inscription aux offres TOK est facultative, décochée par défaut et indépendante du gain.
5. La demande et sa référence sont enregistrées. Le reçu et la demande de remise à l’équipe TOK sont ajoutés à la file transactionnelle existante. Leur livraison dépend du dispatcher d’e-mails existant. L’équipe vérifie l’adresse et organise la remise ; aucun abonnement Stripe/Apple ni code de réduction public n’est créé par le jeu.

## Chances par bille

| Issue | Tickets sur 10 000 | Probabilité |
| --- | ---: | ---: |
| Repas offert | 50 | 0,5 % |
| Réduction de 50 % sur un repas dans le restaurant choisi | 50 | 0,5 % |
| Un mois de Tok One offert | 3 300 | 33 % |
| Rejouer gratuitement | 3 300 | 33 % |
| Perdu | 3 300 | 33 % |

Les trois issues courantes représentent exactement 99 % du poids du tirage ; repas et réduction se partagent le 1 % restant. Il s’agit de chances par bille, y compris les replays, et non d’un quota garanti dans un échantillon de visiteurs. La trajectoire illustre le tirage, elle ne le détermine pas.

## Autorité et données

- Une session anonyme reçoit un jeton aléatoire de 256 bits ; seul son SHA-256 est conservé en base. Le navigateur conserve le jeton pour retrouver le résultat après rechargement. Le jeton ne figure jamais dans une URL ou un e-mail.
- Une première bille par session, puis les replays gagnés. La session expire au bout de sept jours ; le délai de réclamation est visible dans les règles. Une session expirée est remplacée sans réinitialiser les sessions encore valides lors d’une simple panne réseau.
- Les tirages utilisent `crypto.getRandomValues` et un échantillonnage sans biais. Leur identifiant de requête est conservé pour les reprises réseau. Les écritures sont atomiques et sérialisées ; les replays historiques renvoient un reçu distinct de l’état courant pour préserver le gain le plus récent.
- Un seul gain réclamé par adresse normalisée et par campagne `welcome-v1`. L’adresse n’est pas vérifiée automatiquement ; l’équipe doit la vérifier avant la remise. Une adresse déjà utilisée ne peut pas réclamer un second gain.
- Les tables sessions/tirages/gains ont RLS et aucun accès direct `anon`/`authenticated`. Les RPC sont réservées à `service_role`, appelée uniquement par l’Edge Function. Les adresses restent privées ; le statut public n’expose aucune adresse.
- Limites persistantes par IP hachée, session et action, plus plafond global. L’anonymat ne permet pas de garantir l’unicité d’une personne avant sa réclamation ; le contrôle par e-mail et les limites bornent les abus.

## API et activation

Edge Function `plinko-play`, POST JSON : `start`, `status`, `play`, `claim`. Le jeton reste dans le corps JSON. `play` exige un UUID `Idempotency-Key`. Le client n’envoie jamais l’issue du tirage.

Le flag administrable `plinko-welcome` commande l’affichage et les tirages côté serveur. La nouvelle migration le crée actif seulement s’il n’existe pas ; une désactivation existante est conservée. Les routes de paiement, d’authentification, d’administration, les dashboards professionnels et les démos commerciales ne présentent pas le Plinko.

Ordre de livraison : appliquer la nouvelle migration, déployer `plinko-play`, puis livrer le frontend. Ne pas déployer le frontend avant le backend. Pour retirer la promotion, désactiver `plinko-welcome` ; conserver les gains et les réclamations pour leur remise. Aucun déploiement de production ni fusion de branche n’a été effectué pour préparer ce changement.

## Vérification

Les tests ciblés couvrent les 10 000 tickets, la génération de jetons, le transport anonyme, les reprises et le cycle de vie des gains, le délai de cinq secondes, la coexistence des fenêtres, le formulaire e-mail et son consentement facultatif, le mouvement réduit et les erreurs. Les fixtures SQL contrôlent les droits, replays, doublons, réclamations et la file d’e-mails dans une base jetable. Le jeu quotidien existant possède ses propres tests de non-régression.

Le rendu doit aussi être contrôlé dans un navigateur à 320 px, 390 px et sur ordinateur avant la mise en ligne, ainsi que la livraison réelle des deux e-mails dans un environnement de test.

## Fichiers de cette modification

- `src/App.tsx`
- `src/components/plinko/PlinkoDialog.tsx`
- `src/components/plinko/WelcomePlinko.tsx`
- `src/components/plinko/plinko.css`
- `src/lib/plinko.ts`
- `src/lib/admin/auditLogNarrative.ts`
- `src/test/plinko-api.test.ts`
- `src/test/plinko-edge.test.ts`
- `src/test/plinko-rules.test.ts`
- `src/test/welcome-plinko.test.tsx`
- `supabase/config.toml`
- `supabase/functions/plinko-play/index.ts`
- `supabase/functions/plinko-play/rules.ts`
- `supabase/migrations/20261028132220_tok_welcome_plinko.sql`
- `supabase/tests/plinko_welcome_fixture.sql`
- `supabase/tests/plinko_welcome_smoke.sql`
- `docs/features/tok-welcome-plinko.md`
- `docs/architecture/TOK_APPLICATION_REFERENCE.md` (généré)
- `docs/architecture/tok-application-search-index.json` (généré)
- `src/data/tok-user-guide-catalog.generated.ts` (généré)
- `supabase/functions/_shared/error-code-map.ts` (généré)

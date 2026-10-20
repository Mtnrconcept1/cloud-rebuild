# Réception des e-mails TOK dans Outlook

Le MX `thetok.ch` reste chez Resend. La fonction `resend-inbound-forward` transmet les nouveaux messages destinés à `contact@thetok.ch`, `partenariat@thetok.ch`, `r.barman@thetok.ch`, `support@thetok.ch` et `privacy@thetok.ch` vers `rbarman@hotmail.ch`.

Les trois premiers alias ont été observés dans les messages reçus Resend ; support et privacy sont publiés dans le contrat partenaire et la politique de confidentialité du dépôt. Les rapports techniques `dmarc@thetok.ch`, les alias inconnus et le sous-domaine marketing ne sont pas transférés. Aucun changement DNS et aucun rattrapage des anciens messages ne sont effectués automatiquement.

Le message transféré utilise l'expéditeur vérifié `TOK <noreply@thetok.ch>`, garde l'expéditeur original dans Reply-To ainsi que le texte, le HTML et les pièces jointes. Les fichiers sont limités à 20 et à 12 Mio cumulés. Tout dépassement bloque le transfert complet et conserve un reçu opérationnel à examiner ; aucune pièce jointe n'est supprimée silencieusement. Les liens de fichiers proviennent exclusivement de l'API Resend authentifiée et leurs téléchargements HTTPS sont bornés, sans redirection.

## Mise en service

1. Créer un webhook Resend dédié pour `email.received`, vers `https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/resend-inbound-forward`. Ne pas modifier le webhook Pulse Mail existant. La création peut précéder le déploiement : l'endpoint refuse alors les appels et Resend conserve les messages et réessaie leur livraison.
2. Transférer directement la signing key dans le secret GitHub **production** `RESEND_INBOUND_WEBHOOK_SECRET`, sans l'afficher ni la versionner. Le secret existant `RESEND_API_KEY` doit avoir accès à la réception et à l'envoi.
3. Publier la migration, la fonction et la synchronisation des secrets par le workflow `deploy-production.yml` du dépôt ; tester le refus d'un POST non signé après déploiement.
4. Envoyer un message de test uniquement à l'un des alias TOK ci-dessus, avec un identifiant unique, puis vérifier le reçu Resend, le reçu opérationnel et la présence dans Outlook. Inclure une petite pièce jointe dans le test. Un statut fournisseur « delivered » prouve l'acceptation par le serveur destinataire ; seule l'observation Outlook prouve sa présence dans cette boîte.

Avant configuration du secret, la fonction répond 503. Une signature absente, altérée ou vieille de plus de cinq minutes est rejetée. L'absence de JWT est nécessaire au webhook fournisseur ; elle ne remplace jamais cette vérification Svix.

## Exploitation et reprise

La validation locale se relance avec `pnpm exec vitest run src/test/resend-inbound-forward.test.ts src/test/deploy-production-secret-scope.test.ts` et `deno check supabase/functions/resend-inbound-forward/index.ts`. Pour rejouer la migration deux fois, les droits réels et les opérations concurrentes du vrai store sur PostgreSQL local : `node scripts/verification/test-inbound-forward-receipts.mjs`. Fournir `TOK_PGLITE_MODULE` avec l'URL `file:///.../pglite/dist/index.js` du runtime de vérification disponible si le module PGlite n'est pas installé. Cette vérification crée uniquement une base éphémère en mémoire et ne touche aucune cible distante.

La table `tok_inbound_forward_receipts` est réservée à `service_role`, avec RLS et aucun droit utilisateur. Elle conserve uniquement l'identifiant reçu, l'état, les dates, le verrou de traitement, l'identifiant d'envoi et un code d'erreur ; aucun contenu ni adresse d'expéditeur n'y est stocké.

- `pending` / `sending` : Resend peut réessayer ; un verrou de deux minutes empêche les traitements concurrents.
- `sent` : Resend a accepté le transfert. Ce statut ne signifie pas que le message est livré ou lu.
- `blocked` : dépassement des limites ou réconciliation manuelle nécessaire. Vérifier le code d'erreur et le message dans Resend avant toute reprise.

La clé d'idempotence fournisseur est stable par message. Les tentatives ambiguës datant de plus de 23 heures sont bloquées pour ne jamais renvoyer automatiquement après l'expiration de la rétention fournisseur de 24 heures. Ne pas supprimer le reçu pour forcer une reprise sans avoir rapproché l'envoi Resend. Les marqueurs `X-TOK-Forwarded` et `X-Loop` empêchent les boucles ; un message envoyé normalement par l'utilisateur reste accepté.

Retour arrière : désactiver uniquement le webhook entrant dédié. Garder le MX et les messages reçus Resend, ainsi que les reçus d'idempotence. Aucun effacement de messages n'est requis.

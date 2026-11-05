# TOK — Autorisation native de contact

## Périmètre et décision

Demande du 27 octobre 2026 : lien réutilisable, coordonnées de restaurateurs, signature au doigt et preuve d'autorisation, sans DocuSign. Niveau 3 : données privées, authentification, SQL et publication d'un service public.

Implémentation isolée dans `apps/tok-consentement` ; aucune route, dépendance, configuration de déploiement, paiement ni secret du site principal n'est modifié. Dépôt audité : `Mtnrconcept1/cloud-rebuild`, base `3fb491355dbf8a45fd222140fb69f77fc4313e1a`. La branche `feat/native-restaurant-consent-20261027` est dédiée. Le checkout local a échoué (DNS GitHub indisponible) ; travail connector-only, avec copie locale de tests, sans prétendre utiliser un worktree. La PR #987 du Cockpit n'est ni fusionnée ni remplacée.

## Utilisation

- Page publique : renseigner restaurant, signataire, fonction, e-mail et confirmation, lire le texte, cocher explicitement, signer.
- Un seul e-mail transactionnel de confirmation est demandé. Le reçu personnel et sa capacité secrète sont envoyés uniquement à cette adresse. La réponse publique du formulaire ne contient pas ce lien.
- Le signataire ouvre son reçu et confirme explicitement. Lire le lien ne valide rien. Confirmation possible pendant 48 heures.
- Depuis le reçu : retrait, impression/PDF via le navigateur, téléchargement JSON complet avec signature et empreinte SHA-256.
- `/#admin` : identifiants du compte administrateur TOK existant, puis code TOTP d'un facteur déjà vérifié. La session reste en mémoire, sans localStorage/sessionStorage.
- Au premier usage, l'administrateur renseigne et valide le nom ou la raison sociale du responsable, son adresse professionnelle et son e-mail de contact. La collecte est bloquée avant cette étape : aucune identité légale n'est inventée.
- Le registre est paginé par 50. Export CSV des seules adresses confirmées et non expirées/retirées, avec dédoublonnage par e-mail. Les oppositions déjà présentes dans `marketing_contacts` restent prioritaires.

L'export est un instantané : toujours le renouveler avant une campagne, appliquer toute demande de retrait reçue ailleurs et ne jamais réutiliser un ancien fichier après une opposition. Il n'y a **aucune inscription automatique dans Marketing TOK ou Freesendit**, aucun envoi de campagne, aucune modification d'une opposition existante. La preuve d'e-mail confirme l'accès à la boîte, pas l'identité civile ni les pouvoirs du signataire. L'empreinte détecte les changements de contenu, ce n'est ni un certificat qualifié, ni un horodatage qualifié, ni un archivage inviolable face à un propriétaire de base.

## Architecture et risques traités

`public/` contient uniquement HTML/CSS/JS statiques, sans bibliothèque externe ni traceur. L'API TypeScript s'exécute en Edge Function Supabase `tok-field-consent`. Aucun SDK n'est nécessaire. Elle utilise uniquement les variables serveur existantes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, sans lecture/export des valeurs.

Quatre tables nouvelles : preuves, compteurs anti-abus, journal administratif, paramètres du responsable. RLS activée et aucun droit anon/authenticated. Le service valide le JWT via Auth, exige AAL2 puis vérifie le rôle admin côté serveur. Le texte et l'identité sont copiés dans chaque preuve ; une mise à jour des paramètres ne réécrit jamais un accord antérieur. Un trigger protège les données de preuve et empêche de remettre à zéro les confirmations/retraits.

Jetons personnels de 256 bits dérivés par HMAC, empreintes seulement en base. Limites de flux 70 Ko, signature bornée, schéma validé, piège antibot, quotas persistants (100 demandes/jour total, 30/heure par empreinte IP, 3/jour par e-mail, heure suisse). Les échecs d'envoi restent non exportables. Une relance conserve la même clé d'idempotence Resend. Les en-têtes IP dépendant de la passerelle, le quota global et par e-mail ne dépendent pas de leur fiabilité. CORS restreint au domaine du formulaire ; pas une barrière d'authentification.

Nettoyage quotidien : demandes non confirmées de plus de 7 jours, preuves de plus de 24 mois, compteurs de plus de 2 jours, journal de plus de 24 mois. La suppression est limitée aux nouvelles tables. Les durées des sauvegardes/journaux prestataires doivent être vérifiées par l'exploitant, de même que leurs garanties de transfert et contrats.

## Ordre de livraison / retour arrière

1. Tests locaux puis commit/PR sur la branche dédiée, jamais main.
2. Migration additive idempotente, vérification des droits et essais SQL transactionnels annulés.
3. Edge Function dédiée ; `verify_jwt=false` uniquement car les entrées sont publiques et les actions privées font leur propre validation Auth + MFA + rôle.
4. Projet Vercel statique isolé `tok-consentement-restaurateurs` ; aucun lien Git automatique vers main et aucune preview du site principal. URL permanente uniquement après vérification du déploiement.
5. Configuration humaine de l'identité professionnelle et essai contrôlé avant collecte réelle.

Rollback : suspendre le projet de formulaire ou remettre une page d'indisponibilité, puis retirer l'accès au nouvel endpoint si nécessaire. Conserver les preuves, oppositions et leur rétention ; ne pas supprimer les tables et ne pas toucher aux contacts existants. Restaurer seulement les fichiers de ce module. Aucune fusion automatique.

## Vérifications reproductibles

Depuis ce dossier, avec Node 22+ et TypeScript disponible :

```sh
tsc api.ts --strict --target ES2022 --module ES2022 --lib ES2022,DOM --outDir .build
node --test api.test.mjs
node --check public/app.js
python ui.test.py
```

Le test navigateur utilise Python Playwright et Chromium `/usr/bin/chromium`. Il charge le DOM et les assets locaux en mémoire, toutes les réponses API/Auth étant simulées. Les navigations réseau du Chromium fourni sont interdites par sa politique ; ce test ne prétend pas être un essai connecté de production.

Résultats locaux au 27 octobre : 42 tests backend réussis, vérification TypeScript stricte et syntaxe JS réussies ; parcours signature à 320, 390 et 1280 px, confirmation/retrait explicites, connexion MFA/déconnexion et blocage avant configuration réussis. Aucun débordement horizontal ni erreur JavaScript dans ces scénarios. Tests de développement initialement rouges puis verts. Les fichiers `.build/` et captures ne font pas partie du dépôt.

Non exécutés ici : suite complète pnpm/lint/build du site principal (checkout/dépendances réseau indisponibles, aucune modification de cette application), connexion à un compte admin réel, envoi/confirmation d'un e-mail réel et revue juridique. Aucun consentement réel n'est signé au nom d'un tiers pour les tests. La revue de l'identité et du texte appartient au responsable ; une relecture juridique suisse est recommandée avant mise en service.

Sources techniques consultées : Supabase Auth MFA (`https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify`), code officiel auth-js (`https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts`), authentification Edge (`https://supabase.com/docs/guides/functions/auth`). Distinction juridique : OFCOM (`https://www.bakom.admin.ch/fr/signature-electronique`).

# Remédiation des dépendances TOK — 3 octobre 2026

## Résultat vérifié

Dépôt `Mtnrconcept1/cloud-rebuild`, PR #690, branche `fix/dependabot-audit-20261003`.
Validation isolée : exécution GitHub Actions 37094866166, depuis 80271e03727623b0ed50022bac8fd57b8c9b9940 avec modifications candidates contrôlées par empreintes SHA-256.

- Avant : **54 GHSA distincts** dans le graphe pnpm.
- Après : **1 GHSA distinct**, celui de `braces@3.0.3`, toujours visible dans l’audit officiel.
- Dépendances de production : **zéro vulnérabilité signalée** par `pnpm audit --prod`.
- Worker autonome : **zéro vulnérabilité signalée** par `npm audit --package-lock-only`.
- Tests applicatifs : **2610 réussites, zéro échec**.

Ce n’est pas un export de l’onglet privé Dependabot ni une preuve d’absence de toutes les failles applicatives. Les alertes de `main` ne seront recalculées sur le nouveau graphe qu’après fusion. **Aucune fusion ni mise en production n’est effectuée par cette remédiation.**

## Corrections

React Router passe à 7.18.4, Vitest à 4.1.11 et Puppeteer à 25.12.0. React 18 et Vite 6 sont conservés. Node 22.12.0 devient le minimum déclaré pour supporter Puppeteer ; la validation utilise Node 22.23.3.

Puppeteer 25 remplace sa chaîne d’extraction : `extract-zip`, qui n’a pas de correctif publié, est absent du nouveau verrouillage. Les APIs de sélection, clic et capture PNG sont vérifiées dans un véritable navigateur avec une page de test locale, sans requête de production.

Les dépendances indirectes sont corrigées par contraintes ciblées compatibles : gRPC 1.13.6, xmldom 0.8.15, humanfs 0.16.8, undici 7.30.0, js-yaml 4.3.2, nanoid 3.3.19, tar 7.5.22, browserslist 4.29.3 et autres bornes documentées dans `package.json`. Les branches majeures de brace-expansion sont contraintes séparément. Les overrides sont centralisés dans le manifeste ; aucun contournement de l’audit n’est ajouté.

Le verrouillage pnpm est régénéré avec pnpm 10.28.1. Les trois métadonnées de dépendances correspondantes dans `deno.lock` sont synchronisées, sans modifier les URLs distantes ni leurs empreintes. Le `package-lock.json` racine inutilisé est supprimé après vérification que README, Vercel et la CI emploient pnpm. **Le verrouillage npm du worker est conservé**, car son Dockerfile utilise réellement npm ci. Supprimer un ancien verrouillage ne remplace pas les corrections du graphe actif, qui ont été effectuées et auditées séparément.

## Cas `braces` : atténuation locale, alerte amont conservée

L’avis GHSA-vfj7-8cjw-p6xm reste associé à la version publiée 3.0.3. Un patch pnpm versionné limite la profondeur de l’arbre à 128 nœuds avant les traitements récursifs. Il couvre les accolades, parenthèses, imbrications mixtes et groupes non fermés. Les délimiteurs échappés, cités et entre crochets restent acceptés.

Les tests comportementaux sont exécutés contre la dépendance réellement installée : six échecs attendus avant correction, puis huit réussites, auxquelles s’ajoutent les neuf contrôles de politique Dependabot. Leur wrapper fait maintenant partie de la suite Vitest standard.

Empreinte SHA-256 du patch : `9680213ea6351e0a0e9649e78c88a0366b14988fa7a091918fd126755db8bb2c`.

**Ne pas annoncer zéro vulnérabilité dans l’audit complet : celui-ci conserve volontairement l’avis `braces`.** Cette atténuation protège les motifs chaîne testés ; elle n’est pas une attestation universelle sur des arbres AST arbitraires fournis directement à la bibliothèque. Remplacer le patch par un correctif amont compatible dès sa publication, après les mêmes tests.

## Fiabilisation de la validation

Trois descriptions manquantes des fonctions d’images TheFork sont ajoutées au journal d’audit. Le mock de navigation admin est aligné sur le hook réel `useFeatureFlags`. Le test SQL reconnaît les points littéraux `[.]` et teste les adresses privées contre le motif présent dans la migration, sans modifier cette migration. Le contrat de runtime attend maintenant Node >=22.12.0.

Les deux échecs Bash observés dans l’environnement distant provenaient de l’absence de `/dev/fd`, pas d’un défaut de déploiement ; aucun script de production n’a été changé pour les masquer.

## Vérifications effectuées

Installation figée ; audit de production ; audit npm du worker ; contrôle explicite du seul avis résiduel ; 17 contrôles Node ; suite Vitest complète en mode production ; typecheck ; lint ; build:prod ; tests et syntaxe du worker ; capture PNG dans un véritable navigateur.

Les commandes d’audit complètes restent reproductibles :

```sh
pnpm install --frozen-lockfile
pnpm audit --prod --json
pnpm audit --json
node --test scripts/dependabot-policy.test.mjs scripts/dependency-security.test.mjs
pnpm test
pnpm typecheck
pnpm lint
pnpm build:prod
pnpm --filter tok-image-ai-worker test
```

Le code retour non nul de l’audit complet correspond à l’avis amont `braces` conservé. Le build de validation emploie les variables publiques fictives de la CI : il valide le pipeline, pas l’exhaustivité des données SEO de production. Les avertissements de lint existants ne sont pas transformés en réussites silencieuses ; leur journal est conservé.

## Périmètre et limites

Niveau de risque 3 : mises à jour de sécurité et outillage. Aucun secret, paiement, donnée client, fonction Edge, politique RLS ou migration n’est modifié. `deno.lock` contient un module distant Supabase et des métadonnées de workspace, pas un graphe npm exhaustif des Edge Functions ; ce travail ne prétend pas auditer toutes les dépendances distantes de toutes les fonctions.

Les interrupteurs d’administration GitHub et la liste authentifiée des alertes restent distincts de la configuration versionnée. Aucun statut d’activation non vérifié n’est revendiqué. La configuration Dependabot ajoutée dans cette PR deviendra effective après sa fusion sur la branche par défaut ; aucun avis n’est ignoré ou fermé artificiellement.

Le bootstrap de validation est limité à cette seule branche et ne s’exécute pas sur une pull request externe. La validation utilise un jeton lecture seule ; le job de publication séparé ne lance aucun code applicatif et ne copie que les fichiers explicitement autorisés, après contrôle de leurs empreintes. Le bootstrap temporaire doit être retiré après publication des résultats, puis la CI normale du SHA final vérifiée. Pas de merge automatique.

## Retour arrière

Revert des commits de remédiation dans une nouvelle PR. Aucune base de données à restaurer. Ne pas réintroduire d’exclusion d’audit pour faire disparaître une alerte. Une régression liée à la limite de profondeur doit être analysée avec un motif de test réel avant toute modification du garde-fou.

## Annexe — avis présents avant remédiation


Un même avis peut apparaître pour plusieurs paquets dans l’inventaire. Il n’est compté qu’une fois ici. H = élevé, M = modéré, L = faible.

| Avis | Niveau | Paquet(s) concerné(s) |
|---|---|---|
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) | H | `@grpc/grpc-js` |
| [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | L | `@grpc/grpc-js` |
| [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g) | M | `@humanfs/node` |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | M | `@vitest/mocker`, `vitest` |
| [GHSA-6gmq-8vp8-gcm6](https://github.com/advisories/GHSA-6gmq-8vp8-gcm6) | M | `@xmldom/xmldom` |
| [GHSA-w2rr-34g9-rvrj](https://github.com/advisories/GHSA-w2rr-34g9-rvrj) | H | `@xmldom/xmldom` |
| [GHSA-4w3w-2rp5-g8jm](https://github.com/advisories/GHSA-4w3w-2rp5-g8jm) | H | `@xmldom/xmldom` |
| [GHSA-c7q8-3ch8-vqpv](https://github.com/advisories/GHSA-c7q8-3ch8-vqpv) | H | `@xmldom/xmldom` |
| [GHSA-27p8-2357-5qqv](https://github.com/advisories/GHSA-27p8-2357-5qqv) | H | `@xmldom/xmldom` |
| [GHSA-6h8r-xr42-gp59](https://github.com/advisories/GHSA-6h8r-xr42-gp59) | M | `@xmldom/xmldom` |
| [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6) | H | `@xmldom/xmldom` |
| [GHSA-x4fp-j954-r2f4](https://github.com/advisories/GHSA-x4fp-j954-r2f4) | H | `@xmldom/xmldom` |
| [GHSA-965w-775f-mr7g](https://github.com/advisories/GHSA-965w-775f-mr7g) | H | `@xmldom/xmldom` |
| [GHSA-93r5-fhx6-vmg9](https://github.com/advisories/GHSA-93r5-fhx6-vmg9) | H | `@xmldom/xmldom` |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | M | `baseline-browser-mapping` |
| [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | H | `basic-ftp` |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | H | `brace-expansion` |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | H | `brace-expansion` |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | H | `brace-expansion` |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | H | `brace-expansion` |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | M | `brace-expansion` |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | H | `braces` |
| [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) | H | `browserslist` |
| [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | H | `browserslist` |
| [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | H | `extract-zip` |
| [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | H | `extract-zip` |
| [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr) | H | `ip-address` |
| [GHSA-4xrf-jv44-h6hh](https://github.com/advisories/GHSA-4xrf-jv44-h6hh) | M | `ip-address` |
| [GHSA-22jq-vg5j-6vgg](https://github.com/advisories/GHSA-22jq-vg5j-6vgg) | M | `ip-address` |
| [GHSA-rpw4-54j3-4h4q](https://github.com/advisories/GHSA-rpw4-54j3-4h4q) | M | `ip-address` |
| [GHSA-2vr4-cq9g-pvrc](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc) | M | `ip-address` |
| [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv) | M | `ip-address` |
| [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw) | M | `ip-address` |
| [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | H | `js-yaml` |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | H | `js-yaml` |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) | H | `nanoid` |
| [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | L | `postcss-selector-parser` |
| [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | H | `react-router` |
| [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m) | H | `tar` |
| [GHSA-8xcm-r25x-g524](https://github.com/advisories/GHSA-8xcm-r25x-g524) | M | `undici` |
| [GHSA-4cwx-7wf7-3272](https://github.com/advisories/GHSA-4cwx-7wf7-3272) | H | `undici` |
| [GHSA-m8rv-5g2x-5cg5](https://github.com/advisories/GHSA-m8rv-5g2x-5cg5) | M | `undici` |
| [GHSA-jr45-8vmc-qm54](https://github.com/advisories/GHSA-jr45-8vmc-qm54) | M | `undici` |
| [GHSA-v3r7-h72x-cjcm](https://github.com/advisories/GHSA-v3r7-h72x-cjcm) | M | `undici` |
| [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v) | M | `undici` |
| [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | M | `undici` |
| [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | L | `undici` |
| [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | H | `undici` |
| [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | M | `undici` |
| [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | M | `undici` |
| [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | L | `undici` |
| [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | H | `undici` |
| [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | L | `undici` |
| [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | M | `undici` |

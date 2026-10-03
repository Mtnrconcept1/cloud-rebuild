# Audit des dépendances et réglages Dependabot — 3 octobre 2026

## Résultat et limites

Dépôt : `Mtnrconcept1/cloud-rebuild`. Révision analysée : `9e7d9c8989142539f0223e6b3e0b66ccda29cc2e`.

**L’analyse du fichier `pnpm-lock.yaml` a retourné 54 avis GHSA distincts concernant 18 noms de paquets : 28 élevés, 21 modérés et 5 faibles. Aucun avis critique n’a été retourné dans ce périmètre.**

Ce nombre n’est PAS le nombre d’alertes privées affiché dans l’onglet Dependabot. Le connecteur utilisé ne fournit ni la lecture de cet onglet ni les actions d’administration permettant de vérifier ou modifier les interrupteurs de sécurité du dépôt. L’absence du fichier dependabot.yml ne prouve pas que les alertes ou mises à jour de sécurité sont désactivées.

Méthode : lecture complète du verrouillage pnpm à la révision ci-dessus, extraction de la section `packages`, puis requête en lecture seule vers l’API publique npm `POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`. Inventaire envoyé : 807 noms de paquets, 848 versions. Réponse : 60 entrées brutes, dédupliquées par GHSA en 54 avis. Certains avis sont répétés pour plusieurs branches de version ou pour Vitest et son module mocker. L’exception locale d’audit n’a pas été appliquée à cette requête.

Cette opération n’est pas une exécution de `pnpm audit`, un test d’intrusion ou une preuve d’exploitation. La présence d’un paquet dans le verrouillage ne démontre pas que son code vulnérable est livré au navigateur ou exécuté côté serveur.

Les fichiers `package-lock.json`, `workers/image-ai-worker/package-lock.json` et `deno.lock` ont été repérés, mais n’ont pas été intégralement audités. La configuration des dépendances des workflows est couverte par le réglage proposé ; leurs versions n’ont pas été incluses dans les 54 avis. Les autorisations applicatives, RLS, secrets et paiements sont hors du périmètre de ce contrôle des dépendances.

## Changements de ce correctif

1. Ajout de `.github/dependabot.yml` couvrant npm à la racine et dans `workers/image-ai-worker`, ainsi que les dépendances des workflows GitHub Actions existants. Aucun nouveau workflow n’est ajouté.
2. Groupes de sécurité distincts pour les bibliothèques de production, les outils de développement et la famille Vitest. Les mises à jour majeures nécessaires à la sécurité ne sont pas exclues et ne sont pas fusionnées automatiquement.
3. Maintenance ordinaire hebdomadaire, le lundi à 06:00 / 06:30 Europe/Zurich ; plafond de 5 PR npm et 2 PR Actions pour les mises à jour de version. Ces plafonds et cette cadence ne sont pas présentés comme une restriction des mises à jour de sécurité.
4. Retrait de l’exception `GHSA-qwww-vcr4-c8h2` de `pnpm-workspace.yaml`. Cela rétablit sa visibilité dans l’audit ; cela ne corrige PAS React Router. Toutes les autres valeurs du workspace, dont overrides et autorisations de compilation, sont préservées.
5. Ajout de neuf tests natifs Node pour protéger cette politique. La configuration utilise la représentation JSON, compatible YAML, afin de pouvoir être vérifiée sans installer un parseur supplémentaire. Ces tests ne remplacent pas un audit des dépendances et doivent être lancés explicitement ; aucun nouveau job CI n’a été ajouté pour les exécuter.

**Aucune dépendance n’a été mise à jour dans ce correctif. Aucun fichier de verrouillage n’a été modifié. Aucun avis n’a été fermé dans GitHub. La configuration proposée doit être fusionnée avant de devenir active sur la branche par défaut ; les interrupteurs de sécurité GitHub doivent aussi être vérifiés séparément.**

## Inventaire des paquets signalés

Les bornes ci-dessous viennent des plages vulnérables ou des correctifs indiqués par les avis. Elles ne constituent pas une attestation d’installation, de disponibilité npm pour chaque borne, ni de compatibilité avec TOK. Conserver les branches majeures compatibles et régénérer les verrouillages avec le gestionnaire du projet.

| Paquet | Version(s) concernée(s) dans pnpm | Problème | Orientation de correction |
|---|---|---|---|
| `@grpc/grpc-js` | 1.9.16 | Certificats non autorisés dans getAuthContext sous certaines configurations ; fuite de messages d’erreur. | 1.13.6 (dans la branche 1.13) |
| `@humanfs/node` | 0.16.7 | Copie de fichiers suivant des liens symboliques hors du répertoire source. | 0.16.8 |
| `@vitest/mocker` | 3.2.6 | Lecture arbitraire de fichiers par les mocks de redirection, sous les conditions décrites par l’avis. | 4.1.11 ; migration à tester |
| `@xmldom/xmldom` | 0.8.13 | Injections XML, acceptation de documents mal formés et consommation excessive de CPU/mémoire. | Version hors des plages ≤ 0.8.14 ; disponibilité et compatibilité à vérifier |
| `baseline-browser-mapping` | 2.10.18 | Arrêt du processus sur entrée invalide. | 2.11.0 |
| `basic-ftp` | 5.3.1 | Temps CPU quadratique lors de l’analyse de listes de répertoires Unix. | La plage signalée inclut ≤ 6.2.0 ; correctif publié à vérifier |
| `brace-expansion` | 1.1.16 et 5.0.7 | Débordement de pile, expansion non bornée et saturation CPU/mémoire. | Bornes 1.1.21 / 5.0.12 selon la branche ; publication à vérifier |
| `braces` | 3.0.3 | Débordement de pile sur des motifs profondément imbriqués. | Aucun correctif publié dans l’avis consulté |
| `browserslist` | 4.28.2 | Cache sans éviction ; arrêt du processus/écriture de prototype via statistiques non fiables. | Hors de la plage ≤ 4.28.6 ; publication à vérifier |
| `extract-zip` | 2.0.1 | Écriture hors du dossier d’extraction par des archives contenant des liens symboliques. | Aucun correctif publié dans l’avis consulté |
| `ip-address` | 10.2.0 | Erreurs de classification et de sous-réseau pouvant contourner des contrôles SSRF ; déni de service. | Hors de la plage ≤ 10.7.0 ; publication à vérifier |
| `js-yaml` | 4.3.0 | Consommation CPU excessive lors des résolutions omap et des fusions YAML. | 4.3.2 |
| `nanoid` | 3.3.17 | Boucle infinie de générateurs personnalisés avec une taille nulle. | 3.3.18 |
| `postcss-selector-parser` | 6.1.2 | Récursion AST non contrôlée. La version 6.0.10 également inventoriée n’appartient pas à la plage retournée par cet avis. | 6.1.3 |
| `react-router` | 7.18.1 | Contournement CSRF propre au mode RSC instable, pas à toute application utilisant React Router. | 7.18.2 |
| `tar` | 7.5.19 | Débordement de pile sur des chemins longs lors d’extractions avec sélection de membres. | Hors de la plage ≤ 7.5.20 ; publication à vérifier |
| `undici` | 7.28.0 | Problèmes conditionnels de cache HTTP, cookies, injections, réponses, WebSocket, décompression et options TLS personnalisées. | 7.29.1 pour la branche 7 |
| `vitest` | 3.2.6 | Même avis que @vitest/mocker : ne pas compter cet avis deux fois. | 4.1.11 ; migration majeure à valider |

## Impact réel et priorités

**Priorité 1 — réseau et frontières de confiance.** Tracer les dépendances parentes et les appels effectifs de `undici`, `@grpc/grpc-js` et `ip-address`. Mettre à jour les chemins applicables et tester les échanges réseau. L’avis TLS d’undici concerne notamment des options TLS personnalisées perdues dans BalancedPool ; il ne signifie pas que toute validation TLS par défaut est désactivée. Les avis de cache ou SSRF nécessitent également les usages décrits dans chaque avis.

**Priorité 2 — outils et parseurs.** Corriger les versions compatibles de `brace-expansion`, `js-yaml`, `nanoid`, `@humanfs/node`, des parseurs XML/CSS et des autres bibliothèques signalées. L’override actuel `brace-expansion: >=1.1.16` n’impose plus une borne suffisante et traverse plusieurs branches majeures : le remplacer par des contraintes compatibles ciblées après analyse des parents, pas par une montée forcée arbitraire.

**Priorité 3 — cas nécessitant une décision de compatibilité.** Les avis publics consultés indiquent encore l’absence de correctif pour `braces` et `extract-zip`. Étudier le remplacement ou la mise à jour des dépendances parentes, restreindre les entrées/archives non fiables et conserver les avis ouverts. Ce sont au moins deux cas confirmés ; l’absence d’une mention « aucun correctif » dans les autres lignes ne prouve pas qu’une version corrigée est disponible.

La correction Vitest indiquée est 4.1.11 alors que le projet est en 3.2.6. Vérifier la migration, le support de Vite, la configuration et les tests avant de fusionner. Les conditions d’accès au serveur de mocks doivent être examinées ; une dépendance de test n’établit pas à elle seule une exposition du site public.

React Router 7.18.1 est dans la plage signalée. L’ancien commentaire du workspace décrit TOK comme une SPA déclarative sans APIs RSC. Il s’agit d’une indication de contexte, pas d’une preuve d’atteignabilité issue de cet audit. La version corrigée de la branche 7 est 7.18.2. Retirer une exception sans mettre à jour la version rend l’avis visible, mais ne ferme pas la vulnérabilité.

## Ordre de finalisation

1. Obtenir la liste authentifiée complète des alertes Dependabot, avec leurs manifestes, états et versions corrigées, et la rapprocher de cet inventaire. Vérifier le graphe de dépendances, les alertes Dependabot et les mises à jour de sécurité dans les paramètres du dépôt ; aucun de ces interrupteurs n’a été modifié ici.
2. Utiliser le gestionnaire déclaré `pnpm@10.28.1`, analyser les chaînes parentes, puis effectuer les mises à jour compatibles dans une branche. Ne pas exécuter une montée globale forcée. Ne pas supprimer les verrouillages npm avant d’avoir confirmé leurs usages.
3. Régénérer les fichiers de verrouillage pertinents et exécuter installation figée, audit complet, lint, typecheck, tests et build. Tester séparément le worker et la migration Vitest. Rechercher aussi les dépendances Deno et les versions des actions qui ne sont pas incluses dans le comptage pnpm.
4. Fusionner seulement les lots validés, puis vérifier le déploiement concerné et le recalcul effectif des alertes sur la branche par défaut. Conserver explicitement les avis non corrigés ; ne jamais confondre leur suppression ou leur exclusion avec une correction.

Commandes de validation à exécuter dans un checkout complet (non exécutées ici sauf le test de politique indiqué ci-dessous) :

```sh
node --test scripts/dependabot-policy.test.mjs
pnpm install --frozen-lockfile
pnpm audit --audit-level=low
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter tok-image-ai-worker test
```

## Validations réellement effectuées

- Source du workspace recopiée et vérifiée par son empreinte Git blob : `d42aa718d977efa719597500b84dcbe8814a4a2f`.
- Cycle rouge/vert : avant, 9 tests en échec ; après, 9 réussites, zéro échec, zéro ignoré.
- `node --check scripts/dependabot-policy.test.mjs` : réussi.
- Lecture de la configuration par JSON et YAML : structures identiques et valides.
- Comparaison structurelle du workspace : seule l’exception d’audit a été retirée. Aucun changement des packages, overrides ou permissions de compilation.
- Déduplication de l’inventaire : 54 GHSA, 28 high, 21 moderate, 5 low ; 18 noms de paquets.

Non exécutés : installation complète, `pnpm audit`, régénération des verrouillages, lint/typecheck/tests applicatifs/build, essais réseau et validations de production. Le checkout complet et l’exécution de pnpm avec les dépendances du projet n’ont pas pu être obtenus dans l’environnement disponible. Les contrôles ciblés ci-dessus ne permettent pas de déclarer ces validations vertes.

## Risque, publication et retour arrière

Niveau 3, car il s’agit de réglages de sécurité. Périmètre volontairement limité à une politique, un retrait d’exception, ses tests et ce rapport. Aucun secret, migration, paiement, règle RLS ou réglage de déploiement n’est modifié. Une branche et une PR dédiées sont prévues ; pas de modification directe de main ni de fusion/déploiement revendiqué dans ce rapport. Le statut courant de la PR fait foi pour sa publication.

Retour arrière : revenir sur le commit de cette PR via une PR de revert. Le graphe des versions installées reste identique. Réintroduire l’exception React Router masquerait de nouveau l’avis, sans le résoudre ; ne le faire qu’après une décision explicite documentée sur son applicabilité.

## Sources de méthode

- [Options Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
- [Configuration des mises à jour de sécurité](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates).
- [Documentation pnpm audit](https://pnpm.io/cli/audit).
- Avis individuels ci-dessous. Les identifiants et sévérités sont une transcription normalisée de la réponse npm, pas un export des alertes privées du dépôt.

## Annexe — les 54 avis distincts

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

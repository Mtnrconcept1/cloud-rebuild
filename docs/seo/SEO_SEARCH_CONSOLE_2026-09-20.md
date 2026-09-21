# TOK : déduplication des lieux Stoppin et redirections — 20 septembre 2026

## Périmètre et provenance

Le patch fourni (`15198ffb600ed1b192ccc955b378e02147fd0069`) concerne **thetok.ch**,
non le déploiement de Stoppin. Il est analysé contre le dépôt réel
`Mtnrconcept1/cloud-rebuild`, base `05964e257508c743f395e2104c1208f018b3346c`.
Le correctif initial n'est pas présent dans cette base.

Les chiffres suivants sont ceux du rapport Search Console fourni, daté du
18 septembre. Ils n'ont pas été remesurés dans Search Console pendant cette intervention.

| Motif rapporté | Pages |
| --- | ---: |
| Indexées | 10 |
| Détectée, actuellement non indexée | 742 |
| Introuvable (404) | 56 |
| Exclue par la balise noindex | 24 |
| Explorée, actuellement non indexée | 26 |
| Page avec redirection | 2 |

Total rapporté : 860 pages connues, dont 850 non indexées. Parmi les 742 pages
« détectées », le document indique 443 URLs `/restaurants-pres/*` : **pas 742**.
Il rapporte aussi 445 pages de ce répertoire et 46 entrées redondantes dans
23 groupes. Ces volumes ne constituent pas une mesure du résultat de cette PR.
La duplication est un problème technique à corriger, pas une preuve que les
850 exclusions ont une cause unique, ni une garantie d'indexation future.

## Diagnostic vérifié

Quatre régressions ont été reproduites avec les fonctions exactes du patch et
le parseur de coordonnées de la base :

- `Number(null)` devient `0` ; deux entrées sans coordonnées étaient fusionnées.
- Deux points quasiment identiques de part et d'autre d'une frontière d'arrondi
  étaient conservés comme deux lieux.
- Deux points dans la même case d'arrondi, mais séparés de plus de 55 mètres
  sur la diagonale, étaient fusionnés.
- Le premier point est aussi couvert isolément par un test du parseur : quatre
  assertions échouaient au total avant correction.

Le patch produisait un manifeste sans consommateur HTTP. Son commentaire
annonçant un script de redirection déjà présent et un fichier non public ne
correspondait pas au code fourni. Les tests extrayaient du code avec `new Function`
au lieu d'importer un module réellement indépendant.

Supabase TOK a été interrogé **en lecture seule** pour le cas 404 documenté.
La fiche active retournée est « Fernandes De Almeida - Restaurant Le Paradisio »,
ville `Carouge`, slug `fernandes-de-almeida-restaurant-le-paradisio`.
Deux anciennes URLs au slug tronqué sont donc dirigées vers cette fiche exacte,
avant la redirection générique de `carouge-ge` vers `carouge`.
Cette vérification de données ne remplace pas un contrôle HTTP après déploiement.

## Plan exécuté et fichiers

Risque retenu : **niveau 3**, car le routage de production est concerné.
Aucun changement de données, de migration, de RLS, d'Auth, de Storage, de secret,
de paiement, de dépendance ou de workflow CI.

Ordre de travail : reproduire les erreurs, tester les fonctions pures et les
artefacts, corriger les helpers, brancher la génération et le routage, puis
contrôler le diff et publier une seule PR sans fusion.

| Fichier | Action et justification |
| --- | --- |
| `scripts/lib/stoppin-venue-dedupe.mjs` | Nouveau module pur : coordonnées strictes, noms normalisés, distance réelle et choix canonique stable. |
| `scripts/prerender-stoppin-restaurants-bounded.mjs` | Branche les helpers et remplace toujours le manifeste, y compris lorsque le flux est indisponible. |
| `scripts/apply-stoppin-venue-redirects.mjs` | Nouveau finaliseur : valide les alias et les cibles réellement générées, prépare les 301 et nettoie les artefacts redondants. |
| `scripts/stoppin-venue-seo.test.mjs` | Nouvelle suite comportementale Node 22, sans réseau ni dépendance de production. |
| `src/test/stoppin-venue-dedupe.test.ts` | Exécute cette même suite dans Vitest et protège le branchement au build. |
| `package.json` | Ajoute le finaliseur à la fin de `build:prod` et `seo:prerender`, après tous les durcissements SEO. |
| `vercel.json` | Branche `bulkRedirectsPath` et les deux redirections exactes du Paradisio ; conserve les en-têtes, rewrites et paramètres Git existants. |
| `docs/seo/SEO_SEARCH_CONSOLE_2026-09-20.md` | Ce diagnostic, le plan, les preuves et les limites. |

## Comportement retenu

La déduplication exige un nom normalisé identique et une distance géodésique
maximale de 55 mètres. Elle conserve le slug le plus court, puis départage
lexicalement. Les champs d'identité nécessaires au rendu doivent être utilisables ;
un enregistrement court mais incomplet ne remplace pas un enregistrement complet.
Les coordonnées absentes, booléennes, vides, non finies ou hors limites sont rejetées
comme coordonnées, sans supprimer arbitrairement leur entrée du résultat de déduplication.
Les mots géographiques internes au nom sont conservés. La fusion n'est pas
transitive au-delà du rayon du représentant canonique. Il s'agit d'une heuristique
pour le prérendu, pas d'une fusion d'entités dans la base de données.

Le manifeste `stoppin-venue-aliases.json` est un artefact contenant uniquement des
slugs publics, dans `dist/` ou `public/` selon le mode. S'il est publié avec `dist`,
il est public. Le fichier consommé par Vercel, lui, est généré sous
`.vercel/stoppin-venue-redirects.json`, hors du répertoire statique publié.

Le finaliseur s'exécute après tous les durcissements. Il n'émet de redirection
que vers un HTML existant du générateur Stoppin, auto-canonique et indexable.
Il refuse les chemins dangereux, les cycles, les cibles externes et les manifestes
invalides. Les chaînes d'alias sont aplaties. Chaque alias éligible reçoit une
301 avec et sans slash final, en conservant les paramètres de requête.
Les anciens HTML et les entrées de sitemap de ces seuls alias sont retirés.
Les autres pages et les cibles non éligibles ne sont pas supprimées par le finaliseur.

Un manifeste vide ou absent remplace les anciennes règles par une liste vide ;
un JSON invalide fait échouer le build plutôt que publier une configuration douteuse.
La limite est de 1 000 règles générées, vérifiée avant toute suppression de fichier.
Elle empêche ce code d'augmenter automatiquement la capacité de redirection.

Vercel documente `bulkRedirectsPath` avec génération au build et `statusCode: 301` :
https://vercel.com/docs/project-configuration/vercel-json#bulkredirectspath
Les offres éligibles et le nombre de règles déjà configurées dans le projet doivent
être confirmés avant livraison ; cette PR n'active aucun abonnement ni capacité payante.
Référence : https://vercel.com/blog/scaling-redirects-to-infinity-on-vercel

## Validation et limites de livraison

Les copies des trois fichiers existants ont été vérifiées octet pour octet contre
leurs SHA de blob GitHub avant modification. Les régressions initiales ont été
reproduites (4 assertions rouges), puis la suite autonome s'exécute avec :

```sh
node --test scripts/stoppin-venue-seo.test.mjs
node --check scripts/lib/stoppin-venue-dedupe.mjs
node --check scripts/apply-stoppin-venue-redirects.mjs
node --check scripts/prerender-stoppin-restaurants-bounded.mjs
```

Cette suite teste les vrais exports et des répertoires HTML temporaires : pas
une extraction textuelle évaluée, pas une base de production simulée comme validée.
Elle ne remplace pas la compilation de l'application entière.

Commandes à faire passer dans un checkout complet avant fusion :

```sh
pnpm exec vitest run src/test/stoppin-venue-dedupe.test.ts src/test/seo-stoppin-scale.test.ts src/test/stoppin-thetok-routes.test.ts src/test/route-wiring.test.ts
pnpm lint
pnpm typecheck
pnpm run build:prod
```

Le clone local échoue sur la résolution DNS de GitHub et pnpm est absent de
l'environnement de cette intervention. La validation locale se limite donc aux
modules Node autonomes, à leur syntaxe et au diff des fichiers réellement lus.
Les résultats des checks GitHub doivent être consultés sur le SHA final ; aucune
compilation, suite Vitest complète ou livraison Vercel n'est implicitement déclarée verte.

Il reste à contrôler les réponses HTTP de préproduction puis de production après
une livraison autorisée. Les 56 URLs 404 et les deux exclusions de redirection ne sont pas toutes connues
individuellement dans le document joint et ne sont pas déclarées réparées. Aucune nouvelle demande
d'indexation Search Console n'a été soumise pendant cette intervention.

Le manifeste est calculé depuis le flux du build courant. Un alias historique
qui disparaît entièrement de ce flux et de tout manifeste conservé n'est pas
inventé ni reconstitué automatiquement : il doit être enregistré durablement à
partir d'un inventaire vérifié avant un nettoyage amont des lieux. Ne pas lancer
une suppression massive de doublons dans Supabase sur la base de ce correctif.

## Retour arrière

Annuler le commit unique de cette PR et reconstruire le frontend via la voie de
livraison existante. Aucun retour arrière SQL n'est requis. `main` n'est pas
modifiée et cette PR ne doit pas être fusionnée sans validations et autorisation.

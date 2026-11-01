# Blog natif TOK

## Périmètre et choix

Changement de niveau 2 : blog public `/blog`, douze articles `/blog/:slug`, liens de découverte, pré-rendu complet et sitemap. Contenu versionné dans `src/content/blog.json` ; aucun appel BabyLoveGrowth, aucune nouvelle dépendance, aucune migration ni interface d’administration ajoutée. Les douze textes reprennent les brouillons préparés pour TOK, avec des liens internes vers le blog natif.

La page et les articles utilisent le même rendu éditorial côté application et au build. Le pipeline existant crée les fichiers HTML, les canonical, Open Graph et le JSON-LD `Blog` / `BlogPosting` / `BreadcrumbList`. Le sitemap dédié contient seulement les URL publiées dans le catalogue. Les slugs inconnus utilisent la page 404 existante ; aucune réécriture générale vers la SPA n’est ajoutée.

## Ordre de réalisation et fichiers

1. Tests de rendu, sécurité HTML, routes inconnues et pré-rendu/sitemap : `scripts/blog-seo.test.mjs`, `src/test/seo-native-blog.test.tsx` ; déclaration des deux routes publiques dans `src/test/route-wiring.test.ts`.
2. Catalogue et rendu partagé : `src/content/blog.json`, `src/lib/seo/blog.mjs`, `src/lib/seo/blog.d.mts`.
3. Page et styles : `src/pages/Blog.tsx`, `public/blog.css` ; routes dans `src/App.tsx`, lien dans `src/components/home/FooterSection.tsx`, fallback dans `src/hooks/useSeoMeta.ts`.
   Exception UI limitée à `/blog` et ses articles dans `src/lib/launchGate.ts` : les clients connectés peuvent lire ces contenus publics pendant le lancement, sans ouvrir leurs commandes ou réservations.
4. Intégration SEO : `scripts/prerender-seo.mjs`, `scripts/harden-seo-crawl.mjs` pour conserver le lien de l’accueil après durcissement.
5. Mise à jour des trois index applicatifs générés avec `pnpm docs:application-index` : `docs/architecture/TOK_APPLICATION_REFERENCE.md`, `docs/architecture/tok-application-search-index.json`, `src/data/tok-user-guide-catalog.generated.ts`.
6. Tests ciblés, lint/typecheck/build, revue du diff, commit et PR. Pas de fusion automatique ni de changement de DNS ou de souscription BabyLoveGrowth.

## Ajouter ou modifier un article

- Modifier le catalogue sur une branche dédiée. Préserver un slug déjà publié.
- Renseigner titre, description unique, catégorie, auteur réel, dates exactes, nombre de mots, trois slugs de lectures liées et blocs éditoriaux.
- Les blocs disponibles sont `paragraph`, `heading`, `list`, `table`. Les liens Markdown et le gras sont permis dans le texte ; le HTML brut est affiché comme texte. Les URL exécutables et les liens relatifs à un protocole sont refusés.
- Un identifiant de titre doit être unique dans l’article ; le sommaire est dérivé des titres de niveau 2.
- Relire les tarifs et conditions sur les pages TOK actuelles avant publication. Ne pas promettre disponibilité, rendement, classement Google ou résultats enrichis.
- Valider avec `node --test scripts/blog-seo.test.mjs` et `pnpm exec vitest run src/test/seo-native-blog.test.tsx`. Le build de production inclut automatiquement tous les articles et le sitemap.

## Risques et retour arrière

Le risque principal est une divergence entre contenu visible, métadonnées et routage : le rendu partagé et les tests de sortie HTML couvrent ce contrat. Les espaces privés conservent leurs règles d’indexation. La date de publication doit correspondre à la disponibilité du contenu ; en cas de publication différée, actualiser les dates avant fusion.

Retour arrière : revert de la PR puis déploiement par le workflow existant. Le sous-domaine historique `blog.thetok.ch` n’est pas déplacé ; les deux articles historiques et leur hébergement ne sont pas supprimés. L’arrêt éventuel d’un abonnement ou une redirection depuis cet hébergement nécessitent une décision séparée.

## Limites de validation locale

Les tests vérifient le contenu complet des douze articles, leurs liens, les URL inconnues, les métadonnées et le sitemap, ainsi que la cohérence du JSON-LD après les étapes de durcissement. Le pré-rendu local utilise l’inventaire statique, sans lecture de données de production ; les pages dynamiques existantes ne sont pas auditées par ce contrôle. Le navigateur distant ne peut pas joindre le serveur local : la revue visuelle desktop/mobile reste à effectuer avant publication.

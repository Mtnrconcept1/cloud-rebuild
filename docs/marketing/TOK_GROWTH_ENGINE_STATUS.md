# Moteur TOK — état réel du premier lot éditorial

Date : 1er novembre 2026. Risque 3. **Implémentation partielle, non déployée. Aucun des 51 critères n’est déclaré activé.**

La demande « mets tout en place » valide la conception de la PR #1061. Le présent lot construit le domaine éditorial indépendant, sans modifier les campagnes, les publications Meta, les routes du blog, les paiements ni la stratégie de déploiement. La PR de conception reste distincte.

## Livré dans le code

- Entrée « Moteur éditorial » du centre marketing, états réels, listes paginées et erreurs explicites.
- Profil TOK et voix éditoriale approuvés et versionnés ; faits et URL TOK limités, sans recherche web inventée.
- Sujets/briefs, révisions immuables par les interfaces, éditeur texte, FAQ, prévisualisation échappée, reprise des dix dernières révisions.
- Approbation de la révision exacte ; nouvelle édition ou nouveau résultat IA invalide l’approbation ; contrôle des versions et révocation du rôle admin.
- Tables privées avec RLS forcée, droits directs retirés, dispatcher service-only et vérification de session BFF/MFA/CSRF/admin.
- File durable et claim exclusif, clé métier article/version, lease et contrôle du profil/brief/rôle à la fin du travail.
- Réserve atomique mensuelle ; absence de budget, modèle inconnu, prix périmé ou plafond insuffisant bloque l’appel. Le prix vérifié sert au calcul, pas un chiffre arbitraire choisi par l’opérateur.
- Worker Edge distinct des envois, cron de cinq minutes sous les contrôles de pause existants, entretien des leases indépendant des credentials IA.
- Erreur ou timeout ambigu : rapprochement requis, réservation conservée, aucune relance payante aveugle.

## Activation encore bloquée

1. Exécuter la migration et les tests SQL sur une base isolée. Le runtime de cette session n’a ni PostgreSQL ni Docker. Les deux branches Supabase de développement observées sont en `MIGRATIONS_FAILED` et appartiennent à d’autres travaux ; elles n’ont pas été modifiées.
2. Vérifier le déploiement Edge et le timer avec les vrais secrets existants `marketing_edge_url` / `internal_cron_secret`. Le connecteur Supabase accessible ne prouve pas la présence ou validité de chaque secret Edge.
3. Fournir un profil approuvé, un budget explicite, un modèle autorisé et son plafond serveur. Tester un article canari après vérification du compte fournisseur et du coût.
4. Raccorder la publication au blog natif développé séparément. Le code présent **ne publie pas** l’article dans le blog ni sur un réseau social.
5. Développer et recetter les autres domaines ci-dessous. Il ne s’agit pas uniquement de clés à ajouter : plusieurs fonctions restent à construire.

Aucune migration de production, bascule DNS, mutation sociale, dépense IA ni fusion n’a été effectuée dans ce lot.

## Variables serveur

| Variable | Contrat |
| --- | --- |
| `OPENAI_API_KEY` | Accès existant, exclusivement Edge ; jamais dans le navigateur |
| `MARKETING_GROWTH_MODEL` | Seul `gpt-4.1-mini-2025-04-14` est tarifé dans ce premier adaptateur |
| `MARKETING_GROWTH_MAX_CALL_MICROS` | Plafond serveur en micro-CHF ; inférieur à 105600 bloque, n’abaisse jamais la réserve calculée |

Prix de l’adaptateur : [documentation officielle GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), vérifiée le 1er novembre 2026 : 0.40 USD entrée et 1.60 USD sortie / million de tokens, tier standard explicitement demandé. Le calcul majore 100000 tokens entrée et 8000 sortie, avec une provision de conversion/taxes de 2 CHF/USD, soit 105600 micro-CHF. Cette provision n’est pas un taux de change observé. Les prix expirent le 8 novembre 2026 et doivent être revérifiés avant prolongation. Les bytes du prompt, du schema et du contexte de sécurité sont bornés avant appel ; aucun outil payant additionnel n’est fourni au modèle. Le montant réservé est une majoration conservée, pas une facture réelle ni une mesure d’usage.

Les sources de texte sont fournies par le profil approuvé ; la date représente l’approbation du profil, **pas une vérification HTTP de la page**. L’interface le signale et impose la revue humaine.

## Couverture des 51 exigences

« Partiel » signifie code présent dans ce lot, avec recette SQL/fournisseur encore nécessaire. « Socle existant » ne vaut pas conformité nouvelle.

| Exigences | État après ce lot |
| --- | --- |
| G01–G02 : vue croissance, historique/calendrier | Partiel : sujets et jobs ; consolidation de toutes les mesures/calendrier à développer |
| G03–G04 : profil, voix, identité | Partiel : texte et versions ; références visuelles et multi-sites à compléter |
| G05–G07 : concurrence, mots-clés, plan mensuel | À développer |
| G08–G10 : briefs, rédaction, formats/langues | Partiel : brief, document structuré et adaptateur OpenAI ; recherche, formats et pilotage des langues à compléter |
| G11 : sources et exactitude | Partiel : références profil et revue ; collecte/vérification web à développer |
| G12 : structure de lecture | Partiel : résumé, sommaire, sections et FAQ ; options enrichies à compléter |
| G13–G14 : maillage, canonical, meta/schema | Partiel : liens autorisés et meta du document ; publication/validation SEO à développer |
| G15 : éditeur et versions | Partiel : édition, reprise, prévisualisation, approbation ; comparaison et historique paginé complet à compléter |
| G16–G17 : visuels/supports enrichis | À raccorder/développer ; aucun visuel créé dans ce lot |
| G18–G21 : planning publication, blog, CMS, API/webhooks | À développer/raccorder ; cron de génération n’est pas un scheduler de publication |
| G22–G23 : catalogue et contenus produits | À développer |
| G24–G27 : GSC, GA4, trafic IA, mesure des articles | À développer et accès durables à vérifier |
| G28–G31 : prompts, modèles, réponses et tendances IA | À développer ; rédiger via OpenAI n’est pas mesurer la visibilité IA |
| G32–G36 : audit SEO, corrections, rapports | À développer ; socle SEO public existant conservé |
| G37–G40 : backlinks, partenaires, crédits, autorité | Socle outreach conservé ; vérification/réseau/ledger de la conception à développer |
| G41–G43 : Reddit et Quora | À développer et accès officiels à vérifier |
| G44–G47 : carrousels, social, planning/réglages | Socle social conservé ; liaison article-carrousel et recette dédiée à développer |
| G48 : boucle d’amélioration | À développer |
| G49 : budgets/reprise | Partiel : majoration atomique, leases et arrêt ; rapprochement des factures/usage et quotas globaux à compléter |
| G50 : équipe et sites | TOK fixé serveur ; aucun nouveau droit membre ni autre site activé |
| G51 : SaaS/facturation/affiliation | Hors mandat du moteur interne ; décision produit séparée, aucun Stripe modifié |

## Vérifications et reproduction

Tests exécutés et résultats finaux : voir la description de la PR, toujours rattachés au dernier commit testé. Les suites comprennent contenu hostile, sources, budget, BFF, Edge, UI et démarrage du BFF en Node JavaScript émis.

Recette PostgreSQL **non exécutée** dans cette session ; commandes à exécuter exclusivement sur une base jetable vide :

```bash
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/marketing_growth_engine_fixture.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261101080028_marketing_growth_engine.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/marketing_growth_engine.sql
```

Cette fixture simule les prérequis Auth/MFA pour isoler les fonctions ajoutées ; elle ne remplace pas une recette de bout en bout avec les fonctions historiques et le scheduler Vault/pg_net. Les tests SQL vérifient RLS/privilèges, sessions refusées, déduplication, plafond absent, pause, modification concurrente, rejet d’un résultat périmé, approbation et historique. La concurrence réelle multi-connexions et l’intégration Vault/cron restent à exercer.

## Corrections de relecture

- Réserve calculée depuis modèle/tokens/prix vérifiés, expiration et refus d’une sous-réservation.
- Worker séparé du dispatcher d’envois pour préserver ses timeouts.
- Entretien des leases avant la vérification des credentials et dans le timer SQL.
- Blocage persistant visible dans la liste des traitements.
- Métadonnées d’historique séparées des documents ; seuls courant et révision demandée sont retournés, page de 20 articles maximum.
- Suppression des remontages de formulaires provoqués par la sauvegarde d’un autre formulaire ; sauvegarde texte/brief ensemble lorsqu’un document existe.
- Import `.js` au niveau Node/Vercel, protégé par le test de démarrage JavaScript émis.

## Retour arrière

Garder le site en pause ; désactiver le timer `tok-marketing-growth-worker`, revenir au code précédent par revert de PR. Conserver les tables et les révisions ; toute correction de schéma passe par une migration compensatoire. Aucun effet externe de ce lot à annuler.

## Fichiers du lot

29 fichiers ajoutés ou modifiés :

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `docs/marketing/TOK_GROWTH_ENGINE_STATUS.md`
- `docs/superpowers/plans/2026-11-01-tok-growth-engine.md`
- `scripts/application-index-core.mjs`
- `server/marketingBff.ts`
- `src/components/marketing/MarketingWorkspaceChrome.tsx`
- `src/components/marketing/views/MarketingGrowthView.tsx`
- `src/data/tok-user-guide-catalog.generated.ts`
- `src/marketing/growth/client.ts`
- `src/marketing/types.ts`
- `src/pages/marketing/MarketingWorkspace.tsx`
- `src/test/application-search-index.test.ts`
- `src/test/marketing-growth-bff.test.ts`
- `src/test/marketing-growth-budget.test.ts`
- `src/test/marketing-growth-content.test.ts`
- `src/test/marketing-growth-edge.test.ts`
- `src/test/marketing-growth-view.test.tsx`
- `src/test/marketing-growth-worker.test.ts`
- `supabase/config.toml`
- `supabase/functions/_shared/marketing-growth/budget.ts`
- `supabase/functions/_shared/marketing-growth/content.ts`
- `supabase/functions/_shared/marketing-growth/operations.ts`
- `supabase/functions/_shared/marketing-growth/worker.ts`
- `supabase/functions/_shared/openai.ts`
- `supabase/functions/marketing-growth-worker/index.ts`
- `supabase/migrations/20261101080028_marketing_growth_engine.sql`
- `supabase/tests/marketing_growth_engine.sql`
- `supabase/tests/marketing_growth_engine_fixture.sql`

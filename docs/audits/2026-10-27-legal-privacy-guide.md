# Revue CGU, confidentialité, cookies et guides TOK

Date : 27 octobre 2026. Base : `140a7fba720aa48ca46027ba5769298ff2864185`.
Branche et worktree dédiés : `fix/legal-guide-privacy-review`, `tok-legal-review`.

## Conclusion et périmètre

La revue a identifié un écart réel entre les choix annoncés et certains traitements navigateur : les événements TOK statistiques et publicitaires, Vercel Web Analytics et les tendances d’actualités n’étaient pas tous conditionnés aux catégories facultatives. Le correctif ferme ces chemins avant tout accord, sépare les catégories et traite le retrait, les files hors ligne et les réponses tardives. Les opérations demandées, dont la journalisation d’une commande, restent distinctes.

Les CGU, la confidentialité, les cookies, l’aide client et les guides restaurateur/administrateur sont complétés avec des explications pratiques. Cette revue ne constitue pas une certification juridique ni une validation de tous les contrats fournisseurs. Les informations non vérifiables ci-dessous doivent être complétées avant publication des textes.

Niveau de risque : **3**, en raison des contrôles de consentement et de la version reçue par le parcours d’inscription professionnel. Aucun calcul de paiement, droit d’accès, secret, migration, configuration de déploiement ou contrat restaurateur signé n’est modifié.

## Compléments apportés

- CGU : correction des saisies et confirmation, distinction panier/paiement/commande, rétractation sous réserve des droits impératifs, abonnement et résiliation séparée de la suppression de l’application, capacité contractuelle, droits sur les contenus, signalement, IA, crédits et impression, fermeture du compte et réclamation.
- Confidentialité : contact opérationnel existant `contact@thetok.ch`, origine des données, rôles du restaurant, création/impression, équipe/RH lorsque ces outils sont utilisés, cartographie, prestataires nommés, localisation de la base principale, limites de cette localisation, conservation par finalité, droits et demande manuelle, délai d’accès, recours PFPDT, informations sensibles et examen humain.
- Cookies : inventaire des stockages réellement repérés, identifiant de mesure, files de campagnes, attribution, clics d’actualités, Vercel, préférences d’apparence ; distinction entre consentement aux traceurs, permission appareil et communication commerciale. Les durées non configurées ou non vérifiées ne sont pas remplacées par une expiration fictive.
- Lecture : sommaire avec ancres, navigation entre les textes et l’aide, impression/enregistrement PDF via le navigateur ; inventaire cookies en cartes sur téléphone.
- Guides : étapes client au centre d’aide ; Studio Marketing en trois étapes, barre d’actions persistante, coût avant génération et distinction téléchargement/publication/impression ; confidentialité et droits ; mêmes compléments dans l’export PDF existant.
- Version : CGU `cgu-2026-10-v7`, confidentialité `privacy-2026-10-v6`, cookies `cookies-2026-10-v4`. La clé du consentement et l’inventaire dérivent du manifeste. La version reçue par l’inscription est synchronisée. Les conditions restaurateurs conservent leur date propre du 11 août 2026 et leur version existante.

## Vérification des accès et sources applicatives

GitHub accessible ; `main` récupéré ; changements préexistants préservés ; PR ouvertes et issue d’intégration pertinente consultées. Supabase TOK répond `ACTIVE_HEALTHY`, région `eu-central-2`. Projet Vercel `cloud-rebuild-recovered` accessible. Compte Stripe TOK identifié en lecture seule. Aucune opération financière ni lecture de fiches clients Stripe n’a été effectuée.

Architecture observée : React/Vite/TypeScript, React Router, TanStack Query, Radix, Supabase, Stripe, Capacitor, Firebase, Sentry et Vercel Analytics. Manifestes, instructions du dépôt, workflows, configuration Vercel/Supabase et fonctions/migrations directement liées au consentement, à l’inscription, à l’effacement et aux actualités examinés. Les valeurs des secrets n’ont pas été récupérées ou reproduites.

La région Supabase primaire a été vérifiée par le connecteur puis rapprochée de la documentation officielle. Les clauses fournisseurs et leurs configurations précises ne sont pas déduites de cette région.

## Constats corrigés et preuves

| Constat | Correction | Vérification |
| --- | --- | --- |
| Événements statistiques et publicitaires possibles sans choix | Garde à l’entrée des files et au transport | Tests sans accord, avec catégorie séparée et refus |
| File publicitaire rejouable après retrait | Purge du stockage et de la mémoire, arrêt des timers, génération de consentement pour les traitements asynchrones | Tests hors ligne, réponse tardive après retrait/réacceptation, autre onglet |
| Vercel Analytics chargé dès le bootstrap | Chargement différé et filtre sur les événements | Test d’activation et ancien callback après retrait |
| Position facultative demandée ou lue avant le choix TOK | Garde réactive sur accueil et autocomplétion | Test sans accord puis autorisation/retrait |
| Historique utilisé pour des tendances sans accord | Garde de lecture/écriture, purge des signaux, fil chronologique sans appel au classement par intérêts | Tests tendances et requêtes du fil, clé de cache distincte |
| Fenêtre de consentement manuelle sans gestion complète du focus | Dialogue Radix, défilement interne et actions hors de la zone défilante ; fermeture et lecture des textes sans accord implicite | Tests du parcours de choix |
| Dates et versions désynchronisées | Manifeste commun et date distincte des conditions restaurateurs | Tests des textes et de l’inscription |

Le refus peut réduire les statistiques et l’attribution disponibles. Les favoris, abonnements explicites aux établissements et journaux transactionnels restent des fonctions demandées. Le fil général sans personnalisation ne consulte pas l’historique de commandes ou de réservations pour en déduire des intérêts. Les appels serveur externes à ce frontend ne font pas l’objet d’un nouveau protocole de preuve de consentement dans cette PR.

## Informations à confirmer avant publication

1. **Exploitant et responsable de traitement** : raison sociale exacte, adresse postale complète, IDE et TVA le cas échéant, représentant/contact. Le dépôt contient seulement des coordonnées génériques et des modèles à compléter. `TOK Platform Switzerland` n’a pas été validé comme raison sociale enregistrée et n’est pas repris comme fait établi dans les nouveaux textes. Une question a été posée à l’utilisateur ; aucune coordonnée supplémentaire n’était disponible pendant la préparation.
2. **Registre des fournisseurs/transferts** : confirmer les entités contractantes, les pays effectifs des traitements et sous-traitants, les accords de traitement, les garanties suisses et les paramètres de résidence pour chaque service activé. Les politiques publiques de Vercel et Resend confirment notamment des traitements aux États-Unis ; cela ne prouve pas que tout le registre TOK est complet.
3. **Conservation** : décider et documenter les durées numériques par catégorie (support, consentements, diagnostics, campagnes, créations, sauvegardes), les exceptions pour litige et la preuve des purges. Aucun job de suppression de données métier ou durée inventée n’est ajouté à cette PR. Le délai comptable de dix ans est une règle documentaire, pas une preuve que tous les stockages sont déjà configurés correctement.
4. **Documents acceptés** : les nouvelles inscriptions reçoivent les nouvelles versions ; les preuves historiques ne sont pas réécrites. Déterminer le dispositif d’information ou de nouvelle acceptation des comptes existants selon la portée juridique retenue. L’historique Git permet de retrouver les textes antérieurs ; cette PR n’envoie aucune campagne d’information.
5. **Relecture des clauses** : faire confirmer les modalités existantes de garantie/annulation, renouvellement et consommation de crédits selon les contrats effectivement proposés. Les règles financières existantes sont conservées, sans nouveau prélèvement ni nouvelle condition commerciale imposée.

## Validation et limites

Les tests utilisent des données fictives et des services simulés. Aucun compte n’a été supprimé, aucune permission d’appareil réel accordée, aucun e-mail commercial envoyé, aucune réservation, commande, publication, impression ou dépense IA déclenchée.

Vérifications locales :

- Ensemble de régression du domaine : 237 tests sur 46 fichiers ; quatre fichiers UI ont d’abord dépassé leur délai sous forte charge locale, puis leurs 24 tests ont tous réussi dans une exécution isolée (`--maxWorkers=1 --testTimeout=45000`). Les autres fichiers avaient réussi au premier passage.
- Suite ciblée juridique, consentement, guide, données sociales et monitoring : 106 tests réussis sur 17 fichiers ; vérification finale des limites de collecte : 14 tests réussis sur 3 fichiers, dont le retrait pendant une réponse de permission GPS différée.
- Pages et services facultatifs : 6 tests réussis ; export visuel explicite des pages et du dialogue : 9 tests réussis sur 2 fichiers.
- Typecheck applicatif réussi ; ESLint complet sans erreur, avec 23 avertissements dans des fichiers non modifiés par cette PR.
- Build Vite de développement réussi ; avertissement préexistant concernant certains bundles de plus de 500 kB. Le build de production final et la suite complète du dépôt sont contrôlés par la CI de la PR.
- Revue Chrome sur exports locaux des composants réels, sans bootstrap de l’application : desktop 1348 px et petit écran 320 × 568 px ; boutons de consentement visibles, défilement interne, lecture des CGU, de la confidentialité et des cookies, aucun débordement horizontal du dialogue (largeur mesurée 320/320).
- Index applicatif et carte d’erreurs générés avec les scripts officiels ; encodage UTF-8 et `git diff --check` contrôlés avant publication.

Les comptages correspondent à plusieurs suites qui se recouvrent et ne doivent pas être additionnés. Une revue connectée sur appareils physiques, les clauses fournisseurs signées, la délivrabilité d’une boîte de confidentialité dédiée et l’exécution réelle des processus de réponse aux droits ne sont pas revendiquées.

## Livraison et retour arrière

PR dédiée, sans fusion ni mise en production dans cette tâche. Avant une éventuelle publication, conserver l’ordre normal de déploiement qui synchronise la validation de la version d’inscription avec le frontend. Une ancienne session de formulaire peut devoir relire les nouvelles conditions.

Retour arrière : revert du commit et livraison par le workflow habituel. Aucune migration ni donnée distante à restaurer. Les anciennes préférences de cookies ne sont pas migrées vers un accord plus large ; la nouvelle version demande un nouveau choix.

## Références officielles consultées

- PFPDT, devoir d’informer : https://www.edoeb.admin.ch/fr/devoir-dinformer
- PFPDT, droit d’accès : https://www.edoeb.admin.ch/fr/droit-dacces
- PFPDT, décisions automatisées et droits : https://www.edoeb.admin.ch/fr/connaitre-et-faire-valoir-mes-droits
- PFPDT, transferts : https://www.edoeb.admin.ch/fr/communication-de-donnees-a-letranger
- PFPDT, cookies : https://www.edoeb.admin.ch/fr/cookies-conseils-pratiques
- Portail PME de la Confédération, commerce électronique : https://www.kmu.admin.ch/fr/obligations-legales-les-lois-suisses-et-europeennes-sur-le-e-commerce
- Portail PME, identité de l’exploitant : https://www.kmu.admin.ch/fr/informations-sur-lexploitant
- Portail PME, conservation : https://www.kmu.admin.ch/fr/la-conservation-de-factures-et-pieces-comptables-electroniques-doit-respecter-des-regles-strictes
- Supabase, régions : https://supabase.com/docs/guides/platform/regions
- Vercel, confidentialité : https://vercel.com/legal/privacy-notice
- Resend, stockage et garanties : https://resend.com/security/gdpr
- Stripe, cookies : https://stripe.com/fr-ch/cookie-settings

## Fichiers modifiés

- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `docs/audits/2026-10-27-legal-privacy-guide.md`
- `docs/legal/README.md`
- `src/components/AddressAutocomplete.tsx`
- `src/components/legal/LegalConsentBanner.tsx`
- `src/components/legal/LegalDocumentTools.tsx`
- `src/components/legal/OptionalAnalytics.tsx`
- `src/data/tok-user-guide-catalog.generated.ts`
- `src/data/userGuideContent.ts`
- `src/hooks/useConsentCategory.ts`
- `src/hooks/useSocialFeed.ts`
- `src/lib/actualitesPersonalizedTrends.ts`
- `src/lib/analytics.ts`
- `src/lib/consent.ts`
- `src/lib/cookieInventory.ts`
- `src/lib/legalDocuments.ts`
- `src/main.tsx`
- `src/pages/Actualites.tsx`
- `src/pages/Aide.tsx`
- `src/pages/CGU.tsx`
- `src/pages/ConditionsRestaurateurs.tsx`
- `src/pages/Cookies.tsx`
- `src/pages/GuideUtilisateur.tsx`
- `src/pages/Index.tsx`
- `src/pages/PolitiqueConfidentialite.tsx`
- `src/test/actualites-personalized-trends.test.ts`
- `src/test/legal-consent-banner-layout.test.ts`
- `src/test/legal-consent-journey.test.tsx`
- `src/test/legal-pages-review.test.tsx`
- `src/test/optional-client-services.test.tsx`
- `src/test/optional-tracking-consent.test.ts`
- `src/test/social-feed-consent.test.tsx`
- `src/test/tok-connect-legal-content.test.ts`
- `supabase/functions/submit-signup-application/validation.ts`

# Projet — Finalisation de TOK Marketing Autopilot

> Audit réalisé le 3 octobre 2026 sur `Mtnrconcept1/cloud-rebuild`, branche principale au commit
> `9e7d9c8989142539f0223e6b3e0b66ccda29cc2e`.

## 1. Verdict exécutif

Le travail demandé est **partiellement réalisé**, mais le périmètre complet décrit dans le brief n'est
pas livré.

Le dépôt contient déjà un centre marketing isolé et sécurisé, des campagnes, un calendrier, des
audiences, un agent IA de génération, un canal e-mail Resend, un espace d'outreach assisté et une
chaîne print/social réutilisable. En revanche, il ne contient pas encore un autopilote multicanal
complet : les réseaux sociaux restent fermés, Canva/Metricool/HubSpot ne sont pas connectés, les
automatisations métier TOK ne sont pas orchestrées, le SEO et la prospection ne sont pas automatisés,
les publicités payantes ne sont pas pilotées et l'attribution financière reste incomplète.

La bonne stratégie consiste à **étendre le socle existant**, pas à créer un second outil marketing.

## 2. Périmètre audité

L'audit couvre :

- le sous-domaine et l'interface d'administration marketing ;
- les migrations et RPC Supabase marketing ;
- le BFF marketing et ses protections ;
- l'agent IA marketing et l'orchestrateur de campagnes ;
- le canal e-mail Resend ;
- l'outreach et les backlinks ;
- le studio IA, les sorties sociales et la chaîne Cloudprinter ;
- les intégrations déclarées dans le centre marketing ;
- les tableaux de résultats et les indicateurs disponibles ;
- les tests marketing ciblés du dépôt.

Les connexions réelles aux comptes Canva, Metricool, HubSpot, Meta, Google Ads, TikTok Ads et Search
Console n'ont pas été testées : aucun secret ni accès de production n'est nécessaire pour cet audit de
code. Une intégration n'est donc considérée comme livrée que si le dépôt contient un connecteur,
une gestion d'erreurs, des tests et un chemin d'activation vérifiable.

## 3. État actuel, exigence par exigence

Légende : **Livré**, **Partiel**, **Absent**, **À vérifier en environnement**.

| Domaine demandé | État | Preuves présentes | Manque principal |
| --- | --- | --- | --- |
| Tableau de bord central | Partiel | Espace dédié, navigation, activité et résultats | Vue exécutive unifiée, alertes et coûts |
| Campagnes | Livré pour le socle | Brouillons, validation, planification, audiences, livraisons | Budget, objectifs financiers, attribution complète |
| Studio IA | Partiel | Génération de campagne, textes, visuels et sorties sociales/print | Bibliothèque de 30 visuels validés, vidéo et gouvernance éditoriale centralisées |
| Calendrier éditorial | Livré pour le socle | Planification et exécution avec approbation | Coordination multicanale réellement connectée |
| Diffusion multicanale | Partiel | In-app et e-mail ; états de connecteurs fail-closed | Publication sociale, site, push et messageries |
| Prospection et backlinks | Partiel | Cibles, opportunités, brouillons, approbations, preuves | Découverte, envoi, relances, réponses et contrôle périodique |
| CRM | Partiel | Contacts, audiences et prospects internes | Synchronisation HubSpot et résolution des conflits |
| Analytics | Partiel | Envois, livraisons, clics et conversions | UTM, chiffre d'affaires attribué, CAC, CPA, CPL, temps gagné |
| Gouvernance | Largement livré | MFA, session isolée, CSRF, RBAC/RLS, audit, pause globale | Matrice de rôles affinée, rétention, revue juridique et runbooks |
| Agent planificateur | Partiel | L'agent crée une campagne et des éléments de calendrier | Arbitrage budget/canal et contraintes métier |
| Agent rédacteur | Partiel | Textes structurés générés par IA | Mémoire de marque versionnée et contrôle qualité formalisé |
| Directeur artistique | Partiel | Génération de visuels et formats exacts dans le studio existant | Catalogue d'assets central et validation de marque |
| Adaptateur de canaux | Partiel | Formats sociaux préparés | Connecteurs de publication et retours de statut |
| Agent SEO | Absent du centre | Quelques briques SEO ailleurs dans le dépôt | Brief, publication, Search Console et mesure intégrés |
| Agent de prospection | Partiel | Workflow humain assisté | Découverte sûre, e-mailing, réponses et relances bornées |
| Agent conformité | Partiel | Consentement, audit, garde-fous et validation humaine | Politiques centralisées par canal/pays et contrôles automatiques |
| Agent analyste | Partiel | Résultats de campagne simples | Attribution, expériences et recommandations mesurables |
| Zéro attente | Absent de l'orchestrateur | Fonction métier disponible ailleurs | Déclencheur, segment, message, validation et mesure |
| Ventes flash | Absent de l'orchestrateur | — | Modèle de règle et campagne bornée |
| Anti-gaspillage | Absent de l'orchestrateur | — | Source de données, critères, fréquence et opt-out |
| Print studio | Partiel, séparé | Studio existant et Cloudprinter | Intégration au centre marketing et suivi consolidé |
| Communication plan de salle | Absent de l'orchestrateur | — | Événement métier et modèles dédiés |
| TOK social | Partiel | Création de formats | Publication et remontée des performances |
| Publicités IA | Absent | — | Comptes, brouillons, approbation, budgets et mesure |
| Comptabilité IA | Absent du marketing | — | Cas d'usage, données autorisées et séparation des droits |
| Forums/sites | Partiel | Registre de cibles et mode manuel/API | Pays, thème, audience, qualité, découverte et publication contrôlée |
| Backlinks légitimes | Partiel | Ancres, `rel`, statut et preuve | Outreach e-mail, relances, réponses et santé des liens |
| Canva | Absent du centre | — | OAuth, import/export, droits et journalisation |
| Metricool | Absent | — | Connexion, programmation, statuts et métriques |
| HubSpot | Absent | — | Mapping, consentement, déduplication et synchronisation |
| Search Console | Absent du centre | Briques SEO séparées | Connecteur et association aux campagnes |
| Meta/Google/TikTok Ads | Absent | — | Création en brouillon, validation humaine et plafonds budgétaires |

## 4. Socle existant à conserver

Les éléments suivants doivent être réutilisés et renforcés :

- `MarketingWorkspaceChrome` et le routage du sous-domaine marketing ;
- le BFF marketing avec session opaque, MFA, CSRF et listes d'opérations autorisées ;
- les tables/RPC `marketing_*`, la RLS forcée et le journal d'audit ;
- les campagnes, audiences, contacts, calendrier, livraisons et événements ;
- l'orchestrateur avec location de tâches, idempotence, reprises et plafonds ;
- l'agent IA marketing et ses sorties structurées ;
- le canal e-mail Resend avec désinscription en un clic ;
- le workflow d'outreach assisté et son approbation humaine ;
- le studio existant, les formats sociaux exacts et Cloudprinter ;
- la pause globale et l'indisponibilité explicite des connecteurs non configurés.

## 5. Principes non négociables

- Aucun connecteur n'est affiché comme actif sans probe serveur réussi.
- Aucune publication sociale, prise de contact, modification CRM ou dépense publicitaire n'est lancée
  sans l'approbation explicite prévue pour le niveau d'autonomie choisi.
- Les secrets restent côté serveur ; ils ne transitent ni dans le navigateur ni dans les journaux.
- Toute action externe possède un identifiant idempotent, une trace d'audit et un résultat réconcilié.
- La pause globale interrompt les nouvelles actions sans corrompre les travaux en cours.
- Les consentements, désinscriptions et suppressions sont propagés avant toute nouvelle diffusion.
- Les règles des sites, `robots.txt`, conditions d'utilisation et limites d'API sont respectées.
- Aucun faux compte, faux avis, faux échange, spam de forum ou contournement anti-bot n'est autorisé.
- Toute migration est additive, rejouable et accompagnée d'un retour arrière documenté.
- Les validations locales, CI, préproduction, fournisseur et production sont rapportées séparément.

## 6. Définition globale de « terminé »

TOK Marketing Autopilot est terminé lorsque :

- [ ] les neuf sections du centre partagent un modèle de données et une navigation cohérents ;
- [ ] chaque connecteur possède les états `non configuré`, `configuration invalide`, `prêt`, `dégradé`
      et `en pause`, vérifiés côté serveur ;
- [ ] les campagnes texte, image, print, e-mail, social, SEO et ads peuvent être préparées dans un seul
      workflow, sans publication implicite ;
- [ ] les huit automatisations TOK disposent de déclencheurs, garde-fous, simulations, approbations et
      indicateurs propres ;
- [ ] chaque envoi/publication/dépense est idempotent, réessayable et réconciliable ;
- [ ] les contacts et consentements sont dédupliqués entre TOK et HubSpot ;
- [ ] l'attribution relie campagne, contenu, clic, lead, conversion et revenu sans inventer de données ;
- [ ] les indicateurs demandés sont calculés avec une définition documentée et testée ;
- [ ] les tests unitaires, intégration, navigateur et sécurité passent en CI ;
- [ ] un canari a été exécuté en préproduction puis sur une audience interne en production ;
- [ ] les runbooks d'incident, rotation des secrets, pause globale et retour arrière ont été exercés ;
- [ ] la documentation utilisateur et le journal des décisions produit sont à jour.

## 7. Feuille de route détaillée

### Phase 0 — Stabiliser et figer la référence

**Objectif :** disposer d'un état de départ reproductible avant toute connexion externe.

- [ ] Corriger le test de garde outreach pour vérifier la notation SQL réelle `127[.]`.
- [ ] Mettre à jour `MARKETING_OPERATIONS_CENTER.md`, devenu partiellement obsolète depuis l'ajout de
      l'agent IA et de Resend.
- [ ] Documenter les environnements dev, preview, staging et production, avec leurs URLs et propriétaires.
- [ ] Inventorier sans afficher de secret les connexions réellement configurées par environnement.
- [ ] Enregistrer les identifiants de comptes autorisés pour Canva, Metricool, HubSpot, Meta, Google,
      TikTok, Search Console et Resend.
- [ ] Définir qui peut préparer, approuver, publier, dépenser, exporter et administrer.
- [ ] Faire valider la terminologie : campagne, action, publication, lead, conversion et revenu attribué.
- [ ] Capturer une référence des métriques actuelles et du taux d'erreur.

**Critères d'acceptation**

- [ ] Le pipeline principal est vert hors incidents externes explicitement identifiés.
- [ ] La documentation ne présente plus comme absentes des fonctions déjà livrées.
- [ ] La matrice environnement × connecteur × état est approuvée par le produit et l'exploitation.

### Phase 1 — Contrats, données et gouvernance du domaine

**Objectif :** créer le langage commun de l'autopilote avant d'ajouter des canaux.

- [ ] Ajouter aux campagnes : objectif, budget, devise, propriétaire, centre de coût et niveau d'autonomie.
- [ ] Versionner les briefs, prompts, règles de marque, traductions et approbations.
- [ ] Créer un registre de contenus avec checksum, droits d'utilisation, langue, format et date d'expiration.
- [ ] Définir la taxonomie d'événements : impression, ouverture, clic, lead, commande, revenu, coût,
      désinscription, plainte, rebond, réponse et backlink vérifié.
- [ ] Définir les identifiants de corrélation campagne/contenu/canal/contact/conversion.
- [ ] Ajouter le plan UTM versionné et empêcher la réutilisation ambiguë d'une combinaison.
- [ ] Définir la fenêtre et la méthode d'attribution ; afficher « non attribuable » au lieu d'estimer.
- [ ] Étendre le registre d'intégrations avec scopes, propriétaire, dernier probe, expiration, latence et quota.
- [ ] Créer des politiques par pays, canal et type de contenu.
- [ ] Documenter la rétention, l'effacement et l'export des données personnelles.

**Tests attendus**

- [ ] Migrations rejouées sur base vide et base proche production.
- [ ] RLS testée pour visiteur, client, employé marketing, approbateur et administrateur.
- [ ] Tests de compatibilité des RPC et de sérialisation des événements.
- [ ] Tests de déduplication, fuseaux horaires, devises et fenêtres d'attribution.

### Phase 2 — Centraliser le Studio IA et les assets TOK

**Objectif :** rendre les capacités créatives existantes accessibles depuis le centre marketing.

- [ ] Réutiliser le studio restaurant existant au lieu d'en dupliquer la logique.
- [ ] Importer et qualifier les 30 visuels TOK attendus ; refuser les fichiers sans droits ou métadonnées.
- [ ] Ajouter recherche, tags, variantes, campagnes liées et historique d'utilisation.
- [ ] Créer les formats texte, image, carrousel, story, reel/short, QR, PDF et print.
- [ ] Ajouter le contrôle des dimensions, poids, durée, sous-titres et zones sûres par canal.
- [ ] Produire les traductions avec validation humaine pour les langues publiées.
- [ ] Vérifier le contraste, le texte alternatif, la lisibilité mobile et la réduction de mouvement.
- [ ] Intégrer la chaîne Cloudprinter : BAT, devis, validation, commande et statut, sans achat implicite.
- [ ] Prévoir Canva en import/export optionnel ; ne pas en faire une dépendance du studio TOK.
- [ ] Stocker le modèle, la version du prompt, le coût estimé et les assets sources de chaque génération.

**Critères d'acceptation**

- [ ] Un brief approuvé génère un pack multiformat traçable et modifiable.
- [ ] Aucun asset n'est publié ou imprimé sans validation finale.
- [ ] Les vues 360, 768, 1024 et 1440 px sont vérifiées au clavier et avec lecteur d'écran de base.

### Phase 3 — Construire le moteur d'automatisations TOK

**Objectif :** remplacer les interrupteurs décoratifs par un moteur borné et observable.

- [ ] Modéliser déclencheur, conditions, fenêtre horaire, audience, action, approbation et durée de vie.
- [ ] Ajouter le mode simulation avec nombre de contacts, coût maximal et exemples de sorties.
- [ ] Construire une outbox transactionnelle, des leases courts, retries exponentiels et une dead-letter queue.
- [ ] Dédupliquer les événements entrants et les actions sortantes.
- [ ] Appliquer pause globale, pause par règle, plafond global, plafond contact et plafond fournisseur.
- [ ] Ajouter un journal lisible : déclencheur, décision, motif de refus, approbateur et résultat.
- [ ] Créer un replay borné qui ne contourne jamais les consentements actuels.
- [ ] Livrer les modèles suivants, désactivés par défaut :
  - [ ] zéro attente : seuil, plage horaire, établissement, audience et fréquence ;
  - [ ] vente flash : inventaire, remise, début/fin, stock et budget ;
  - [ ] anti-gaspillage : surplus vérifié, retrait automatique et exclusions ;
  - [ ] print studio : validation BAT, plafond et bon à tirer ;
  - [ ] plan de salle : événement métier, message et destinataires autorisés ;
  - [ ] TOK social : pack créatif, canaux et calendrier ;
  - [ ] publicités IA : brouillons seulement jusqu'à la phase 8 ;
  - [ ] comptabilité IA : définition produit préalable, accès minimaux et aucune donnée sensible dans l'IA.

**Tests attendus**

- [ ] Même événement reçu dix fois : une seule action externe.
- [ ] Crash avant/après appel fournisseur : reprise sans double publication.
- [ ] Pause activée pendant une campagne : aucune nouvelle action après le point de coupure.
- [ ] Charge, files, latence et saturation de la base mesurées avant hausse de concurrence.

### Phase 4 — Publication sociale via Metricool et canaux directs

**Objectif :** planifier et publier de façon contrôlée, avec un retour de statut fiable.

- [ ] Confirmer si Metricool est l'agrégateur principal ; conserver des adaptateurs par interface stable.
- [ ] Implémenter OAuth/clé serveur, chiffrement, rotation et révocation.
- [ ] Mapper les identités autorisées Instagram, Facebook, LinkedIn, TikTok, YouTube et Google Business.
- [ ] Valider format, longueur, hashtags, mentions, liens et médias avant mise en file.
- [ ] Créer d'abord le brouillon fournisseur quand l'API le permet.
- [ ] Exiger une approbation humaine avant la première publication de chaque canal.
- [ ] Gérer programmation, annulation, expiration, quota, 429, 5xx et indisponibilité.
- [ ] Recevoir les webhooks, vérifier leur signature et réconcilier les statuts.
- [ ] Afficher l'URL publique seulement après confirmation du fournisseur.
- [ ] Conserver un mode manuel avec checklist et preuve lorsque l'API ne publie pas.
- [ ] Importer les métriques sans les confondre entre plateformes.

**Critères d'acceptation**

- [ ] Un compte de test publie, annule et réconcilie un contenu par canal pris en charge.
- [ ] Une erreur ne marque jamais une publication comme réussie.
- [ ] Une publication supprimée côté fournisseur est détectée et signalée.

### Phase 5 — CRM HubSpot et cycle de vie des leads

**Objectif :** synchroniser les leads sans écraser les données ou consentements.

- [ ] Définir TOK ou HubSpot comme source de vérité pour chaque champ.
- [ ] Mapper contact, entreprise, consentement, segment, campagne, lead, deal et propriétaire.
- [ ] Créer une clé de déduplication stable et une file de conflits.
- [ ] Commencer par un import en lecture seule et produire un rapport d'écarts.
- [ ] Ajouter ensuite une synchronisation TOK → HubSpot limitée à une liste canari.
- [ ] Propager immédiatement désinscription, opposition et suppression.
- [ ] Vérifier les signatures webhook et empêcher les boucles de mise à jour.
- [ ] Ajouter reprises, checkpoint, pagination et limites API.
- [ ] Journaliser les mutations sans enregistrer le contenu personnel inutile.
- [ ] N'activer le bidirectionnel qu'après validation du rapport de conflits.

**Critères d'acceptation**

- [ ] Aucune mutation HubSpot n'est effectuée pendant les simulations.
- [ ] Un contact désinscrit ne peut être réinscrit par une synchronisation obsolète.
- [ ] Les écarts sont réconciliables par un administrateur.

### Phase 6 — SEO, contenus propriétaires et Search Console

**Objectif :** relier recherche, création, publication et performance organique.

- [ ] Créer des briefs avec intention, requête, région, langue, page cible et preuve de valeur.
- [ ] Éviter les pages quasi identiques et détecter la cannibalisation.
- [ ] Vérifier titres, descriptions, canonicals, données structurées et maillage interne.
- [ ] Publier uniquement sur les propriétés TOK autorisées, d'abord en brouillon.
- [ ] Ajouter les UTMs aux campagnes sortantes sans polluer les URLs canoniques.
- [ ] Connecter Search Console côté serveur avec scopes minimaux.
- [ ] Associer requêtes, pages, clics, impressions et position à la campagne correspondante.
- [ ] Contrôler sitemap, indexation et erreurs sans promettre une indexation garantie.
- [ ] Ajouter une revue éditoriale anti-contenu mince et anti-allégation non prouvée.

**Critères d'acceptation**

- [ ] Chaque contenu publié a un propriétaire, une date de révision et une page canonique.
- [ ] Les métriques Search Console sont datées et distinguées des métriques temps réel.

### Phase 7 — Prospection, forums et backlinks légitimes

**Objectif :** compléter le workflow assisté sans automatiser le spam.

- [ ] Étendre les cibles avec thème, pays, langue, audience, pertinence, qualité et propriétaire.
- [ ] Stocker mode manuel/API, règles du site, fréquence autorisée et dernière vérification.
- [ ] Ajouter des sources de découverte publiques et autorisées ; aucune création de faux compte.
- [ ] Enregistrer le passage conversation détectée → brouillon → validation → publication → résultat.
- [ ] Résoudre DNS et redirections avant tout appel sortant pour renforcer la protection SSRF.
- [ ] Restreindre chaque adaptateur à une allowlist et à des destinations publiques vérifiées.
- [ ] Créer les séquences e-mail avec approbation, nombre maximal de relances et délai minimal.
- [ ] Ajouter opt-out, désinscription, suppression, rebond, plainte et liste de suppression globale.
- [ ] Capturer réponse, sentiment déclaré, prochain suivi et clôture, sans inventer de réponse.
- [ ] Vérifier périodiquement statut HTTP, destination, ancre et attribut `rel` des backlinks.
- [ ] Signaler lien perdu, redirection, `nofollow`, `sponsored` ou `ugc` sans manipuler le site tiers.

**Critères d'acceptation**

- [ ] Toute publication externe garde une preuve et l'identité de l'approbateur.
- [ ] Les plafonds de fréquence sont testés par cible et par destinataire.
- [ ] Une règle de site inconnue bloque l'automatisation et propose le mode manuel.

### Phase 8 — Publicités payantes en mode contrôlé

**Objectif :** préparer et mesurer les campagnes sans dépense accidentelle.

- [ ] Définir comptes, pays, objectifs, audiences autorisées et propriétés de conversion.
- [ ] Connecter Meta Ads, Google Ads et TikTok Ads avec scopes minimaux.
- [ ] Créer campagnes, groupes et annonces en `draft` ou `paused` uniquement.
- [ ] Vérifier pixels/tags et consentement avant d'utiliser une conversion.
- [ ] Ajouter plafonds journalier, campagne et compte, plus seuil d'arrêt d'urgence.
- [ ] Exiger une approbation distincte pour le créatif, le ciblage et le budget.
- [ ] Réconcilier dépense, impressions, clics, conversions et devise depuis les fournisseurs.
- [ ] Détecter dérive de budget, annonce rejetée, apprentissage limité et tracking cassé.
- [ ] Interdire la hausse automatique de budget pendant la première version.
- [ ] Documenter précisément qui peut activer une campagne dans le compte fournisseur.

**Critères d'acceptation**

- [ ] Les tests et previews ne dépensent rien.
- [ ] Le premier canari réel utilise un budget plafonné et une validation nominative.
- [ ] La pause TOK et la pause fournisseur sont réconciliées.

### Phase 9 — Analytics, attribution et agent analyste

**Objectif :** fournir des décisions traçables plutôt que des chiffres décoratifs.

- [ ] Définir source, formule, fraîcheur et propriétaire de chaque KPI.
- [ ] Calculer dépenses, leads, conversions et revenu dans une devise de référence explicite.
- [ ] Ajouter CAC, CPA, CPL, ROAS et marge lorsque les entrées sont complètes.
- [ ] Ajouter clics, taux de conversion, domaines référents, qualité des liens et liens perdus.
- [ ] Ajouter taux de réponse, désinscriptions, rebonds et plaintes.
- [ ] Mesurer le temps gagné par comparaison à une base déclarée, jamais par estimation cachée.
- [ ] Distinguer événement observé, revenu attribué et recommandation de l'agent.
- [ ] Générer un rapport hebdomadaire avec anomalies, hypothèses et données manquantes.
- [ ] Créer des variantes A/B avec taille minimale et critère d'arrêt documenté.
- [ ] Garder les recommandations budgétaires en lecture seule jusqu'à un historique suffisant.

**Critères d'acceptation**

- [ ] Chaque tuile permet de remonter aux événements sources.
- [ ] Les données manquantes ou en retard sont visibles.
- [ ] Les sommes par campagne se réconcilient avec les fournisseurs dans une tolérance documentée.

### Phase 10 — Sécurité, conformité et exploitation

**Objectif :** rendre l'autonomie sûre et réversible.

- [ ] Produire un threat model des BFF, webhooks, uploads, URLs sortantes, OAuth et agents IA.
- [ ] Tester contrôle d'accès objet par objet, RLS, CSRF, MFA et séparation des tenants.
- [ ] Valider MIME, taille, contenu, stockage et durée de vie des assets importés.
- [ ] Ajouter protection SSRF après résolution DNS, sur chaque redirection et pour IPv4/IPv6.
- [ ] Signer les webhooks sortants et vérifier signatures/timestamps entrants.
- [ ] Définir rotation, révocation et test de santé des secrets.
- [ ] Ajouter métriques de file, âge du plus vieux job, retries, DLQ, quotas et coûts.
- [ ] Définir SLO, alertes, astreinte, runbook fournisseur dégradé et runbook fuite de secret.
- [ ] Faire valider consentement, base légale, rétention, DPA fournisseurs et transfert de données.
- [ ] Tester export, rectification et effacement d'un contact sur toutes les copies.
- [ ] Réaliser un exercice de pause globale et un exercice de retour arrière.

### Phase 11 — Déploiement progressif et passage en production

**Objectif :** prouver le comportement à chaque niveau avant d'élargir.

- [ ] Mettre chaque connecteur et automatisation derrière un feature flag côté serveur.
- [ ] Valider localement les contrats et migrations.
- [ ] Exécuter la CI complète sur le commit exact candidat.
- [ ] Déployer en preview et tester interface, droits et erreurs sans secret de production.
- [ ] Déployer en staging avec comptes sandbox et webhooks réels de test.
- [ ] Lancer un canari production interne, puis un seul canal et une audience réduite.
- [ ] Vérifier livraison, métriques, audit, consentement, coûts et pause avant élargissement.
- [ ] Définir des seuils go/no-go pour erreurs, plaintes, désinscriptions et dérive budgétaire.
- [ ] Conserver une période d'observation avant d'augmenter fréquence ou autonomie.
- [ ] Publier le bilan de lancement et les écarts restants.

## 8. Découpage recommandé en tickets

Chaque ticket ci-dessous doit rester fusionnable indépendamment et inclure tests et documentation.

1. **TOK-MKT-001 — Actualiser la documentation et la matrice des intégrations** — Phase 0.
2. **TOK-MKT-002 — Étendre les contrats campagne, assets et événements** — Phase 1.
3. **TOK-MKT-003 — Ajouter UTM et attribution de première version** — Phases 1 et 9.
4. **TOK-MKT-004 — Intégrer le studio IA/print dans le centre marketing** — Phase 2.
5. **TOK-MKT-005 — Livrer le moteur de règles en simulation** — Phase 3.
6. **TOK-MKT-006 — Livrer zéro attente, vente flash et anti-gaspillage** — Phase 3.
7. **TOK-MKT-007 — Livrer print, plan de salle et TOK social** — Phase 3.
8. **TOK-MKT-008 — Connecter Metricool et publier sur un compte sandbox** — Phase 4.
9. **TOK-MKT-009 — Synchroniser HubSpot en lecture seule** — Phase 5.
10. **TOK-MKT-010 — Ajouter la synchronisation HubSpot canari** — Phase 5.
11. **TOK-MKT-011 — Intégrer SEO et Search Console** — Phase 6.
12. **TOK-MKT-012 — Enrichir le registre forums/sites et la sécurité URL** — Phase 7.
13. **TOK-MKT-013 — Ajouter séquences outreach, réponses et suppression globale** — Phase 7.
14. **TOK-MKT-014 — Ajouter le contrôle de santé des backlinks** — Phase 7.
15. **TOK-MKT-015 — Créer les brouillons Meta/Google/TikTok Ads** — Phase 8.
16. **TOK-MKT-016 — Livrer le tableau CAC/CPA/CPL/ROAS et qualité** — Phase 9.
17. **TOK-MKT-017 — Livrer rapports et recommandations de l'agent analyste** — Phase 9.
18. **TOK-MKT-018 — Durcir webhooks, SSRF, secrets et rétention** — Phase 10.
19. **TOK-MKT-019 — Exécuter les canaris et les exercices de retour arrière** — Phase 11.
20. **TOK-MKT-020 — Activer progressivement les niveaux d'autonomie** — Phase 11.

## 9. Dépendances et ordre de réalisation

```text
Phase 0
  └─ Phase 1
      ├─ Phase 2 ─┬─ Phase 4
      │           └─ Phase 8
      ├─ Phase 3 ─── Phase 11
      ├─ Phase 5 ─── Phase 9
      ├─ Phase 6 ─── Phase 9
      └─ Phase 7 ─── Phase 9

Phase 10 accompagne toutes les phases et bloque la mise en production.
```

Ordre de valeur conseillé : socle de données → studio central → moteur en simulation → social canari →
CRM lecture seule → SEO/outreach → analytics → ads. Les travaux UI peuvent avancer en parallèle des
connecteurs seulement avec des fixtures clairement étiquetées ; une maquette ne doit jamais être
présentée comme une intégration opérationnelle.

## 10. Niveaux d'autonomie

| Niveau | Comportement | Autorisation |
| --- | --- | --- |
| 0 — Observation | Mesures et recommandations uniquement | Par défaut |
| 1 — Brouillon | Prépare contenus, campagnes et changements | Approbation avant toute action externe |
| 2 — Planification | Programme après validation du pack | Approbation par campagne et canal |
| 3 — Exécution bornée | Exécute des règles préapprouvées avec plafonds | Autorisation explicite, révocable |
| 4 — Optimisation | Propose ou applique des ajustements limités | Non activé avant historique et revue dédiée |

Le niveau est défini par environnement, canal et règle. Une autorisation donnée à l'e-mail ne vaut pas
pour les réseaux sociaux, le CRM ou les dépenses publicitaires.

## 11. Matrice de validation

| Couche | Preuve minimale |
| --- | --- |
| Unitaire | Règles, validations, calculs, déduplication et erreurs |
| Base de données | Migration rejouée, RLS, RPC, concurrence et rollback |
| Intégration | Sandbox fournisseur, signature webhook, quota et reprise |
| Interface | Parcours clavier, erreurs, responsive et états vides/dégradés |
| Sécurité | Accès horizontal, CSRF, SSRF, uploads, secrets et audit |
| CI | Checks exigés verts sur le SHA exact |
| Preview | Build et parcours sans production |
| Staging | Comptes sandbox et webhooks réels de test |
| Production | Canari borné, observation et réconciliation fournisseur |

## 12. Indicateurs de succès

- couverture des campagnes avec UTMs valides ;
- pourcentage d'actions externes réconciliées ;
- délai médian et p95 entre approbation et publication ;
- taux d'échec, retry et DLQ par connecteur ;
- coût IA et fournisseur par campagne ;
- leads, conversion, revenu attribué, CAC, CPA, CPL et ROAS quand calculables ;
- clics, domaines référents, backlinks gagnés/perdus et qualité ;
- réponses, désinscriptions, rebonds et plaintes ;
- temps de préparation déclaré avant/après automatisation ;
- nombre d'actions bloquées par consentement, règle de site ou plafond ;
- incidents, temps de détection, temps de reprise et efficacité de la pause globale.

## 13. Risques principaux et réponses

| Risque | Réponse attendue |
| --- | --- |
| Publication ou dépense accidentelle | Brouillon/paused, double validation, plafonds et canari |
| Spam ou atteinte à la réputation | Ciblage, preuve de pertinence, fréquence, opt-out et validation humaine |
| Écrasement CRM | Lecture seule d'abord, source de vérité par champ et file de conflits |
| Fuite de secret | Coffre serveur, scopes minimaux, rotation et journaux expurgés |
| SSRF par URL de cible | Résolution DNS, blocage IP privées IPv4/IPv6 et contrôle des redirections |
| Double envoi/publication | Outbox transactionnelle et clé idempotente fournisseur |
| Métriques trompeuses | Définitions, provenance, fraîcheur et état « données insuffisantes » |
| Saturation Supabase | Mesure des files/pools, transactions courtes et concurrence bornée |
| Dépendance fournisseur | Interface d'adaptateur, mode manuel, export et état dégradé explicite |
| Contenu IA incorrect | Sources, politique de marque, validation et journal de génération |

## 14. Estimation et jalons

L'effort dépend des validations de comptes et des limites d'API. À équipe disponible, le découpage
raisonnable est :

- **Jalon A — 1 à 2 semaines :** phases 0 et 1, contrats et documentation fiables ;
- **Jalon B — 2 à 4 semaines :** studio central et moteur en simulation ;
- **Jalon C — 2 à 4 semaines :** premier canal social et HubSpot lecture seule ;
- **Jalon D — 3 à 6 semaines :** SEO, outreach complet et analytics ;
- **Jalon E — 2 à 4 semaines :** ads en brouillon, sécurité finale et canaris.

Ces fourchettes ne constituent pas une date de livraison. OAuth, revues de plateformes, comptes ads,
validation juridique, qualité des données et disponibilité des équipes peuvent déplacer les jalons.

## 15. Prochaine décision

Avant le premier ticket de connecteur, confirmer :

1. Metricool comme voie principale de publication sociale ou APIs directes ;
2. TOK ou HubSpot comme source de vérité pour chaque donnée CRM ;
3. les comptes/profils sociaux et publicitaires autorisés ;
4. les pays et langues de la première audience ;
5. le premier niveau d'autonomie autorisé, recommandé à **Niveau 1 — Brouillon** ;
6. le budget maximal du premier canari payant ;
7. les 30 assets de marque autorisés et leurs droits d'utilisation.

Tant que ces décisions ne sont pas enregistrées, les connecteurs concernés doivent rester fermés et
les actions externes en mode brouillon ou simulation.

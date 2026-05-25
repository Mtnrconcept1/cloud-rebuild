# Actualites sociales - parametres et promotions

Date: 2026-05-25
Statut: draft valide pour relecture utilisateur

## Objectif

Brancher l'outil Actualites sociales de bout en bout pour que les restaurateurs puissent publier, modifier, supprimer, parametrer et promouvoir leurs posts, et pour que les clients disposent de reglages de confidentialite et de personnalisation coherents.

La mise en avant payante doit reutiliser le systeme de campagnes et de paiement existant, au lieu de creer un deuxieme tunnel de paiement.

## Decision produit

L'approche retenue est l'integration complete avec les campagnes publicitaires existantes.

Les posts Actualites restent le contenu social principal. Les campagnes payantes deviennent un mecanisme de distribution du post :

1. le restaurateur cree ou choisit un post;
2. il definit une audience, une duree et un budget;
3. le systeme cree une campagne liee au post;
4. le paiement Stripe valide la promotion;
5. le feed affiche le post comme sponsorise uniquement si la campagne est payee et active.

## Constat actuel

### Cote client

La page [Actualites.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/pages/Actualites.tsx) affiche deja un feed social avec scopes `for_you`, `followed`, `nearby` et `offers`.

Les cartes [SocialPostCard.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/components/social/SocialPostCard.tsx) gerent deja reactions, commentaires, reposts, sauvegardes, follow, feedback, signalement et suppression.

Mais le client n'a pas encore de preferences globales pour :

- personnalisation du feed;
- confidentialite de son activite;
- contenus sponsorises personnalises;
- themes ou categories a privilegier/masquer.

### Cote restaurateur

La page [DashboardActualites.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/pages/dashboard/DashboardActualites.tsx) permet deja de composer et lister des posts.

Le composer [SocialComposer.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/components/social/SocialComposer.tsx) gere le texte, les medias, le type de post, le CTA et la planification.

Mais il n'expose pas encore :

- confidentialite du post;
- portee organique;
- autorisations de commentaires, reactions, reposts et partages;
- edition d'un post publie;
- creation d'une mise en avant payante.

### Cote base de donnees

La migration [20260523022842_social_feed_v2.sql](C:/Users/Pc/cloud-rebuild-recovered/supabase/migrations/20260523022842_social_feed_v2.sql) ajoute deja `visibility`, `scheduled_at` et `pinned_until`.

Cependant :

- `visibility` n'est pas branchee dans l'UI;
- `pinned_until` ne doit pas devenir un champ modifiable directement par le client pour contourner le paiement;
- il manque les permissions fines du post;
- il manque un lien propre entre posts sociaux et campagnes payantes;
- le feed ne marque pas les contenus sponsorises.

## Experience cible restaurateur

### Composer et modifier un post

Le composer doit couvrir la creation et l'edition.

Parametres disponibles :

- type de post : plat, promo, evenement, coulisses, annonce;
- CTA : aucun, reserver, commander, menu, offre;
- statut : brouillon, planifie, publie;
- confidentialite : public, abonnes, non repertorie;
- portee organique : tous, ville du restaurant, rayon local;
- commentaires autorises;
- reactions autorisees;
- reposts autorises;
- partages externes autorises.

Un post edite conserve un historique minimal :

- `edited_at`;
- `edited_by`;
- `edit_count`.

### Supprimer un post

La suppression reste un soft-delete :

- `status = deleted`;
- conservation des traces de moderation et reporting;
- disparition du feed client;
- conservation possible pour audit admin.

### Mettre en avant un post

Le dashboard Actualites ajoute une action `Mettre en avant`.

Le restaurateur definit :

- post cible;
- objectif : visibilite, trafic, conversion;
- placement : feed Actualites et suggestions Actualites pour cette iteration;
- audience : ville, rayon, centres d'interet/cuisines si disponibles;
- budget;
- date de debut et date de fin.

Le flux paiement reutilise les fonctions existantes de campagnes et checkout Stripe.

## Experience cible client

### Feed

Le feed continue a proposer :

- pour vous;
- suivis;
- pres de moi;
- offres.

Il doit aussi :

- masquer les posts dont les permissions ne permettent pas l'interaction demandee;
- afficher un badge `Sponsorise` si le post provient d'une campagne active payee;
- enregistrer impressions, clics, CTA et interactions;
- respecter les preferences client.

### Preferences client

Ajouter des preferences sociales client :

- personnalisation du feed activee/desactivee;
- activite visible par defaut ou privee;
- autoriser les recommandations sponsorisees personnalisees;
- categories de contenu preferees;
- categories masquees;
- restaurants ou posts masques via feedback existant.

Ces preferences ne remplacent pas les feedbacks existants `hide`, `not_interested`, `show_more`; elles les completent.

## Modele de donnees

### `social_posts`

Ajouter ou utiliser les champs suivants :

- `visibility`;
- `audience_scope`;
- `audience_city`;
- `audience_radius_km`;
- `allow_comments`;
- `allow_reactions`;
- `allow_reposts`;
- `allow_external_shares`;
- `edited_at`;
- `edited_by`;
- `edit_count`.

Les champs payants ne doivent pas etre modifiables directement depuis le client.

### `social_post_promotions`

Nouvelle table de liaison entre posts sociaux et campagnes :

- `id`;
- `post_id`;
- `campaign_id`;
- `restaurant_id`;
- `status`;
- `starts_at`;
- `ends_at`;
- `budget_amount`;
- `currency`;
- `placement`;
- `boost_weight`;
- `targeting`;
- `created_by`;
- `created_at`;
- `updated_at`.

Regle centrale : une promotion n'est eligible dans le feed que si la campagne liee est payee, active, dans ses dates, et rattachee au meme restaurant que le post.

### `social_user_preferences`

Nouvelle table pour les reglages client :

- `user_id`;
- `personalized_feed_enabled`;
- `activity_visibility`;
- `sponsored_personalization_enabled`;
- `preferred_categories`;
- `muted_categories`;
- `updated_at`.

RLS :

- chaque client lit et modifie uniquement ses preferences;
- les admins peuvent lire pour support/moderation si la politique existante le permet.

## Backend et RLS

### Posts

Les politiques existantes continuent de permettre aux proprietaires restaurant et admins de gerer leurs posts.

Ajouter une protection explicite :

- les champs de promotion ou de mise en avant ne peuvent pas etre modifies par un update client direct;
- la mise en avant passe par le flux campagne/paiement;
- les posts `unlisted` restent visibles au proprietaire/admin et doivent recevoir une strategie claire pour les liens directs.

### Interactions

Les hooks et RPC doivent verifier les permissions du post :

- pas de commentaire si `allow_comments = false`;
- pas de reaction si `allow_reactions = false`;
- pas de repost si `allow_reposts = false`;
- pas de partage externe si `allow_external_shares = false`.

Ces controles doivent exister cote UI et cote base/RPC pour eviter les contournements.

### Promotions

Les promotions sociales doivent etre creees par le meme tunnel que les campagnes :

- creation campagne via l'infra existante;
- checkout Stripe existant;
- activation uniquement apres paiement;
- le feed ne se base jamais sur un simple champ client pour declarer un post sponsorise.

## Feed et ranking

Le RPC `get_social_feed_v2` doit retourner des champs supplementaires :

- `is_sponsored`;
- `promotion_id`;
- `campaign_id`;
- `sponsor_label`;
- `interaction_permissions`;
- `audience_reason` si utile pour l'explication.

Le score organique actuel reste la base.

Un boost sponsorise actif ajoute un poids limite, sans bypasser :

- moderation;
- suppression;
- visibilite;
- preferences client;
- dates de campagne;
- paiement valide.

## UI cible

### Dashboard Actualites

Ajouter une organisation claire :

- publication;
- posts;
- parametres;
- boosts.

Le restaurateur doit pouvoir :

- creer un post complet;
- editer un post;
- supprimer un post;
- choisir confidentialite et portee;
- activer/desactiver les interactions;
- lancer une promotion payante;
- voir l'etat de promotion : brouillon, paiement requis, active, terminee, rejetee.

### Feed client

Adapter [SocialPostCard.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/components/social/SocialPostCard.tsx) :

- badge sponsorise;
- actions masquees ou desactivees selon permissions;
- edition seulement pour auteur/proprietaire/admin;
- impression tracking par IntersectionObserver.

### Admin Actualites

Etendre [AdminActualites.tsx](C:/Users/Pc/cloud-rebuild-recovered/src/pages/admin/AdminActualites.tsx) pour rendre visibles :

- posts sponsorises;
- campagne associee;
- statut paiement;
- moderation d'un contenu sponsorise sans casser l'audit.

## Tests attendus

### Tests SQL

Ajouter ou etendre les tests de migration pour verifier :

- nouvelles colonnes `social_posts`;
- table `social_post_promotions`;
- table `social_user_preferences`;
- RLS activee;
- policies de lecture/ecriture;
- protection des champs de boost;
- extension du RPC feed.

### Tests TypeScript

Etendre les tests social feed pour verifier :

- validation des nouveaux parametres de post;
- mapping des permissions d'interaction;
- ranking sponsorise uniquement quand la promotion est eligible;
- preferences client appliquees au ranking/filtrage.

### Validation UI

Apres implementation :

- build;
- tests unitaires concernes;
- verification navigateur desktop et mobile du dashboard Actualites;
- verification navigateur desktop et mobile du feed client;
- controle console sans erreur pertinente.

## Non-objectifs

Ce chantier ne construit pas :

- messagerie privee sociale;
- profils publics complets;
- facturation distincte des campagnes existantes;
- moteur publicitaire complet avec enchere;
- historique complet de toutes les versions de post.

## Risques et mitigations

### Contournement paiement

Risque : un restaurateur modifie directement un champ de mise en avant.

Mitigation : champs payants proteges cote base et boost derive de campagnes payees.

### Complexite RLS

Risque : les controles UI divergent des politiques base.

Mitigation : tests SQL dedies et logique d'autorisation centralisee dans RPC/policies.

### Feed trop publicitaire

Risque : la qualite du feed diminue.

Mitigation : boost plafonne, respect feedback client, badge sponsorise visible.

### Posts non repertories

Risque : l'etat actuel rend `unlisted` peu utile pour les clients.

Mitigation : definir explicitement si `unlisted` signifie proprietaire/admin seulement ou lien direct partageable. Pour cette iteration, `unlisted` reste hors feed et sera accessible seulement via une route detail si elle est ajoutee.

## Validation attendue

1. Un restaurateur peut parametrer, publier, editer et supprimer un post Actualites.
2. Les permissions du post sont respectees par l'UI et par la base.
3. Un client peut definir ses preferences sociales de base.
4. Une mise en avant payante de post passe par campagne et Stripe.
5. Le feed affiche un badge sponsorise uniquement pour une campagne payee et active.
6. Les champs de boost ne sont pas modifiables directement par le client.
7. Les tests SQL et TypeScript couvrent les nouvelles garanties.

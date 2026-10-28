# Analytics TOK — données et preuves

## Périmètre

La page Analytics lit les données déjà enregistrées par TOK. Les indicateurs de
préparation, les publications Meta, les événements de diffusion et les résultats
commerciaux restent séparés. Ouvrir la page ne lance ni publication, ni email,
ni acquisition de données chez un fournisseur.

La migration `20261022000000_marketing_analytics_evidence.sql` remplace le calcul
du dashboard et ajoute les index nécessaires. Elle ne modifie aucun événement,
montant, consentement, campagne ou état fournisseur.

## Contrat et période

`admin_get_marketing_autopilot_dashboard(p_from, p_to)` conserve son accès par le
BFF existant, avec session marketing, administrateur, MFA et CSRF. La période est
`[p_from, p_to)` : début inclus, fin exclue, dates finies et durée maximale de
366 jours. La réponse `analytics` contient `from`, `to`, `timezone`, `generated_at`,
`metrics`, `daily_results`, `completeness` et `unavailable_reasons`.

Chaque mesure contient sa clé, son libellé, son groupe, sa valeur nullable, son
unité, sa source, la date d'observation, la fraîcheur et la raison éventuelle
d'indisponibilité. Les anciens champs scalaires restent présents pour une mise
à jour progressive du frontend. `metrics` est le contrat prioritaire.

Le frontend transmet les bornes explicites des journées suisses choisies, fin
incluse dans le sélecteur puis convertie au début du jour suivant pour le RPC.
Sans filtre, il retient les trente dates calendrier se terminant aujourd'hui.
Chaque période a son propre cache et une période invalide ne lance pas de lecture.
Après livraison du frontend, actualiser un onglet déjà ouvert : son ancien code
privilégiait les champs scalaires et ne peut pas afficher les quatre mesures
d'activité du nouveau contrat.

| Mesures | Source et définition |
| --- | --- |
| `campaigns_created` | Campagnes créées dans la période, quelle que soit leur diffusion ultérieure. |
| `items_created` | Contenus du calendrier créés dans la période. Une préparation ne prouve aucun résultat commercial. |
| `items_scheduled` — En attente de diffusion | État observé à la lecture : contenus approuvés, actuellement planifiés ou en traitement, avec date prévue dans la période. Ce stock baisse normalement après diffusion. |
| `social_publications` | Publications Instagram ou Facebook avec `published_at` et identifiant fournisseur non vide. Une référence rejouée compte une fois par canal, à sa première publication. |
| `sent`, `delivered`, `clicks`, `delivery_conversions` | Événements canoniques, dédupliqués par livraison et type. Plusieurs envois vers une même personne restent plusieurs livraisons. |
| `leads`, `business_conversions`, `spend`, `revenue` | Faits d'attribution portant une campagne identifiée. Un montant sans campagne ne devient pas un revenu marketing. |
| `cpl`, `cpa`, `roas` | Rapports calculables à partir de ces faits compatibles. Le CAC reste indisponible sans preuve de première acquisition client. |

## Zéro, indisponibilité et horodatage

Une lecture réussie des tables de campagnes et calendrier peut confirmer zéro
élément. Les événements de diffusion restent indisponibles en l'absence de preuve
du type concerné : l'absence de webhook n'est pas présentée comme un taux nul.
Un fait financier égal à zéro reste zéro ; aucun montant n'est créé pour remplir
une carte. Les montants de monnaies différentes ne sont ni additionnés ni convertis
implicitement en CHF.

La complétude est le nombre de mesures non nulles divisé par les seize mesures
exposées. Elle mesure la disponibilité des données, pas la réussite marketing.

`generated_at` est l'heure du calcul. Pour un flux observé, `observed_at` est la
date du dernier fait retenu dans la période ; pour un état de stock ou un compte
nul vérifié, c'est l'heure de lecture. Pour un rapport financier, la date la plus
ancienne des deux sources est retenue. La fraîcheur est inconnue sans preuve,
à jour jusqu'à 24 heures, puis ancienne. Elle ne prouve pas à elle seule que
l'adaptateur fournisseur est connecté.

## Déduplication et historique

Le trigger d'une transition et son accusé explicite peuvent créer plusieurs
événements physiques. Le calcul conserve la première occurrence du même type
canonique pour la même livraison. Cette déduplication précède le filtre de dates :
un callback rejoué le lendemain ne crée pas un second envoi. Les événements
historiques `sent`, `delivered`, `clicked`, `converted` et leurs variantes
`delivery_*` restent normalisés à la lecture. Un événement sans livraison conserve
son identité propre ; l'historique n'est jamais effacé.

`daily_results` utilise les mêmes faits dédupliqués, regroupés par jour suisse
(`Europe/Zurich`). Seuls les jours contenant un fait apparaissent. Les autres
colonnes d'un jour existant peuvent contenir zéro événement enregistré ; les jours
entièrement absents ne sont pas fabriqués.

Les volumes quotidiens ne constituent pas une cohorte : une distribution peut
concerner un envoi antérieur à la période. Le résumé périodique ne calcule donc
aucun taux en divisant ces volumes. Les taux cumulés par campagne restent affichés
sur leur ensemble historique, séparément du filtre de période.

## Limites et livraison

Le seul producteur de `marketing_attribution_facts` est l'attribution first-touch
décrite ci-dessous (`source_system = 'tok_first_touch'`). Les chiffres du grand livre
ou les abonnements globaux ne remplacent pas cette attribution.

Le webhook marketing générique attend une enveloppe interne signée. Il ne constitue
pas un adaptateur natif Resend/Svix et ce lot n'en configure pas un.

Déployer la migration par le circuit de production existant puis le frontend.
Contrôler une lecture authentifiée de la période, les preuves de publication et
l'absence de double comptage. Le retour arrière restaure la définition précédente
du RPC via une nouvelle migration compensatoire ; les index ajoutés peuvent rester.
Aucune restauration de données n'est requise.

## Attribution first-touch

Migration `20261027220000_marketing_first_touch_attribution.sql`, fonction Edge
`track-analytics`, module partagé `supabase/functions/_shared/marketing-utm.ts` et
module navigateur `src/lib/acquisitionAttribution.ts`.

### Convention UTM des publications Meta

Au moment de la publication, et sans réécrire le brouillon approuvé, chaque lien
`https://www.thetok.ch/…` de la légende Instagram ou du message Facebook reçoit :

| Paramètre | Valeur |
| --- | --- |
| `utm_source` | `instagram` ou `facebook` |
| `utm_medium` | `social` |
| `utm_campaign` | `{slug du nom de campagne}_{aaaamm}`, mois suisse de `scheduled_at` ; `tok_{aaaamm}` sans campagne |
| `utm_content` | identifiant de l'élément du calendrier |

Un lien qui porte déjà un paramètre `utm_*`, un autre domaine ou le simple texte
`thetok.ch` ne sont pas modifiés : la destination reste celle du catalogue public.
Si les paramètres feraient dépasser la limite du réseau, la légende approuvée est
publiée telle quelle. `result_summary.utm_applied` et `utm_campaign` indiquent le
résultat. Les légendes de la série quotidienne citent `thetok.ch` sans URL et ne
portent donc pas d'UTM ; le lien en bio doit suivre la même convention et peut être
déclaré dans `marketing_utm_plans`.

### Capture et consentement

- Au chargement de l'application publique, le navigateur lit les UTM de l'URL
  d'arrivée, le seul domaine du référent externe et le chemin d'arrivée sans
  requête ni fragment. Retours de TOK, Stripe, Supabase et des fournisseurs de
  connexion exclus. Une visite directe n'est pas une source.
- Tant que le bandeau n'a pas reçu de réponse, la source reste en mémoire. Elle est
  enregistrée dans `localStorage` (`tok_first_touch_v1`, 90 jours) uniquement après
  consentement marketing. La première source conservée n'est jamais remplacée
  avant expiration. Un refus ou un retrait l'efface.
- `page_view` est envoyé pour tout visiteur, connecté ou non, après consentement
  mesure d'audience, une fois par chemin et par chargement de page. Seule la page
  d'arrivée porte UTM et référent, et seulement avec consentement marketing. Les
  vues sont stockées dans `event_store` (`entity_type = 'site'`) sans identifiant de
  visiteur anonyme.

### Rattachement serveur

Après connexion ou inscription, le navigateur envoie la source à `track-analytics`
(`kind: "acquisition"`). Le compte est celui du JWT vérifié, jamais un identifiant du
corps. `service_record_marketing_acquisition_touch` renormalise les valeurs et
conserve une ligne par compte dans `marketing_acquisition_touches` (RLS forcée,
aucun accès direct). La campagne est résolue côté serveur :

1. `utm_content` désigne un élément du calendrier publié sur le réseau de
   `utm_source` et rattaché à une campagne ;
2. sinon un plan `marketing_utm_plans` actif correspond à source, support et campagne.

Un identifiant de campagne envoyé par le navigateur est ignoré. Une source sans
campagne identifiée reste visible côté serveur dans la ligne de rattachement, sans
produire de fait.

### Faits produits

| Fait | `source_fact_id` | Condition |
| --- | --- | --- |
| `lead` | `lead:account:{compte}` | Compte créé après la source, dans la fenêtre de la campagne |
| `conversion` | `conversion:reservation:{id}` | Réservation confirmée, hors fichier client du restaurant et démo |
| `conversion` | `conversion:order:{id}` | Commande confirmée et payée |
| `revenue` | `revenue:order:{id}` | Même commande ; `total_amount` serveur en centimes, devise de la commande |
| `conversion` | `conversion:signup_application:{id}` | Candidature partenaire soumise |

États confirmés et exclusion du personnel du restaurant : mêmes règles que les
conversions sponsorisées (`ad_campaign_conversion_entity_state`,
`is_restaurant_internal_actor`). La fenêtre est `attribution_window_hours` de la
campagne, avec dix minutes de tolérance d'horloge. `subject_hash` est un SHA-256
pseudonyme ; les métadonnées portent la source, la version du consentement et le
modèle `first_touch`, jamais l'identifiant du compte. Le revenu correspond au
montant payé de la commande, pas à la commission TOK. Les faits étant append-only, une
annulation ou un remboursement ultérieur ne retire pas la conversion ni le revenu
déjà enregistrés : le revenu attribué est un revenu encaissé à la confirmation, pas un
revenu net.

Idempotence : `UNIQUE (source_system, source_fact_id)` avec `ON CONFLICT DO NOTHING`.
Les déclencheurs sur `reservations`, `orders` et `signup_applications` traitent
uniquement leur ligne ; le rattachement rapproche aussi les conversions antérieures.
Une erreur d'attribution est ignorée et ne bloque jamais une réservation, une
commande ou une candidature. Les colonnes `acquisition_source` utilisées pour la
facturation des restaurants ne sont ni lues pour un montant ni modifiées.

### Retrait, effacement et retour arrière

Le retrait du consentement marketing efface la ligne de rattachement : tout de suite
si une session est ouverte, sinon à la prochaine connexion sur cet appareil
(`tok_first_touch_forget_v1`, nécessaire), avant tout nouveau rattachement. La
suppression du compte l'efface en cascade. Les faits déjà produits sont pseudonymes
et append-only.

Retour arrière : une migration compensatoire supprime les trois déclencheurs et les
fonctions ; les faits restent valides. Retirer le code frontend arrête la capture et
retirer `utm` dans l'orchestrateur rétablit les liens sans paramètres.

## Vérification locale

Le test utilise PostgreSQL dans une base PGlite jetable, sans connexion externe.
Les tables, le trigger de livraison, les contrôles de session et le dispatcher
proviennent des migrations réelles ; seuls l'environnement d'identité et les cibles
de clés étrangères hors marketing sont limités à leur contrat utile.

```sh
TOK_PGLITE_MODULE=/chemin/verification/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verification/test-marketing-analytics.mjs
```

L'attribution first-touch se vérifie de la même façon :

```sh
TOK_PGLITE_MODULE=/chemin/verification/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verification/test-marketing-first-touch.mjs
```

Elle couvre accès, visite anonyme puis inscription, réservation, commande payée,
candidature, indices de campagne non fiables, rattachement tardif, panne
d'attribution non bloquante, lecture Analytics et retrait.

Le module PGlite est fourni par l'environnement de vérification et n'ajoute aucune
dépendance à la production. Huit groupes couvrent les bornes, les comptes natifs,
les preuves Meta, les doublons réels trigger/webhook, les jours suisses, les faits
financiers, les devises et les accès. La migration est rejouée deux fois. Ce test
ne remplace pas un rejeu intégral de toutes les migrations Supabase ni une recette
sur la production.

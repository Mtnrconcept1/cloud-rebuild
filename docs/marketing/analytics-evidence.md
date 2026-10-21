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

Le dépôt ne contient actuellement aucun producteur de `marketing_attribution_facts`.
Ce correctif n'en crée pas. Un raccordement métier ultérieur doit documenter
identifiants, campagne, source, consentements applicables et idempotence. Les chiffres
du grand livre ou les abonnements globaux ne remplacent pas cette attribution.

Le webhook marketing générique attend une enveloppe interne signée. Il ne constitue
pas un adaptateur natif Resend/Svix et ce lot n'en configure pas un.

Déployer la migration par le circuit de production existant puis le frontend.
Contrôler une lecture authentifiée de la période, les preuves de publication et
l'absence de double comptage. Le retour arrière restaure la définition précédente
du RPC via une nouvelle migration compensatoire ; les index ajoutés peuvent rester.
Aucune restauration de données n'est requise.

## Vérification locale

Le test utilise PostgreSQL dans une base PGlite jetable, sans connexion externe.
Les tables, le trigger de livraison, les contrôles de session et le dispatcher
proviennent des migrations réelles ; seuls l'environnement d'identité et les cibles
de clés étrangères hors marketing sont limités à leur contrat utile.

```sh
TOK_PGLITE_MODULE=/chemin/verification/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verification/test-marketing-analytics.mjs
```

Le module PGlite est fourni par l'environnement de vérification et n'ajoute aucune
dépendance à la production. Huit groupes couvrent les bornes, les comptes natifs,
les preuves Meta, les doublons réels trigger/webhook, les jours suisses, les faits
financiers, les devises et les accès. La migration est rejouée deux fois. Ce test
ne remplace pas un rejeu intégral de toutes les migrations Supabase ni une recette
sur la production.

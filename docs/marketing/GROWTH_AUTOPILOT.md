# TOK Growth AutoPilot — qualification et conversions à partir des preuves réelles

## Portée effective de cette version

Ce moteur tourne dans l'orchestrateur marketing Supabase existant, indépendamment
du PC et de Quantum Rack, à chaque passage de `run_due`. Il produit au plus une
qualification et un instantané **par date suisse**, sans modifier le parcours
réservation, paiement ou abonnement.

Il **qualifie et priorise** les restaurants du CRM TOK, prépare des brouillons
internes, identifie les personnes réellement éligibles à une séquence de suivi
et conserve un journal des indicateurs commerciaux. Il ne contacte pas
spontanément un prospect, ne génère pas de fausse preuve de consentement et
ne publie pas de backlink. Les campagnes approuvées continuent à être envoyées
par le pipeline marketing existant : cette migration ne contourne pas les
approbations, le contrôleur de contenu, Resend ni les désabonnements.

Cette distinction est nécessaire : un algorithme peut travailler seul sur le CRM
mais ne peut pas présumer qu'une adresse découverte dans un annuaire accepte de
recevoir de la publicité. Selon le PFPDT, la publicité par e-mail en Suisse
requiert généralement le consentement préalable ; exception encadrée pour les
clients existants et les services similaires :
https://www.edoeb.admin.ch/fr/publicite-et-marketing

## Déclenchement et sécurité

- La branche Edge `marketing-orchestrator` appelle
  `service_run_marketing_growth_autopilot(200)` uniquement pour `run_due`.
- La fonction exige la clé/service JWT `service_role`, la pause marketing
  globale désactivée et un verrou transactionnel PostgreSQL.
- Un instantané unique `marketing_growth_snapshots.local_date` conserve la date
  suisse et évite les doublons : au plus 200 nouveaux dossiers sont proposés le
  matin, puis les **agrégats seulement** sont rafraîchis une fois après 12h
  heure de Genève. Les tâches existantes ne sont pas recréées et les compteurs
  de qualification initiaux restent inchangés. Le créneau est calculé avec
  `Europe/Zurich`, y compris lors des passages été/hiver.
- Les tables nouvelles ont RLS activée et forcée, sans `SELECT` direct
  `anon`, `authenticated` ou `service_role` : le traitement utilise le
  seul RPC contrôlé, à droits limités. Aucun nom, e-mail, téléphone ou contenu
  personnel n'entre dans les réponses de l'orchestrateur ou dans les métriques.
- Les prospects ayant retiré le consentement sont supprimés de la file active ;
  les établissements ayant signé passent au statut `converted`.
- Le brouillon de prospection pour un contact non consentant indique explicitement
  `research_review` ; il ne peut **pas** être traité comme une autorisation
  d'envoyer un e-mail. Les contacts opt-in éligibles reçoivent seulement
  `consented_nurture` en préparation, **aucun envoi direct**.
- L'ancien classement `legitimate_interest` n'est plus suffisant pour la
  délivrabilité en masse sur le canal `email`. Le garde-fou SQL conserve
  toutefois la distinction avec les suivis humains `manual_email`.
- Les erreurs du nouveau module n'interrompent pas le traitement des campagnes
  approuvées : l'orchestrateur retourne `growth.status=unavailable` sans
  exposer les erreurs de base et journalise le statut.

## Priorisation sans invention

Le score s'appuie uniquement sur `marketing_contacts.lead_score`, le type
de contact, l'existence d'un site Web et la présence en région genevoise. Il
n'invente ni recette, ni contact, ni adresse électronique, ni signal d'intention.
Seuls les contacts déjà enregistrés dans TOK sont pris en compte.

L'instantané conserve les volumes réels de la période glissante de sept jours :
prospects connus, e-mails consentis, nouveaux leads, signatures commerciales,
réservations créées et honorées, rattachements d'acquisition et conversions
attribuées à une campagne. Il n'additionne pas les visites et les réservations
comme une cohorte. `conversion_rate` reste `null` faute d'un dénominateur
visiteur → réservation apparié et fiable.

La priorité `focus_code` est une **recommandation**, jamais une preuve de
causalité. Elle peut orienter les tests de la page restaurateurs, la fluidité
de la réservation ou une campagne ciblée vers les contacts opt-in.

Les formulaires de démonstration peuvent aussi déclarer une première source
UTM après consentement **distinct** au suivi marketing dans le navigateur.
Cette indication est normalisée, bornée et marquée
`self_reported_unverified` dans les métadonnées du lead. Le bilan mesure le
nombre de demandes présentant une telle source, sans en déduire une conversion
attribuée à une campagne. Aucun paramètre d'URL arbitraire ni identité de
navigation n'est conservé à cet endroit.

Le bilan distingue également quatre étapes post-signature vérifiables : contrats
acceptés et signés, factures d'abonnement Stripe confirmées par un événement
`invoice_paid` (dédupliquées par facture), deals payés disposant d'un identifiant
de paiement Stripe et non remboursés, établissements ayant un job d'activation
terminé. **Ces compteurs ne s'additionnent pas et ne sont pas du revenu attribué** :
un même restaurant peut apparaître dans plusieurs étapes. L'agent ne déduit
jamais le montant de Stripe d'un abonnement théorique ou d'une promesse commerciale.
Les métriques seront renseignées après application contrôlée des migrations.

Le suivi Metricool web de la PR d'intégration conserve les visites publiques
sous consentement Analytics, sans prétendre constituer un connecteur de
publication externe, une attribution de chiffre d'affaires ou une API
utilisable depuis le backend TOK sans droits supplémentaires.

## Où consulter

Les résultats sont dans `public.marketing_growth_snapshots` et les tâches
dans `public.marketing_growth_opportunities`, visibles uniquement depuis
un contexte PostgreSQL habilité (par exemple audit administrateur Supabase),
pas par la Data API navigateur. Le retour `growth` de l'orchestrateur
ne porte que le statut, le nombre de tâches et le code de priorité.

La couche de pilotage Quantum Rack (PR SEO autonome distincte) peut analyser
ces **agrégats** après un futur branchement d'API authentifiée en lecture
seule. Aucun jeton `service_role` TOK ne doit être installé dans Electron,
et le BFF marketing MFA existant ne doit pas être contourné.

## Tests et lancement

Sur une installation PostgreSQL **jetable** avec trois rôles de test, exécuter :

```sh
psql -v ON_ERROR_STOP=1 -f supabase/tests/marketing_growth_autopilot_fixture.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261031063000_marketing_growth_autopilot.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261031063000_marketing_growth_autopilot.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261031214500_marketing_growth_noon_refresh.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261031214500_marketing_growth_noon_refresh.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/marketing_growth_autopilot.sql
```

Ce jeu vérifie l'opt-in vs intérêt légitime, la file idempotente, les oppositions,
les signatures, les 7 jours de mesures, la pause globale et l'interdiction
d'accès anonyme. Ne jamais exécuter la fixture sur la production.

Effectuer ensuite `pnpm exec vitest run src/test/marketing-growth-autopilot.test.ts`,
`pnpm typecheck`, lint ciblé et build adapté. Le déploiement suit l'ordre habituel :
migration de production validée et testée, mise à jour de la fonction Edge,
puis surveillance de l'audit `growth_status`. Aucun secret supplémentaire.

## Limitations et retour arrière

Ce jalon ne signifie **pas** prospection et vente 100 % autonomes : aucune
invitation à un inconnu, aucun appel téléphonique robotisé, aucune inscription
fictive et aucune conclusion de vente automatisée. Les emails opt-in utilisent
les campagnes préapprouvées existantes ; leur disponibilité dépend des
connexions Resend, de la revue de contenu et des protections d'abonnement.

Pour arrêter de qualifier : basculer la pause marketing existante vers `true`
ou retirer l'appel dans le worker par une PR contrôlée. Une fois déployé, un
rollback complet passe par une nouvelle migration compensatoire : ne jamais
réécrire une migration déjà appliquée. Conserver les preuves, désabonnements,
rapports et statuts audités.

## Capture réelle des demandes de démonstration

L'audit a révélé que la page `/restaurateurs/geneve` envoyait les demandes
de démonstration uniquement au support, sans renseigner `restaurant_leads`.
La fonction serveur `contact-support` reçoit désormais, pour ce formulaire
public uniquement, un objet `restaurantLead` structuré : UUID v4 stable
jusqu'au succès, établissement, ville, téléphone, tables et besoin.

Après la validation CAPTCHA et les plafonds existants, le serveur persiste
le dossier dans `restaurant_leads` avec le statut `new` et la source
`restaurateurs_geneve`. La clé primaire UUID protège contre les doublons lors
d'un nouvel essai. Un plafond supplémentaire de deux requêtes par jour et par
empreinte SHA-256 d'e-mail limite l'abus sans inscrire l'adresse brute dans
la clé du rate limiter.

La demande continue d'être signalée au support. Seule la **première**
création d'un dossier peut mettre en file un accusé de réception
transactionnel à l'adresse fournie. Cet e-mail confirme uniquement la
demande de démo et ne contient pas de publicité récurrente ; une adresse
erronée ou usurpée reste un risque limité par CAPTCHA et fréquence.

Une case facultative non cochée par défaut permet de demander à recevoir
des nouvelles/offres TOK. Sa sélection, sa version de texte et la date
serveur sont enregistrées sous `restaurant_leads.metadata` avec l'état
**`marketing_status: unverified`**. Cela ne crée **pas** automatiquement
un contact autorisé ni une inscription à une campagne. Une preuve de
consentement vérifiée et la synchronisation contrôlée restent obligatoires
avant tout marketing. Les demandes sans cette case restent traitables pour
la démonstration qu'elles ont explicitement sollicitée.

Tests : `src/test/restaurant-demo-lead-funnel.test.ts`, tests page
`RestaurateursGeneve`, contrôles Deno et construction front.

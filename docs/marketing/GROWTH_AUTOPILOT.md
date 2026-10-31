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
- Un instantané unique `marketing_growth_snapshots.local_date` évite les
  traitements répétés le même jour suisse ; un maximum de 200 nouveaux dossiers
  est proposé par jour. Les tâches existantes ne sont pas récréées.
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

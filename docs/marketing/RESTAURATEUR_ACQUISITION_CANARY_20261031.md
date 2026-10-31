# TOK — Première recette commerciale restaurateurs (31 octobre 2026)

## Statut de la recette
**Préproduction / tests contrôlés. Aucun restaurant réel sollicité, aucune facture créée,
aucune publication sociale ni vente revendiquée.** L'intégration doit d'abord
passer la PR et son déploiement contrôlé ; le fait d'avoir des outils connectés
dans ChatGPT ne crée pas de droits serveur dans TOK.

## Baseline constatée en lecture seule
- La landing `/restaurateurs/geneve` répond en HTTP 200/304 sur PC et mobile ;
  formulaire de demande de démo présent, aucun débordement horizontal constaté.
  Le site actuel n'expose pas de CTA d'inscription directe au premier écran :
  ce manque est corrigé **dans la PR uniquement**.
- Le navigateur de test a bloqué ses requêtes mutantes : **aucun lead de test
  ni événement de paiement créé en production**.
- CRM TOK : environ 3 033 prospects restaurant à Genève, 268 à Carouge
  et 122 à Meyrin dans le segment examiné. Ce sont des pistes d'étude, **pas
  des destinataires e-mail éligibles**. Deux contacts ont consentement et e-mail
  enregistrés, dont l'un présente une origine de consentement ambiguë.
- Registre Metricool connecté : marque nommée `stoppin_gva` avec posts Facebook
  Stoppin déjà publiés, même si le compte Instagram est `tok_suisse`.
  **Aucune publication TOK sur cette marque mixte** tant que les droits de
  marque et de site ne sont pas vérifiés indépendamment.
- Resend TOK : domaine `mailing.thetok.ch` vérifié pour l'envoi. Ne pas
  confondre preuve de domaine et consentement du destinataire.
- Stripe TOK : compte de production en mode réel. Les essais de conversion
  ne doivent pas créer de paiements fictifs dans cet environnement.
- Plans actifs vérifiés en production : Starter 69 CHF, Business 129 CHF,
  Premium 199 CHF, Elite 499 CHF, tous à 5 CHF par table honorée dans
  les enregistrements contrôlés à cette date. Vérifier à nouveau les tarifs
  avant toute publicité ou offre contractuelle.

## Tests d'approche (messages à évaluer, non publiés)

### A — Gain de temps, restauration de quartier
> Les réservations, demandes et offres de votre restaurant sont dispersées ?
> TOK vous aide à les piloter depuis un espace unique, avec des outils
> de réservation, de commande et de fidélité. Découvrez la démonstration
> gratuite : https://www.thetok.ch/restaurateurs/geneve?utm_source=instagram&utm_medium=social&utm_campaign=tok_resto_canary_20261031&utm_content=temps

Angle de valeur : centralisation opérationnelle. Cible : restaurateurs ayant
des contraintes de temps identifiables dans un formulaire entrant, **pas
des personnes identifiées sans consentement**.

### B — Transparence des frais
> Avec TOK, le pack Starter est affiché à 69 CHF/mois et les réservations
> réellement honorées à 5 CHF par table. Dix tables servies : 119 CHF
> pour l'abonnement et ces réservations, hors autres frais.
> Comparez avec vos propres chiffres avant de décider :
> https://www.thetok.ch/restaurateurs/geneve?utm_source=instagram&utm_medium=social&utm_campaign=tok_resto_canary_20261031&utm_content=prix

Angle : budget explicite, sans promesse de revenus ni de classement Google.

### C — Réservations et créneaux creux
> Vous souhaitez mieux organiser les tables et communiquer vos disponibilités ?
> Découvrez dans TOK les réservations, les offres ponctuelles et le suivi
> depuis le dashboard. Demandez une démonstration sans engagement :
> https://www.thetok.ch/restaurateurs/geneve?utm_source=facebook&utm_medium=social&utm_campaign=tok_resto_canary_20261031&utm_content=reservations

Angle : problème concret, pas de garantie de remplissage.

## Recette de conversion contrôlée

1. Vérifier le propriétaire du compte social/site et approuver un seul message ;
   ne pas poster sur la marque Metricool mélangée.
2. Après mise en production et consentement Analytics/Marketing, vérifier que
   l'arrivée avec UTM est enregistrée sans collecte d'une URL contenant des secrets.
3. Tester localement un formulaire factice (domaine e-mail `example.invalid`).
   Les requêtes du navigateur de test sont interceptées : aucun faux lead en production.
4. Vérifier l'ID idempotent du lead, l'enregistrement CRM, l'accusé transactionnel
   unique et la conservation du statut `self_reported_unverified` pour la source ;
   aucune inscription marketing automatique.
5. Vérifier une inscription directe sur `/auth?role=restaurateur` jusqu'aux étapes
   précédant tout vrai paiement ; soumettre un paiement uniquement par le client
   volontaire sur une page Stripe vérifiée, ou employer un environnement de test isolé.
6. Rapprocher les compteurs **séparés** : demande, opt-in vérifié, contrat accepté,
   facture payée Stripe, activation. Une facture n'est jamais comptée deux fois ;
   un événement sans source vérifiée ne prouve pas l'attribution d'une campagne.
7. Après un volume statistiquement suffisant, comparer A/B/C sur
   demandes qualifiées par visite, abonnements réellement activés et coût d'acquisition.
   Ne pas optimiser sur les likes seuls.

## Garde-fous légaux et anti-spam

Le PFPDT rappelle que les courriels publicitaires de masse exigent en principe
un consentement préalable explicite et révocable, sauf exception encadrée
pour des clients existants et des offres similaires :
https://www.edoeb.admin.ch/fr/publicite-et-marketing

Les contacts d'annuaire `legitimate_interest` restent réservés à la
recherche et à un éventuel suivi humain licite, **pas à une campagne massive**.
Aucune usurpation, aucun avis fictif, aucune publicité cachée, aucun formulaire
tiers rempli pour acquérir un contact sans demande authentique, aucun achat
d'annuaire e-mail. Le budget publicitaire par défaut reste **zéro** tant qu'un
plafond explicite et les comptes officiels ne sont pas validés.

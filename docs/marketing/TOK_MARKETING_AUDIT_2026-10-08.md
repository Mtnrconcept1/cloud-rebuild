# Audit du marketing automatique TOK — 8 octobre 2026

## Verdict

Le calendrier approuvé dispose d'un orchestrateur fonctionnel, mais TOK ne possède pas encore un
Autopilot entièrement autonome. Les huit modèles métier sont limités à la simulation et à la
préparation de brouillons. Ce lot reprend le travail Meta de la PR #718 sur le main actuel, corrige
sa reprise après incident et ne fusionne pas main. Il ne remplace pas une activation de comptes
CRM, SEO ou publicitaires.

Risque : niveau 3 (Edge Function, publication externe, approbation, secrets et CI).
Base consultée : `a2b16d4` ; travail antérieur réutilisé : `00ed228` (PR #718).
Worktree dédié : `tok-marketing` ; branche : `audit/tok-marketing-20261008`.

## Preuves d'environnement obtenues

- Accès GitHub confirmé, permissions d'écriture disponibles.
- Supabase de production : `wwcrtyoueexyxkkikaos`, projet Tok actif.
- Vercel : `cloud-rebuild-recovered`, déploiement de production READY ; domaines thetok.ch et
  marketing.thetok.ch associés. Aucune erreur runtime des endpoints marketing sur 24 heures.
- Stripe : compte Tok en mode live identifié. Aucun paiement ni changement Stripe exécuté.
- Cloudflare : accès confirmé ; workers `cloud-rebuild` et `cloud-rebuild2` présents, dernière
  modification le 16 septembre. Aucun worker marketing dédié identifié dans cette liste.
- Cron `tok-marketing-orchestrator` actif toutes les deux minutes ; cinq dernières exécutions SQL
  réussies. Les logs Edge comptent 626 appels HTTP 200 de l'orchestrateur sur 24 heures.
- Calendrier et historique des runs Autopilot vides ; aucun contenu approuvé à publier au moment
  de la lecture. Le cron actif ne prouve donc pas une publication réelle.
- Pause globale levée et feature flag marketing actif.
- Orchestrateur de production ACTIVE, version 234 : bundle récupéré et adaptateur Meta présent,
  mais sans les nouveaux délais maximaux. Ce code de production est en avance sur main.
- Facebook et Instagram déclarés connectés, avec la Page `1409554725565734`, Instagram
  `17841447348180505` et Graph `v26.0`. La dernière vérification enregistrée date du 6 octobre.
  Aucune nouvelle publication fournisseur n'a été effectuée pour cet audit.
- RLS activée sur les 28 tables marketing physiques inspectées ; aucune policy dédiée au rôle
  anon trouvée. Cette lecture ne constitue pas une simulation exhaustive des permissions.
- La migration de fondations Autopilot est enregistrée en production ; la migration
  `20261006033000` de la PR #718 ne l'est pas. Les paramètres Meta ont donc été configurés
  hors de cet historique. Son application déconnectera volontairement les intégrations : prévoir
  une nouvelle vérification des credentials et une activation contrôlée après livraison.

## État fonctionnel

| Domaine | État observé | Action restante |
| --- | --- | --- |
| Campagnes et calendrier | Approbation, planification, cron et leases présents | Tester un contenu réel approuvé après livraison |
| Facebook / Instagram | Backend déclaré connecté ; code encore hors de main | Livrer le lot Meta, puis canari et réconciliation |
| Email Resend | Intégration blocked_configuration | Vérifier les secrets serveur, domaine et désinscription |
| Push Firebase | Intégration blocked_configuration | Configurer et vérifier le fournisseur |
| Huit modèles TOK | disabled ; effets externes interdits par contraintes SQL | Déclencheurs métier et moteur d'exécution à développer |
| HubSpot | unconfigured ; aucun adaptateur déployé | Compte autorisé, mapping des champs, consentements et canari |
| Search Console | unconfigured | Propriété autorisée et accès vérifié |
| Meta / Google / TikTok Ads | unconfigured | Comptes, plafonds de budget et adaptateurs ; aucun achat activé |
| Canva | unconfigured | Accès et import/export à définir |
| Metricool | unconfigured | Ne pas activer : voie Meta directe retenue |
| Autres réseaux | disconnected | Comptes et adaptateurs manquants |
| Attribution | Socle de KPI nullables présent | Alimentation réelle des faits et validation des rapprochements |
| Studio / assets | Bibliothèque et métadonnées présentes dans le code | Inventaire et droits des 30 assets à compléter |

## Plan et correctifs de ce lot

1. Reprendre exclusivement le lot marketing de #718, en conservant les changements d'accueil main.
2. Borner chaque requête Graph à 10 secondes, y compris la lecture du corps. Après un POST de
   publication, une réponse illisible ou sans identifiant reste un résultat inconnu à réconcilier.
3. Préserver le marqueur durable et l'identifiant fournisseur lors d'un échec SQL. L'adaptateur
   Meta gère sa reprise ; le catch générique ne peut plus écraser cette preuve par un objet vide.
4. Réévaluer la pause globale, le feature flag, l'approbation de l'élément et de sa campagne, et
   l'expiration du lease immédiatement avant publication. Vérifier la même approbation au moment
   d'enregistrer le marqueur.
5. Utiliser l'intégration enregistrée sur l'élément, plutôt qu'un compte arbitraire du même canal.
6. Réserver un seul élément par passage pour éviter qu'un élément attende derrière plusieurs
   publications réseau avec un lease déjà en cours. Le plafond e-mail reste cinq livraisons.
7. Ajouter des tests de publication, timeout, absence d'identifiant, pause, approbation révoquée,
   récupération sans republication et échec de persistance.
8. Actualiser l'index canonique et publier une PR de revue, sans merge ni mutation de production.

La limite d'un élément par passage donne un débit nominal de 30 éléments par heure avec le cron
actuel, hors reprises et passages manuels. C'est un compromis conservateur pour les leases ; une
augmentation doit réserver les éléments au moment de leur traitement et mesurer le budget runtime.
La vérification juste avant publication réduit les courses d'état, sans rendre atomique une API
externe avec une transaction PostgreSQL.

## Retour arrière et livraison

Avant livraison : relire le diff et les checks CI de cette PR. Ce lot inclut la synchronisation des
noms de secrets Meta dans le pipeline existant, sans ajouter ni modifier aucune valeur de secret.
Les déclarations connected en base ne suffisent pas à certifier les droits Meta aujourd'hui.

Rollback code : PR de revert du commit. Les publications déjà effectuées restent à réconcilier
chez le fournisseur ; une restauration de code ne les supprime pas. Conserver les marqueurs et les
identifiants fournisseur pour empêcher les doublons. Aucun historique SQL appliqué n'a été édité.

## Validations

Tests marketing : 292 réussites lors du premier lot, puis 21 tests Meta réussis après
ajout du contrôle de réservation. Typecheck applicatif et contrôle Deno de l’orchestrateur réussis
(le contrôle Deno résout Supabase vers la même version npm locale 2.106.2). Lint : zéro erreur,
17 avertissements existants. Build de production complet réussi. Suite Node 24 : 2 668 réussites
et une attente textuelle du reporter Node 22 en échec ; les 37 tests internes correspondants
passent avec le reporter TAP. Relance Node 22 : 2 669 tests réussis sur 2 670 ; le test Stoppin passe. Une assertion
exigeant stderr vide échoue uniquement sur un avertissement expérimental du proxy Node.
Les deux tests concernés sont ensuite relancés avec le proxy Node désactivé.

Les résultats définitifs sont consignés dans la PR. Les tests de reprise utilisent des fournisseurs
simulés, sans publication ni donnée personnelle. Le build de production utilise les variables
publiques du projet TOK via l'environnement du processus, sans écrire de fichier .env.

Non exécutés : canari de publication réelle, test physique d'impression, modification Stripe,
rejeu SQL sur PostgreSQL local (Docker et psql indisponibles), déploiement de ce lot. La migration
Meta est un UPDATE de configuration existant repris de #718 ; son statut de production est
explicitement décrit ci-dessus. Aucun secret n'est demandé ou supposé présent.

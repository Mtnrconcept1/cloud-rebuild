# Actualités — identité des événements facturables

Risque : niveau 3, budget prépayé et fonctions SQL privilégiées.

## Défaut reproduit

Le replay PostgreSQL isolé [38081908606](https://github.com/Mtnrconcept1/cloud-rebuild/actions/runs/38081908606), candidat `c0359d30cab62cd0db3c5a5fed5a842c867dc9e2`, a rejoué la base `f893d29c41c6f0ebf542693d72baa2255332d9dc` puis appelé la vraie chaîne RPC sous les rôles anonymes et connectés. Pour le même visiteur, post et jour, changer `page`, `source` ou le User-Agent produisait une nouvelle clé payante. Les fixtures ont observé 0,02 au lieu de 0,01 pour les impressions et 2 au lieu de 1 pour les clics. Aucune campagne ni transaction réelle n'a été utilisée. Les plafonds existants limitaient la dépense totale sans empêcher ce double débit.

## Changement proposé

La nouvelle fonction privée calcule une clé commune au writer historique et au wrapper d'attribution. Elle ignore les métadonnées analytiques libres et normalise le clic CTA. Les comptes authentifiés conservent une identité distincte ; les appels service utilisent leur identité serveur. Pour les visiteurs anonymes, la facturation regroupe le réseau observé, le post, le type d'événement et la journée. L'adresse brute n'est pas ajoutée aux événements : elle entre seulement dans le calcul d'une empreinte.

Ce regroupement anonyme est conservateur : plusieurs personnes partageant une adresse réseau peuvent compter pour un seul événement facturable. Il garde la frontière de confiance existante des en-têtes transmis par la passerelle ; il ne prouve pas une identité humaine et ne bloque pas une fraude distribuée. L'identité analytique et les données d'attribution existantes restent séparées de cette clé payante.

Les événements déjà acceptés et reconnaissables sont réutilisés sans réécrire les montants ni les preuves historiques. Un ancien hash anonyme ne permet pas de reconstruire l'adresse d'origine : après un changement de User-Agent antérieur à la migration, le rapprochement historique peut rester impossible. Aucun recalcul ni remboursement automatique n'est effectué.

Le writer de budget, ses plafonds et les règles de conversion restent inchangés. La migration vérifie leurs empreintes et refuse une dérive des fonctions ciblées. Elle doit précéder la recette finale ; un simple succès de CI n'atteste pas un déploiement.

## Vérifications exigées

- Rejeu historique complet avec les 440 contacts synthétiques requis par une ancienne migration ; le réseau sortant de la base doit être refusé et ce refus observé.
- Refus de la dérive et rollback intégral, réapplication sans changement, conservation des ACL et événements antérieurs.
- Variations de page/source/User-Agent, répétition de trackingCallId, alias CTA, comptes distincts, trafic interne non facturé et attribution conservée.
- Plafond total, plafond journalier, changement de jour et conversion différée confirmée une fois.
- Six transactions réellement concurrentes bloquées puis libérées : une dépense, six événements analytiques.
- Helper privé inaccessible aux clients ; collecte directe historique toujours refusée aux rôles publics.

Le runner exige une base jetable PostgreSQL 17+ sur loopback avec consentement explicite par variable dédiée. Aucun appel de ce runner n'est autorisé vers une base hébergée. Docker local reste en pause manuelle ; les preuves SQL sont produites dans le runner distant isolé.

## Déploiement et reprise

Avant application, comparer l'historique SQL et les empreintes des fonctions live à la base validée. Appliquer uniquement la nouvelle migration versionnée, puis vérifier ses ACL et le contenu des fonctions. Ne pas lancer les fixtures en production. En cas d'écart, suspendre cette livraison et préparer un correctif ; ne pas rétablir une clé dépendant des métadonnées libres pour faire disparaître une erreur.

L'exposition des helpers de quotas Actualités fait l'objet d'un lot distinct ; elle n'est pas déclarée corrigée par cette migration.

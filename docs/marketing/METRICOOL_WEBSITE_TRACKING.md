# TOK — Suivi du site via Metricool

## Périmètre

La balise JavaScript fournie par l'exploitant est intégrée au runtime React, pas en
inline dans `index.html`, afin de respecter la politique CSP stricte de TOK.
Le script officiel `https://tracker.metricool.com/resources/be.js` est chargé
dynamiquement au premier affichage public autorisé puis la méthode
`beTracker.t({ hash })` est appelée à chaque changement de page autorisé.

Le hash fourni initialement appartenait à la marque mixte `stoppin_gva`, et ne
peut donc plus activer le suivi de TOK. Le chargeur attend désormais **une nouvelle
marque TOK et un nouveau hash de site**, publics mais distincts, tous deux
validés dans Metricool. Le chargeur ne fournit pas de publication, d'analyse des
posts ni de synchronisation CRM côté serveur.

## Protection des visiteurs

- Traceur externe chargé seulement après consentement `analytics` explicite.
- Pas de chargement sur les hôtes d'administration, les déploiements preview ou Capacitor.
- Seules les routes publiques de découverte/marketing prévues dans l'allowlist sont suivies.
- Exclusion de l'authentification, des paniers, des paiements, des profils et des espaces privés.
- Refus de toutes les URL avec fragment ou paramètre non autorisé. Paramètres de campagnes
  acceptés : UTM, `gclid`, `fbclid`, avec valeurs bornées et sans caractères sensibles.
- Aucun nouvel événement n'est émis après retrait du consentement. Un script tiers
  déjà exécuté ne peut pas être « dés-exécuté » rétroactivement.
- Les sources CSP `script-src` et `connect-src` autorisent uniquement
  `https://tracker.metricool.com` pour ce fournisseur.

Metricool indique que son traqueur de site ne dépose pas de cookies, mais reçoit
la page consultée et déduit le pays de l'adresse IP. La politique de confidentialité
et l'inventaire des traceurs TOK le documentent.

## Précondition bloquante : identité de marque

Le 31 octobre, la marque Metricool reliée dans ChatGPT porte le nom `stoppin_gva`
et contient des **publications Stoppin déjà publiées sur Facebook**, bien que
le profil Instagram connecté soit `tok_suisse`. Cette marque est donc MIXTE :
l'identifiant de suivi fourni ne constitue pas une preuve qu'une propriété
Web TOK indépendante est configurée. Pour éviter de mélanger des statistiques
entre deux entreprises, **le traceur reste désactivé par défaut**.

Trois variables publiques de build sont nécessaires, toutes **refusées par défaut** :
`VITE_METRICOOL_TOK_PROPERTY_VERIFIED=true`,
`VITE_METRICOOL_TOK_BRAND_ID=<nouvel ID>` et
`VITE_METRICOOL_TOK_TRACKER_HASH=<nouveau hash>`.
Le code rejette explicitement l'ancienne marque **6954835** et l'ancien hash
**8dd2fca1e84e3ac86c6d9d09fc0d05e9**, même si l'interrupteur de
vérification a été activé. Ces identifiants sont publics et ne sont pas des
clés d'API. Une nouvelle marque doit être vérifiée par l'opérateur ; le code
seul ne peut pas attester la propriété des comptes sociaux.
Le consentement Analytics du visiteur demeure obligatoire après activation.

## Séparation sans effacement

Ne pas renommer ou supprimer la marque historique en espérant séparer ses
statistiques : Metricool rattache les données du Planner à l'ID de marque.
Une seconde marque « TOK Suisse » doit être créée via
**Metricool → Connexions → Ajouter une marque**, dans les limites du forfait.
La connexion et les droits des comptes TOK doivent être contrôlés séparément ;
le connecteur Metricool utilisé ici ne dispose pas d'une action de création de
marque ou de transfert. Ne jamais engager une mise à niveau payante sans accord.

Consulter le plan de mise en service et les brouillons dans
`docs/marketing/TOK_AUTOPILOT_EXPLOITATION_20261031.md`.

## Contrôle d'activation après fusion et publication

1. Dans Metricool, vérifier que le compte de marque concerné contient réellement
   les réseaux TOK et le **site `www.thetok.ch`**. Lors du contrôle du 31/10/2026,
   le compte accessible portait encore l'étiquette `stoppin_gva` mais son profil
   Instagram pointait désormais sur `tok_suisse`. Vérifier que l'historique Stoppin
   n'est pas mélangé avec les rapports TOK et séparer les marques si nécessaire.
2. Ouvrir une fenêtre privée sur `https://www.thetok.ch/`, accepter Analytics,
   puis vérifier dans Network que `be.js` se charge sans erreur CSP.
3. Naviguer vers `/recherche` sans rechargement et vérifier une nouvelle mesure
   dans Metricool sans deuxième injection du script.
4. Refuser Analytics ou visiter `/auth` : aucun nouvel événement Metricool.
5. Dans Metricool > Connexions > Site web, utiliser « Vérifier la connexion ».
   Les visites temps réel sont visibles après détection ; les statistiques
   agrégées du site peuvent demander 24 heures.
6. Contrôler les métriques, notamment le domaine affiché et le trafic interne
   exclu, avant de relier ces chiffres aux conversions TOK.

## Ce que cette PR ne prétend pas livrer

Le connecteur Metricool de ChatGPT ne constitue pas une configuration de
fournisseur serveur dans Supabase. Le registre marketing TOK reste en l'état,
et aucune publication automatique ni campagne externe n'est activée ici.
La qualification commerciale issue de la PR #1054 fonctionne dans un module
séparé, sous ses propres contrôles de sécurité et d'autorisation.
Un adaptateur côté serveur avec identifiants sécurisés, sondes fournisseurs,
rapprochement des publications et attribution aux ventes sera nécessaire
pour un autopilote commercial réellement autonome.

Retour arrière : revert de la PR et retrait de la balise autorisée de la CSP.
Aucune migration ni donnée commerciale n'est modifiée.

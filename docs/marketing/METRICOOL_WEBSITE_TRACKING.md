# TOK — Suivi du site via Metricool

## Périmètre

La balise JavaScript fournie par l'exploitant est intégrée au runtime React, pas en
inline dans `index.html`, afin de respecter la politique CSP stricte de TOK.
Le script officiel `https://tracker.metricool.com/resources/be.js` est chargé
dynamiquement au premier affichage public autorisé puis la méthode
`beTracker.t({ hash })` est appelée à chaque changement de page autorisé.

Le propriétaire autorise désormais l'usage du compte existant « Tok » / 6954835
avec son historique Stoppin, sans nouvel abonnement. Les KPI TOK commencent le
**1er novembre 2026** : ne pas les mélanger aux résultats Stoppin antérieurs.
La propriété web de Metricool reste à vérifier indépendamment.

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

## Réutilisation autorisée de la marque Tok

Le 31 octobre, Metricool affiche une marque « Tok » avec ID **6954835**,
Instagram **tok_suisse** et Facebook **Tok**. Le propriétaire a expressément
accepté la réutilisation de cette marque et de ses faibles données Stoppin.
Aucun deuxième compte ni effacement n'est requis.

**Important :** la propriété web a une URL vide dans les données du connecteur.
Cela n'empêche pas la publication organique sur les comptes vérifiés,
mais le tracking du site reste **désactivé** jusqu'à validation de
**www.thetok.ch** dans Metricool.

Valeurs publiques de build :
- `VITE_METRICOOL_TOK_BRAND_ID=6954835`
- `VITE_METRICOOL_TOK_TRACKER_HASH=8dd2fca1e84e3ac86c6d9d09fc0d05e9`
- `VITE_METRICOOL_TOK_REUSE_EXISTING_BRAND_APPROVED=true`
- `VITE_METRICOOL_TOK_PROPERTY_VERIFIED=false` **tant que le site n'est pas vérifié**.

La réutilisation de la marque exige l'ancien **couple exact**, l'accord
explicite et le second drapeau de validation du site web. Le consentement
Analytics des visiteurs demeure obligatoire. Ne rien supprimer ni transférer
automatiquement. Toutes les performances TOK sont mesurées à partir du
**1er novembre 2026** seulement.

## Contrôle d'activation après validation de la propriété web

1. Dans Metricool, confirmer les comptes Facebook Tok et Instagram tok_suisse
   sur la marque existante 6954835. Connecter puis vérifier www.thetok.ch
   dans le module Site web (actuellement sans URL).
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

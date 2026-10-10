# Hébergement des associations mobiles

Les associations iOS et Android doivent répondre directement en HTTPS sur chacun des domaines déclarés par l'application. Le JSON correct ne suffit pas si le domaine retourne une redirection ou une page 404.

## État observé le 10 octobre 2026

- `www.thetok.ch` et `admin.thetok.ch` servent l'AASA en 200, mais avec le type `application/octet-stream`.
- `thetok.ch` possède une redirection de domaine Vercel 308 vers `www.thetok.ch`, y compris pour les associations.
- `app.thetok.ch` retourne 404 et n'est pas rattaché au projet Vercel nominal, alors qu'il figure dans les domaines associés natifs.

## Ordre de livraison

1. Déployer la règle de type JSON AASA et la redirection canonique applicative contenues dans `vercel.json`. Cette redirection préserve le comportement du site public tout en exemptant exactement les deux fichiers d'association sous `/.well-known/`.
2. Confirmer le SHA déployé et le type JSON en 200 sur `www.thetok.ch` et `admin.thetok.ch`.
3. Rattacher `app.thetok.ch` au projet `cloud-rebuild-recovered` après contrôle DNS/ownership ; aucune souscription ni nouveau domaine requis.
4. Retirer uniquement la redirection globale du domaine `thetok.ch` dans ce projet. Conserver le domaine, son DNS, HTTPS et tous les autres domaines.
5. Vérifier sans suivi de redirection : HTTP 200 + JSON AASA/assetlinks sur les quatre domaines iOS ; contrôler aussi les hôtes Android historiques avant publication Android. Vérifier que les pages ordinaires de l'apex rejoignent toujours le domaine canonique et que l'accès admin/auth conserve son comportement.
6. Valider les liens dans une application signée sur appareil. Un contrôle HTTP ne prouve ni le rafraîchissement du cache CDN Apple ni la validation par Android.

Si la désactivation de la redirection fournisseur cause une régression, la remettre vers `www.thetok.ch` avec code 308. Les associations apex ne seront alors plus considérées validées ; le trafic web retrouvera son état antérieur.

Références : [Apple — domaines associés](https://developer.apple.com/documentation/xcode/supporting-associated-domains), [Apple — diagnostic des liens universels](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links), [Apple — format JSON et absence de redirection](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/UniversalLinks.html).

# Légendes des campagnes TOK

Politique éditoriale du Studio marketing, établie le 13 octobre 2026.

## Objectif

Produire un texte utile et précis pour chaque réseau : une accroche concrète, un bénéfice vérifiable et un appel à découvrir la fonctionnalité. La pertinence est privilégiée ; aucune portée ni viralité n'est garantie.

Les modèles guidés génèrent une variante originale par réseau. Plusieurs formats d'un même réseau partagent cette légende. Les visuels restent partagés entre réseaux lorsque le format et le sujet sont identiques. Les publications existantes et les modifications manuelles ne sont pas réécrites.

Le brief libre conserve son format existant, mais ses nouvelles publications sociales passent également les contrôles de liens, mentions et hashtags. Le thème du post prime sur l'objectif général d'une campagne multithème. Sans identification fiable, seuls les liens publics exacts du catalogue sont conservés ; sinon le lien est l'accueil. Les autres canaux, notamment e-mail et messages internes, conservent leur traitement existant.

## Réseaux, hashtags et mentions

- Instagram : texte aéré, 2 à 4 phrases, 3 à 5 hashtags liés au sujet, à TOK et au lieu lorsque celui-ci est renseigné.
- Facebook : texte plus court et direct, 1 à 3 phrases, 0 à 2 hashtags utiles.
- LinkedIn : angle professionnel ; Actualités TOK : information claire sans hashtags.
- Les hashtags proviennent d'un vocabulaire éditorial par fonctionnalité. Ils ne sont pas présentés comme des tendances mesurées ou un classement de popularité.
- Les mentions sont facultatives. Seul le compte Instagram `@tok_suisse` a été vérifié dans cette livraison. Aucun compte partenaire ni handle Facebook n'est supposé.
- Pas d'engagement artificiel, de fausse urgence, de chiffres de performance inventés ou de promesse absolue.

## Liens

Chaque post guidé possède un thème principal sélectionné et une URL choisie côté serveur. Les URL proposées librement dans le texte généré sont retirées avant l'ajout de ce lien.

| Thème | Destination publique |
| --- | --- |
| Zéro attente | `https://www.thetok.ch/zero-attente` |
| Anti-gaspi | `https://www.thetok.ch/anti-gaspi` |
| Vente flash | `https://www.thetok.ch/ventes-flash` |
| Découverte | `https://www.thetok.ch/recherche` |
| Livraison | `https://www.thetok.ch/recherche?delivery=true` |
| Tables à 5 CHF | `https://www.thetok.ch/restaurateurs/alternative-commission-couvert` |
| TOK One | `https://www.thetok.ch/tok-one` |
| Autres modèles | `https://www.thetok.ch/` |

Les outils Studio marketing, Photo Pro, plan de salle, menu digital, offres et formules, avis, pilotage et création d'actualités nécessitent une connexion : leur lien reste l'accueil. Même règle pour réservations, fidélité et cadeaux Miamz. Dernière minute et à emporter n'ont pas de destination publique dédiée vérifiée.

Une URL Instagram est affichée dans la légende sans promettre qu'elle sera cliquable. Aucun « lien en bio » n'est annoncé automatiquement.

## Sources et maintenance

Les skills `marketing:content-creation` et `marketing:brand-review` ont servi à construire la structure et la cohérence de marque. Les règles produit TOK restent la source des bénéfices et restrictions commerciales.

- [Instagram Creators, annonce officielle du 18 décembre 2025](https://www.threads.com/@creators/post/DSalXGPCWM4/new-hashtag-guidance-starting-today-instagram-will-allow-up-to-hashtags-in-a) : annonce de cinq hashtags maximum par post ou reel, vérifiée directement dans le navigateur.
- [Meta, lutte contre les contenus indésirables sur Facebook](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/?locale=en_US) : légendes sans rapport, accumulation de hashtags et engagement artificiel à éviter.
- Routes et protections contrôlées dans `src/App.tsx`, `src/pages/Recherche.tsx`, `src/components/DashboardRoute.tsx` et `src/components/ProtectedRoute.tsx`.

Revoir le catalogue lorsqu'une route ou son accès change. Ajouter une mention uniquement après vérification du compte et de sa pertinence pour le contenu. L'approbation humaine des brouillons demeure nécessaire avant diffusion.

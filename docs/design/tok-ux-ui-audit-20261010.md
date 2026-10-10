# TOK — Proposition UX/UI du 10 octobre 2026

## Résultat et périmètre

**Recommandation : faire de TOK un guide local chaleureux qui aide d’abord à choisir une adresse et un service réellement disponible.** Conserver le logo, l’orange et la solidarité ; donner la priorité à la recherche, aux restaurants et à la clarté des informations.

[Ouvrir la maquette interactive](./tok-ux-ui-proposal-20261010.html). Elle fonctionne directement comme fichier HTML, avec les médias déjà présents dans `public/`, ou depuis un serveur local à la racine du dépôt. Les établissements, menus, prix et créneaux de la maquette sont fictifs et explicitement signalés. Aucun appel au backend, aucune commande ni réservation réelle.

Niveau de risque **1** : audit, document et maquette autonome. Aucun composant applicatif, route, permission, paiement, configuration de production ou donnée restaurant modifié. Base examinée : `origin/main` au commit `702a9a19`, dans un worktree et une branche dédiés. Le checkout principal était plus ancien et contenait des fichiers non suivis ; il a été préservé.

L’audit navigateur couvre l’accueil, la recherche, une fiche d’annuaire et un aperçu de l’espace client, dans la session connectée existante. Le sélecteur officiel « Espace client » a permis d’accéder au parcours client sans déconnexion. Le parcours invité reste à vérifier séparément. Aucune donnée personnelle de cette session n’est reproduite ici.

## Ce qui freine aujourd’hui le parcours

| Priorité | Observation en production | Conséquence | Amélioration proposée |
| --- | --- | --- | --- |
| P1 | Depuis l’accueil, chercher « Mamasan » impose Genève et renvoie 0 résultat. Changer la ville pour Vernier donne 1 résultat. | Un restaurant visible dans les sélections paraît introuvable. | Champ de lieu explicite, « Tout le canton » possible, maintien du lieu choisi entre accueil et résultats. |
| P1 | La fiche Mamasan annonce « Commencez en quelques secondes », alors que réservation, livraison et emporter sont indisponibles. | Promesse incompatible avec le service réellement accessible. | Distinguer « Fiche annuaire » et « Réservation en ligne » dès les cartes ; sur la fiche, expliquer l’indisponibilité et proposer des alternatives. |
| P1 | Une annonce intitulée « Les Brasseurs » comporte Vernier, une adresse à Thônex et une description citant « Blues Bsr ». | La confiance baisse avant même l’ouverture de la fiche. | Vérifier la cohérence restaurant, lieu, texte, visuel et destination avant diffusion. La cause n’est pas établie par cet audit. |
| P2 | Une introduction vidéo a masqué temporairement l’accueil pendant la visite. | Une étape supplémentaire retarde la recherche. | Lecture volontaire depuis un accès secondaire ; accueil utilisable immédiatement. |
| P2 | Sur mobile et largeur intermédiaire, deux accroches (« Réservez et commandez… » puis « Les meilleures offres… ») apparaissent dans le même titre. | Répétition et surcharge visuelle. | Un seul titre court, une seule promesse, même sens sur toutes les tailles. |
| P2 | À l’ouverture desktop, le grand visuel et le personnage occupent le premier écran, sans restaurant visible. | Les contenus permettant de choisir arrivent tard. | Hero plus court, photo culinaire utile, première sélection rapprochée. |
| P2 | Plusieurs sections répètent des restaurants dans « Dans Vernier », « Pour ce soir », « Pour ce midi » et « À découvrir ». | Long défilement sans découverte proportionnelle. | Réduire les sélections initiales, varier les adresses et proposer « Tout explorer ». |
| P2 | La recherche mobile place introduction, compteur, cuisines, filtres et deux tris avant les résultats. | Les filtres prennent le pas sur leur résultat. | Recherche compacte, lieu visible, bouton Filtres avec compteur et un seul tri. |
| P2 | Des boutons favoris des cartes ordinaires n’ont pas de nom accessible dans l’arbre observé ; la lecture du composant confirme cette lacune. | Action peu compréhensible au lecteur d’écran. | Nom du restaurant dans le bouton, état annoncé, cible confortable et focus visible. |
| P2 | La fiche d’annuaire inspectée affiche un grand encart de revendication destiné aux professionnels au-dessus du parcours client. | L’action d’un propriétaire concurrence celle du visiteur. | Résumé discret de provenance, informations détaillées dépliables et accès propriétaire secondaire. |

Ces observations ne constituent pas un audit complet de toutes les pages, des comptes ou de l’accessibilité. Le cas de recherche est reproductible dans la session inspectée ; il ne prouve pas que toutes les recherches échouent.

## Trois directions comparées

1. **Guide local chaleureux — retenu.** Fond ivoire, titres éditoriaux courts, photos culinaires, orange réservé aux actions, lieux et services lisibles. Meilleur équilibre entre identité, confiance et choix rapide.
2. **Affiche TOK simplifiée.** Garder le grand chef et le décor genevois, réduire fortement le texte et déplacer les promotions. Changement visuel moindre, mais le décor reste dominant et l’interface ressemble encore à une campagne.
3. **Interface utilitaire centrée sur la recherche.** Liste, filtres et carte dès l’arrivée. Rapide pour un habitué, mais moins accueillante et moins distinctive pour une première visite.

## Direction retenue : décisions de design

### Accueil

- Accroche : **« Votre prochaine bonne adresse. »**
- Texte : « Une table, un repas à emporter, une nouvelle envie. Trouvez le restaurant qui vous correspond. »
- Trois intentions : Explorer, Réserver, À emporter. La livraison ne doit apparaître que si l’offre réelle et le lieu le permettent ; elle n’est pas simulée ici.
- Recherche avec labels permanents : « Restaurant ou cuisine » et « Où ? ». Aucun filtre de ville caché.
- Navigation resserrée : Découvrir, Restaurants, Les Miamz, Mon compte ; accès restaurateurs secondaire. Les accès actuels des comptes et rôles doivent être conservés lors d’une intégration.
- Une sélection courte, puis une explication simple des Miamz. Ne pas inventer de volumes de restaurants, notes, économies, repas financés ou disponibilité.
- La mascotte reste présente dans le logo. Son illustration grand format peut intervenir dans une page de marque, sans retarder la découverte des restaurants.

### Recherche et cartes

- Afficher le nombre d’adresses et la zone ; ne pas assimiler « adresse trouvée » à « table disponible ».
- Regrouper service et budget dans une fenêtre de filtres native, conserver la recherche et afficher le nombre de filtres.
- Une carte contient photo, nom, cuisine, ville, budget si connu, services et action précise. Aucun avis fictif.
- Une fiche d’annuaire indique immédiatement l’absence de réservation et de commande. Son bouton devient « Consulter la fiche ».
- Une erreur réseau doit être distinguée d’un résultat vide. Réessayer conserve les critères. L’élargissement de zone ne doit être proposé que s’il élargit réellement la recherche.

### Fiche et suite du parcours

- Le choix du service reste cohérent avec l’intention sélectionnée.
- Réserver montre jour, nombre de personnes et créneaux ; emporter montre plat, quantité, retrait et récapitulatif. La maquette s’arrête explicitement avant toute action réelle.
- Passer d’emporter à réserver conserve le même restaurant et remet le focus sur le service choisi.
- En production, les prix, allergènes, stocks, créneaux, frais et conditions doivent venir des sources validées. La refonte visuelle ne doit pas remplacer les contrôles transactionnels existants.
- L’état indisponible propose une recherche de restaurants réservables, sans bouton de réservation trompeur.

### Système visuel

| Usage | Valeur proposée |
| --- | --- |
| Fond | Ivoire `#FFFCF7` |
| Texte principal | Brun très sombre `#29221E` |
| Texte secondaire | `#685E57` |
| Action principale | Orange profond `#B83B12` avec texte blanc |
| Indication de service | Vert `#285B43`, toujours accompagné de texte |
| Typographies de la maquette | Georgia pour les titres, Arial pour l’interface ; polices système sans téléchargement |
| Espacements | Base de 8 px, sections plus compactes, largeur de lecture limitée |
| Boutons | Hauteur minimale CSS 44 px ; focus bleu visible ; texte explicite |
| Mouvement | Aucun autoplay ; transitions discrètes et préférence de mouvement réduit respectée |

Contrastes calculés : blanc/orange **5,72:1**, texte secondaire/ivoire **6,17:1**, texte principal/ivoire **15,29:1**, vert/blanc **7,87:1**. Ces calculs concernent les couples de couleurs listés, pas tous les pixels des images ni une conformité WCAG globale. Référence : [W3C, contraste minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). La cible de 44 px est un choix de confort ; le [minimum WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) prévoit 24 px avec exceptions.

## Itérations et évaluation

Grille annoncée avant la revue : utilité/navigation 30, hiérarchie 20, responsive 20, accessibilité 15, confiance et états 15. Il s’agit d’une appréciation heuristique de la **proposition cadrée et du prototype**, non d’une mesure statistique ni d’une note du site en production.

- **Première revue : 87/100.** Emporter absent, navigation historique manquante, filtres désynchronisés et petit écran à corriger.
- **Deuxième revue : 95/100.** Parcours présents et testés ; restaient des CTA périmés et le focus lors d’un changement de service.
- **Revue finale indépendante : 97/100.** Les derniers écarts fonctionnels ont été corrigés puis exercés au navigateur. Un clic sur le service réservation déjà actif est désormais sans effet, afin de préserver les valeurs sélectionnées.

| Dimension | Note finale | Éléments examinés |
| --- | ---: | --- |
| Utilité/navigation | 29/30 | Recherche, lieu, filtres, services distincts, historique, récapitulatifs simulés |
| Hiérarchie | 19/20 | Une accroche, action prioritaire, sélection courte, contenu secondaire ordonné |
| Responsive | 19/20 | Petit mobile, largeur intermédiaire et bureau ; absence de débordement dans les vues contrôlées |
| Accessibilité du prototype | 15/15 | Labels, boutons nommés, état des favoris, focus, Escape, dialogues natifs et contrastes listés |
| Confiance/états | 15/15 | Données fictives annoncées, indisponibilité, erreur, vide, réessai et absence de fausse confirmation |
| **Total** | **97/100 = 9,7/10** | **Qualité de la proposition uniquement** |

La précision du score est conventionnelle. Elle ne remplace ni des tests utilisateurs, ni une mesure de conversion, ni un audit complet d’accessibilité. Les 3 points restants reflètent notamment la couverture limitée de contenus, appareils et utilisateurs.

## Vérifications réalisées

| Vérification | Résultat |
| --- | --- |
| Site réel : accueil → recherche Mamasan → ville Vernier → fiche | Parcours inspecté ; défaut de lieu et indisponibilité observés |
| Maquette : petit mobile 320 × 800 effectifs | Pas de débordement horizontal ; navigation compacte |
| Maquette : largeurs intermédiaires effectives 433 et 853 px | Pas de dépassement du document dans les mesures DOM |
| Maquette : bureau effectif 1600 × 1111 | `scrollWidth = clientWidth = 1583` ; rendu inspecté |
| Réservation simulée | Sélection 19:30, 2 personnes : récapitulatif conforme, aucune réservation réelle |
| Emporter simulé | 2 plats à 20 CHF : total 40 CHF et message explicite d’absence de commande |
| Changement de service dans une fiche | Même restaurant conservé ; focus `dish` puis `detail-book`, puis `dish` |
| Retour/avance du navigateur | Vues accueil et résultats restaurées ; mode affiché synchronisé |
| Erreur/réessai et liste vide/réinitialisation | États distincts ; bouton d’élargissement masqué quand tout le canton est déjà choisi |
| Escape et retour du focus | Fermeture du récapitulatif et retour sur son bouton d’ouverture vérifiés |
| Console de la maquette | Aucun avertissement ni erreur dans les logs consultés |
| JavaScript embarqué | Syntaxe validée avec Node |
| Récapitulatifs | Texte dynamique inséré avec `textContent`, puis parcours réservation/emporter revérifiés |
| Lint applicatif local | Réussi : 0 erreur, 16 avertissements dans des fichiers applicatifs non modifiés |
| Typecheck applicatif local | Réussi |
| Tests locaux des contrôles CI | 33 tests réussis |
| Médias locaux | Fichiers référencés présents et images chargées dans le navigateur |
| Encodage | UTF-8 ; aucun caractère de remplacement détecté |
| Index documentaire obligatoire | Index régénéré après ajout des documents suivis, puis vérifié |
| Classificateur CI du dépôt | Documentation seulement, mais index canonique modifié : suite complète, lint/typecheck/build exigés par la CI ; aucun déploiement attendu |

Le navigateur conservait un zoom existant, d’où des dimensions effectives différentes de certaines tailles demandées. Les valeurs ci-dessus sont celles retournées par le DOM, sans assimiler un viewport demandé à une mesure effective.

Non exécutés : tests utilisateurs, Safari/iOS réel, Android réel, lecteur d’écran complet, audit WCAG exhaustif, paiement, réservation de production, métriques de performance ou de conversion. Le lint/typecheck/build applicatif n’est pas une validation de ce HTML autonome ; les contrôles nécessaires sont définis par le classificateur CI et les règles du dépôt.

## Intégration proposée et limites

Une intégration applicative constituerait une tâche distincte de niveau 2 ; les changements transactionnels ou d’autorisation, s’ils deviennent nécessaires, relèveraient du niveau 3. Ordre recommandé :

1. Corriger la continuité du lieu de recherche et les libellés de disponibilité. Cibles : `src/components/home/HeroSection.tsx`, `src/pages/Recherche.tsx`, `src/components/RestaurantCard.tsx`.
2. Appliquer le hero et les sélections resserrées : `src/components/home/HeroSection.css`, `src/pages/Index.tsx`, `src/components/home/RestaurantSection.tsx`, `src/components/home/SectionShowcaseHeader.tsx`.
3. Adapter la présentation de fiche dans `src/pages/RestaurantDetail.tsx`, en conservant les règles réelles de réservation, panier, paiement et autorisation.
4. Vérifier les contenus sponsorisés séparément : ne pas résoudre une incohérence de données par une simple retouche CSS.

Avant mise en production : tester l’invité et le client connecté, le maintien des espaces autorisés, mobile 320/390/768 et desktop, filtres et retour navigateur, états réseau et indisponibles, puis lint/typecheck/tests/build pertinents. Les créneaux et prix simulés ne doivent jamais être copiés dans les données réelles.

Pour démontrer ensuite une amélioration de l’expérience réelle : mesurer la réussite de la recherche d’un restaurant, l’identification du service disponible, le temps jusqu’à la fiche utile, les abandons et les erreurs. Constituer des tâches représentatives avec des utilisateurs avant d’attribuer une note de satisfaction au produit livré.

Rollback de cette livraison documentaire : retirer les deux fichiers de `docs/design/`. Aucune migration et aucun changement d’environnement à annuler. Les éventuels index documentaires générés sont à régénérer, jamais à modifier à la main.

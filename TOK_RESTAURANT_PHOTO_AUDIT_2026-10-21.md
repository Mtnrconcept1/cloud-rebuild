# Audit des couvertures de restaurants TOK — 21 octobre 2026

## Périmètre et état de la reprise du 22 octobre

La recherche `https://www.thetok.ch/recherche` annonçait 580 adresses le 21 octobre. Le contenu accessible comportait 162 cartes déjà chargées. Ce relevé concernait les identités et noms de fichiers ; il ne constitue pas une validation visuelle de 162 photographies. Les 418 autres adresses restent hors de ce relevé.

Quatre fichiers publics correspondant exactement aux noms signalés ont été retrouvés et examinés visuellement, puis quatre propositions ont été contrôlées dans leurs pages sources et leurs pixels. Trois fichiers sont inadaptés à une couverture ; celui de l’Auberge de Savièse montre bien le restaurant mais manque de netteté.

**Aucun remplacement de photo en production n’a été appliqué pendant cet audit.** Les URL complètes actuellement enregistrées dans TOK pour ces quatre cartes restent à relire avant application. Les fichiers actuels indiqués ci-dessous sont des correspondances publiques de noms de fichiers, et non une lecture certifiée des valeurs complètes en base.

Le 22 octobre, l’ancien onglet de recherche était fermé. La navigation vers `/recherche` dans Edge redirigeait le compte restaurateur connecté vers `/dashboard`. TOK Connect demandait une reconnexion. L’inspection du code confirme que `/admin/restaurants` n’expose pas de remplacement de couverture et que `/dashboard/photos` limite le choix aux restaurants appartenant au compte. La revue de publication du catalogue doit être conservée.

## Critères retenus

La couverture doit montrer le bon établissement : salle, façade, terrasse ou plat rattaché à la bonne adresse. La taille du fichier, son domaine, un nom ressemblant ou sa présence dans le pied de page d’un groupe ne suffisent pas. Les logos, pictogrammes et cartes de visite ne constituent pas une photographie de couverture.

Les identifiants proviennent des liens des cartes relevées sur la recherche TOK. Les empreintes SHA-256 décrivent les fichiers candidats inspectés le 21 octobre, sans transformation.

## Chez Philippe

- Identifiant TOK : `376658d7-acad-4bc1-84aa-f026bd4dc8e6`.
- Fichier relevé : `Les-Aviateurs-interieur-1.jpg`.
- Fichier public retrouvé : https://chezphilippe.ch/app/uploads/2024/08/Les-Aviateurs-interieur-1.jpg
- Constat visuel : le comptoir porte l’enseigne LES AVIATEURS. Ce média appartient aux autres établissements présentés par le groupe, et non à Chez Philippe.
- Identité : Chez Philippe, rue du Rhône 8, Genève ; Les Aviateurs, rue du Rhône 48, Genève.
- Proposition : terrasse couverte du Grill, tables dressées et verrière, 2560 × 1707 px.
- Image proposée : https://chezphilippe.ch/app/uploads/2026/02/Chez-Philippe_Terrasse-du-Grill-%C2%A9-Marc-Ninghetto-5-scaled.jpeg
- Source : https://chezphilippe.ch/fr/
- Source complémentaire : https://lesaviateurs.ch/fr
- SHA-256 : `051fab91e4b20dc0e06ae16c4f23b93d16216436291f60310542438acc411285`.

## Le Flacon

- Identifiant TOK : `83b06470-1d8a-48dc-86ec-d09598e07cb9`.
- Fichier relevé : `partenaire-1.png`.
- Fichier public retrouvé : https://le-flacon.ch/wp-content/uploads/2026/01/partenaire-1.png
- Constat visuel : pictogramme noir de poignée de main et d’épis, sans scène de restaurant.
- Identité : rue Vautier 45, 1227 Carouge, confirmée par la fiche institutionnelle de Genève Terroir qui renvoie vers le-flacon.ch.
- Proposition : salle avec mur de pierre, banquette beige et tables dressées, 660 × 440 px.
- Image proposée : https://www.geneveterroir.ch/sites/default/files/styles/producteur_slide/public/ambassadeurs/_MG_1974web%20corrigee.jpg?itok=gBZo5vZK
- Source : https://www.geneveterroir.ch/fr/le-flacon/5516
- SHA-256 : `1f10595fc1eae520080d420c5dbe710cadbaad4cef29ae4d275625ffe0cfe658`.
- Limite : date de prise de vue inconnue ; la proposition provient de la fiche exacte du restaurant, pas d’un visuel décoratif générique.

## Bap Urban Korean Food

- Identifiant TOK : `5f44c58c-fb45-46a9-8d7f-56422f1ddc20`.
- Fichier relevé : `1-DSC00954_cartes_de_visite.JPG`.
- Fichier public retrouvé : https://www.b-a-p.ch/attachments/Image/1-DSC00954_cartes_de_visite.JPG
- Constat visuel : carte de visite dans un bol vide ; ce n’est ni une assiette servie ni une vue du restaurant.
- Identité : rue de Coutance 25, 1201 Genève, d’après la page contact officielle.
- Proposition : dolsot bibimbap avec soupe et sauce, 800 × 450 px, légendé sur la page cuisine.
- Image proposée : https://www.b-a-p.ch/attachments/Image/1-DSC00879.JPG
- Source : https://www.b-a-p.ch/page3.php
- Contact : https://www.b-a-p.ch/page7.php
- SHA-256 : `ad02eef6abfd66d6160c1845b5cc00e488a30c65e1fbac6d354d9afb09ae7e6b`.

## Auberge de Savièse

- Identifiant TOK : `6fd0a37e-a160-4d8e-837a-9e7459312d55`.
- Fichier relevé : `AvecOuSansCash.png`.
- Fichier public retrouvé : https://www.aubergedesaviese.com/wp-content/uploads/2019/01/AvecOuSansCash.png
- Constat visuel : capture vidéo floue de deux personnes mangeant une fondue dans le restaurant. Ce n’est pas une bannière de paiement ni une erreur d’établissement démontrée.
- Identité : l’article officiel décrit l’émission tournée à l’Auberge ; adresse rue des Pâquis 20, Genève.
- Proposition : salle nette à boiseries et nappes à carreaux rouges, sans personnes, 1024 × 684 px.
- Image proposée : https://www.aubergedesaviese.com/wp-content/uploads/2018/11/AubergeSaviese6-1024px.jpg
- Source : https://www.aubergedesaviese.com/galerie-photos/
- Article : https://www.aubergedesaviese.com/avec-ou-sans-cash/
- SHA-256 : `f58af567d546967ba04dd2fa555af71e58fab2fef35c6091aaaa860f777f3d22`.
- Décision : amélioration éditoriale de netteté ; ne pas classer l’image actuelle comme étrangère au restaurant.

## Correctif associé et application restante

Le correctif de cette branche renforce les preuves de rattachement utilisées par le vérificateur et le repli d’affichage des cartes ordinaires. Il ne certifie pas les pixels : les preuves portent explicitement `visual_review_performed: false`, et le worker visuel existant reste nécessaire. Les sources sans données structurées suffisamment précises sont orientées vers `manual_review`.

Pour appliquer les propositions, relire d’abord la valeur actuelle complète de chaque couverture et confirmer qu’elle correspond toujours au fichier signalé. Soumettre ensuite la nouvelle candidate par le mécanisme autorisé de TOK, en conservant la valeur précédente et la provenance. Les fiches du catalogue maintiennent leur ancienne couverture tant que la revue n’a pas accepté la candidate.

Après application, contrôler le rendu de la carte et de la fiche, le recadrage mobile et le chargement. Reprendre ensuite le défilement de la recherche et le chargement des autres cartes. Ce correctif de code ne remplace aucune photo existante à lui seul et ne constitue pas un audit visuel achevé des 580 adresses.

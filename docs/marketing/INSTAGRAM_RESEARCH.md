# Veille Instagram Genève

La rubrique **Marketing Studio → Veille Instagram** (`/marketing?view=instagram`) recherche des publications sur la restauration, la cuisine et les sorties à Genève. Elle exploite la connexion professionnelle Instagram existante. Elle prépare des réponses avec une mention de l’auteur et une destination TOK ; la publication de la réponse se fait dans Instagram.

## Parcours

1. Choisir jusqu’à trois hashtags et trois comptes professionnels publics, ainsi qu’une période de 7, 30 ou 90 jours.
2. Lancer la recherche. Le compte TOK connecté est aussi consulté. Les mentions de comptes dans les légendes locales deviennent des candidats ; trois candidats maximum sont vérifiés avec Business Discovery. Une mention ne prouve pas que ce compte est l’auteur de la publication.
3. Comparer les comptes par taux médian et les publications par taux public ou volume d’interactions. Ouvrir la publication pour vérifier sa pertinence et sa localisation.
4. Pour une publication TOK, charger les commentaires, éventuellement les pages suivantes. Pour une publication tierce, ouvrir Instagram et saisir le commentaire et le pseudo observés dans le formulaire clairement identifié comme manuel.
5. Sélectionner un commentaire, choisir un sujet et personnaliser la réponse. Cliquer sur **Envoyer sur Telegram pour validation**. Le bot administrateur TOK reçoit l’auteur, les J’aime observés, le commentaire (extrait si long), le lien Instagram et la réponse exacte, avec **Valider / Refuser**.
6. Décider dans Telegram puis **Actualiser les validations Telegram** dans le Studio. Seul le texte figé validé est proposé comme texte validé à copier. Une modification du brouillon ne change jamais une réponse déjà soumise ; elle nécessite un nouvel envoi et une nouvelle décision. Publier manuellement dans Instagram depuis le bon compte TOK. Une copie ou une ouverture de page n’est jamais annoncée comme une publication réussie.

Les recherches restent dans la mémoire de l’écran. Les couples commentaire/réponse explicitement envoyés pour validation sont conservés dans `marketing_instagram_reviews` et retrouvables après rechargement (20 derniers affichés). Il n’y a pas de recherche récurrente ni de diffusion automatique de réponses.

Le circuit des publications et campagnes, y compris les contenus quotidiens, est décrit dans [Validation Telegram des contenus Marketing](./TELEGRAM_CONTENT_REVIEWS.md). Il ajoute une approbation du contenu aux conditions natives de diffusion ; le présent circuit de commentaires conserve une publication manuelle dans Instagram.

## Validation Telegram

Le BFF exige la session marketing, CSRF, le rôle admin et un quota partagé. Il transmet uniquement à `ops-incident-control` avec authentification de service et identité administrateur déléguée, revalidée dans `user_roles`. Le navigateur ne choisit jamais le bot ou le destinataire. La rubrique Telegram de diffusion marketing reste distincte de ce bot de validation privé.

Le bot et le webhook existants sont réutilisés avec `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_ADMIN_USER_ID` et `TELEGRAM_WEBHOOK_SECRET` ; aucun nouveau webhook n’est enregistré. Dans un chat privé, l’identifiant utilisateur peut reprendre celui du chat ; un groupe exige un administrateur explicitement configuré. Les boutons `igv:` suivent un chemin distinct des validations d’incidents. Le secret du webhook, le chat et l’utilisateur sont vérifiés avant toute décision.

Le texte du commentaire et les métriques sont des observations soumises par le Studio, pas une attestation cryptographique de Meta. Telegram le signale et renvoie vers la publication pour contrôle. Un commentaire long devient un extrait explicite dans Telegram ; la réponse reste intégrale, en texte brut sans interprétation de balisage. L’instantané complet reste en base privée. Le token aléatoire de décision est uniquement stocké sous forme SHA-256 et expire après 24 heures. La décision atomique est liée au chat et, une fois connu, au message Telegram ; elle ne peut être rejouée ni modifier le texte soumis.

Une empreinte unique du contenu bloque les doubles clics et requêtes simultanées. Un délai réseau ou une perte de l’accusé de réception produit `delivery_unknown` ; un arrêt avant cet enregistrement peut laisser `delivering`. **Ne pas renvoyer automatiquement** : le message peut déjà être arrivé. Vérifier Telegram et actualiser le suivi. Un bouton reçu peut encore enregistrer la décision autorisée même si l’accusé d’envoi a été perdu. Une même proposition expirée/refusée n’est pas renvoyée : préparer une proposition révisée. Aucune clé de validation ni identifiant du chat n’est retourné au navigateur.

Référence : [Telegram Bot API — sendMessage et InlineKeyboardButton](https://core.telegram.org/bots/api), vérifiée le 20 octobre 2026.

## Mesures et couverture

- Taux public par publication : `(J’aime + commentaires) / abonnés relevés × 100`. Les abonnés sont ceux du relevé, pas ceux de la date de publication. Ce taux ne mesure pas l’engagement par portée.
- Un compteur masqué, absent ou invalide produit une valeur indisponible. Un zéro réellement reçu reste zéro. Les taux ne sont pas limités artificiellement à 100 %.
- Taux d’un compte : médiane des publications locales mesurables reçues dans la période ; le nombre effectivement mesuré est affiché.
- Commentaires : classement par J’aime, sans inventer un taux puisque le nombre de vues du commentaire n’est pas fourni.
- Un maximum de 25 publications par source est reçu. Le module ne revendique jamais « les meilleurs de tout Instagram ». Les publications sont dédupliquées par identifiant, en préférant les données de compte aux métadonnées limitées des hashtags. Les pages supplémentaires disponibles sont signalées.
- Les hashtags ne fournissent pas le pseudo de l’auteur. Les publications obtenues uniquement par hashtag ont donc un auteur et un taux indisponibles, même si les compteurs d’interactions sont présents.
- Les indices Genève/restauration/sorties viennent des légendes, des profils ou d’un hashtag local. Ils ne remplacent pas la vérification du lieu et de la pertinence. Les publications périmées, futures, sans date exploitable ou sans URL Instagram valide sont exclues.
- Les commentaires TOK sont paginés par lots de 50, dédupliqués et limités à 500 dans l’écran. Les commentaires externes saisis manuellement ne sont pas des données collectées par l’API.

## Accès et limites Meta

La connexion de publication déjà enregistrée ne prouve pas que la découverte et la lecture des commentaires sont autorisées. Les fonctionnalités dépendent notamment des permissions `instagram_basic`, `pages_read_engagement`, `instagram_manage_comments` et des accès publics approuvés par Meta pour l’application. Vérifier les permissions effectivement accordées dans l’application Meta avant la recette réelle. Le module ne modifie pas ces permissions et ne remplace pas les secrets.

Meta limite la recherche à 30 hashtags uniques sur sept jours par compte professionnel. La limite est appliquée par Meta, commune à toutes les applications concernées. Une erreur d’accès ou de quota devient un avertissement de source ; les résultats des autres sources sont conservés. Les comptes personnels et privés ne sont pas rendus accessibles par ce module.

L’API de modération est destinée aux commentaires des médias du compte professionnel connecté. Le serveur vérifie le lien Page/compte Instagram, puis l’identité du propriétaire du média avant toute lecture de commentaires. Les commentaires des publications tierces et les réponses externes passent par l’interface Instagram. Les liens placés dans un commentaire peuvent ne pas être cliquables.

Références officielles vérifiées le 20 octobre 2026 :

- [Meta — API Instagram avec Facebook Login](https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login).
- [Meta — Business Discovery](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery).
- [Meta — Hashtag Top Media](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-hashtag/top-media).
- [Meta — IG Comment](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment).

## Sécurité et exploitation

Le navigateur appelle le BFF existant avec session isolée et CSRF. Le BFF revalide l’administrateur et consomme un quota atomique partagé entre administrateurs du même compte. L’orchestrateur exige une authentification de service et un administrateur délégué revalidé ; un jeton utilisateur ou le secret scheduler seul ne suffit pas.

Le transport n’émet que des GET sur `graph.facebook.com`, avec les secrets dans les en-têtes et une preuve HMAC. Les redirections sont refusées. Les réponses sont limitées à 400 Ko par requête, les lectures à 15 appels et 45 secondes par recherche, chaque requête à huit secondes maximum. Aucun `paging.next` fourni par Meta n’est suivi : seul un curseur opaque validé peut être transmis sur le chemin reconstruit d’un média appartenant à TOK.

Les entrées et les champs retournés sont bornés ; seuls les liens HTTPS natifs de publications/reels sans identifiants ni paramètres sont rendus. Les erreurs publiques et audits contiennent des codes ou nombres, jamais les secrets ou le corps d’une erreur fournisseur. Les pseudos des destinataires ne sont pas placés dans les paramètres UTM. Les propositions sont déterministes, modifiables et sans coût de génération IA.

## Livraison et retour arrière

Risque **niveau 3** : interface administrateur, BFF, webhook et conservation de décisions. Livrer la migration additive `20261020153214_marketing_instagram_telegram_reviews.sql`, puis `ops-incident-control`, l’orchestrateur et le frontend via le processus habituel après fusion autorisée et contrôles CI. La table a RLS, aucun privilège `anon`/`authenticated`, et des écritures de service uniquement ; un trigger interdit la modification de l’instantané et des décisions finales. Aucun secret ni configuration de déploiement n’est modifié.

La branche seule n’active pas la fonction en production. La recette réelle doit vérifier un compte professionnel local, un hashtag, les compteurs visibles, un compteur masqué, une permission insuffisante, les commentaires d’un média TOK et une réponse externe manuelle. Ne pas confondre les tests avec réponses contrôlées et une validation réelle des permissions Meta.

Recette Telegram : sélectionner un vrai commentaire, vérifier l’auteur et le texte, envoyer une fois et constater le message reçu, valider/refuser depuis le compte configuré, puis actualiser le Studio. Vérifier également un double clic, un mauvais utilisateur, une expiration et une interruption réseau. Les tests simulés ne prouvent pas un envoi réel au bot.

Retour arrière : revert du commit et redéploiement des fonctions/frontend précédents. Conserver la table et l’historique, sans migration destructive. Les anciens boutons deviennent inactifs avec l’ancien webhook ; ne pas publier les propositions non validées. Aucune réponse Instagram n’est envoyée par la validation Telegram.

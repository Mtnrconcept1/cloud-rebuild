# Mailings ciblés TOK

## Parcours

Depuis **Campagnes → Créer un mailing ou une campagne IA**, la carte **Mailing ciblé** prépare une séquence de 1 à 12 brouillons à relire. Deux sources de destinataires sont possibles : les filtres des restaurants prospects et leads, ou une liste exclusive d’adresses saisies/importées.

1. Décrire la cible, le nombre de messages, le rythme et les bénéfices à présenter. Le bouton **Interpréter le brief** préremplit les filtres et la cadence ; les choix manuels restent prioritaires.
2. Cocher les cantons, villes, communes, codes postaux, cuisines/catégories, types d’établissement, tailles d’entreprise, langues, sources et statuts des contacts. Chaque rubrique propose **Tous**, une recherche et une pagination. Plusieurs valeurs d’une rubrique sont combinées par OU ; les rubriques sont combinées par ET.
3. Vérifier les destinataires, choisir le premier envoi en heure de Genève et entre 1 et 12 messages. Le rythme peut être quotidien, tous les deux jours, deux fois par semaine, hebdomadaire ou toutes les deux semaines.
4. Choisir explicitement **Image générée** ou **Import manuel**, puis générer la séquence. Chaque message possède un objet, un titre, un corps complet et un appel à l’action. En mode généré, une bannière native TOK 16:9 commune est produite avec les références de marque existantes. En mode manuel, seuls les textes sont générés ; chaque message attend ensuite son image propre.
5. Relire chaque e-mail dans son template, vérifier la bannière et les dates, puis utiliser les validations de campagne et de calendrier existantes. La génération et l’interprétation ne donnent aucune approbation et n’envoient aucun e-mail.

Exemple : « Campagne mailing de 4 mails sur un mois, un par semaine, visant les pizzerias de Genève. Promouvoir le zéro attente, les ventes flash, le marketing studio et le plan de table automatisé. » La séquence comporte quatre dates espacées d’une semaine, à heure locale constante, y compris lors du changement d’heure.

## Destinataires saisis ou importés

L’autre parcours accepte des adresses saisies/collées ou un fichier **CSV, XLS ou XLSX**. Le résultat est présenté avant ajout : adresses valides, doublons, entrées invalides. Écarter des entrées invalides exige une action explicite de l’opérateur. Une colonne d’e-mail reconnue ou un fichier d’une seule colonne sans en-tête peut être utilisé ; une importation ambiguë est refusée. Les formules Excel, même avec un résultat mis en cache, ne sont jamais importées comme des coordonnées. Les éléments masqués sont ignorés avec un avertissement.

Limites : **500 adresses distinctes**, **2 Mio** par fichier, 5 000 lignes/candidats, 50 colonnes et cinq feuilles. Les CSV acceptent les séparateurs usuels, les guillemets et les encodages courants. Les XLS/XLSX sont contrôlés par leur véritable signature. Pour XLSX, le nombre d’entrées ZIP est borné et le contenu est décompressé sous contrôle avant lecture, avec un maximum cumulé de 20 Mio. Le lecteur Excel est chargé à la demande.

Les adresses sont normalisées en minuscules et dédupliquées ; elles doivent respecter la syntaxe ASCII, 254 caractères au total, 64 pour la partie locale et 63 pour chaque segment du domaine. Le bouton **Enregistrer et vérifier les destinataires** crée uniquement les contacts absents. Les identités existantes, leurs qualifications, préférences et oppositions restent inchangées. Les nouveaux contacts sont de type manuel, source mailing_import, avec lawful_basis=none : **importer une adresse ne vaut pas consentement** et ne rend pas automatiquement le contact éligible à l’envoi.

Cette liste est la cible complète et exclusive de la campagne ; elle ne se combine pas avec les filtres de restaurants. Une liste vide ou invalide est refusée et n’est jamais transformée en « Tous ». Le serveur impose la cible exacte à la campagne et à chacun de ses e-mails, jusqu’à la matérialisation des envois. Toute modification de la liste invalide son estimation. Un import en cours ou non confirmé empêche de générer avec une cible ambiguë.

Les brouillons peuvent être préparés lorsque les contacts existent mais ne sont pas encore éligibles ou que la connexion e-mail manque. L’approbation et l’envoi conservent leurs propres gardes.

## Images indépendantes et template

**Image générée** conserve une bannière commune par campagne. Une panne du fournisseur conserve les textes, signale l’image manquante et empêche l’approbation des messages incomplets. Les anciens appels API qui omettent imageMode conservent ce comportement.

**Import manuel** n’appelle ni l’allocateur ni le fournisseur d’images, pour une campagne de un à douze e-mails. Les textes sont produits puis chaque e-mail reçoit sa propre image depuis les résultats de génération ou la galerie de campagne. Changer l’image d’un message ne modifie pas les autres. Les erreurs conservent les textes et l’image précédente.

Les imports acceptent **JPEG/PNG jusqu’à 3 Mio**, avec un maximum de 8 192 pixels par côté et 16 777 216 pixels au total. Le navigateur vérifie le décodage ; le serveur contrôle les octets réels, le format et les dimensions. Les JPEG sont réellement décodés en mode strict avec une mémoire bornée. Les PNG sont contrôlés par structure, CRC et raster décompressé borné ; les fichiers animés ou corrompus sont refusés. Les octets validés sont conservés sans recadrage ni redimensionnement.

Le composant suit chaque upload indépendamment, vérifie la réponse et utilise la version exacte updated_at du mail. L’upload est refusé en lecture seule, après approbation de l’e-mail ou de sa campagne, ou dans un état terminé/incompatible. Les actions qui pourraient perdre un upload en cours ou approuver un état intermédiaire sont bloquées.

Le logo utilise **public/marketing/email/tok-logo.jpg**, optimisé à 320 × 320 pixels à partir de la troisième pièce fournie. Le damier fait partie du JPEG d’origine et ne constitue pas une transparence. Le pied de mail présente une bannière promotionnelle orange inspirée de la quatrième référence, avec **public/marketing/email/restaurant-promotion.png**, dérivé de chef3.png à proportions conservées. Le bouton **Mettre mon restaurant en avant** ouvre https://www.thetok.ch/dashboard/campagnes ; le lien éditorial vers https://www.thetok.ch/packs-restaurateur reste distinct. Le texte brut comprend aussi le lien de promotion.

L’aperçu et l’envoi utilisent le même HTML, une largeur maximale de 600 pixels, des styles compatibles e-mail et des images fluides.

## Sémantique et limites des données

- Une rubrique absente de `selections` signifie Tous, y compris les contacts dont le champ est inconnu. Une liste vide signifie personne ; le formulaire refuse de générer dans cet état.
- Le serveur impose les sélections relues et le calendrier au résultat de l’IA. Les critères suggérés par le modèle ne remplacent pas ceux de la demande.
- Les choix viennent des données réellement présentes. Les cuisines séparées par `;` sont proposées individuellement. Une catégorie générale « Restaurant » ou « Italien » n’est jamais supposée être « Pizzeria ».
- L’interprétation reçoit au maximum 200 valeurs par rubrique. Une valeur non disponible ou un critère non pris en charge doit être signalé ; l’opérateur peut chercher et sélectionner manuellement une valeur au-delà de cette première page. Les avertissements exigent une vérification explicite avant génération.
- Les listes de sélection acceptent au maximum 100 valeurs par rubrique. Les facettes affichent des comptes globaux de restaurants, sans coordonnées individuelles ; le bouton de vérification calcule l’intersection réelle.
- L’éligibilité e-mail est revérifiée lors de l’envoi avec les oppositions, autorisations, plafonds et intégrations existants. Une connexion e-mail indisponible n’empêche pas de préparer des brouillons.
- Les coûts de texte et d’image passent par les fournisseurs IA existants. Aucun nouvel abonnement ou secret n’est introduit.

## Contrôles techniques

Le BFF conserve la session HttpOnly, le contrôle CSRF et la vérification du rôle administrateur courant. L’interprétation utilise le quota persistant existant avec un compartiment dédié. La fonction de facettes est réservée à `service_role` et vérifie aussi le rôle de la requête ; aucun accès direct `anon` ou `authenticated` n’est accordé.

Les nouvelles actions prepare_mailing_recipients et upload_mailing_image utilisent le BFF /api/marketing/agent ; aucun accès privilégié au stockage n’est exposé au navigateur. L’objet est enregistré sous un chemin choisi par le serveur, unique par tentative, acteur et e-mail. Le quota d’upload est appliqué par acteur et par e-mail pour permettre douze imports dans une campagne de douze messages. Le corps Base64 possède une limite dédiée sans élargir les autres actions du BFF.

L’attachement passe par une RPC dédiée : verrou de campagne puis verrou d’e-mail, contrôle de version avec microsecondes, état, approbation, dimensions et chemin d’objet. Seules les propriétés d’image sont mises à jour ; le texte, le ciblage, la date et les statuts ne sont pas acceptés par cet appel. Les révisions et l’audit existants restent actifs. Un refus définitif nettoie seulement le nouvel objet ; une réponse serveur ambiguë le conserve pour éviter de casser un attachement éventuellement enregistré.

Les nouvelles fonctions privées n’accordent pas d’exécution directe aux rôles PUBLIC, anon, authenticated ou service_role. Les mutations passent par le dispatcher existant avec preuve CSRF obligatoire et arguments limités. Le ciblage est réimposé au résultat de l’IA avant persistance ; le modèle reçoit le nombre de destinataires, sans recevoir automatiquement leurs adresses. Les définitions d’audience sont expurgées de l’audit générique.

Pour une liste explicite, les identités sont résolues une fois à partir de l’index e-mail. L’estimation, l’approbation et la matérialisation parcourent cette sélection bornée en conservant tous les contrôles existants : rôle, opposition, qualification, plafonds, horaires et idempotence. L’adresse actuelle du contact doit toujours appartenir à la liste au moment de la sélection.

La migration étend le validateur et le moteur de filtres sans modifier les sélecteurs scalaires historiques. Un trigger refuse l’approbation ou la planification d’un nouveau mailing sans texte complet et bannière HTTPS prête. Le BFF applique également ce contrôle. Le worker utilise le même moteur HTML que l’aperçu, avec désabonnement signé personnalisé et idempotence Resend existante. Le contenu et les URL sont échappés ; l’aperçu utilise une iframe sandboxée.

La migration ajoute `content` à la réponse de `service_prepare_marketing_email_delivery` en conservant sa définition existante. Elle échoue si le point d’insertion attendu manque ou est ambigu, afin de ne pas remplacer silencieusement des contrôles d’envoi divergents.

## Validation reproductible

Exécuter avec `pnpm@10.28.1` :

```sh
pnpm exec vitest run src/test/marketing-*.test.ts src/test/marketing-*.test.tsx --reporter=dot
pnpm lint
pnpm typecheck
pnpm build
pnpm generate:error-code-map
pnpm docs:application-index
pnpm docs:application-index:check
```

Les tests couvrent notamment les combinaisons Tous/cuisine/ville, le comptage périmé, le mode lecture seule, les pannes de facettes, la configuration e-mail manquante, le changement d’heure, l’unique génération de bannière, les destinataires imposés côté serveur, la session/CSRF, le template et le refus d’approbation incomplet.

Les nouveaux tests couvrent aussi les deux modes d’image, l’absence d’appel au fournisseur en mode manuel, la cible exacte du bundle final, l’import CSV/XLS/XLSX réel, les bornes ZIP, le décodage d’images, les conflits de version, l’état des composants et la sauvegarde indépendante des images.

Pour les assertions SQL, utiliser exclusivement une **base PostgreSQL jetable et vide**, jamais le projet Supabase partagé. La fixture est minimale ; elle ne reproduit pas les règles d’éligibilité historiques, couvertes séparément par les tests marketing existants.

```sh
psql "$MAILING_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/marketing_targeted_mailing_fixture.sql \
  -f supabase/migrations/20261018171046_marketing_targeted_mailing.sql \
  -f supabase/migrations/20261018171046_marketing_targeted_mailing.sql \
  -f supabase/tests/marketing_targeted_mailing.sql
```

Cette séquence a aussi été exécutée dans une base PGlite isolée : application deux fois de la migration, filtres ET/OU, tableaux vides, compatibilité scalaire, catégories multiples, pagination, permissions et refus d’approbation sans bannière.

Pour les deux nouvelles migrations, le script suivant assemble les définitions historiques réelles nécessaires, applique chaque migration deux fois puis lance les deux suites SQL. Utiliser une base vide et jetable. Aucun fournisseur d’envoi n’est appelé.

```sh
node scripts/marketing-mailing-sql-fixture.mjs > /tmp/marketing-mailing-fixture.sql
psql "$MAILING_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/marketing-mailing-fixture.sql
```

Cette fixture vérifie la cible exacte, l’idempotence de l’import, les permissions, CSRF, les oppositions, le maintien du texte, les révisions et le refus après approbation. Elle inclut les gardes d’éligibilité réels nécessaires sans reproduire un bootstrap Supabase complet. Les tests de matérialisation tiennent compte du créneau d’envoi lorsqu’ils sont exécutés dans PGlite.

## Mise en service et retour arrière

Après validation de la PR, l’ordre prévu est : migration Supabase, Edge Functions `ai-marketing-agent` et `marketing-orchestrator`, puis BFF/frontend via le workflow de production existant. Ne pas créer de preview Vercel ni réactiver les déploiements Git automatiques.

La mise en service ajoute **20261018210000_marketing_mailing_recipients.sql** et **20261018210100_marketing_mailing_image_upload.sql**, après la migration de ciblage déjà existante. Les dépendances supplémentaires sont jpeg-js 0.4.4 et SheetJS 0.20.3 distribué par le CDN officiel. Aucun secret ni fichier de configuration de déploiement n’est modifié.

`MARKETING_SENDER_ADDRESS` est une option serveur du worker pour préciser l’adresse d’expédition affichée ; le rendu utilise « Genève, Suisse » par défaut. Les autres clés IA, Resend et de signature restent celles du système existant.

Lors de l’inspection antérieure en lecture seule du 18 octobre 2026, l’intégration Resend du projet TOK était marquée `blocked_configuration`, sans `last_error`, avec un dernier contrôle enregistré au 1er août 2026. Cet état n’est pas une nouvelle vérification de production. La connexion et le domaine d’envoi doivent être vérifiés dans les intégrations avant tout essai réel. Aucune migration de production, génération payante ou expédition réelle n’a été effectuée pour cette PR. Les tests de rendu sont automatisés ; l’accès navigateur disponible n’a pas permis la recette visuelle authentifiée. Celle-ci et un essai contrôlé de réception restent à faire après mise en service.

En cas de retour arrière, suspendre d’abord les nouvelles campagnes mailing et leurs éléments, puis revenir au code précédent. Conserver le support SQL des filtres, de recipient_emails et les gardes d’approbation tant que des brouillons ou éléments en file les utilisent ; supprimer ces contrôles pourrait élargir une audience ou permettre l’envoi d’un contenu incomplet. Conserver les contacts importés et les images déjà référencées ; aucune suppression de données n’est nécessaire.

# Studio vidéo marketing TOK

## Périmètre et contrat

Le studio Marketing expose les réglages créatifs et techniques ci-dessous. Il utilise le modèle public Higgsfield `bytedance/seedance-2.5/reference-to-video`. Le choix d’un format créatif devient une direction de réalisation TOK transmise avec les images sélectionnées ; ce n’est pas l’exécution d’un template propriétaire Marketing Studio.

| Réglage | Comportement TOK |
| --- | --- |
| Format créatif | 26 directions inspirées du catalogue Marketing Studio audité, plus une direction libre. |
| Produit / plat / expérience | Description facultative, limitée à 5 000 caractères. |
| Accroche et décor | Deux champs de 500 caractères ; les consignes restent liées aux sujets et lieux des photos. |
| Images | Une à six photos ordonnées du restaurant, avec un logo séparé facultatif. |
| Rôles des photos | Produit principal, présentateur, référence d’ouverture, référence de fin. Chaque rôle doit désigner une photo sélectionnée. |
| Présentateur | Personne déjà visible dans la photo choisie. Aucun avatar de catalogue n’est créé ou importé implicitement. |
| Appel à l’action | Texte exact à afficher, facultatif, 160 caractères maximum. |
| Son | Silence, ambiance sans voix, ou voix off avec script explicite. |
| Voix off | Français, anglais, allemand ou italien ; script de 1 000 caractères maximum, écrit dans la langue choisie. Aucune traduction automatique. |
| Durée | Tous les entiers de 4 à 30 secondes. |
| Résolution | 480p, 720p, 1080p. |
| Ratio | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9. |
| Fichier | MP4 ou MOV, débit standard ou renforcé. |

Les images d’ouverture et de fin guident le prompt ; elles ne sont pas des keyframes garantis par cette API. Le CTA et la voix demandés restent soumis au rendu du modèle : l’utilisateur doit vérifier le résultat, notamment son texte, son identité visuelle et ses détails.

Le mode **Reel fidèle** reste disponible. Son export local est un MP4 H.264 de 10 secondes, 720 × 1280, 300 images à 30 fps. Il utilise les fichiers choisis et n’invente ni scène ni voix.

Dans **Actualité**, Reel fidèle reste le mode initial. Une animation IA destinée au brouillon conserve les contraintes 10 s / 720p / 9:16 / MP4. Les autres sorties marketing restent consultables et téléchargeables, sans ajout incompatible au brouillon ni publication automatique.

### Écarts explicites avec Marketing Studio natif

Cette intégration ne comprend pas Product Link, Ad Reference, les vidéos ou pistes audio fournies comme références, le catalogue d’avatars du compte Higgsfield, la bibliothèque complète de templates propriétaires, ni une commande groupée de 1 à 4 variantes. Le quota TOK existant reste de trois générations non échouées sur 24 heures, avec une seule génération active par restaurant.

Aucun endpoint public natif Marketing Studio Video permettant de reproduire ces fonctions n’a été vérifié pour le backend TOK. Ne pas envoyer les identifiants privés de templates/avatars aux endpoints Seedance ni présenter cette intégration comme une parité intégrale avec le produit web Higgsfield.

Sources officielles consultées le 5 novembre 2026 :

- [API Seedance 2.5 reference-to-video](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference)
- [Tarification et formule de tokens](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground)
- [Parcours Marketing Studio](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-marketing-studio-to-create-video-ads)
- [Outils et workflow créatif](https://higgsfield.ai/enterprise-help-center/platform/tools-creative-workflow)
- [Statut d’une requête et résultat vidéo](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status)

## Validation et crédits

Le contrat partagé est dans `supabase/functions/_shared/higgsfield-marketing-settings.ts`. Les requêtes marketing sont normalisées, contrôlées et enregistrées dans `request_options.version = 2`. Les requêtes historiques sans objet `marketing` conservent leur contrat et leur tarification.

Le backend vérifie le restaurant, les rôles autorisés, les références, le bucket, le chemin et le type de média. Les rôles produit/présentateur/ouverture/fin doivent appartenir aux photos sélectionnées, et `generateAudio` doit correspondre au mode sonore. Les RPC de réservation restent exécutables uniquement par `service_role` ; le navigateur ne peut pas choisir librement un débit.

Le devis utilise la formule de tokens publiée, 24 images par seconde, un taux de 0,0214 USD/1 000 tokens en 480p/720p ou 0,0234 USD/1 000 tokens en 1080p, et les conversions TOK existantes. Le petit côté correspond à la résolution et le grand côté est arrondi au multiple supérieur de 16. Cette géométrie est une **estimation du coût fournisseur**, pas une garantie de sa facture réelle.

Le nombre de crédits TOK affiché puis confirmé est recalculé indépendamment en SQL avant réservation. Le plafond de l’ensemble proposé est de 4 043 crédits, pour 30 secondes en 1080p / 21:9. Le snapshot complet des réglages est protégé par l’idempotence ; modifier un paramètre avec la même clé provoque un conflit. Les crédits ne sont réservés qu’à la confirmation de génération, pas à l’obtention du devis.

Les brouillons sont stockés par restaurant sur l’appareil. Ils conservent les champs inachevés, mais pas le devis ni la confirmation de débit. Toute modification du brief, des références ou des paramètres invalide le devis. Le changement de restaurant remonte un panneau isolé et ignore les réponses asynchrones de l’ancien contexte.

## Suivi, archivage et remboursement

L’identifiant de requête fournisseur est conservé avant les étapes suivantes. Une reprise consulte cet identifiant sans soumettre une nouvelle vidéo. Le réconciliateur existant dans cette livraison traite au plus deux jobs par passage et ne relance pas une demande payante ambiguë.

Un refus fournisseur confirmé restitue les crédits une seule fois, y compris ceux issus d’une attribution offerte. Un état ambigu sans identifiant fournisseur reste en vérification ; il ne déclenche ni seconde génération ni remboursement automatique non justifié.

L’archive conserve le format demandé : `.mp4` / `video/mp4` ou `.mov` / `video/quicktime`. Le téléchargement serveur refuse les redirections, contrôle l’hôte et arrête la lecture au-delà de 100 Mo réels, même sans `Content-Length`. Le contrôle de conteneur rejette les réponses HTML/JSON et les formats incohérents ; il ne remplace pas un décodage complet. L’ajout à Actualité applique en plus le contrôle réel du MP4, de la durée, des dimensions et de la limite de 25 Mo.

## Vérifications reproductibles

Utiliser Node 22 et pnpm 10.28.1, avec les dépendances du lockfile. Les tests ne nécessitent pas de clé Higgsfield.

```sh
pnpm exec vitest run \
  src/test/higgsfield-marketing-settings.test.ts \
  src/test/higgsfield-video-studio.test.ts \
  src/test/higgsfield-video-download.test.ts \
  src/test/higgsfield-video-submission.test.ts \
  src/test/tok-video-ai-panel.test.tsx \
  src/test/tok-video-marketing-ui.test.tsx \
  src/test/tok-video-image-upload-ui.test.tsx \
  src/test/tok-video-image-upload.test.ts \
  src/test/restaurant-reel-plan.test.ts \
  src/test/restaurant-reel-renderer.test.ts \
  src/test/social-video-compression.test.ts
pnpm lint
pnpm typecheck
pnpm build
pnpm docs:application-index:check
```

Pour compiler sans accès à la production, utiliser les variables publiques factices prévues par `.github/workflows/_validation.yml`. Le workflow de livraison injecte ses propres variables validées.

Le harness `node scripts/security/test-video-gift-refunds.mjs --pglite` accepte `TOK_PGLITE_MODULE` pour désigner une installation locale de PGlite. Il utilise les triggers natifs de crédits, applique et rejoue les migrations, puis vérifie les 486 combinaisons durée/résolution/ratio calculées par le vrai code TypeScript et recalculées par PostgreSQL. Il vérifie aussi les restitutions uniques, conflits de contrat, références d’un autre restaurant, droits, états terminaux et compatibilité historique. PGlite ne prouve pas les courses entre deux sessions PostgreSQL indépendantes ; un mode `--postgres` existe pour une base jetable explicitement limitée à loopback.

Le test `CHROME_BIN=/chemin/vers/chromium REEL_TEST_FFMPEG=true node scripts/test-restaurant-reel.mjs` produit et décode un vrai export fidèle, le contrôle avec ffprobe, rejette quatre fichiers non conformes, puis vérifie le studio et le dialogue Actualité à plusieurs largeurs. Le parcours marketing vérifie la conservation des réglages, leur transmission complète et l’invalidation du devis. Les réponses de génération y sont **synthétiques** ; aucun appel fournisseur ni débit réel n’est effectué.

## Livraison et retour arrière

Niveau de risque **3** : réservation de crédits, Edge Function, SQL et Storage. Publier par PR avec les contrôles obligatoires verts sur le dernier SHA. Suivre le workflow existant `deploy-production.yml`, sans activer de preview Vercel ou modifier les secrets.

L’ordre nécessaire est : migrations SQL, Edge Function `ai-video-studio`, puis frontend. Cette livraison dépend des migrations nouvelles suivantes, dans cet ordre :

1. `20261105153000_tok_brand_video_references.sql`
2. `20261105203000_tok_video_gift_refunds.sql`
3. `20261105213000_tok_video_background_reconciliation.sql`
4. `20261105223000_tok_video_marketing_settings.sql`

Après déploiement autorisé, vérifier sur une session restaurateur authentifiée le devis, la confirmation, une génération réelle, son statut jusqu’à `completed`, son archive, son débit unique et sa lecture. La réussite historique d’un job 5 secondes ne valide pas le nouveau contrat multiréférence/marketing. Vérifier également le fonctionnement du réconciliateur lorsque le navigateur est fermé. Ces contrôles fournisseur ne sont pas remplacés par les fixtures locales.

Pour un retour arrière, revenir d’abord au frontend précédent afin de cesser la création de nouveaux contrats v2. Garder un backend capable de traiter les jobs v2 déjà réservés jusqu’à leur état terminal ; une ancienne Edge Function ignorant MOV ou les nouveaux paramètres ne doit pas les reprendre. Conserver les colonnes, contraintes élargies, RPC compatibles, restitutions et historiques. Si une correction SQL est nécessaire, créer une nouvelle migration ; ne pas supprimer de jobs ni restreindre les contraintes tant que des données ou jobs v2 subsistent.

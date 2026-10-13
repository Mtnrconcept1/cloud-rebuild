# Références visuelles des campagnes TOK

Profil `tok-v1-20261011`, basé sur les quatre affiches fournies par le propriétaire le 11 octobre 2026. Périmètre : campagnes TOK dans marketing.thetok.ch (`ai-marketing-agent`). Le studio des restaurants conserve leur propre identité et leurs médias autorisés.

## Invariants et variations

- Logo principal : disque orange, contour blanc, lettres TOK blanches, toque blanche, moustache noire. Référence principale : Genève. Le modèle doit conserver proportions et orthographe.
- Chef : même personnage cartoon 3D, moustache noire recourbée, lunettes noires, toque/veste blanches, boutons noirs, foulard et ceinture rouges. Pose et cadrage peuvent varier.
- Couleurs : orange, noir, blanc/crème ; jaune doré pour les accents. Les nuances proviennent des images jointes, aucun code hexadécimal n'est présenté comme une spécification officielle.
- Titres : capitales sans empattement grasses et condensées. La police exacte n'a pas été fournie ; aucune identification de fonte n'est revendiquée.
- Composition : titre court, chef et bénéfice dominant, CTA lisible, marges. Restaurant ambré, Genève ou fond crème selon le sujet ; texture BD possible.
- Les prix, réductions, récompenses, QR codes, badges et interfaces des références ne constituent pas des faits autorisés pour une nouvelle campagne. Seul le brief courant apporte les faits.

## Contrat technique

Les quatre JPEG originaux sont versionnés dans `public/marketing/brand/tok-v1/` (environ 2,4 Mo au total). Aucun recadrage ni recompression n'altère le logo ou les lettres. Le manifeste partagé `marketing-brand.ts` expose leurs chemins et SHA-256, également utilisés par la galerie du Studio IA.

`marketing-visual.ts` charge uniquement les chemins fixes sur `https://www.thetok.ch`, sans authentification ni redirection, avec délai de 10 secondes et plafond de 2 Mo par fichier. Il vérifie chaque SHA-256 avant mise en cache mémoire. Un échec invalide le chargement ; la requête suivante peut réessayer.

Les quatre fichiers binaires sont joints en `image[]` au multipart `POST /v1/images/edits`, modèle existant `gpt-image-2`. Les références sont toujours haute fidélité pour ce modèle ; pas de paramètre `input_fidelity`. La sortie JPEG utilise le bucket natif le plus proche du format demandé (`1024x1024` pour 1:1, `1024x1536` pour 9:16, `1536x1024` pour 16:9) et conserve `1024x1280` par défaut pour les appels historiques sans format. Réponse bornée en taille, signature JPEG contrôlée avant stockage dans le bucket public existant `social-post-media`. L'API du helper conserve `timeoutMs` pour les budgets imposés par l'orchestrateur ; défaut/plafond 90 secondes.

En cas de référence absente, modifiée, trop grande, timeout, erreur fournisseur ou stockage, le helper retourne `null`. Il ne déclenche jamais une génération texte seule. Le plan reste un brouillon sans ce visuel selon le contrat existant. Les contenus qui possèdent une image enregistrent `visual_brand_profile` et `visual_reference_ids` ; les contenus sans image ne prétendent pas avoir utilisé le profil.

Les garde-fous d'accès admin, quotas, consentement, brouillon et approbation restent ceux de l'agent existant. Aucune migration ni modification de secret/RLS. Le coût affiché historiquement concerne le texte ; cette modification ne prétend pas calculer le coût des références ou images.

## Activation et limites

1. Publier le frontend contenant les quatre assets, puis vérifier leurs réponses HTTP et empreintes sur www.thetok.ch.
2. Intégrer les changements en conservant les correctifs de délais/concurrence de la PR #736, puis déployer `ai-marketing-agent`. Ne pas écraser la version de production depuis une ancienne base.
3. La PR #763 apporte l'aperçu des publications (texte + image). Cette PR ajoute la galerie de références et le conditionnement du moteur ; intégrer les deux pour l'expérience complète.
4. Créer un brouillon de test dans le Studio IA, vérifier le 4:5, les quatre références dans les métadonnées et relire logo, chef, orthographe, couleurs et prix avant approbation. Les tests automatisés du multipart ne remplacent pas ce contrôle de rendu réel.

L'édition avec références réduit la dérive mais ne garantit pas une reproduction vectorielle du logo ou une police identique au pixel. L'approbation humaine reste nécessaire. Une garantie typographique stricte demanderait les fichiers maîtres du logo, de la mascotte et la fonte licenciée, puis une composition déterministe séparée de la génération.

Les campagnes et images déjà générées ne sont pas modifiées rétroactivement. Aucun post déjà approuvé n'est régénéré ou republié par ce changement.

Rollback : revenir sur le commit, republier le frontend et l'Edge Function depuis leur version précédente compatible. Aucun rollback de base de données. Les images et brouillons existants conservent leurs URLs.

Documentation API consultée : https://developers.openai.com/api/reference/resources/images/methods/edit et https://developers.openai.com/api/docs/guides/image-prompting.

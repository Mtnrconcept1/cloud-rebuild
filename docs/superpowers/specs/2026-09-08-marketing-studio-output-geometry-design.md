# Marketing Studio Output Geometry Design

## Objectif

Le Studio Marketing doit produire deux familles de livrables clairement séparées :

1. **Impression Cloudprinter** — le fichier final respecte la géométrie réellement hydratée depuis Cloudprinter (`/products/info`), y compris le format à plat des produits pliés, le bleed, la marge de sécurité et une politique DPI adaptée au support.
2. **Digital TheTok / réseaux sociaux** — le visuel final est indépendant de Cloudprinter et exporté à une taille exacte correspondant à un usage digital choisi (9:16, 16:9, 4:3, 1:1, 4:5, 1.91:1, etc.).

Le modèle OpenAI continue d'être appelé uniquement avec ses trois buckets natifs supportés par TOK (`1024x1024`, `1024x1536`, `1536x1024`). Les ratios finaux sont obtenus par un post-traitement déterministe haute qualité ; le Studio ne doit jamais prétendre qu'OpenAI a généré nativement une taille arbitraire.

## Source de vérité Cloudprinter

Les dimensions d'impression ne doivent pas être codées en dur côté frontend. L'ordre d'autorité est :

1. détails de la référence Cloudprinter hydratés via `/products/info` ;
2. géométrie stockée dans `print_provider_products` ;
3. fallback explicite seulement si une propriété fournisseur manque et si le produit peut encore être préflighté sans ambiguïté.

La valeur de bleed `3 mm` est fréquente et observée sur les références déjà hydratées, mais elle n'est pas une constante métier globale. `bleed_mm` issu de Cloudprinter prévaut toujours.

Le parser doit accepter les libellés Cloudprinter réellement observés :

- `The exact width of the card in mm. after trimming`
- `The exact height of the card in mm. after trimming`
- variantes `item` / `product` équivalentes
- dimensions `after folding` pour le format fermé d'un produit plié
- `Bleed in mm`
- `The page safety margin in mm` quand présent
- `Number of printable sides`
- `Minimum order quantity`
- `Per set order quantity`
- orientation / technologie / options

Pour un produit plié, **la surface de création et le PDF utilisent le format après trimming (spread à plat)**. Les dimensions `after folding` sont conservées comme information d'affichage et de contrôle, mais ne remplacent jamais le format à plat.

## Politique DPI et rasterisation

Le fichier raster préparé avant export PDF doit avoir exactement :

`ceil((dimension_finie_mm + 2 * bleed_mm) / 25.4 * dpi_cible)`

La politique par famille est :

- carte de visite, flyer, menu, dépliant, carte/postcard/sticker : **300 DPI** ;
- affiche, grand format, calendrier, bannière / support observé à distance : **150 DPI** ;
- si un produit futur ne correspond à aucune famille connue, 300 DPI est le fallback conservateur tant que l'Admin ne lui attribue pas une politique explicite.

Le facteur d'agrandissement est calculé **après le crop `cover` nécessaire pour atteindre le ratio final**, pas seulement à partir des dimensions brutes du bucket OpenAI.

Politique de qualité :

- `factor <= 1.0` : aucun upscale, downscale/crop uniquement ;
- `1.0 < factor <= 2.5` : upscale haute qualité autorisé avec avertissement visible dans le Studio et le BAT ;
- `factor > 2.5` : blocage du fichier Print ; choisir un autre visuel ou une autre stratégie de génération.

La table fournie par le produit sert de jeu de référence : cartes de visite sans upscale ; menus A6/A5/DL/A4 et dépliants dans la zone contrôlée jusqu'à environ x2.5 ; calendriers/affiches à 150 DPI. Le calcul runtime reste toutefois dérivé de la géométrie Cloudprinter réelle.

## Sorties digitales

Les formats digitaux sont statiques, provider-agnostic et ne doivent jamais dépendre de la disponibilité de Cloudprinter.

Presets initiaux :

| Cible | Pixels finaux | Ratio | Bucket OpenAI |
| --- | ---: | ---: | --- |
| TheTok Hero / écran large | 1600×900 | 16:9 | landscape |
| TheTok carte éditoriale | 1200×900 | 4:3 | landscape |
| TheTok carré | 1200×1200 | 1:1 | square |
| Story / Reel / TikTok | 1080×1920 | 9:16 | portrait |
| Feed vertical | 1080×1350 | 4:5 | portrait |
| Feed carré | 1080×1080 | 1:1 | square |
| Social horizontal | 1600×900 | 16:9 | landscape |
| LinkedIn / partage URL | 1200×627 | 1.91:1 | landscape |
| YouTube miniature | 1280×720 | 16:9 | landscape |

Ces presets couvrent les usages demandés et pourront évoluer sans toucher au domaine Print. Le ratio, la taille finale et la plateforme sont affichés avant génération.

## Architecture

### `src/lib/marketing/outputGeometry.ts`

Module pur et testable :

- définit les presets digitaux ;
- transforme un `PrintCatalogProduct` / `PrintProductSpec` hydraté en cible Print ;
- calcule les pixels finaux, crop `cover`, DPI source effectif et upscale ;
- sélectionne le bucket OpenAI le plus proche par orientation ;
- conserve format à plat + format fermé pour les produits pliés.

Aucun appel réseau, aucun accès Storage et aucune référence secrète Cloudprinter dans ce module.

### `src/lib/marketing/imageOutput.ts`

Post-traitement navigateur :

- charge l'image générée ;
- calcule le crop `cover` via le module de géométrie ;
- dessine un canvas à la taille exacte ;
- active le smoothing haute qualité ;
- produit un Blob PNG/JPEG exact ;
- protège la mémoire avec une limite de surface en pixels ;
- permet le téléchargement digital et la préparation Print.

### `TokAiMarketingStudioPrintShell`

Le shell Print charge le catalogue via `getPrintCatalog` et transforme les variantes actives en cibles Print. Il passe uniquement des données provider-agnostic au Studio. Le Studio ne doit jamais appeler Cloudprinter directement.

### `TokAiMarketingStudio`

Le Studio expose un choix explicite :

- **TheTok / réseaux sociaux**
- **Impression Cloudprinter**

Puis un sélecteur de cible exacte. Le prompt indique format final, ratio et dimensions. L'appel OpenAI utilise le bucket natif, puis l'aperçu/export exact est produit localement.

En mode Print, le bouton doit expliquer DPI cible, bleed, dimensions à plat, pixels finaux et facteur d'upscale attendu. Les produits Print non hydratés ou géométriquement invalides ne sont pas proposés comme prêts à imprimer.

### `PrintComposerDialog`

Avant `createPrintExport`, le composant rasterise l'asset sélectionné exactement aux pixels de la variante Cloudprinter choisie, puis utilise ce raster préparé comme fond du `MarketingPrintDocument`. Le préflight serveur voit donc la vraie résolution cible. Le document conserve les métadonnées de préparation (source, cible, DPI, facteur d'upscale) pour audit/BAT.

## Compatibilité des mappings fournisseur

L'activation/mapping Cloudprinter reste sous contrôle Admin. Ce chantier **ne mappe ni n'active automatiquement** des références fournisseur.

Une variante active doit être exclue du catalogue restaurateur si sa géométrie ne peut pas être hydratée. Une incohérence manifeste entre le produit logique et la référence fournisseur doit être remontée à l'Admin plutôt que silencieusement utilisée.

Cas production observé à corriger par garde-fou : un produit logique `flyer-a4` pointe actuellement vers une référence Cloudprinter pliée dont le spread est 297×420 mm. Ce mapping ne doit pas être traité comme un flyer A4 plat 210×297 tant qu'il n'est pas explicitement corrigé/mappé vers la bonne famille.

## Métadonnées de rendu

`MarketingPrintDocument` reçoit un champ optionnel `rendering` :

```ts
{
  targetWidthPx: number;
  targetHeightPx: number;
  targetDpi: number;
  sourceWidthPx: number;
  sourceHeightPx: number;
  upscaleFactor: number;
  cropMode: "cover";
  strategy: "high_quality_resample";
}
```

Le serveur valide que ces valeurs correspondent au raster réellement fourni et n'utilise jamais les métadonnées clientes pour autoriser un fichier insuffisant.

## Sécurité et limites

- Aucun secret Cloudprinter/OpenAI côté frontend.
- Aucun changement de logique Stripe / paiement fournisseur.
- Aucun mapping fournisseur automatique.
- Les comptes Démo ne déclenchent aucune impression réelle.
- Le post-traitement digital n'écrit pas en base par défaut.
- Les fichiers Print préparés sont limités à une surface raisonnable (minimum : les ~9,2 MP nécessaires aux formats A4/A5 pliés 300 DPI du périmètre fourni ; plafond recommandé 20 MP).
- Les URLs source restent HTTPS pour le chemin Print serveur.
- Les tests doivent couvrir géométrie, folded spread, bleed non constant, crop, upscale <=2.5, presets digitaux et absence de dépendance Cloudprinter dans le Studio cœur.

## Critères d'acceptation

1. Un format digital 9:16 produit un fichier final 1080×1920, même si OpenAI a fourni 1024×1536.
2. Les sorties 16:9, 4:3, 1:1, 4:5 et 1.91:1 sont sélectionnables indépendamment de Cloudprinter.
3. Une variante Print hydratée calcule ses pixels depuis width/height/bleed réels et sa politique DPI.
4. Une carte 85×55 avec bleed 3 mm n'est jamais upscalée depuis le bucket landscape.
5. Les menus/leaflets nécessitant jusqu'à x2.5 sont autorisés avec avertissement ; au-delà, le Print est bloqué.
6. Un produit plié utilise le spread `after trimming` pour le fichier et expose `after folding` comme format fermé.
7. Les libellés Cloudprinter `card ... after trimming` remplissent correctement `width_mm` / `height_mm`.
8. Un mapping actif sans géométrie valide n'est pas présenté comme imprimable.
9. L'Admin reste seul responsable du mapping/activation fournisseur.
10. Lint, typecheck, tests complets et build production sont verts avant que la PR ne soit prête à review.

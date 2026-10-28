# Cloudprinter : formats de génération et d’impression

Vérification du 9 octobre 2026, projet TOK `wwcrtyoueexyxkkikaos`.

Le catalogue compte 1 668 références distinctes retournées par l’API du compte Cloudprinter. Ce catalogue fournisseur inclut des vêtements, objets et produits multipages : toutes ces références ne sont pas imprimables depuis un visuel unique du Marketing Studio.

## Parcours pris en charge

1. Choisir la destination Impression et un support disponible avant de générer.
2. La génération enregistre le produit, les dimensions et les fonds perdus vérifiés côté serveur. L’orientation native est déduite de ces dimensions.
3. Ouvrir l’impression depuis la création sélectionnée. Le support est verrouillé ; changer le support du studio après la génération ne modifie pas celui de cette création.
4. Le serveur contrôle à nouveau le contrat enregistré et le catalogue actif avant le BAT. Le PDF vérifie le ratio et la résolution à partir du PNG/JPEG décodé.

Les créations numériques ou anciennes sans contrat d’impression enregistré doivent être régénérées avec un support d’impression. Un ratio seul ne permet pas de distinguer un A4 d’un A5 et ne sert donc pas à deviner un format physique.

## Mappings actifs vérifiés via `/products/info`

Les dimensions sont celles du format fini, en millimètres. Chaque support ci-dessous est recto, une page, avec 3 mm de fond perdu.

| Support TOK | Largeur × hauteur | Référence Cloudprinter |
| --- | --- | --- |
| Flyer A6 | 105 × 148 | `card_flat_105x148_mm_single_fc_tnr` |
| Flyer A5 | 148 × 210 | `card_flat_148x210_mm_single_fc_tnr` |
| Flyer A4 | 210 × 297 | `card_flat_210x297_mm_single_fc_tnr` |
| Affiche A3 | 297 × 420 | `poster_a3_fc` |
| Carte paysage | 85 × 55 | `businesscard_ss_int_bc_fc` |
| Carte portrait | 55 × 85 | `businesscard_ss_int_p_bc_fc` |
| Carte carrée | 55 × 55 | `businesscard_ss_s55_mm_bc_fc` |
| Carte / menu DL | 98 × 210 | `card_flat_98x210_mm_single_sided_fc_tnr` |

Les mappings des menus pliés A6/A5 et calendriers bureau A5, mural A4/A3 sont conservés mais inactifs. Ils exigent plusieurs faces/pages, que le générateur de BAT actuel ne produit pas. Les variantes recto-verso restent également inactives. Les catalogues de génération et de commande excluent ces produits même si un ancien réglage les marque actifs.

## Exploitation

L’Edge Function `print-catalog` réserve aux administrateurs et services explicitement autorisés :

- `discover`, avec `offset` et `limit` (100 maximum), lit les références disponibles chez Cloudprinter ;
- `sync` déduplique les références puis synchronise par lots, sans écraser les mappings ni leur activation ;
- `map`, avec `reference`, `productId` et `active`, relit les spécifications fournisseur et valide la géométrie orientée avant d’enregistrer et auditer le mapping ;
- `admin_mappings` permet de consulter les mappings par pages, sans troncature aux 100 premières références.

Les détails des 50 premiers mappings au maximum sont rafraîchis par `sync` ; `hydrate` et `map` permettent de rafraîchir les autres individuellement. Un code d’erreur de base neutre aide à diagnostiquer les échecs sans exposer les messages SQL ni les secrets.

La migration `20261009003407_protect_generated_print_format.sql` réserve la modification de `metadata.marketing_output_target` aux rôles serveur. Elle ne change ni les droits d’accès aux autres métadonnées ni les politiques RLS existantes.

## Vérification et retour arrière

Les tests couvrent le format verrouillé, les anciennes créations sélectionnées, les erreurs de mapping, la pagination, les pages multiples et les dimensions décodées. Le smoke SQL `supabase/tests/generated_print_format_smoke.sql` vérifie les rôles et annule ses données temporaires.

Le retour arrière applicatif consiste à révoquer le commit et redéployer les fonctions concernées (`print-catalog`, `print-admin`, `print-export`, `ai-image-enhance`). La protection SQL peut rester en place avec l’ancien code. Les mappings retirés du choix d’impression ne doivent être réactivés qu’après prise en charge réelle des faces/pages supplémentaires. Aucun paiement ni ordre d’impression réel n’a été déclenché pour ces vérifications.

## Mise à jour du 28 octobre 2026 — visuel natif uniquement

Le Studio ne propose plus de champs de surimpression (titre, prix, sous-titre, CTA, logo ou QR). Toute modification artistique se fait par une nouvelle génération native avec les références actives. Le nom de la création reste uniquement un titre de métadonnées PDF. Les repères de l’aperçu ne sont jamais dessinés dans le fichier de production.

Le helper partagé `supabase/functions/_shared/print/artwork.ts` calcule le gabarit de chaque référence mappée : dimensions finies, fonds perdus propres au produit, zone sûre depuis **la coupe**, rectangle sûr en pixels et dimensions natives compatibles avec GPT Image 2. Une marge absente ne devient plus `0` : le minimum est de 3 mm à l’intérieur du format fini, ou davantage si le catalogue l’indique. Le fond perdu reste issu du produit ; une valeur inconnue bloque le support. Les huit supports plats du tableau ci-dessus sont couverts par les tests. Les règles d’impression ne sont pas injectées dans les publications numériques.

La génération utilise une seule image, le modèle et la qualité existants, des dimensions natives multiples de 16 dans la limite de 3 840 pixels par côté et de 8 294 400 pixels au total. Elle ne fait aucun second essai payant automatique. Les règles serveur sont ajoutées **après** la troncature éventuelle du brief. Les références maîtresses et le circuit de réservation des crédits restent inchangés. La limite de résolution est physique : 300 DPI sont recommandés ; le seuil bloquant TOK est 150 DPI en l’absence d’exigence supérieure prise en charge. Un A4/A3 peut rester sous 300 DPI aux limites natives du modèle : avertissement visible et approbation humaine nécessaires, jamais de rééchantillonnage présenté comme un gain de détail. Les tailles supérieures à 2 560×1 440 restent expérimentales selon la documentation du modèle.

Le contrat `metadata.marketing_output_target` contient la version native, la marge, les seuils DPI, la taille native demandée et le SHA-256 des octets originaux. Il bénéficie de la protection serveur existante. Les anciennes créations sans ce contrat doivent être régénérées. Le produit et la géométrie sont recontrôlés à l’export ; une évolution du gabarit invalide l’ancien contrat.

L’export ignore l’URL et les dimensions déclarées par le navigateur : il signe l’original enregistré appartenant au restaurant, vérifie son empreinte et décode ses pixels. Aucun crop, surimpression ni agrandissement artificiel n’est effectué. Une tolérance d’arrondi d’un pixel sur le ratio est autorisée ; la mise à l’échelle PDF est proportionnelle, les écarts subpixel restent dans le fond perdu extérieur. MediaBox/BleedBox/CropBox incluent les fonds perdus ; TrimBox correspond au format fini ; ArtBox indique la zone sûre.

Un seul contrôle visuel IA, borné à 25 secondes, 4 000 tokens et 96 Kio de réponse, observe les boîtes complètes de tous les éléments essentiels. Le serveur mesure ces boîtes contre la zone sûre au lieu de faire confiance à une affirmation « conforme ». Une observation incomplète, ambiguë, illisible, contenant plusieurs visuels, des repères imprimés ou des éléments hors marge bloque le BAT. Les QR/barcodes intégrés sont également bloqués : aucun décodeur ne garantit leur lecture dans ce parcours. Limitation de préparation : 5 demandes/utilisateur/10 minutes et 10/restaurant/10 minutes avec les overrides opérationnels existants. Aucun retry automatique du contrôle ni nouvelle génération facturée lors de l’export.

Une observation IA reste probabiliste : elle ne certifie ni chaque glyphe ni l’exhaustivité absolue des détections. Le restaurateur doit ouvrir le PDF réel et confirmer explicitement les marges, les textes et la netteté avant approbation. Les vieux préflights `ready: true` sans validation native ne suffisent plus. Les commandes déjà payées ne sont pas réécrites.

### Limites de prise en charge

Seules les familles de références plates `card_flat_`, `businesscard_ss_` et `poster_`, numériques, recto et monopages sont exposées. Les plis, découpes, enveloppes à prise de pince, objets, encres spéciales, exigences ICC/PDF-X spécifiques et procédés offset ne sont pas transformés arbitrairement en rectangle. Leur support exige un moteur adapté et un gabarit vérifié ; ils restent exclus, même lorsqu’un ancien mapping est actif. Cette implémentation ne prétend pas couvrir l’ensemble du catalogue fournisseur.

Le PDF produit est un PDF 1.7 à image RGB native, pas un PDF/X-4 certifié, ni une conversion CMYK/ICC, ni une vectorisation des textes. Cloudprinter accepte les PDF 1.4 à 1.7 pour les cartes/flyers/affiches et recommande RGB en impression numérique. Leurs guides recommandent toutefois 300 DPI, les polices incorporées/vectorisées et parfois PDF/X-4. Ces recommandations ne sont pas présentées comme des certifications de notre export raster.

### Sources officielles consultées

- https://docs.cloudprinter.com/client/how-to-build-the-pdf — zone sûre 3 mm, couleurs, polices, versions PDF.
- https://docs.cloudprinter.com/client/product-specification-types — géométrie et spécifications par référence.
- https://knowledge.cloudprinter.com/flyer — fond perdu, zone sûre, recommandation 300 DPI et guide PDF/X-4.
- https://developers.openai.com/api/docs/guides/image-generation#earlier-gpt-image-models — contraintes de tailles natives GPT Image 2 et limitations de précision.

### Vérification et déploiement

Tests géométriques des huit supports, contrôle de la marge nulle, ancien contrat, hash d’original, faux DPI/URL, requêtes de surimpression forgées, bornes de vision, absence de retry, préservation des références, sélection verrouillée, guides et approbation explicite. Tests sans appel IA payant, commande Cloudprinter ni paiement réel. Frontend et fonctions `ai-image-enhance`, `print-catalog`, `print-export` doivent être déployés ensemble après validation de la PR ; les changements `_shared` sont gérés par le pipeline existant. Aucun secret, schéma SQL, politique RLS ou paiement n’est modifié.

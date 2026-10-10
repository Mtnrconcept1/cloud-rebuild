# Fabrication des assets

Source : « Image ChatGPT 10 oct. 2026, 21_28_05.png », fournie par l’utilisateur.
Outil : imagegen intégré, trois éditions non destructives. Original préservé.
Sorties copiées dans `public/assets`. Aucune retouche externe ou clé API employée.

## Chef — `chef.png`

Use case: background-extraction. Edit target: attached TOK poster. Create a single transparent PNG sprite sheet for a faithful Remotion recreation, high resolution. Extract only the running chef INCLUDING his hat, red scarf, clothing, shoes, watch and the silver cloche held in his left hand. Preserve exactly the original face, surprised expression, running pose, proportions, clothing, TOK belt logo and beautiful 3D illustrated rendering. Place the complete chef and cloche isolated, centered and filling the canvas, no cropping of shoes or hat. Remove EVERYTHING else: entire background, flying props, food, all typography, countdown, sign, speech bubble, separate top logo. Genuine alpha transparent background, no shadow rectangle, no checkerboard. Do not redesign the chef.

## Décor — `background.png`

Use case: precise-object-edit. Edit target: TOK orange launch poster. Produce ONLY its clean background plate, landscape 16:9. Remove chef, all cookware, all flying food and leaves, all logos, ALL text, countdown boxes, speech bubble, ribbon, wooden sign and pole. Reconstruct the empty orange-gold radial burst background behind everything, retain the sunlit warm orange and cream streaks radiating from middle-left, rustic blurred restaurant kitchen along lower left and warm ground in bottom left, with a smoother golden-orange broad negative space across right half. Faithful to original cinematic lighting and textured illustrated 3D look. No objects, no text, no symbols, no people. This is a clean plate for layered parallax animation. Fill canvas edge to edge.

## Accessoires — `props.png`

Use case: background-extraction. Edit target: original TOK chef poster. Produce a transparent PNG SPRITE ATLAS with EXACTLY 4 columns x 3 rows of equally sized cells, landscape 4:3 canvas. Each cell contains ONE isolated accessory from the source, centered and entirely within its cell with at least 12 percent transparent padding on all edges. No object overlaps cell boundaries. Consistent original 3D food illustration quality, warm golden highlights. Row 1 left to right: red tomato with green stem; brown wooden pepper grinder; silver cylindrical cooking pot tilted; flying white chef toque. Row 2 left to right: silver whisk diagonally oriented; tilted frying pan with food inside; sprig of three green basil leaves; yellow bell pepper. Row 3 left to right: plate of spaghetti with red sauce splashing; wooden arrow-shaped launch sign on short pole (BLANK wood, NO TEXT); exact TOK circular orange white chef hat moustache logo from upper right (preserve letters TOK); small red chili pepper. Use actual transparent background everywhere between objects. NO labels, NO grid lines, NO checkerboard, NO background or chef. These 12 sprites will each animate independently in a parallax composition.

Les contraintes de fidélité ci-dessus sont les prompts transmis, pas une garantie
d’identité pixel. La composition utilise des fenêtres de découpe ajustées au rendu
réel de l’atlas (1448 × 1086). Dimensions du chef : 1145 × 1374 ; décor : 1672 × 941.

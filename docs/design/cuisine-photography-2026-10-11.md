# TOK — renouvellement des photographies de cuisine

Date : 2026-10-11. Risque : niveau 1, assets statiques uniquement.

31 images générées avec l’outil intégré ImageGen, puis redimensionnées en 240 × 240 et encodées en WebP (qualité 82, méthode 6). Aucun collage ni retouche créative après génération. Modèle et coût non exposés par l’outil.

Direction : photographies culinaires en gros plan, lumière latérale chaude, fonds de restaurant flous, textures détaillées, sujets centrés pour les vignettes circulaires. Référence fournie par l’utilisateur : cartes de cuisines TOK. Arrêt des générations après pizza, italien, sushi et thaï à sa demande ; les huit autres images existantes restent disponibles.

## Validation

- Revue visuelle des 31 générations et de leur planche de contrôle après compression.
- 39 chemins d’images du composant vérifiés : fichiers présents et WebP décodables.
- `vitest run src/test/home-cuisine-accessibility.test.tsx` : 2 tests réussis.
- `git diff --check` : réussi.
- Poids cumulé des 31 WebP : 563 828 octets ; maximum : 22 202 octets/image. Ancien total : 146 502 octets. Le gain de détail augmente donc le poids de ces assets de 417 326 octets au total ; le chargement différé existant est conservé.
- Lint/typecheck/build non exécutés : aucun changement de code ou de configuration ; la validation porte sur les assets et le test existant du composant.
- Retour arrière : revert du commit de cette PR.

## Fichiers modifiés

- `public/images/miniatures/01_africain.webp`
- `public/images/miniatures/02_americain.webp`
- `public/images/miniatures/03_bistro.webp`
- `public/images/miniatures/04_boulangerie.webp`
- `public/images/miniatures/05_brunch.webp`
- `public/images/miniatures/06_burger.webp`
- `public/images/miniatures/07_cafe.webp`
- `public/images/miniatures/08_chinois.webp`
- `public/images/miniatures/09_creole.webp`
- `public/images/miniatures/10_desserts.webp`
- `public/images/miniatures/11_francais.webp`
- `public/images/miniatures/12_gastronomique.webp`
- `public/images/miniatures/13_grillades.webp`
- `public/images/miniatures/14_halal.webp`
- `public/images/miniatures/15_healthy.webp`
- `public/images/miniatures/16_indien.webp`
- `public/images/miniatures/17_italien.webp`
- `public/images/miniatures/18_japonais.webp`
- `public/images/miniatures/19_kebab.webp`
- `public/images/miniatures/20_libanais.webp`
- `public/images/miniatures/21_marocain.webp`
- `public/images/miniatures/22_mediterranee.webp`
- `public/images/miniatures/23_mexicain.webp`
- `public/images/miniatures/24_pakistanais.webp`
- `public/images/miniatures/25_pizza.webp`
- `public/images/miniatures/26_sushi.webp`
- `public/images/miniatures/27_ramen.webp`
- `public/images/miniatures/28_thai.webp`
- `public/images/miniatures/29_turc.webp`
- `public/images/miniatures/30_salades.webp`
- `public/images/miniatures/31_poke.webp`
- `docs/design/cuisine-photography-2026-10-11.md` (ce document)

## Prompts

Pour les images 02 à 31, préfixe commun suivi du sujet individuel :

```text
Use case: photorealistic-natural. Create ONE square premium editorial food photograph for TOK restaurant cuisine category. Tight three-quarter close-up, hero food fills 75-85% of frame, central composition recognizable as a tiny circular thumbnail. Dish partially cropped, warm side window light and delicate rim lighting, rich natural food colors, deep warm shadows, restrained appetizing highlights, tack-sharp tactile textures on hero with creamy shallow depth of field behind, dark walnut table and softly blurred upscale restaurant, 85mm professional food photography. Consistent sophisticated golden-brown palette with fresh colored ingredients. Real food with natural imperfections, beautifully styled. No lettering, icons, logos, watermark, borders, collage, people, illustration or plastic 3D. Output 1024x1024 square. Subject: 
```

### 01_africain

Résumé du prompt initial : Senegalese chicken yassa with rice, onions and lemon

### 02_americain

Sujet : American BBQ glazed baby back ribs, shiny amber barbecue glaze, small side of golden fries and crisp slaw, hearty delicious closeup

### 03_bistro

Sujet : French bistro steak frites, thick grilled beef steak with melting herb butter and golden crisp hand-cut fries, tiny watercress garnish

### 04_boulangerie

Sujet : three freshly baked French butter croissants, exceptionally delicate crisp golden lamination, one broken open showing airy crumb, few natural crumbs on walnut board

### 05_brunch

Sujet : beautiful eggs Benedict on toasted brioche with poached eggs and golden hollandaise, one egg gently opened, smoked salmon and fresh chives

### 06_burger

Sujet : spectacular double smash cheeseburger, toasted sesame brioche, seared beef, molten cheddar, crisp lettuce and juicy tomato, low eye-level hero shot with entire burger centered

### 07_cafe

Sujet : beautiful ceramic cappuccino cup with precise rosetta latte art, smooth velvety milk foam, warm coffee crema, one small unbranded biscuit, close cup-level perspective

### 08_chinois

Sujet : authentic Chinese dim sum bamboo steamer packed with pleated translucent shrimp dumplings and golden siu mai, a few scallion flecks

### 09_creole

Sujet : Creole shrimp curry in warm golden coconut sauce with bell pepper and fresh herbs, fluffy rice peeking to one side, dark handmade bowl

### 10_desserts

Sujet : dark chocolate fondant broken open with glossy molten chocolate, a scoop of vanilla ice cream and a couple of fresh raspberries on dark ceramic

### 11_francais

Sujet : French duck breast sliced to reveal rosy center, glossy dark jus, golden potato fondant and tiny thyme sprigs, elegant hearty restaurant plating

### 12_gastronomique

Sujet : three caramelized scallops on silky pale cauliflower puree with delicate beurre noisette, restrained microgreens, striking fine dining composition, fill frame with food rather than empty plate

### 13_grillades

Sujet : thick flame-grilled beef ribeye sliced with juicy rosy interior, caramelized crust and coarse salt, fresh rosemary, dark walnut serving board

### 14_halal

Sujet : beautiful grilled spiced chicken skewers with saffron rice, roasted peppers and yogurt sauce on dark ceramic; chicken only, no pork or alcohol

### 15_healthy

Sujet : fresh colorful balanced bowl with quinoa, avocado fan, roasted sweet potato, chickpeas, crunchy cucumber and leafy greens, natural lemon dressing

### 16_indien

Sujet : authentic butter chicken in rich orange tomato sauce, subtle cream swirl, cilantro and blistered naan visible behind, hammered brass bowl

### 17_italien

Sujet : twirl of spaghetti pomodoro with glossy roasted cherry tomatoes, fresh basil leaves and delicate parmesan flakes, rustic dark ceramic shallow bowl

### 18_japonais

Sujet : Japanese glazed miso salmon over rice, lacquered golden fish with black sesame, tender bok choy and delicate pickled ginger, premium dark ceramic

### 19_kebab

Sujet : artisan doner kebab in toasted pita cut open to reveal juicy grilled meat, fresh purple cabbage, tomato, lettuce and white garlic sauce

### 20_libanais

Sujet : beautiful Lebanese hummus with elegant spiral of creamy chickpea puree, olive oil pooling, chickpeas and parsley, paprika accent, warm pita softly visible behind

### 21_marocain

Sujet : authentic Moroccan chicken tagine with preserved lemon and green olives, glossy golden sauce, roasted almonds, terracotta tagine base with lid blurred behind

### 22_mediterranee

Sujet : grilled sea bream fillet with golden crisp skin, cherry tomatoes, olives, charred lemon and fragrant herbs, Mediterranean dark ceramic platter

### 23_mexicain

Sujet : three authentic soft corn tacos generously filled with grilled beef, bright pico de gallo, avocado, cilantro and lime, colorful appetizing closeup

### 24_pakistanais

Sujet : authentic Pakistani chicken biryani, fluffy separate white and saffron basmati grains, beautifully browned chicken, crispy onions and fresh mint, dark bowl

### 25_pizza

Sujet : authentic Neapolitan margherita pizza with airy blistered cornicione, molten mozzarella, vibrant tomato sauce and fresh basil, close low angle showing delicious crust

### 26_sushi

Sujet : premium salmon sushi assortment, lustrous salmon nigiri and neatly cut salmon avocado maki, distinct rice grains, tiny wasabi and ginger, dark ceramic platter

### 27_ramen

Sujet : authentic Japanese ramen bowl with rich broth, noodles, sliced chashu pork, jammy soy egg cut in half, scallions and nori, food central and appetizing

### 28_thai

Sujet : authentic Thai pad thai with glossy rice noodles, juicy prawns, bean sprouts, crushed peanuts, chives and fresh lime wedge, dark plate

### 29_turc

Sujet : Turkish pide with beautifully golden boat-shaped crust, juicy minced beef and peppers, parsley, one slice exposing soft bread, rustic board

### 30_salades

Sujet : vibrant fresh Mediterranean salad with cherry tomatoes, crunchy cucumber, kalamata olives, creamy feta cubes and fresh herbs, luminous natural olive oil dressing

### 31_poke

Sujet : beautiful Hawaiian poke bowl with fresh salmon cubes, avocado fan, mango, edamame, red cabbage and sesame over rice, vibrant clean colors

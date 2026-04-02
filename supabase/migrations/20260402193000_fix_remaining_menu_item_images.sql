-- Fix remaining menu item images with closer matches from public/images

-- R3: Pizzeria Da Luigi
UPDATE public.menu_items SET image_url = '/images/1.webp' WHERE name = 'Tiramisu';

-- R4: Le Bosphore
UPDATE public.menu_items SET image_url = '/images/pizza diavola.avif' WHERE name = 'Lahmacun';
UPDATE public.menu_items SET image_url = '/images/mixed-grill-platter.jpeg' WHERE name = 'Adana kebab';
UPDATE public.menu_items SET image_url = '/images/assiette mixte libanaise.jpeg' WHERE name = 'Falafel assiette';
UPDATE public.menu_items SET image_url = '/images/limonade menthe.jpeg' WHERE name ILIKE 'Th% turc';

-- R5: Tandoori Palace
UPDATE public.menu_items SET image_url = '/images/indian-curry-bowls.jpeg' WHERE name = 'Tikka Masala';

-- R6: Chez Mamie Thai
UPDATE public.menu_items SET image_url = '/images/thai-curry-spread.jpeg' WHERE name = 'Curry vert poulet';
UPDATE public.menu_items SET image_url = '/images/thai-curry-spread.jpeg' WHERE name ILIKE 'Curry rouge b%uf';
UPDATE public.menu_items SET image_url = '/images/fattouche.webp' WHERE name = 'Som Tam';
UPDATE public.menu_items SET image_url = '/images/thai-curry-spread.jpeg' WHERE name = 'Rouleaux de printemps';
UPDATE public.menu_items SET image_url = '/images/ramen miso.jpg' WHERE name = 'Tom Yum Kung';
UPDATE public.menu_items SET image_url = '/images/acai bowl.jpg' WHERE name = 'Riz gluant mangue';
UPDATE public.menu_items SET image_url = '/images/mango lassi.jpeg' WHERE name = 'Bubble Tea taro';

-- R7: Burger Brothers GVA
UPDATE public.menu_items SET image_url = '/images/gfc-fried-chicken.jpeg' WHERE name = 'Chicken Crispy';
UPDATE public.menu_items SET image_url = '/images/chicken-bucket-fries.jpeg' WHERE name = 'Frites maison';
UPDATE public.menu_items SET image_url = '/images/chicken-bucket-fries.jpeg' WHERE name = 'Sweet potato fries';

-- R8: Maison du Dragon
UPDATE public.menu_items SET image_url = '/images/gyoza porc.webp' WHERE name = 'Dim Sum vapeur (6 pcs)';
UPDATE public.menu_items SET image_url = '/images/gyoza porc.webp' WHERE name ILIKE 'Bao porc caram%lis%';
UPDATE public.menu_items SET image_url = '/images/thai-curry-spread.jpeg' WHERE name = 'Poulet Kung Pao';
UPDATE public.menu_items SET image_url = '/images/byriani.jpg' WHERE name = 'Riz cantonais';
UPDATE public.menu_items SET image_url = '/images/ramen miso.jpg' WHERE name = 'Soupe wonton';
UPDATE public.menu_items
SET image_url = '/images/moshi glac' || CHR(233) || 's.jpg'
WHERE name = 'Perles de coco';

-- R10: Poke Bowl Factory
UPDATE public.menu_items SET image_url = '/images/poke-bowls.jpeg' WHERE name = 'Chicken Teriyaki';

-- R11: Cafe des Bains
UPDATE public.menu_items SET image_url = '/images/octopus-fine-dining.jpeg' WHERE name ILIKE 'Tartare de b%uf';
UPDATE public.menu_items SET image_url = '/images/fattouche.webp' WHERE name ILIKE 'Salade ni%oise';
UPDATE public.menu_items SET image_url = '/images/bruschetta.jpg' WHERE name = 'Croque-monsieur';
UPDATE public.menu_items SET image_url = '/images/tarte aux noix.webp' WHERE name = 'Quiche du jour';
UPDATE public.menu_items SET image_url = '/images/assiette mixte libanaise.jpeg' WHERE name ILIKE 'Planche ap%ro';
UPDATE public.menu_items SET image_url = '/images/pannacotta.webp' WHERE name ILIKE 'Cr%me br%l%e';
UPDATE public.menu_items SET image_url = '/images/1.webp' WHERE name = 'Fondant au chocolat';

-- R13: Seoul Kitchen
UPDATE public.menu_items SET image_url = '/images/gfc-fried-chicken.jpeg' WHERE name = 'Korean Fried Chicken';
UPDATE public.menu_items SET image_url = '/images/ramen miso.jpg' WHERE name = 'Kimchi Jjigae';
UPDATE public.menu_items SET image_url = '/images/thai-pad-thai.jpeg' WHERE name = 'Japchae';
UPDATE public.menu_items SET image_url = '/images/california roll.jpg' WHERE name = 'Kimbap (8 pcs)';
UPDATE public.menu_items SET image_url = '/images/gyoza porc.webp' WHERE name = 'Mandu (6 pcs)';
UPDATE public.menu_items SET image_url = '/images/thai-pad-thai.jpeg' WHERE name = 'Tteokbokki';
UPDATE public.menu_items SET image_url = '/images/kombucha.jpeg' WHERE name = 'Soju original';

-- R14: Dar Marrakech
UPDATE public.menu_items SET image_url = '/images/indian-feast.jpeg' WHERE name = 'Tajine agneau pruneaux';
UPDATE public.menu_items SET image_url = '/images/indian-feast.jpeg' WHERE name = 'Tajine poulet citron';
UPDATE public.menu_items SET image_url = '/images/samosa.jpg' WHERE name = 'Pastilla au poulet';
UPDATE public.menu_items SET image_url = '/images/samosa.jpg' WHERE name = 'Briouates viande';
UPDATE public.menu_items SET image_url = '/images/ramen miso.jpg' WHERE name = 'Harira';
UPDATE public.menu_items SET image_url = '/images/baklava.jpg' WHERE name = 'Cornes de gazelle';
UPDATE public.menu_items SET image_url = '/images/limonade menthe.jpeg' WHERE name ILIKE 'Th% % la menthe';

-- R15: Le Petit Grec
UPDATE public.menu_items SET image_url = '/images/greek-gyros.jpeg' WHERE name = 'Souvlaki mixte assiette';
UPDATE public.menu_items SET image_url = '/images/WhatsApp Image 2026-03-12 at 19.54.57.jpeg' WHERE name = 'Moussaka';
UPDATE public.menu_items SET image_url = '/images/fattouche.webp' WHERE name ILIKE 'Salade grecque';
UPDATE public.menu_items SET image_url = '/images/raita.webp' WHERE name = 'Tzatziki';
UPDATE public.menu_items SET image_url = '/images/samosa.jpg' WHERE name = 'Spanakopita';
UPDATE public.menu_items SET image_url = '/images/gulam jamun.jpg' WHERE name = 'Loukoumades';
UPDATE public.menu_items SET image_url = '/images/milshake vanille.jpeg' WHERE name ILIKE 'Frapp% caf%';

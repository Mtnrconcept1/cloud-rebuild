-- Seed Geneva restaurants and their menu items
-- Use a single owner_id: pick the first restaurateur, or fallback to any user
DO $$
DECLARE
  v_owner uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
  r6 uuid; r7 uuid; r8 uuid; r9 uuid; r10 uuid;
  r11 uuid; r12 uuid; r13 uuid; r14 uuid; r15 uuid;
BEGIN
  -- Get a restaurateur owner
  SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'restaurateur' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    RAISE NOTICE 'Skipping Geneva demo restaurant seed because no owner account exists yet.';
    RETURN;
  END IF;

  -- ========== RESTAURANTS ==========

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Comptoir Genevois', 'Cuisine traditionnelle suisse et genevoise au cœur de la vieille ville. Spécialités de fondue, raclette et longeole.', 'Suisse', 'Rue du Rhône 42', 'Genève', '+41 22 310 55 60', 4.6, 234, 3, true, true, 5.90, 25, 46.2044, 6.1432, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800')
  RETURNING id INTO r1;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Sakura Genève', 'Restaurant japonais authentique. Sushis frais préparés par notre chef Takeshi, ramens maison et spécialités izakaya.', 'Japonais', 'Rue de Lausanne 18', 'Genève', '+41 22 731 88 90', 4.7, 312, 3, true, true, 4.90, 30, 46.2087, 6.1440, 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800')
  RETURNING id INTO r2;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Pizzeria Da Luigi', 'Pizzas napolitaines cuites au feu de bois. Pâte fermentée 72h, mozzarella di bufala importée et ingrédients frais.', 'Italien', 'Boulevard Carl-Vogt 65', 'Genève', '+41 22 320 44 12', 4.5, 456, 2, true, true, 3.90, 20, 46.1983, 6.1380, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800')
  RETURNING id INTO r3;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Bosphore', 'Saveurs turques et méditerranéennes. Kebabs artisanaux, mezze variés et baklava maison.', 'Turc', 'Rue de Carouge 28', 'Genève', '+41 22 342 11 55', 4.3, 187, 2, true, true, 3.50, 18, 46.1935, 6.1420, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800')
  RETURNING id INTO r4;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Tandoori Palace', 'Restaurant indien haut de gamme. Tandoori, biryanis, currys épicés et naans fraîchement cuits au four.', 'Indien', 'Rue de Berne 12', 'Genève', '+41 22 738 22 30', 4.4, 198, 2, true, true, 4.50, 22, 46.2095, 6.1470, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800')
  RETURNING id INTO r5;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Chez Mamie Thaï', 'Street food thaïlandaise authentique. Pad thaï, curry vert, som tam et bubble tea maison.', 'Thaïlandais', 'Rue de la Servette 45', 'Genève', '+41 22 733 99 10', 4.5, 267, 1, true, true, 3.90, 15, 46.2120, 6.1350, 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=800')
  RETURNING id INTO r6;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Burger Brothers GVA', 'Burgers gourmets 100% artisanaux. Viande suisse, buns briochés maison, frites fraîches et milkshakes.', 'Burger', 'Rue du Mont-Blanc 22', 'Genève', '+41 22 732 60 70', 4.6, 389, 2, true, true, 3.90, 20, 46.2078, 6.1460, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800')
  RETURNING id INTO r7;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Maison du Dragon', 'Cuisine chinoise cantonaise et sichuanaise. Dim sum vapeur, canard laqué et nouilles sautées au wok.', 'Chinois', 'Avenue de France 15', 'Genève', '+41 22 734 55 80', 4.2, 156, 2, true, true, 4.50, 25, 46.2100, 6.1420, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800')
  RETURNING id INTO r8;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'La Table Libanaise', 'Mezze, grillades et spécialités libanaises familiales. Houmous crémeux, falafels croustillants et shawarma juteux.', 'Libanais', 'Rue de Zurich 8', 'Genève', '+41 22 741 33 20', 4.7, 278, 2, true, true, 4.50, 20, 46.2060, 6.1500, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800')
  RETURNING id INTO r9;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Poke Bowl Factory', 'Poke bowls frais et healthy. Base riz ou quinoa, poisson cru, avocat, edamame et sauces signature.', 'Healthy', 'Rue du Cendrier 10', 'Genève', '+41 22 310 77 40', 4.4, 203, 2, true, true, 3.50, 18, 46.2070, 6.1450, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800')
  RETURNING id INTO r10;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Café des Bains', 'Brunch, salades et plats du jour à deux pas du MAMCO. Cuisine de marché fraîche et locale.', 'Français', 'Rue des Bains 26', 'Genève', '+41 22 321 10 05', 4.5, 145, 2, true, true, 4.90, 22, 46.1990, 6.1410, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800')
  RETURNING id INTO r11;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Tacos El Padrino', 'Tacos mexicains authentiques, burritos géants, nachos et guacamole frais. Ambiance festive !', 'Mexicain', 'Rue de Monthoux 34', 'Genève', '+41 22 738 44 55', 4.3, 210, 1, true, true, 3.50, 15, 46.2090, 6.1480, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800')
  RETURNING id INTO r12;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Seoul Kitchen', 'Cuisine coréenne moderne. Bibimbap, kimchi jjigae, poulet frit coréen et barbecue à table.', 'Coréen', 'Rue Voltaire 7', 'Genève', '+41 22 740 88 15', 4.6, 175, 2, true, true, 4.90, 25, 46.2010, 6.1440, 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800')
  RETURNING id INTO r13;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Dar Marrakech', 'Couscous royal, tajines mijotés et pastilla traditionnelle. La cuisine marocaine dans toute sa splendeur.', 'Marocain', 'Rue de Chantepoulet 16', 'Genève', '+41 22 731 22 45', 4.5, 192, 2, true, true, 4.50, 22, 46.2085, 6.1455, 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=800')
  RETURNING id INTO r14;

  INSERT INTO public.restaurants (id, owner_id, name, description, cuisine_type, address, city, phone, rating, review_count, price_range, is_active, delivery_available, delivery_fee, min_order_amount, latitude, longitude, image_url)
  VALUES
    (gen_random_uuid(), v_owner, 'Le Petit Grec', 'Gyros, souvlaki, salade grecque et tzatziki maison. Voyage culinaire direct à Athènes.', 'Grec', 'Place du Cirque 3', 'Genève', '+41 22 328 77 90', 4.4, 163, 1, true, true, 3.50, 15, 46.2000, 6.1400, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800')
  RETURNING id INTO r15;

  -- ========== MENU ITEMS ==========

  -- R1: Le Comptoir Genevois (Suisse)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r1, 'Fondue moitié-moitié', 'Gruyère AOP et Vacherin fribourgeois, pain artisanal', 28.50, 'Plats principaux', true, 'https://images.unsplash.com/photo-1530016555861-2d4da7e45a4d?w=400'),
    (r1, 'Raclette du Valais', 'Fromage raclette fondu, pommes de terre, cornichons et oignons', 26.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1510431198580-7727c9fa1e3a?w=400'),
    (r1, 'Longeole IGP', 'Saucisse genevoise traditionnelle aux graines de fenouil, gratin dauphinois', 24.00, 'Plats principaux', true, NULL),
    (r1, 'Rösti bernois', 'Rösti croustillant garni de lard, œuf au plat et fromage', 22.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1432139509613-5c4255a1d197?w=400'),
    (r1, 'Filets de perche', 'Perche du Léman, sauce tartare maison, frites allumettes', 32.00, 'Plats principaux', true, NULL),
    (r1, 'Salade du marché', 'Mesclun, noix, gruyère et vinaigrette moutarde', 14.50, 'Entrées', true, NULL),
    (r1, 'Tarte aux noix', 'Spécialité des Grisons, servie tiède avec crème double', 9.50, 'Desserts', true, NULL),
    (r1, 'Meringues à la double crème', 'Meringues craquantes et crème de la Gruyère', 10.00, 'Desserts', true, NULL);

  -- R2: Sakura Genève (Japonais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r2, 'Assortiment sashimi', '12 pièces : saumon, thon, daurade', 28.00, 'Sashimi', true, 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400'),
    (r2, 'Plateau sushi mixte', '18 pièces nigiri et maki assortis', 34.00, 'Sushi', true, 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400'),
    (r2, 'California roll', '8 pièces avocat, concombre, surimi', 14.50, 'Maki', true, NULL),
    (r2, 'Salmon roll spécial', '8 pièces saumon flambé, cream cheese, ciboulette', 16.50, 'Maki', true, NULL),
    (r2, 'Ramen tonkotsu', 'Bouillon porc 12h, chashu, œuf mollet, nouilles fraîches', 22.00, 'Ramen', true, 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400'),
    (r2, 'Ramen miso', 'Bouillon miso, poulet grillé, maïs, beurre', 20.00, 'Ramen', true, NULL),
    (r2, 'Gyoza porc', '6 raviolis japonais grillés, sauce ponzu', 12.00, 'Entrées', true, NULL),
    (r2, 'Edamame', 'Fèves de soja salées', 7.50, 'Entrées', true, NULL),
    (r2, 'Tempura crevettes', '5 crevettes tempura, sauce tentsuyu', 16.00, 'Entrées', true, NULL),
    (r2, 'Mochi glacé (3 pcs)', 'Matcha, mangue, fraise', 8.50, 'Desserts', true, NULL);

  -- R3: Pizzeria Da Luigi (Italien)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r3, 'Margherita', 'San Marzano, mozzarella fior di latte, basilic frais', 16.00, 'Pizzas', true, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400'),
    (r3, 'Quattro Formaggi', 'Mozzarella, gorgonzola, parmesan, taleggio', 19.50, 'Pizzas', true, NULL),
    (r3, 'Diavola', 'Salame piccante, mozzarella, piment calabrais', 18.50, 'Pizzas', true, NULL),
    (r3, 'Prosciutto e Rucola', 'Jambon de Parme 24 mois, roquette, copeaux de parmesan', 21.00, 'Pizzas', true, NULL),
    (r3, 'Truffe Nera', 'Crème de truffe, mozzarella di bufala, champignons', 24.00, 'Pizzas', true, NULL),
    (r3, 'Calzone', 'Jambon, mozzarella, champignons, sauce tomate', 19.00, 'Pizzas', true, NULL),
    (r3, 'Bruschetta classique', 'Tomates cerises, ail, basilic, huile d''olive', 10.50, 'Entrées', true, NULL),
    (r3, 'Tiramisu', 'Recette traditionnelle au mascarpone et café', 9.50, 'Desserts', true, NULL),
    (r3, 'Panna cotta', 'Vanille bourbon et coulis de fruits rouges', 8.50, 'Desserts', true, NULL);

  -- R4: Le Bosphore (Turc)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r4, 'Kebab mixte assiette', 'Agneau et poulet grillés, riz, salade, sauce yaourt', 22.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400'),
    (r4, 'Döner sandwich', 'Viande tournante, crudités, sauce blanche, pain turc', 12.50, 'Sandwichs', true, NULL),
    (r4, 'Lahmacun', 'Pizza turque fine à la viande hachée et herbes', 10.00, 'Entrées', true, NULL),
    (r4, 'Mezze variés', 'Houmous, baba ganoush, muhammara, pain pita', 15.00, 'Entrées', true, NULL),
    (r4, 'Adana kebab', 'Brochette d''agneau épicée, boulgour et salade', 20.00, 'Plats principaux', true, NULL),
    (r4, 'Falafel assiette', 'Boulettes de pois chiches, houmous, salade taboulé', 16.00, 'Plats principaux', true, NULL),
    (r4, 'Baklava pistache', 'Pâte filo, miel et pistaches (4 pièces)', 8.00, 'Desserts', true, NULL),
    (r4, 'Thé turc', 'Thé noir traditionnel servi en verre tulipe', 3.50, 'Boissons', true, NULL);

  -- R5: Tandoori Palace (Indien)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r5, 'Butter Chicken', 'Poulet tandoori dans une sauce tomate crémeuse au beurre', 23.00, 'Curries', true, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400'),
    (r5, 'Tikka Masala', 'Poulet mariné grillé, sauce masala onctueuse', 22.00, 'Curries', true, NULL),
    (r5, 'Biryani agneau', 'Riz basmati épicé, agneau mijoté, raïta', 24.00, 'Biryani', true, NULL),
    (r5, 'Palak Paneer', 'Épinards frais et fromage indien, épices douces', 18.00, 'Végétarien', true, NULL),
    (r5, 'Naan au fromage', 'Pain indien au four tandoor, farci au fromage', 6.50, 'Accompagnements', true, NULL),
    (r5, 'Naan nature', 'Pain indien traditionnel', 4.00, 'Accompagnements', true, NULL),
    (r5, 'Samosa (3 pcs)', 'Beignets croustillants farcis aux légumes épicés', 8.50, 'Entrées', true, NULL),
    (r5, 'Raïta concombre', 'Yaourt frais, concombre et menthe', 5.00, 'Accompagnements', true, NULL),
    (r5, 'Mango Lassi', 'Boisson onctueuse à la mangue et yaourt', 6.50, 'Boissons', true, NULL),
    (r5, 'Gulab Jamun', 'Beignets de lait en sirop de cardamome et rose', 7.50, 'Desserts', true, NULL);

  -- R6: Chez Mamie Thaï (Thaïlandais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r6, 'Pad Thaï crevettes', 'Nouilles de riz sautées, crevettes, cacahuètes, citron vert', 19.50, 'Plats principaux', true, 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400'),
    (r6, 'Curry vert poulet', 'Lait de coco, basilic thaï, aubergines, bambou', 18.00, 'Curries', true, NULL),
    (r6, 'Curry rouge bœuf', 'Lait de coco, bœuf mijoté, haricots verts, kaffir', 19.00, 'Curries', true, NULL),
    (r6, 'Som Tam', 'Salade de papaye verte épicée, cacahuètes, crevettes séchées', 13.00, 'Entrées', true, NULL),
    (r6, 'Rouleaux de printemps', '4 rouleaux frais aux crevettes, sauce sweet chili', 11.00, 'Entrées', true, NULL),
    (r6, 'Tom Yum Kung', 'Soupe épicée aux crevettes, citronnelle et galanga', 14.00, 'Soupes', true, NULL),
    (r6, 'Riz gluant mangue', 'Riz gluant au lait de coco et mangue fraîche', 9.00, 'Desserts', true, NULL),
    (r6, 'Bubble Tea taro', 'Thé au lait de taro, perles de tapioca', 7.50, 'Boissons', true, NULL);

  -- R7: Burger Brothers GVA (Burger)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r7, 'Classic Smash', 'Double smash patty, cheddar, pickles, sauce secrète', 16.50, 'Burgers', true, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400'),
    (r7, 'BBQ Bacon', 'Bacon croustillant, oignons frits, sauce BBQ fumée, cheddar', 18.50, 'Burgers', true, NULL),
    (r7, 'Truffle Burger', 'Emmental, champignons, mayo truffée, roquette', 20.00, 'Burgers', true, NULL),
    (r7, 'Veggie Burger', 'Steak Beyond Meat, avocat, tomate, sauce vegan', 17.50, 'Burgers', true, NULL),
    (r7, 'Chicken Crispy', 'Poulet pané croustillant, coleslaw, sauce sriracha mayo', 17.00, 'Burgers', true, NULL),
    (r7, 'Frites maison', 'Frites fraîches coupées, sel marin', 6.50, 'Sides', true, NULL),
    (r7, 'Sweet potato fries', 'Frites de patate douce, sauce chipotle', 7.50, 'Sides', true, NULL),
    (r7, 'Onion Rings', 'Oignons panés croustillants, dip ranch', 8.00, 'Sides', true, NULL),
    (r7, 'Milkshake vanille', 'Crème glacée artisanale, lait frais', 8.50, 'Boissons', true, NULL),
    (r7, 'Milkshake Oreo', 'Crème glacée, Oreo concassés, chantilly', 9.50, 'Boissons', true, NULL);

  -- R8: Maison du Dragon (Chinois)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r8, 'Canard laqué', 'Canard rôti caramélisé, crêpes mandarin, ciboule', 32.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400'),
    (r8, 'Dim Sum vapeur (6 pcs)', 'Assortiment ha gow et siu mai', 14.00, 'Dim Sum', true, NULL),
    (r8, 'Bao porc caramélisé', '3 brioches vapeur, porc effiloché, pickles', 13.00, 'Dim Sum', true, NULL),
    (r8, 'Poulet Kung Pao', 'Poulet sauté, cacahuètes, piments séchés, poivrons', 20.00, 'Plats principaux', true, NULL),
    (r8, 'Nouilles sautées bœuf', 'Nouilles fraîches au wok, bœuf, légumes croquants', 18.00, 'Plats principaux', true, NULL),
    (r8, 'Riz cantonais', 'Riz sauté, œuf, crevettes, petits pois, char siu', 15.00, 'Accompagnements', true, NULL),
    (r8, 'Soupe wonton', 'Raviolis de porc dans un bouillon clair parfumé', 11.00, 'Soupes', true, NULL),
    (r8, 'Perles de coco', 'Boules de riz gluant à la noix de coco', 7.00, 'Desserts', true, NULL);

  -- R9: La Table Libanaise (Libanais)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r9, 'Shawarma poulet', 'Poulet mariné, ail, pickles, sauce toum, pain saj', 15.00, 'Sandwichs', true, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400'),
    (r9, 'Assiette mixte grillades', 'Kafta, taouk, agneau, riz, salade fattouch', 26.00, 'Plats principaux', true, NULL),
    (r9, 'Houmous libanais', 'Pois chiches, tahini, citron, huile d''olive, pain', 10.00, 'Mezze', true, NULL),
    (r9, 'Falafel wrap', 'Falafels croustillants, houmous, crudités, sauce tahini', 13.00, 'Sandwichs', true, NULL),
    (r9, 'Taboulé libanais', 'Persil, menthe, boulgour fin, tomates, citron', 11.00, 'Mezze', true, NULL),
    (r9, 'Fattouch', 'Salade croquante au pain grillé et sumac', 12.00, 'Mezze', true, NULL),
    (r9, 'Kebbé frit (4 pcs)', 'Croquettes de viande et boulgour, pignons', 12.00, 'Mezze', true, NULL),
    (r9, 'Baklawa assortie', 'Pistache, noix, fleur d''oranger (6 pièces)', 9.00, 'Desserts', true, NULL),
    (r9, 'Limonade à la menthe', 'Citron frais, menthe, eau de fleur d''oranger', 5.50, 'Boissons', true, NULL);

  -- R10: Poke Bowl Factory (Healthy)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r10, 'Salmon Lover', 'Saumon frais, avocat, mangue, edamame, riz vinaigré, sauce soja sésame', 19.50, 'Poke Bowls', true, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'),
    (r10, 'Tuna Spicy', 'Thon épicé, concombre, carotte, wakame, riz, sauce sriracha mayo', 20.50, 'Poke Bowls', true, NULL),
    (r10, 'Veggie Green', 'Tofu grillé, avocat, edamame, kale, quinoa, sauce miso gingembre', 17.50, 'Poke Bowls', true, NULL),
    (r10, 'Chicken Teriyaki', 'Poulet teriyaki, ananas, chou rouge, riz, sauce teriyaki', 18.00, 'Poke Bowls', true, NULL),
    (r10, 'Açaí Bowl', 'Açaí, banane, granola, fruits frais, miel', 14.00, 'Bowls sucrés', true, NULL),
    (r10, 'Smoothie vert', 'Épinards, banane, mangue, lait d''amande', 8.50, 'Boissons', true, NULL),
    (r10, 'Kombucha maison', 'Gingembre-citron, fermentation artisanale', 6.50, 'Boissons', true, NULL);

  -- R11: Café des Bains (Français)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r11, 'Tartare de bœuf', 'Bœuf suisse haché au couteau, câpres, échalotes, frites', 28.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400'),
    (r11, 'Salade niçoise', 'Thon, œuf, haricots verts, olives, anchois', 18.00, 'Salades', true, NULL),
    (r11, 'Croque-monsieur', 'Jambon, gruyère, béchamel gratinée, salade verte', 15.00, 'Plats principaux', true, NULL),
    (r11, 'Quiche du jour', 'Pâte brisée maison, garniture de saison, salade', 16.00, 'Plats principaux', true, NULL),
    (r11, 'Planche apéro', 'Charcuterie, fromages suisses, cornichons, pain', 22.00, 'Entrées', true, NULL),
    (r11, 'Crème brûlée', 'Vanille de Madagascar, caramel craquant', 9.00, 'Desserts', true, NULL),
    (r11, 'Fondant au chocolat', 'Cœur coulant, glace vanille', 10.00, 'Desserts', true, NULL);

  -- R12: Tacos El Padrino (Mexicain)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r12, 'Tacos al Pastor (3)', 'Porc mariné achiote, ananas, coriandre, oignon', 14.50, 'Tacos', true, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400'),
    (r12, 'Tacos Carnitas (3)', 'Porc effiloché confit, salsa verde, oignon', 14.50, 'Tacos', true, NULL),
    (r12, 'Burrito poulet', 'Poulet grillé, riz, haricots noirs, guacamole, crème', 16.00, 'Burritos', true, NULL),
    (r12, 'Burrito bœuf', 'Bœuf épicé, riz, pico de gallo, cheddar, crème', 17.00, 'Burritos', true, NULL),
    (r12, 'Nachos supremos', 'Tortilla chips, fromage fondu, jalapeños, guacamole, crème', 13.00, 'Entrées', true, NULL),
    (r12, 'Guacamole frais', 'Avocat, citron vert, coriandre, tortilla chips', 10.00, 'Entrées', true, NULL),
    (r12, 'Quesadilla fromage', 'Tortilla grillée, mélange de fromages, pico de gallo', 12.00, 'Entrées', true, NULL),
    (r12, 'Churros (6 pcs)', 'Beignets cannelle, sauce chocolat', 8.00, 'Desserts', true, NULL);

  -- R13: Seoul Kitchen (Coréen)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r13, 'Bibimbap bœuf', 'Riz, bœuf bulgogi, légumes, œuf, sauce gochujang', 20.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=400'),
    (r13, 'Korean Fried Chicken', 'Poulet frit croustillant, sauce yangnyeom épicée', 18.00, 'Plats principaux', true, NULL),
    (r13, 'Kimchi Jjigae', 'Ragoût de kimchi, tofu, porc, riz', 17.00, 'Soupes', true, NULL),
    (r13, 'Japchae', 'Nouilles de patate douce sautées, légumes, sésame', 16.00, 'Plats principaux', true, NULL),
    (r13, 'Kimbap (8 pcs)', 'Rouleau de riz coréen, bœuf, légumes, œuf', 13.00, 'Entrées', true, NULL),
    (r13, 'Mandu (6 pcs)', 'Raviolis coréens grillés au porc et chou', 11.00, 'Entrées', true, NULL),
    (r13, 'Tteokbokki', 'Gâteaux de riz épicés à la sauce gochujang', 12.00, 'Entrées', true, NULL),
    (r13, 'Soju original', 'Alcool de riz coréen (360ml)', 9.00, 'Boissons', true, NULL);

  -- R14: Dar Marrakech (Marocain)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r14, 'Couscous royal', 'Semoule, agneau, poulet, merguez, légumes, bouillon', 26.00, 'Plats principaux', true, 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=400'),
    (r14, 'Tajine agneau pruneaux', 'Agneau mijoté, pruneaux, amandes, cannelle', 24.00, 'Tajines', true, NULL),
    (r14, 'Tajine poulet citron', 'Poulet fermier, citrons confits, olives vertes', 22.00, 'Tajines', true, NULL),
    (r14, 'Pastilla au poulet', 'Feuille de brick, poulet, amandes, cannelle, sucre glace', 18.00, 'Entrées', true, NULL),
    (r14, 'Briouates viande', '4 triangles croustillants farcis bœuf-oignon', 10.00, 'Entrées', true, NULL),
    (r14, 'Harira', 'Soupe traditionnelle aux lentilles, pois chiches et tomate', 9.00, 'Soupes', true, NULL),
    (r14, 'Cornes de gazelle', 'Pâte d''amande et fleur d''oranger (4 pièces)', 8.00, 'Desserts', true, NULL),
    (r14, 'Thé à la menthe', 'Thé vert gunpowder, menthe fraîche, sucré', 4.50, 'Boissons', true, NULL);

  -- R15: Le Petit Grec (Grec)
  INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available, image_url) VALUES
    (r15, 'Gyros poulet pita', 'Poulet grillé, tomate, oignon, tzatziki, frites, pain pita', 14.00, 'Sandwichs', true, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400'),
    (r15, 'Souvlaki mixte assiette', 'Brochettes poulet et porc, riz, salade grecque', 20.00, 'Plats principaux', true, NULL),
    (r15, 'Moussaka', 'Gratin d''aubergines, viande hachée, béchamel', 18.00, 'Plats principaux', true, NULL),
    (r15, 'Salade grecque', 'Tomate, concombre, feta, olives kalamata, origan', 13.00, 'Salades', true, NULL),
    (r15, 'Tzatziki', 'Yaourt grec, concombre, ail, aneth, pain pita', 8.00, 'Mezze', true, NULL),
    (r15, 'Spanakopita', 'Feuilleté épinards et feta croustillant', 10.00, 'Mezze', true, NULL),
    (r15, 'Loukoumades', 'Beignets grecs au miel et noix concassées', 8.50, 'Desserts', true, NULL),
    (r15, 'Frappé café', 'Café glacé grec fouetté', 5.50, 'Boissons', true, NULL);

END $$;

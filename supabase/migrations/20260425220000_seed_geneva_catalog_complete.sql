-- Complete the Geneva demo catalog with coherent local imagery and active offers.

CREATE TEMP TABLE tmp_geneva_restaurants (
  phone text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  cuisine_type text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  rating numeric NOT NULL,
  review_count integer NOT NULL,
  price_range integer NOT NULL,
  delivery_fee numeric NOT NULL,
  min_order_amount numeric NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  image_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_restaurants (
  phone,
  name,
  description,
  cuisine_type,
  address,
  city,
  rating,
  review_count,
  price_range,
  delivery_fee,
  min_order_amount,
  latitude,
  longitude,
  image_url
) VALUES
  ('+41 22 310 55 60', 'Le Comptoir Genevois', 'Brasserie genevoise autour des classiques suisses, du lac et du fromage.', 'Suisse', 'Rue du Rhone 42', 'Geneve', 4.6, 234, 3, 5.90, 25.00, 46.2044, 6.1432, '/images/fondue-moitie-moitie.jpg'),
  ('+41 22 731 88 90', 'Sakura Geneve', 'Comptoir japonais a Geneve avec rolls, ramen et fritures minute.', 'Japonais', 'Rue de Lausanne 18', 'Geneve', 4.7, 312, 3, 4.90, 30.00, 46.2087, 6.1440, '/images/california roll.jpg'),
  ('+41 22 320 44 12', 'Pizzeria Da Luigi', 'Pizzeria genevoise au four chaud, pate longue fermentation et produits italiens.', 'Italien', 'Boulevard Carl-Vogt 65', 'Geneve', 4.5, 456, 2, 3.90, 20.00, 46.1983, 6.1380, '/images/pizza quatre fromage.jpg'),
  ('+41 22 342 11 55', 'Le Bosphore', 'Table turque et mediterraneenne, sandwichs doner, grillades et mezzes.', 'Turc', 'Rue de Carouge 28', 'Geneve', 4.3, 187, 2, 3.50, 18.00, 46.1935, 6.1420, '/images/doner-kebab-plate.jpeg'),
  ('+41 22 738 22 30', 'Tandoori Palace', 'Maison indienne a Geneve, currys, biryanis et pains minute.', 'Indien', 'Rue de Berne 12', 'Geneve', 4.4, 198, 2, 4.50, 22.00, 46.2095, 6.1470, '/images/indian-feast.jpeg'),
  ('+41 22 733 99 10', 'Chez Mamie Thai', 'Cuisine thai de quartier avec wok, currys et service rapide.', 'Thailandais', 'Rue de la Servette 45', 'Geneve', 4.5, 267, 1, 3.90, 15.00, 46.2120, 6.1350, '/images/thai-pad-thai.jpeg'),
  ('+41 22 732 60 70', 'Burger Brothers GVA', 'Burgers gourmands, buns moelleux, sauces maison et sides croustillants.', 'Burger', 'Rue du Mont-Blanc 22', 'Geneve', 4.6, 389, 2, 3.90, 20.00, 46.2078, 6.1460, '/images/smash-burgers.jpeg'),
  ('+41 22 734 55 80', 'Maison du Dragon', 'Comptoir asiatique a Geneve avec wok, fritures et assiettes a partager.', 'Asiatique', 'Avenue de France 15', 'Geneve', 4.2, 156, 2, 4.50, 25.00, 46.2100, 6.1420, '/images/thai-spread.jpeg'),
  ('+41 22 741 33 20', 'La Table Libanaise', 'Cuisine levantine, mezzes frais, wraps et grillades maison.', 'Libanais', 'Rue de Zurich 8', 'Geneve', 4.7, 278, 2, 4.50, 20.00, 46.2060, 6.1500, '/images/assiette mixte libanaise.jpeg'),
  ('+41 22 310 77 40', 'Poke Bowl Factory', 'Bowls frais et healthy, sauces maison et options legeres a Geneve.', 'Healthy', 'Rue du Cendrier 10', 'Geneve', 4.4, 203, 2, 3.50, 18.00, 46.2070, 6.1450, '/images/poke-bowls.jpeg'),
  ('+41 22 321 10 05', 'Cafe des Bains', 'Cafe genevois de quartier, assiettes de marche, brunch et pauses sucrees.', 'Brunch', 'Rue des Bains 26', 'Geneve', 4.5, 145, 2, 4.90, 22.00, 46.1990, 6.1410, '/images/salade-du-marche.jpg'),
  ('+41 22 738 44 55', 'Tacos El Padrino', 'Comptoir mexicain avec burritos, tacos, quesadillas et box a partager.', 'Mexicain', 'Rue de Monthoux 34', 'Geneve', 4.3, 210, 1, 3.50, 15.00, 46.2090, 6.1480, '/images/tacos carnitas.webp'),
  ('+41 22 740 88 15', 'Seoul Kitchen', 'Street food coreenne, poulet croustillant, bols chauds et saveurs relevees.', 'Coreen', 'Rue Voltaire 7', 'Geneve', 4.6, 175, 2, 4.90, 25.00, 46.2010, 6.1440, '/images/gfc-fried-chicken.jpeg'),
  ('+41 22 731 22 45', 'Dar Marrakech', 'Table orientale a Geneve, plats mijotes, grillades et douceurs du soir.', 'Oriental', 'Rue de Chantepoulet 16', 'Geneve', 4.5, 192, 2, 4.50, 22.00, 46.2085, 6.1455, '/images/mixed-grill-platter.jpeg'),
  ('+41 22 328 77 90', 'Le Petit Grec', 'Cuisine grecque simple et genereuse avec gyros, grillades et desserts au miel.', 'Grec', 'Place du Cirque 3', 'Geneve', 4.4, 163, 1, 3.50, 15.00, 46.2000, 6.1400, '/images/greek-gyros.jpeg');

CREATE TEMP TABLE tmp_geneva_menu_items (
  restaurant_phone text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  price numeric NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_menu_items (restaurant_phone, name, description, price, category, image_url) VALUES
  ('+41 22 310 55 60', 'Salade du marche', 'Mesclun, noix, copeaux de fromage et vinaigrette maison.', 14.50, 'Entrees', '/images/salade-du-marche.jpg'),
  ('+41 22 310 55 60', 'Fondue moitie moitie', 'Melange cremeux de fromages suisses avec pain artisanal.', 28.50, 'Plats', '/images/fondue-moitie-moitie.jpg'),
  ('+41 22 310 55 60', 'Raclette du Valais', 'Fromage fondu, pommes de terre et condiments.', 26.00, 'Plats', '/images/raclette.jpg'),
  ('+41 22 310 55 60', 'Longeole genevoise', 'Specialite fumee servie avec garniture du jour.', 24.00, 'Plats', '/images/longeole.avif'),
  ('+41 22 310 55 60', 'Filets de perche du Leman', 'Filets dores, citron et accompagnement maison.', 32.00, 'Plats', '/images/filets de perche.jpg'),
  ('+41 22 310 55 60', 'Tarte aux noix', 'Dessert gourmand avec creme legere.', 9.50, 'Desserts', '/images/tarte aux noix.webp'),
  ('+41 22 310 55 60', 'Meringue double creme', 'Meringue croustillante et creme onctueuse.', 10.00, 'Desserts', '/images/meringue-double.webp'),

  ('+41 22 731 88 90', 'Edamame sale', 'Feves de soja juste saisies.', 7.50, 'Entrees', '/images/edamame.webp'),
  ('+41 22 731 88 90', 'Gyoza porc', 'Raviolis poeles et sauce soja vinaigree.', 12.00, 'Entrees', '/images/gyoza porc.webp'),
  ('+41 22 731 88 90', 'California roll', 'Roll avocat, concombre et surimi.', 14.50, 'Plats', '/images/california roll.jpg'),
  ('+41 22 731 88 90', 'Salmon roll special', 'Saumon, cream cheese et ciboulette.', 16.50, 'Plats', '/images/salmon roll.webp'),
  ('+41 22 731 88 90', 'Ramen miso', 'Bouillon miso, nouilles et garnitures maison.', 20.00, 'Plats', '/images/ramen miso.jpg'),
  ('+41 22 731 88 90', 'Tempura crevettes', 'Crevettes croustillantes minute.', 16.00, 'Plats', '/images/tempura crevettes.jpg'),
  ('+41 22 731 88 90', 'Mochi glaces', 'Assortiment glace du moment.', 8.50, 'Desserts', '/images/mochi-glaces.jpg'),

  ('+41 22 320 44 12', 'Bruschetta classique', 'Pain grille, tomates, basilic et huile olive.', 10.50, 'Entrees', '/images/bruschetta.jpg'),
  ('+41 22 320 44 12', 'Calzone mozzarella', 'Pizza chausson, jambon et mozzarella.', 19.00, 'Plats', '/images/calzone.webp'),
  ('+41 22 320 44 12', 'Quattro formaggi', 'Creme de fromages et finition gratinee.', 19.50, 'Plats', '/images/pizza quatre fromage.jpg'),
  ('+41 22 320 44 12', 'Diavola', 'Salami releve et mozzarella.', 18.50, 'Plats', '/images/pizza diavola.avif'),
  ('+41 22 320 44 12', 'Prosciutto e rucola', 'Jambon affiné, roquette et parmesan.', 21.00, 'Plats', '/images/prosciutto e rucola.avif'),
  ('+41 22 320 44 12', 'Truffe nera', 'Creme truffee, champignons et mozzarella.', 24.00, 'Plats', '/images/truffe nera.webp'),
  ('+41 22 320 44 12', 'Panna cotta vanille', 'Dessert frais, coulis maison.', 8.50, 'Desserts', '/images/pannacotta.webp'),

  ('+41 22 342 11 55', 'Houmous maison', 'Pois chiches, tahini et huile olive.', 9.50, 'Entrees', '/images/houmous.webp'),
  ('+41 22 342 11 55', 'Mezze du Bosphore', 'Assortiment froid a partager.', 15.00, 'Entrees', '/images/lebanese-mezze.jpeg'),
  ('+41 22 342 11 55', 'Doner sandwich', 'Viande tranchee, crudites et sauce blanche.', 12.50, 'Plats', '/images/kebab-box-spread.jpeg'),
  ('+41 22 342 11 55', 'Kebab mixte assiette', 'Viandes grillees, salade et accompagnement.', 22.00, 'Plats', '/images/doner-kebab-plate.jpeg'),
  ('+41 22 342 11 55', 'Falafel wrap', 'Wrap croustillant et sauce maison.', 16.00, 'Plats', '/images/falafel wrap.jpeg'),
  ('+41 22 342 11 55', 'Baklava pistache', 'Feuilletage, miel et pistaches.', 8.00, 'Desserts', '/images/baklava.jpg'),

  ('+41 22 738 22 30', 'Samosa legumes', 'Triangle croustillant et chutney.', 8.50, 'Entrees', '/images/samosa.jpg'),
  ('+41 22 738 22 30', 'Naan fromage', 'Pain chaud sorti du four.', 6.50, 'Entrees', '/images/naan.jpeg'),
  ('+41 22 738 22 30', 'Butter chicken', 'Sauce douce au beurre et epices.', 23.00, 'Plats', '/images/indian-curry-bowls.jpeg'),
  ('+41 22 738 22 30', 'Palak paneer', 'Epinards fondants et fromage indien.', 18.00, 'Plats', '/images/palak paneer.jpg'),
  ('+41 22 738 22 30', 'Biryani agneau', 'Riz parfume et agneau mijote.', 24.00, 'Plats', '/images/byriani.jpg'),
  ('+41 22 738 22 30', 'Curry du chef', 'Assiette genereuse aux epices maison.', 22.50, 'Plats', '/images/indian-feast.jpeg'),
  ('+41 22 738 22 30', 'Gulab jamun', 'Bouchees sucrees au sirop.', 7.50, 'Desserts', '/images/gulam jamun.jpg'),

  ('+41 22 733 99 10', 'Rouleaux croustillants', 'Entree chaude et sauce douce.', 11.00, 'Entrees', '/images/thai-spread.jpeg'),
  ('+41 22 733 99 10', 'Salade papaye verte', 'Fraiche, relevee et herbes thai.', 13.00, 'Entrees', '/images/thai-spread.jpeg'),
  ('+41 22 733 99 10', 'Pad thai crevettes', 'Nouilles, crevettes et cacahuetes.', 19.50, 'Plats', '/images/thai-pad-thai.jpeg'),
  ('+41 22 733 99 10', 'Curry vert poulet', 'Lait coco et basilic thai.', 18.00, 'Plats', '/images/thai-curry-spread.jpeg'),
  ('+41 22 733 99 10', 'Curry rouge boeuf', 'Sauce relevee et boeuf tendre.', 19.00, 'Plats', '/images/thai-curry-spread.jpeg'),
  ('+41 22 733 99 10', 'Riz gluant mangue', 'Dessert doux et fruit du jour.', 9.00, 'Desserts', '/images/acai bowl.jpg'),

  ('+41 22 732 60 70', 'Onion rings', 'Oignons croustillants a partager.', 8.00, 'Entrees', '/images/onion rings.jpg'),
  ('+41 22 732 60 70', 'Classic smash', 'Double steak, cheddar et pickles.', 16.50, 'Plats', '/images/smash-burger-single.jpeg'),
  ('+41 22 732 60 70', 'BBQ bacon', 'Sauce fumee et bacon croustillant.', 18.50, 'Plats', '/images/gourmet-burgers.jpeg'),
  ('+41 22 732 60 70', 'Truffle burger', 'Creme truffee, champignons et cheddar.', 20.00, 'Plats', '/images/burger truffe.webp'),
  ('+41 22 732 60 70', 'Veggie burger', 'Steak vegetal, avocat et tomate.', 17.50, 'Plats', '/images/veggie burger.jpg'),
  ('+41 22 732 60 70', 'Chicken crispy burger', 'Filet croustillant et sauce relevee.', 17.00, 'Plats', '/images/crispy-chicken.jpeg'),
  ('+41 22 732 60 70', 'Milkshake oreo', 'Shake cremeux aux biscuits.', 9.50, 'Desserts', '/images/milkshake-oreo.jpg'),

  ('+41 22 734 55 80', 'Rouleaux croustillants', 'Rouleaux dores servis bien chauds.', 10.00, 'Entrees', '/images/thai-spread.jpeg'),
  ('+41 22 734 55 80', 'Gyoza du dragon', 'Raviolis poeles et sauce sesame.', 11.00, 'Entrees', '/images/gyoza porc.webp'),
  ('+41 22 734 55 80', 'Tempura crevettes', 'Crevettes croustillantes minute.', 16.00, 'Plats', '/images/tempura crevettes.jpg'),
  ('+41 22 734 55 80', 'Nouilles du wok', 'Nouilles sautees sauce maison.', 18.00, 'Plats', '/images/thai-pad-thai.jpeg'),
  ('+41 22 734 55 80', 'Bol dragon sesame', 'Bol chaud aux legumes et graines.', 19.00, 'Plats', '/images/thai-spread.jpeg'),
  ('+41 22 734 55 80', 'Mochi coco', 'Dessert glace inspiration asiatique.', 8.00, 'Desserts', '/images/mochi-glaces.jpg'),

  ('+41 22 741 33 20', 'Houmous libanais', 'Pois chiches, tahini et citron.', 10.00, 'Entrees', '/images/houmous.webp'),
  ('+41 22 741 33 20', 'Taboule', 'Persil, menthe et boulgour fin.', 11.00, 'Entrees', '/images/taboule.webp'),
  ('+41 22 741 33 20', 'Shawarma poulet', 'Poulet marine et sauce ail.', 15.00, 'Plats', '/images/shawarma poulet.jpeg'),
  ('+41 22 741 33 20', 'Falafel wrap', 'Wrap croustillant et frais.', 13.00, 'Plats', '/images/falafel wrap.jpeg'),
  ('+41 22 741 33 20', 'Assiette mixte grillades', 'Grillades maison et accompagnements.', 26.00, 'Plats', '/images/assiette mixte libanaise.jpeg'),
  ('+41 22 741 33 20', 'Baklava assortie', 'Assortiment miel et fruits secs.', 9.00, 'Desserts', '/images/baklava.jpg'),

  ('+41 22 310 77 40', 'Edamame sesame', 'Petite entree fraiche et salee.', 7.50, 'Entrees', '/images/edamame.webp'),
  ('+41 22 310 77 40', 'Salmon lover', 'Saumon, avocat et riz vinaigre.', 19.50, 'Plats', '/images/poke-bowls.jpeg'),
  ('+41 22 310 77 40', 'Tuna spicy', 'Thon releve et legumes croquants.', 20.50, 'Plats', '/images/poke-bowls.jpeg'),
  ('+41 22 310 77 40', 'Veggie green', 'Tofu, kale et sauce gingembre.', 17.50, 'Plats', '/images/poke-bowls.jpeg'),
  ('+41 22 310 77 40', 'Chicken teriyaki bowl', 'Poulet laque, riz et ananas.', 18.00, 'Plats', '/images/poke-bowls.jpeg'),
  ('+41 22 310 77 40', 'Acai bowl', 'Fruits, granola et creme acai.', 14.00, 'Desserts', '/images/acai bowl.jpg'),
  ('+41 22 310 77 40', 'Smoothie vert', 'Epinards, mangue et banane.', 8.50, 'Boissons', '/images/smoothie vert.jpg'),
  ('+41 22 310 77 40', 'Kombucha maison', 'Boisson petillante du moment.', 6.50, 'Boissons', '/images/kombucha.jpeg'),

  ('+41 22 321 10 05', 'Salade du marche', 'Produits frais et herbes du jour.', 14.00, 'Entrees', '/images/salade-du-marche.jpg'),
  ('+41 22 321 10 05', 'Tartine bruschetta', 'Tartine tomate et basilic.', 10.50, 'Entrees', '/images/bruschetta.jpg'),
  ('+41 22 321 10 05', 'Lobster roll maison', 'Pain toaste, garniture marine et frites.', 24.00, 'Plats', '/images/lobster-roll-fries.jpeg'),
  ('+41 22 321 10 05', 'Poulet croustillant du jour', 'Assiette chaude avec sauce minute.', 18.00, 'Plats', '/images/chicken-bucket-fries.jpeg'),
  ('+41 22 321 10 05', 'Assiette du chef des bains', 'Plat de marche selon arrivage.', 21.00, 'Plats', '/images/octopus-fine-dining.jpeg'),
  ('+41 22 321 10 05', 'Panna cotta cafe', 'Dessert cremeux et finition cacao.', 9.00, 'Desserts', '/images/pannacotta.webp'),

  ('+41 22 738 44 55', 'Guacamole frais', 'Avocat ecrase et citron vert.', 10.00, 'Entrees', '/images/guacamole.jpg'),
  ('+41 22 738 44 55', 'Nachos supremos', 'Chips, fromage fondu et crema.', 13.00, 'Entrees', '/images/nachos.webp'),
  ('+41 22 738 44 55', 'Tacos carnitas', 'Tortillas, porc effiloche et salsa.', 14.50, 'Plats', '/images/tacos carnitas.webp'),
  ('+41 22 738 44 55', 'Burrito poulet', 'Riz, haricots et poulet grille.', 16.00, 'Plats', '/images/burrito poulet.jpg'),
  ('+41 22 738 44 55', 'Burrito boeuf', 'Boeuf epice, cheddar et salsa.', 17.00, 'Plats', '/images/burrito boeuf.jpg'),
  ('+41 22 738 44 55', 'Quesadilla fromage', 'Tortilla grillee et fromage fondant.', 12.00, 'Plats', '/images/quesadillas.jpeg'),
  ('+41 22 738 44 55', 'Churros', 'Sucre cannelle et sauce chocolat.', 8.00, 'Desserts', '/images/churros.jpg'),

  ('+41 22 740 88 15', 'Mandu grilles', 'Raviolis poeles style maison.', 11.00, 'Entrees', '/images/gyoza porc.webp'),
  ('+41 22 740 88 15', 'Korean fried chicken', 'Poulet croustillant et glaze relevee.', 18.00, 'Plats', '/images/gfc-fried-chicken.jpeg'),
  ('+41 22 740 88 15', 'Bibimbap maison', 'Bol chaud, riz, legumes et sauce gochujang.', 20.00, 'Plats', '/images/poke-bowls.jpeg'),
  ('+41 22 740 88 15', 'Japchae', 'Nouilles et legumes sautes.', 16.00, 'Plats', '/images/thai-pad-thai.jpeg'),
  ('+41 22 740 88 15', 'Poulet gochujang croustillant', 'Version relevee du poulet signature.', 19.00, 'Plats', '/images/chicken-bucket-fries.jpeg'),
  ('+41 22 740 88 15', 'Mochi sesame', 'Douceur glacee en fin de repas.', 8.50, 'Desserts', '/images/mochi-glaces.jpg'),

  ('+41 22 731 22 45', 'Assortiment oriental', 'Assiette a partager du soir.', 12.00, 'Entrees', '/images/lebanese-mezze.jpeg'),
  ('+41 22 731 22 45', 'Houmous epice', 'Creme orientale relevee.', 9.00, 'Entrees', '/images/houmous.webp'),
  ('+41 22 731 22 45', 'Couscous du chef', 'Semoule, bouillon et garnitures.', 24.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('+41 22 731 22 45', 'Grillades orientales', 'Selection chaude du grill.', 25.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('+41 22 731 22 45', 'Tajine du marche', 'Plat mijote du jour.', 22.00, 'Plats', '/images/indian-feast.jpeg'),
  ('+41 22 731 22 45', 'Baklava amandes', 'Douceur sucree de fin de service.', 8.50, 'Desserts', '/images/baklava.jpg'),

  ('+41 22 328 77 90', 'Mezze grec', 'Assortiment mediterraneen a partager.', 11.00, 'Entrees', '/images/lebanese-mezze.jpeg'),
  ('+41 22 328 77 90', 'Tzatziki maison', 'Yaourt, concombre et herbes.', 8.00, 'Entrees', '/images/houmous.webp'),
  ('+41 22 328 77 90', 'Gyros pita', 'Pita garnie et sauce blanche.', 14.00, 'Plats', '/images/greek-gyros.jpeg'),
  ('+41 22 328 77 90', 'Assiette souvlaki', 'Grillades, salade et garniture.', 20.00, 'Plats', '/images/mixed-grill-platter.jpeg'),
  ('+41 22 328 77 90', 'Salade mediterraneenne', 'Crudites, herbes et feta.', 13.00, 'Plats', '/images/fattouche.webp'),
  ('+41 22 328 77 90', 'Loukoumades', 'Bouchees sucrees au miel.', 8.50, 'Desserts', '/images/churros.jpg');

CREATE TEMP TABLE tmp_geneva_formula_blueprints (
  formula_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  discount_percent integer NOT NULL,
  image_url text NOT NULL,
  availability jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_formula_blueprints (formula_key, name, description, discount_percent, image_url, availability) VALUES
  (
    'entree_plat',
    'Entree + Plat',
    'Reduction visible quand une entree et un plat sont ajoutes ensemble.',
    12,
    '/images/bruschetta.jpg',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  ),
  (
    'plat_dessert',
    'Plat + Dessert',
    'Formule active pour completer le repas avec une note sucree.',
    15,
    '/images/pannacotta.webp',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  ),
  (
    'entree_plat_dessert',
    'Entree + Plat + Dessert',
    'Menu complet avec la meilleure remise pour la reservation et le dine-in.',
    20,
    '/images/octopus-fine-dining.jpeg',
    '{"days":["mon","tue","wed","thu","fri","sat","sun"],"servicePeriods":["lunch","dinner"],"services":{"lunch":{"enabled":true,"startTime":"12:00","endTime":"14:30"},"dinner":{"enabled":true,"startTime":"19:00","endTime":"22:30"}}}'::jsonb
  );

CREATE TEMP TABLE tmp_geneva_formula_categories (
  formula_key text NOT NULL,
  category text NOT NULL,
  course_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_formula_categories (formula_key, category, course_order) VALUES
  ('entree_plat', 'Entrees', 1),
  ('entree_plat', 'Plats', 2),
  ('plat_dessert', 'Plats', 1),
  ('plat_dessert', 'Desserts', 2),
  ('entree_plat_dessert', 'Entrees', 1),
  ('entree_plat_dessert', 'Plats', 2),
  ('entree_plat_dessert', 'Desserts', 3);

CREATE TEMP TABLE tmp_geneva_flash_sales (
  restaurant_phone text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL,
  sale_start time NOT NULL,
  sale_end time NOT NULL,
  delivery_available boolean NOT NULL,
  takeaway_available boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_flash_sales (restaurant_phone, title, description, image_url, original_price, discounted_price, quantity_available, sale_start, sale_end, delivery_available, takeaway_available) VALUES
  ('+41 22 310 55 60', 'Filets de perche minute', 'Offre visible toute la journee sur la specialite du lac.', '/images/filets de perche.jpg', 32.00, 24.90, 6, '00:00', '23:59', true, true),
  ('+41 22 731 88 90', 'Ramen miso express', 'Bol chaud a prix serre sur le service continu.', '/images/ramen miso.jpg', 20.00, 14.90, 6, '00:00', '23:59', true, true),
  ('+41 22 320 44 12', 'Pizza diavola sortie du four', 'Vente flash sur une pizza phare du comptoir.', '/images/pizza diavola.avif', 18.50, 13.90, 8, '00:00', '23:59', true, true),
  ('+41 22 342 11 55', 'Doner minute du Bosphore', 'Sandwich minute pret a emporter ou livrer.', '/images/kebab-box-spread.jpeg', 12.50, 9.50, 8, '00:00', '23:59', true, true),
  ('+41 22 738 22 30', 'Biryani agneau express', 'Reduction active toute la journee sur le biryani signature.', '/images/byriani.jpg', 24.00, 17.50, 6, '00:00', '23:59', true, true),
  ('+41 22 733 99 10', 'Pad thai express', 'Wok minute a prix flash.', '/images/thai-pad-thai.jpeg', 19.50, 14.50, 7, '00:00', '23:59', true, true),
  ('+41 22 732 60 70', 'Classic smash midi', 'Burger star en reduction sur le service rapide.', '/images/smash-burger-single.jpeg', 16.50, 12.90, 8, '00:00', '23:59', true, true),
  ('+41 22 734 55 80', 'Nouilles du wok minute', 'Wok chaud et visible toute la journee.', '/images/thai-pad-thai.jpeg', 18.00, 13.50, 6, '00:00', '23:59', true, true),
  ('+41 22 741 33 20', 'Shawarma poulet minute', 'Wrap chaud pret a emporter ou livrer.', '/images/shawarma poulet.jpeg', 15.00, 11.90, 7, '00:00', '23:59', true, true),
  ('+41 22 310 77 40', 'Poke saumon signature', 'Bol frais mis en avant toute la journee.', '/images/poke-bowls.jpeg', 19.50, 14.90, 7, '00:00', '23:59', true, true),
  ('+41 22 321 10 05', 'Lobster roll comptoir', 'Brunch premium en vente flash.', '/images/lobster-roll-fries.jpeg', 24.00, 18.50, 5, '00:00', '23:59', true, true),
  ('+41 22 738 44 55', 'Burrito boeuf express', 'Burrito chaud pret en quelques minutes.', '/images/burrito boeuf.jpg', 17.00, 12.90, 7, '00:00', '23:59', true, true),
  ('+41 22 740 88 15', 'Korean fried chicken hot', 'Poulet croustillant mis en avant en continu.', '/images/gfc-fried-chicken.jpeg', 18.00, 13.90, 7, '00:00', '23:59', true, true),
  ('+41 22 731 22 45', 'Couscous oriental minute', 'Plat chaud du jour en prix flash.', '/images/mixed-grill-platter.jpeg', 24.00, 18.00, 6, '00:00', '23:59', true, true),
  ('+41 22 328 77 90', 'Gyros pita minute', 'Gyros chaud et genereux a prix flash.', '/images/greek-gyros.jpeg', 14.00, 10.90, 7, '00:00', '23:59', true, true);

CREATE TEMP TABLE tmp_geneva_anti_waste_offers (
  restaurant_phone text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  offer_type text NOT NULL,
  original_price numeric NOT NULL,
  discounted_price numeric NOT NULL,
  quantity_available integer NOT NULL,
  pickup_start time NOT NULL,
  pickup_end time NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_anti_waste_offers (restaurant_phone, title, description, image_url, offer_type, original_price, discounted_price, quantity_available, pickup_start, pickup_end) VALUES
  ('+41 22 310 55 60', 'Box fondue genevoise', 'Portion du soir pour limiter les pertes en fin de service.', '/images/fondue-moitie-moitie.jpg', 'regular', 28.50, 18.90, 4, '18:00', '23:59'),
  ('+41 22 731 88 90', 'Sushi mix de fin de service', 'Selection du comptoir a emporter avant fermeture.', '/images/california roll.jpg', 'regular', 26.00, 16.90, 4, '18:00', '23:59'),
  ('+41 22 320 44 12', 'Box calzone du soir', 'Pieces restantes remises proprement en panier du soir.', '/images/calzone.webp', 'regular', 19.00, 12.50, 4, '18:00', '23:59'),
  ('+41 22 342 11 55', 'Box mezze et pain chaud', 'Mezzes et accompagnement en recuperation tardive.', '/images/lebanese-mezze.jpeg', 'regular', 15.00, 10.50, 4, '18:00', '23:59'),
  ('+41 22 738 22 30', 'Box curry du soir', 'Preparation chaude remise a petit prix avant fermeture.', '/images/indian-feast.jpeg', 'regular', 22.50, 14.90, 4, '18:00', '23:59'),
  ('+41 22 733 99 10', 'Box curry thai du soir', 'Assortiment chaud de fin de service.', '/images/thai-curry-spread.jpeg', 'regular', 18.50, 12.50, 4, '18:00', '23:59'),
  ('+41 22 732 60 70', 'Box burger et sides', 'Burger complet et side pour ecouler le dernier service.', '/images/burgers-wings.jpeg', 'regular', 22.00, 14.90, 4, '18:00', '23:59'),
  ('+41 22 734 55 80', 'Box asiatique du soir', 'Pieces de comptoir et bol chaud avant fermeture.', '/images/thai-spread.jpeg', 'regular', 19.00, 12.90, 4, '18:00', '23:59'),
  ('+41 22 741 33 20', 'Panier mezze du soir', 'Selection froide du soir a recuperer rapidement.', '/images/lebanese-mezze.jpeg', 'regular', 18.00, 12.50, 4, '18:00', '23:59'),
  ('+41 22 310 77 40', 'Panier healthy du soir', 'Bol surprise healthy avec produits du jour.', '/images/poke-bowls.jpeg', 'surprise_bag', 17.50, 12.90, 4, '18:00', '23:59'),
  ('+41 22 321 10 05', 'Panier brunch tardif', 'Selection tardive du comptoir a prix reduit.', '/images/salade-du-marche.jpg', 'surprise_bag', 18.00, 12.90, 4, '18:00', '23:59'),
  ('+41 22 738 44 55', 'Box tacos fiesta', 'Selection mexicaine du soir a emporter.', '/images/tacos carnitas.webp', 'regular', 16.00, 11.50, 4, '18:00', '23:59'),
  ('+41 22 740 88 15', 'Box Seoul street food', 'Street food coreenne encore parfaite en fin de service.', '/images/gfc-fried-chicken.jpeg', 'regular', 16.00, 11.90, 4, '18:00', '23:59'),
  ('+41 22 731 22 45', 'Panier oriental du soir', 'Offre solidaire de fin de journee.', '/images/lebanese-mezze.jpeg', 'solidarity', 18.00, 12.90, 4, '18:00', '23:59'),
  ('+41 22 328 77 90', 'Box mezze grecque', 'Panier mediterraneen remis en fin de service.', '/images/lebanese-mezze.jpeg', 'regular', 15.00, 11.00, 4, '18:00', '23:59');

CREATE TEMP TABLE tmp_geneva_chefs_table (
  restaurant_phone text NOT NULL,
  chef_name text NOT NULL,
  dish_name text NOT NULL,
  description text NOT NULL,
  image_url text NOT NULL,
  price numeric NOT NULL,
  original_price numeric NOT NULL,
  total_portions integer NOT NULL,
  drop_offset_hours integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_geneva_chefs_table (restaurant_phone, chef_name, dish_name, description, image_url, price, original_price, total_portions, drop_offset_hours) VALUES
  ('+41 22 310 55 60', 'Chef Antoine Perrin', 'Longeole glacee au jus court', 'Service en petite serie avec garniture du marche.', '/images/longeole.avif', 39.00, 48.00, 12, 20),
  ('+41 22 731 88 90', 'Chef Takeshi Sato', 'Salmon roll flambe', 'Creation minute flambe au comptoir devant le client.', '/images/salmon roll.webp', 32.00, 39.00, 10, 21),
  ('+41 22 320 44 12', 'Chef Luigi Mancini', 'Truffe nera al taglio', 'Part individuelle servie chaude avec finition truffee.', '/images/truffe nera.webp', 34.00, 42.00, 10, 22),
  ('+41 22 342 11 55', 'Chef Mehmet Kaya', 'Kebab mixte du chef', 'Version premium du grill, portion courte et rythme minute.', '/images/doner-kebab-plate.jpeg', 31.00, 38.00, 10, 23),
  ('+41 22 738 22 30', 'Chef Arjun Malhotra', 'Butter chicken fumant', 'Assiette servie en petit nombre sur la soiree.', '/images/indian-curry-bowls.jpeg', 33.00, 40.00, 10, 24),
  ('+41 22 733 99 10', 'Chef Pimlada Sorn', 'Wok thai du chef', 'Wok de soiree au rythme du comptoir et des herbes fraiches.', '/images/thai-spread.jpeg', 31.00, 38.00, 10, 25),
  ('+41 22 732 60 70', 'Chef Noah Becker', 'Truffle burger minute', 'Burger monte a la minute, cuisson et creme truffee.', '/images/burger truffe.webp', 29.00, 35.00, 12, 26),
  ('+41 22 734 55 80', 'Chef Lin Zhao', 'Dragon tempura', 'Experience courte autour de la friture minute.', '/images/tempura crevettes.jpg', 30.00, 36.00, 10, 27),
  ('+41 22 741 33 20', 'Chef Karim Haddad', 'Assiette mixte braisee', 'Grand plat partage et portions limitees pour le service.', '/images/assiette mixte libanaise.jpeg', 34.00, 41.00, 10, 28),
  ('+41 22 310 77 40', 'Chef Lea Morel', 'Salmon lover signature', 'Bol signature travaille en petite serie avec dressage minute.', '/images/poke-bowls.jpeg', 32.00, 39.00, 12, 29),
  ('+41 22 321 10 05', 'Chef Claire Vautier', 'Assiette du chef des bains', 'Service du soir autour du produit de marche et du dressage.', '/images/octopus-fine-dining.jpeg', 36.00, 44.00, 10, 30),
  ('+41 22 738 44 55', 'Chef Rafael Ortega', 'Tacos carnitas signature', 'Serie courte de tacos minute et toppings frais.', '/images/tacos carnitas.webp', 28.00, 34.00, 12, 31),
  ('+41 22 740 88 15', 'Chef Min Seo Han', 'Bibimbap du chef', 'Bol chaud, service rythme et portions reservees a l avance.', '/images/poke-bowls.jpeg', 30.00, 37.00, 10, 32),
  ('+41 22 731 22 45', 'Chef Samir El Idrissi', 'Tajine du marche', 'Plat mijote en petit nombre pour le service du soir.', '/images/indian-feast.jpeg', 33.00, 40.00, 10, 33),
  ('+41 22 328 77 90', 'Chef Yannis Petropoulos', 'Souvlaki au charbon', 'Grillade courte serie, service assis et portions limitees.', '/images/mixed-grill-platter.jpeg', 31.00, 38.00, 10, 34);

DO $$
DECLARE
  v_owner uuid;
  v_opening_hours jsonb;
BEGIN
  SELECT user_id
  INTO v_owner
  FROM public.user_roles
  WHERE role = 'restaurateur'
  LIMIT 1;

  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    RAISE NOTICE 'Skipping Geneva demo catalog completion because no owner account exists yet.';
    RETURN;
  END IF;

  v_opening_hours := jsonb_build_object(
    'lundi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'mardi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'mercredi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'jeudi', jsonb_build_object('open', '12:00', 'close', '22:30'),
    'vendredi', jsonb_build_object('open', '12:00', 'close', '23:00'),
    'samedi', jsonb_build_object('open', '12:00', 'close', '23:00'),
    'dimanche', jsonb_build_object('open', '12:00', 'close', '21:30'),
    'service_settings', jsonb_build_object(
      'lunch', jsonb_build_object(
        'start_time', '12:00',
        'end_time', '14:30',
        'last_reservation_time', '14:00',
        'max_covers', 60,
        'min_party_size', 1,
        'max_party_size', 8,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      ),
      'dinner', jsonb_build_object(
        'start_time', '19:00',
        'end_time', '22:30',
        'last_reservation_time', '22:00',
        'max_covers', 80,
        'min_party_size', 1,
        'max_party_size', 10,
        'online_booking_enabled', true,
        'service_closed', false,
        'service_note', ''
      )
    )
  );

  UPDATE public.restaurants AS r
  SET
    owner_id = COALESCE(r.owner_id, v_owner),
    name = t.name,
    description = t.description,
    cuisine_type = t.cuisine_type,
    address = t.address,
    city = t.city,
    rating = t.rating,
    review_count = t.review_count,
    price_range = t.price_range,
    is_active = true,
    is_featured = true,
    delivery_available = true,
    delivery_fee = t.delivery_fee,
    min_order_amount = t.min_order_amount,
    latitude = t.latitude,
    longitude = t.longitude,
    image_url = t.image_url,
    supports_pickup = true,
    supports_dinein = true,
    supports_reservation = true,
    supports_group_orders = true,
    supports_scheduled = true,
    supports_scheduled_orders = true,
    status = 'active',
    disabled_dashboard_features = '{}'::text[],
    opening_hours = jsonb_strip_nulls(COALESCE(r.opening_hours, '{}'::jsonb) || v_opening_hours)
  FROM tmp_geneva_restaurants AS t
  WHERE r.phone = t.phone;

  INSERT INTO public.restaurants (
    owner_id,
    name,
    description,
    cuisine_type,
    address,
    city,
    phone,
    rating,
    review_count,
    price_range,
    is_active,
    is_featured,
    delivery_available,
    delivery_fee,
    min_order_amount,
    latitude,
    longitude,
    image_url,
    opening_hours,
    supports_pickup,
    supports_dinein,
    supports_reservation,
    supports_group_orders,
    supports_scheduled,
    supports_scheduled_orders,
    status,
    disabled_dashboard_features
  )
  SELECT
    v_owner,
    t.name,
    t.description,
    t.cuisine_type,
    t.address,
    t.city,
    t.phone,
    t.rating,
    t.review_count,
    t.price_range,
    true,
    true,
    true,
    t.delivery_fee,
    t.min_order_amount,
    t.latitude,
    t.longitude,
    t.image_url,
    v_opening_hours,
    true,
    true,
    true,
    true,
    true,
    true,
    'active',
    '{}'::text[]
  FROM tmp_geneva_restaurants AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.restaurants AS r
    WHERE r.phone = t.phone
  );
END $$;

CREATE TEMP TABLE tmp_geneva_target_restaurants ON COMMIT DROP AS
SELECT
  t.phone,
  r.id AS restaurant_id
FROM tmp_geneva_restaurants AS t
JOIN public.restaurants AS r
  ON r.phone = t.phone;

UPDATE public.menu_items
SET is_available = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_geneva_target_restaurants
);

UPDATE public.menu_items AS mi
SET
  description = t.description,
  price = t.price,
  category = t.category,
  image_url = t.image_url,
  is_available = true,
  is_exclusive = false,
  exclusive_type = NULL
FROM tmp_geneva_menu_items AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE mi.restaurant_id = tr.restaurant_id
  AND lower(mi.name) = lower(t.name);

INSERT INTO public.menu_items (
  restaurant_id,
  name,
  description,
  price,
  category,
  is_available,
  image_url,
  is_exclusive,
  exclusive_type
)
SELECT
  tr.restaurant_id,
  t.name,
  t.description,
  t.price,
  t.category,
  true,
  t.image_url,
  false,
  NULL
FROM tmp_geneva_menu_items AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE NOT EXISTS (
  SELECT 1
  FROM public.menu_items AS mi
  WHERE mi.restaurant_id = tr.restaurant_id
    AND lower(mi.name) = lower(t.name)
);

UPDATE public.meal_formulas
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_geneva_target_restaurants
)
AND (
  COALESCE(is_standard, false) = true
  OR formula_key IN (SELECT formula_key FROM tmp_geneva_formula_blueprints)
);

UPDATE public.meal_formulas AS mf
SET
  name = b.name,
  description = b.description,
  discount_percent = b.discount_percent,
  applies_to = 'both',
  image_url = b.image_url,
  is_active = true,
  is_standard = true,
  availability = b.availability
FROM tmp_geneva_formula_blueprints AS b
JOIN tmp_geneva_target_restaurants AS tr
  ON true
WHERE mf.restaurant_id = tr.restaurant_id
  AND mf.formula_key = b.formula_key;

INSERT INTO public.meal_formulas (
  restaurant_id,
  name,
  description,
  formula_key,
  discount_percent,
  applies_to,
  image_url,
  is_active,
  is_standard,
  availability
)
SELECT
  tr.restaurant_id,
  b.name,
  b.description,
  b.formula_key,
  b.discount_percent,
  'both',
  b.image_url,
  true,
  true,
  b.availability
FROM tmp_geneva_target_restaurants AS tr
CROSS JOIN tmp_geneva_formula_blueprints AS b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.meal_formulas AS mf
  WHERE mf.restaurant_id = tr.restaurant_id
    AND mf.formula_key = b.formula_key
);

DELETE FROM public.meal_formula_categories AS mfc
USING public.meal_formulas AS mf
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.restaurant_id = mf.restaurant_id
WHERE mfc.formula_id = mf.id
  AND mf.formula_key IN (SELECT formula_key FROM tmp_geneva_formula_blueprints);

INSERT INTO public.meal_formula_categories (
  formula_id,
  category,
  course_order
)
SELECT
  mf.id,
  c.category,
  c.course_order
FROM public.meal_formulas AS mf
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.restaurant_id = mf.restaurant_id
JOIN tmp_geneva_formula_categories AS c
  ON c.formula_key = mf.formula_key
WHERE mf.formula_key IN (SELECT formula_key FROM tmp_geneva_formula_blueprints);

UPDATE public.flash_sales
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_geneva_target_restaurants
);

UPDATE public.flash_sales AS fs
SET
  description = t.description,
  image_url = t.image_url,
  original_price = t.original_price,
  discounted_price = t.discounted_price,
  quantity_available = LEAST(COALESCE(fs.quantity_available, t.quantity_available), t.quantity_available),
  sale_date = current_date,
  sale_start = t.sale_start,
  sale_end = t.sale_end,
  delivery_available = t.delivery_available,
  takeaway_available = t.takeaway_available,
  is_active = true,
  updated_at = now()
FROM tmp_geneva_flash_sales AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE fs.restaurant_id = tr.restaurant_id
  AND lower(fs.title) = lower(t.title);

INSERT INTO public.flash_sales (
  restaurant_id,
  title,
  description,
  image_url,
  original_price,
  discounted_price,
  quantity_available,
  sale_date,
  sale_start,
  sale_end,
  is_active,
  delivery_available,
  takeaway_available
)
SELECT
  tr.restaurant_id,
  t.title,
  t.description,
  t.image_url,
  t.original_price,
  t.discounted_price,
  t.quantity_available,
  current_date,
  t.sale_start,
  t.sale_end,
  true,
  t.delivery_available,
  t.takeaway_available
FROM tmp_geneva_flash_sales AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE NOT EXISTS (
  SELECT 1
  FROM public.flash_sales AS fs
  WHERE fs.restaurant_id = tr.restaurant_id
    AND lower(fs.title) = lower(t.title)
);

UPDATE public.anti_waste_offers
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_geneva_target_restaurants
);

UPDATE public.anti_waste_offers AS awo
SET
  description = t.description,
  image_url = t.image_url,
  offer_type = t.offer_type,
  original_price = t.original_price,
  discounted_price = t.discounted_price,
  quantity_available = LEAST(COALESCE(awo.quantity_available, t.quantity_available), t.quantity_available),
  pickup_start = t.pickup_start,
  pickup_end = t.pickup_end,
  available_date = current_date,
  is_active = true
FROM tmp_geneva_anti_waste_offers AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE awo.restaurant_id = tr.restaurant_id
  AND lower(awo.title) = lower(t.title);

INSERT INTO public.anti_waste_offers (
  restaurant_id,
  title,
  description,
  image_url,
  offer_type,
  original_price,
  discounted_price,
  quantity_available,
  pickup_start,
  pickup_end,
  available_date,
  is_active
)
SELECT
  tr.restaurant_id,
  t.title,
  t.description,
  t.image_url,
  t.offer_type,
  t.original_price,
  t.discounted_price,
  t.quantity_available,
  t.pickup_start,
  t.pickup_end,
  current_date,
  true
FROM tmp_geneva_anti_waste_offers AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE NOT EXISTS (
  SELECT 1
  FROM public.anti_waste_offers AS awo
  WHERE awo.restaurant_id = tr.restaurant_id
    AND lower(awo.title) = lower(t.title)
);

UPDATE public.chef_table_drops
SET is_active = false
WHERE restaurant_id IN (
  SELECT restaurant_id FROM tmp_geneva_target_restaurants
);

UPDATE public.chef_table_drops AS ctd
SET
  chef_name = t.chef_name,
  description = t.description,
  image_url = t.image_url,
  price = t.price,
  original_price = t.original_price,
  total_portions = t.total_portions,
  remaining_portions = LEAST(COALESCE(ctd.remaining_portions, t.total_portions), t.total_portions),
  drop_time = date_trunc('minute', now() + make_interval(hours => t.drop_offset_hours)),
  is_active = true,
  updated_at = now()
FROM tmp_geneva_chefs_table AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE ctd.restaurant_id = tr.restaurant_id
  AND lower(ctd.dish_name) = lower(t.dish_name);

INSERT INTO public.chef_table_drops (
  restaurant_id,
  dish_name,
  chef_name,
  description,
  image_url,
  price,
  original_price,
  total_portions,
  remaining_portions,
  drop_time,
  is_active
)
SELECT
  tr.restaurant_id,
  t.dish_name,
  t.chef_name,
  t.description,
  t.image_url,
  t.price,
  t.original_price,
  t.total_portions,
  t.total_portions,
  date_trunc('minute', now() + make_interval(hours => t.drop_offset_hours)),
  true
FROM tmp_geneva_chefs_table AS t
JOIN tmp_geneva_target_restaurants AS tr
  ON tr.phone = t.restaurant_phone
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chef_table_drops AS ctd
  WHERE ctd.restaurant_id = tr.restaurant_id
    AND lower(ctd.dish_name) = lower(t.dish_name)
);

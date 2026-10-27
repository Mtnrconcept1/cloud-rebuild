# TOK — Stratégie réseaux sociaux et génération de leads à budget zéro

Version du 27 octobre 2026. Périmètre : Genève d'abord, restaurateurs (B2B) et clients (B2C).
Budget média : 0 CHF. Ressources mobilisées : outils déjà livrés dans TOK, connecteurs et skills
disponibles dans les sessions Claude, comptes gratuits des plateformes.

Ce document est une stratégie. Il ne publie rien, n'active aucune automatisation et ne modifie
aucune donnée. Chaque diffusion reste soumise aux approbations natives de TOK et à la validation
Telegram décrites dans [SOCIAL_EDITORIAL_POLICY.md](SOCIAL_EDITORIAL_POLICY.md) et
[TELEGRAM_CONTENT_REVIEWS.md](TELEGRAM_CONTENT_REVIEWS.md).

---

## 1. Résumé exécutif

**Constat.** TOK publie déjà (56 posts Meta diffusés) et possède 4 841 prospects restaurateurs, mais
la plateforme ne compte que 34 comptes utilisateurs et 3 inscriptions restaurateurs approuvées. Aucun
lien publié ne porte d'UTM et aucune source d'acquisition n'est enregistrée : il est aujourd'hui
impossible de savoir ce que les réseaux sociaux rapportent.

**Thèse.** À budget zéro, la portée ne s'achète pas : elle s'emprunte. Les 3 840 restaurants déjà
présents dans l'annuaire TOK, sans compte, sont à la fois le contenu, le canal de diffusion et la
cible commerciale. Chaque restaurant mis en avant partage le contenu à sa communauté, ce qui ouvre une
conversation commerciale chaleureuse au lieu d'une prospection à froid.

**Quatre moteurs, dans cet ordre :**

1. **Guide → mention → conversation → fiche revendiquée** : des guides de quartier publiés sur
   Instagram et Facebook citent de vrais restaurants. Les restaurants mentionnés repartagent, TOK
   engage la conversation et propose de revendiquer la fiche existante.
2. **Kit partenaire** : chaque restaurant signé reçoit de quoi faire la promotion de TOK auprès de
   ses propres clients (QR code, lien Google « Réserver », stories prêtes, posts Collab).
3. **Drops locaux** : ventes flash, anti-gaspi et Miamz annoncés en stories et sur un canal
   WhatsApp/Telegram gratuit, pour convertir et fidéliser les clients.
4. **Autorité** : prise de parole du fondateur sur LinkedIn, presse locale et l'angle inédit
   « réserver un restaurant genevois depuis ChatGPT » (TOK Connect).

**Stratégie de densité.** Conquérir un quartier avant d'en ouvrir un autre. **Carouge** en premier :
246 restaurants recensés, 14 déjà sur TOK, zone compacte et culture « food ». Un client doit trouver
plusieurs restaurants TOK à cinq minutes à pied ; un restaurateur doit voir ses voisins sur TOK.

**Priorité absolue de la semaine 1 :** rendre la mesure possible (UTM + capture de la source). Sans
cela, chaque autre action reste invérifiable.

---

## 2. Diagnostic chiffré

Lectures du 27 octobre 2026. Requêtes SQL agrégées en lecture seule sur le projet Supabase de
production, sans aucune donnée personnelle extraite ; Metricool et Vercel interrogés via leurs
connecteurs.

### 2.1 Offre et marché

| Mesure | Valeur | Lecture |
| --- | ---: | --- |
| Restaurants en base | 4 050 | Couverture très large du canton |
| Fiches annuaire sans compte | 3 840 | Réservoir de leads « déjà sur TOK » |
| Restaurants hors annuaire | 210 | Inclut des comptes de démonstration ou de test : à qualifier |
| Genève (ville) | 2 542 recensés, 130 hors annuaire | Marché principal |
| Carouge | 246 recensés, 14 hors annuaire | Quartier pilote recommandé |
| Meyrin / Plan-les-Ouates / Versoix / Onex / Vernier | 58 à 106 chacun | Vagues suivantes |

### 2.2 Pipeline commercial

| Mesure | Valeur | Lecture |
| --- | ---: | --- |
| Contacts « restaurant_prospect » | 4 841 (statut `new`) | Jamais travaillés |
| Contacts avec e-mail | 1 682 | Pas de consentement : envoi de masse exclu (voir § 10) |
| Leads qualifiés | 2 | Le goulot est la qualification, pas la base |
| Contacts consentis non opposés | 6 | Base e-mail marketing quasi vide |
| Inscriptions restaurateurs | 3 approuvées, 1 en revue | |

### 2.3 Demande client

| Mesure | Valeur |
| --- | ---: |
| Comptes utilisateurs | 34 (10 sur 30 jours) |
| Réservations | 27 (8 sur 30 jours) |
| Commandes | 3 (toutes sur 30 jours) |
| Comptes fidélité | 0 |
| Posts sur le réseau social TOK (Actualités) | 3 publiés |

### 2.4 Réseaux sociaux et mesure

| Mesure | Valeur | Lecture |
| --- | ---: | --- |
| Posts Meta publiés | 56 (29 Facebook, 27 Instagram) | La publication directe fonctionne |
| Brouillons en attente | 23 Instagram, 8 Facebook, 13 e-mails, 1 in-app | Stock à trier avant de produire plus |
| Échecs de publication | 4 (2 Instagram, 2 Facebook) | À diagnostiquer dans Journal |
| UTM dans les liens Meta publiés | Aucun | Seule la veille Instagram ajoute des UTM |
| Événements `page_view` sur 30 jours | 0 | Émis uniquement pour un visiteur connecté sur l'accueil |
| Source d'acquisition à l'inscription | Non capturée | Ni champ « Comment avez-vous connu TOK ? », ni first-touch |
| Vercel Web Analytics | Non activé (réponse 404 du connecteur) | |
| Metricool | Relié à la marque `stoppin_gva`, pas à TOK | Décision documentée : voie Meta directe pour TOK |
| Search Console (rapport du 18 septembre) | 10 pages indexées sur 860 connues | À remesurer ; correctifs SEO livrés depuis |

### 2.5 Ce que cela implique

- Produire davantage de posts n'est pas le levier. Le levier est de **transformer l'attention en
  conversations**, puis les conversations en fiches revendiquées et en réservations.
- La base de 4 841 prospects a de la valeur pour la **qualification 1:1** (appel, DM, visite, e-mail
  individuel), pas pour un envoi en masse.
- Le côté client ne décollera qu'avec une **densité locale** de restaurants actifs. Chaque restaurant
  signé doit devenir un canal d'acquisition client.

---

## 3. Positionnement et messages

Règles : uniquement des faits vérifiables, sans fausse urgence, sans chiffre de performance inventé,
sans nommer un concurrent dans un support public (formulation « les autres plateformes »).

### 3.1 Restaurateurs (B2B)

| Message | Preuve | Page de destination |
| --- | --- | --- |
| « Une table de 10 vous coûte 5 CHF, pas 62. » | Forfait CHF 5 par réservation honorée, quelle que soit la taille de la table ([fair-growth-business-model.md](../fair-growth-business-model.md)) | `/restaurateurs/alternative-commission-couvert` |
| « Votre restaurant est déjà sur TOK. Reprenez la main sur votre fiche. » | Fiche annuaire existante, parcours de revendication intégré | Fiche du restaurant, puis `/auth?claimRestaurant=…` |
| « Vous dites ce que vous voulez annoncer, TOK crée le visuel. » | Campaign Studio, Photo Pro, références de marque persistantes | `/restaurateurs/geneve` |
| « Le client arrive, son plat est prêt. » | Zéro attente : précommande et prépaiement | `/zero-attente` |
| « 100 % des pourboires restent au restaurant. » | Règle tarifaire | `/restaurateurs/geneve` |

Accroche principale : **« Payez la table, pas les couverts. »**

### 3.2 Clients (B2C)

| Message | Fonctionnalité | Page |
| --- | --- | --- |
| « Commandez avant d'arriver, mangez sans attendre. » | Zéro attente | `/zero-attente` |
| « Les bonnes affaires de dernière minute près de chez vous. » | Ventes flash | `/ventes-flash` |
| « Sauvez un repas, payez moins. » | Anti-gaspi | `/anti-gaspi` |
| « Découvrez les adresses de votre quartier. » | Recherche et pages ville/catégorie | `/recherche`, `/restaurants/:city/:category` |
| « Vos repas vous rapportent des Miamz à offrir. » | Points cadeaux, Miamz solidaires | `/miamz-solidaires` |

---

## 4. Les quatre moteurs

### Moteur 1 — Guide → mention → conversation → fiche revendiquée

C'est le moteur principal : il produit en même temps du contenu client et des leads restaurateurs.

```text
Guide de quartier publié (Instagram carrousel + Facebook + TOK Actualités)
        │  mentionne 5 à 7 vrais restaurants avec leur compte Instagram
        ▼
Les restaurants mentionnés reçoivent une notification et repartagent en story
        │  portée gratuite auprès de leurs abonnés locaux
        ▼
DM personnalisé de TOK : « Merci du partage ! Votre fiche TOK existe déjà… »
        │
        ▼
Revendication de la fiche, démonstration live, puis abonnement
```

**Exécution**

1. **Choisir le thème** du guide : « 6 terrasses chauffées à Carouge », « Où manger après 22 h à
   Plainpalais », « Brunchs du dimanche aux Eaux-Vives », « Meilleurs menus du midi sous 25 CHF ».
   Uniquement des critères vérifiables (horaires, terrasse, prix affichés sur la carte publique).
2. **Sélectionner les restaurants** : mélanger 1 à 2 partenaires TOK et 4 à 5 fiches annuaire.
   Vérifier les informations publiques et le compte Instagram exact de chaque établissement.
3. **Produire** avec le Studio marketing : carrousel 4:5, une diapositive par restaurant, lien vers
   la fiche TOK. Photos : uniquement des médias autorisés (photos propres au restaurant repartagées
   avec accord, ou visuels TOK sans photo de plat d'un tiers).
4. **Publier** par la voie Meta directe après approbation et validation Telegram. Mentionner les
   comptes dans la légende (5 hashtags au maximum).
5. **Converser** : chaque restaurant qui réagit, commente ou repartage reçoit un DM individuel dans
   les 24 heures (script en annexe A). Consigner la conversation comme tâche `manual_call` ou
   `manual_email` dans le centre marketing.
6. **Convertir** : proposer une démonstration de 15 minutes (`/commercial/demo-live`), puis la
   revendication de la fiche.

**Cadence** : 2 guides par semaine, soit environ 12 restaurants mentionnés par semaine.

**Amplification gratuite** : la fonction **Collab** d'Instagram (co-auteur) avec un restaurant
partenaire affiche le post dans les deux fils. À utiliser pour chaque « Restaurant de la semaine ».

### Moteur 2 — Kit partenaire : chaque restaurant devient un canal

Un restaurant signé a déjà des clients, des abonnés et une fiche Google. Le kit transforme ces actifs
en acquisition pour TOK, sans dépense.

| Élément du kit | Outil TOK | Effet |
| --- | --- | --- |
| Lien « Réserver » sur Google Business Profile | `https://www.thetok.ch/r/{booking_slug}/reserver`, page `/restaurateurs/google-business` | Les recherches Google deviennent des réservations TOK |
| QR code de table et de vitrine | Lien de réservation ou fiche restaurant avec UTM `utm_medium=qr` | Les clients présents installent TOK |
| 3 stories prêtes : « Réservez-nous sur TOK », « Zéro attente disponible », « Vente flash ce soir » | Studio marketing du restaurant, références de marque | Annonce sur les comptes du restaurant |
| Post Collab de bienvenue | Co-auteur Instagram TOK + restaurant | Double audience |
| Lien en bio du restaurant | Fiche TOK ou page de réservation | Trafic permanent |
| Widget TOK Pulse | App iPhone TOK | Visibilité des offres en temps réel |
| Publications sur TOK Actualités | Réseau social TOK | Contenu dans un fil déjà orienté « où manger » |

**Règle d'activation** : un restaurant n'est « actif » que lorsque le lien Google et le QR code sont
en place. Viser une activation complète dans les 7 jours suivant la signature.

### Moteur 3 — Drops locaux : convertir et fidéliser les clients

1. Créer un **canal WhatsApp** et/ou un **canal Telegram public** « TOK Genève — bons plans »
   (gratuits, diffusion à sens unique, adhésion volontaire = consentement explicite).
2. Annoncer uniquement des offres réelles : ventes flash, paniers anti-gaspi, Tables du Chef,
   créneaux garantis. Une à deux publications par jour au maximum.
3. Relayer chaque drop en story Instagram avec un sticker lien UTM, et sur TOK Actualités.
4. Récompenser le partage avec des **Miamz** (monnaie interne, coût cash nul) : par exemple,
   « Partagez votre réservation en story et mentionnez @tok_suisse ». Définir le barème dans
   `/admin/loyalty` avant d'annoncer quoi que ce soit.
5. Inviter chaque nouveau compte à rejoindre le canal : c'est la base consentie qui manque aujourd'hui
   (6 contacts consentis).

### Moteur 4 — Autorité : fondateur, presse, communautés, IA

| Action | Canal | Fréquence |
| --- | --- | --- |
| Construire en public : chiffres réels, décisions, coulisses | LinkedIn personnel du fondateur | 2 posts par semaine |
| Pédagogie restaurateur : « Combien coûte vraiment une réservation ? » | LinkedIn, groupes Facebook de restaurateurs | 1 par semaine |
| Proposition de sujet presse locale | GHI, GoLunch ([marketing-backlink-opportunities.md](../marketing-backlink-opportunities.md)) | Après les 10 premiers restaurants actifs à Carouge |
| Angle inédit : « Réserver un restaurant genevois depuis ChatGPT » | Communiqué, LinkedIn, presse tech romande | Une fois, avec démonstration vidéo réelle |
| Participation utile dans les groupes locaux (expatriés, quartiers, bons plans) | Facebook | Selon le règlement de chaque groupe, sans spam |

---

## 5. Plateformes, formats et horaires

### 5.1 Rôle de chaque plateforme

| Plateforme | Rôle | Format prioritaire | Cadence cible |
| --- | --- | --- | --- |
| Instagram `@tok_suisse` | Vitrine B2C et moteur 1 | Carrousels guides, reels courts, stories quotidiennes | 4 à 5 posts et stories chaque jour |
| Facebook (Page TOK) | Relais B2C et groupes locaux | Mêmes contenus adaptés, plus courts | 3 à 4 posts par semaine |
| LinkedIn | B2B et autorité | Posts texte du fondateur, carrousels PDF | 2 à 3 par semaine |
| TikTok | Portée organique B2C | Reels recyclés : POV zéro attente, coulisses | 3 par semaine, après validation des reels Instagram |
| Google Business Profile (TOK et partenaires) | Intention de recherche | Lien de réservation, posts d'offres | Configuration une fois, puis un post par semaine |
| WhatsApp / Telegram (canal) | Rétention et drops | Message court + lien | 1 à 2 par jour |
| TOK Actualités | Réseau de niche « où manger » | Posts restaurants et TOK | Chaque contenu B2C y est aussi publié |

TikTok, LinkedIn, Google Business et Telegram sont `disconnected` dans le centre marketing : la
publication y reste manuelle, puis est consignée comme telle dans le calendrier.

### 5.2 Horaires

Indice Metricool « meilleur moment » (fuseau Europe/Paris, identique à Zurich), lu sur la seule marque
connectée (`stoppin_gva`, audience genevoise). C'est un **indicateur de départ**, pas une mesure de
l'audience TOK.

| Jour | Pic principal | Pic secondaire |
| --- | --- | --- |
| Lundi | 10 h (5 528) | 18 h (4 206) |
| Mardi | 10 h (4 942) | 18 h (4 788) |
| Mercredi | 10 h (6 506) | 18 h (4 869) |
| Jeudi | 10 h (6 275) | 18 h (5 078) |
| Vendredi | 10 h (6 734) | 12 h (5 909) |
| Samedi | 10 h (3 409) | 18 h (2 393) |
| Dimanche | 10 h (2 582) | 18 h (2 253) |

Application :

- **B2C** : 10 h à 11 h 30 (décision du midi) et 17 h 30 à 18 h 30 (décision du soir). Le week-end
  représente environ la moitié de l'activité de semaine : y placer les stories de drops, pas les
  contenus phares.
- **B2B** : les restaurateurs consultent leur téléphone entre les services. Publier vers 15 h, et le
  lundi (jour de fermeture fréquent). **Appeler entre 14 h 30 et 17 h du mardi au vendredi**, jamais
  pendant le service ; le centre marketing impose déjà la plage 08:00–20:00 en Suisse.
- La série Instagram quotidienne est réglée par défaut à 10:00 : cohérent avec le pic.

Après quatre semaines de publications avec UTM, remplacer cet indice par les horaires réellement
mesurés pour TOK.

---

## 6. Calendrier éditorial type

Piliers : **G** guide de quartier (moteur 1), **R** restaurant de la semaine en Collab (moteurs 1 et
2), **D** drop réel (moteur 3), **P** pédagogie restaurateur (B2B), **F** fonctionnalité en
30 secondes, **C** communauté et coulisses.

| Jour | Instagram / Facebook | Story | LinkedIn | Canal WhatsApp/Telegram |
| --- | --- | --- | --- | --- |
| Lundi | 15 h — **P** « Payez la table, pas les couverts » | Coulisses de la semaine | Fondateur : bilan chiffré de la semaine | — |
| Mardi | 11 h — **G** guide n° 1 (carrousel) | Repartages des restaurants mentionnés | — | Drop du jour si disponible |
| Mercredi | 10 h — **F** reel 30 s (ventes flash, plan de salle, Photo Pro) | Sondage « Où mangez-vous ce midi ? » | Pédagogie restaurateur | Drop du jour |
| Jeudi | 18 h — **D** drop du soir ou Tables du Chef | Compte à rebours de l'offre réelle | — | Drop du soir |
| Vendredi | 11 h — **R** restaurant de la semaine (Collab) | Visite du restaurant | Fondateur : leçon apprise | Sélection du week-end |
| Samedi | 10 h 30 — **G** guide n° 2 | Drops du week-end | — | Brunchs et anti-gaspi |
| Dimanche | 18 h — **C** UGC repartagé, Miamz, solidarité | Questions-réponses | — | — |

**Série Instagram quotidienne existante** : ses 14 sujets parlent surtout aux restaurateurs. La
ramener à 3 publications par semaine (lundi, mercredi, vendredi) et libérer les autres jours pour les
guides et les Collab, qui servent les deux audiences. Trier d'abord les 23 brouillons Instagram et
8 brouillons Facebook en attente : approuver ce qui respecte la politique éditoriale, annuler le reste.

### 6.1 Quatre premières semaines à Carouge

| Semaine | Guide n° 1 | Guide n° 2 | Restaurant de la semaine | Objectif |
| --- | --- | --- | --- | --- |
| 1 | Terrasses chauffées à Carouge | Où déjeuner rapidement près de la place du Marché | Partenaire TOK de Carouge le plus actif | Mesure en place, premiers repartages |
| 2 | Brunchs du dimanche à Carouge | Cuisines du monde à Carouge | Partenaire n° 2 | 20 conversations restaurateurs |
| 3 | Menus du midi à Carouge (prix publics vérifiés) | Adresses ouvertes le lundi | Premier restaurant signé grâce au moteur 1 | Premières revendications |
| 4 | Carouge végétarien et végane | Le guide des habitués : votes de la communauté | Partenaire n° 3 | Bilan, décision d'ouvrir Plainpalais |

---

## 7. Tunnels de conversion

### 7.1 Restaurateur

```text
Contenu (guide, Collab, pédagogie)  ──►  Conversation 1:1 (DM, commentaire, appel)
        ──►  Démo live 15 min (/commercial/demo-live)  ──►  Revendication de la fiche
        ──►  Inscription et plan  ──►  Kit partenaire activé sous 7 jours
```

**Aimants à leads sans coût média** :

1. **Photo Pro offerte** : « Envoyez-nous une photo de votre plat signature, on vous la rend
   retouchée. » Le restaurateur voit la valeur de TOK en quelques minutes. Coût : une génération
   d'image par lead, sur l'infrastructure IA existante. Exiger l'accord écrit pour toute publication
   d'un avant/après réel.
2. **Calculateur de coût** déjà présent sur `/restaurateurs/geneve` : « Vos ventes d'un côté, votre
   coût TOK de l'autre. » À utiliser en lien de DM et en reel.
3. **Audit de fiche gratuit** : capture de la fiche TOK existante et trois améliorations concrètes
   (photos, horaires, menu digital).

### 7.2 Client

```text
Contenu (guide, drop, reel)  ──►  Fiche restaurant ou offre avec UTM
        ──►  Réservation, commande ou zéro attente  ──►  Création de compte
        ──►  Canal WhatsApp/Telegram + Miamz  ──►  Réservation suivante et partage
```

### 7.3 Réponses automatiques gratuites

Meta Business Suite permet des réponses automatiques gratuites (message de bienvenue, questions
fréquentes) sur Messenger et Instagram. Configurer :

- « Je suis restaurateur » → lien vers `/restaurateurs/geneve` et proposition de démo.
- « Comment réserver ? » → lien `/recherche`.
- « Bons plans » → lien d'adhésion au canal.

Ne pas utiliser d'outil tiers d'automatisation des DM, de follow/unfollow ou de « pods » d'engagement :
contraire aux règles Meta et à la politique éditoriale TOK.

---

## 8. Outils mobilisés

### 8.1 Outils déjà livrés dans TOK

| Outil | Où | Usage dans cette stratégie | État observé |
| --- | --- | --- | --- |
| Centre marketing (campagnes, calendrier, approbations) | `marketing.thetok.ch/marketing` | Planifier et approuver tous les contenus | Opérationnel |
| Publication Meta directe | Orchestrateur, Instagram + Facebook | Diffuser guides, Collab, drops | 56 publications réussies |
| Agent IA et Studio (références de marque) | Vue Agent | Produire carrousels et visuels cohérents | Opérationnel, approbation humaine |
| Série Instagram quotidienne | Vue Automatisations | Contenus B2B à cadence réduite | Brouillons en attente |
| Import de séries (CSV + images) | Vue Calendrier | Charger un mois de guides en une fois | Fusionné (#983) ; migration et import en production à vérifier |
| Veille Instagram Genève + validation Telegram | `/marketing?view=instagram` | Repérer les posts food locaux, préparer des réponses utiles | Livré, UTM déjà présents |
| Mailing ciblé | Vue Campagnes | Séquences pour les contacts **consentis** uniquement | E-mail Resend selon configuration |
| Tâches `manual_call` / `manual_email` | Vue Exécution | Prospection 1:1 tracée, avec révélation auditée | Opérationnel |
| Prospection et backlinks assistés | Vue Outreach | Presse locale, annuaires | Opérationnel, sans envoi automatique |
| Analytics marketing | Vue Résultats | Suivi des diffusions | Attribution non alimentée |
| Campaign Studio, Photo Pro, réseaux sociaux du restaurant | Dashboard restaurateur | Kit partenaire, aimant à leads | Opérationnel |
| Fiches annuaire et revendication | Fiche restaurant, `/auth?claimRestaurant=…` | Conversion du moteur 1 | Opérationnel |
| Lien de réservation Google | `/r/{booking_slug}/reserver` | Kit partenaire | Opérationnel ; Reserve with Google en homologation (#788) |
| Ventes flash, anti-gaspi, Tables du Chef, Miamz | Pages publiques et dashboard | Moteur 3 | Opérationnel |
| TOK Actualités | `/actualites` | Diffusion de niche | 3 posts publiés |
| TOK Connect (ChatGPT) | `/tok-connect` | Angle presse et démonstration | Livré |
| CRM et prospection commerciale | `/admin/crm`, `/commercial/prospection` | Suivi du pipeline | Opérationnel |

### 8.2 Connecteurs et skills disponibles dans Claude

| Ressource | État au 27 octobre | Usage recommandé | Coût |
| --- | --- | --- | --- |
| Supabase | Connecté | KPI hebdomadaires agrégés, listes de restaurants à mettre en avant (données publiques d'annuaire) | Gratuit |
| Metricool | Connecté, marque `stoppin_gva` | Indice d'horaires ; ne pas y basculer TOK sans décision (voie Meta directe documentée) | Plan gratuit limité à une marque |
| Vercel | Connecté, Web Analytics inactif | Activer Web Analytics (UTM, référents) ou s'appuyer sur la capture interne | Quota inclus à vérifier selon le plan |
| GitHub | Connecté | Suivre le plan en issues, livrer les correctifs de mesure | Gratuit |
| Gmail | Connecté, mais seule la suppression de brouillons est exposée | Rédiger les e-mails 1:1 dans les tâches `manual_email` du centre marketing, jamais d'envoi en masse | Gratuit |
| Google Drive | Connecté | Bibliothèque du kit partenaire, autorisations photos | Gratuit |
| Higgsfield | Connecté | Vidéos et visuels IA ponctuels | **Consomme des crédits** : hors budget zéro, sauf générations gratuites disponibles |
| Canva, Klaviyo, Ahrefs, Similarweb, Amplitude, Supermetrics | Autorisation requise dans les connecteurs claude.ai | Canva gratuit utile pour les stories ; les autres ne sont pas nécessaires | — |
| HubSpot | Échec de connexion | Inutile : le CRM TOK couvre le besoin | — |
| Skills `marketing:campaign-plan`, `marketing:content-creation`, `marketing:draft-content` | Disponibles | Briefs de guides, légendes par réseau | — |
| Skill `marketing:brand-review` | Disponible | Relecture de chaque lot avant approbation | — |
| Skill `marketing:email-sequence` | Disponible | Suivi après démo et accueil des contacts consentis | — |
| Skill `marketing:competitive-brief` | Disponible | Positionnement face aux plateformes de réservation et de livraison à Genève | — |
| Skills `marketing:seo-audit` et `marketing:performance-report` | Disponibles | Pages ville/catégorie, bilan hebdomadaire | — |
| Skills `design:ux-copy` et `dataviz` | Disponibles | CTA des pages d'arrivée, tableau de bord KPI | — |
| Tâches planifiées Claude | Disponibles | Rapport KPI automatique chaque lundi | — |

---

## 9. Mesure

### 9.1 Indicateurs

**North Star** : réservations honorées par semaine provenant d'un restaurant actif (événement
facturé CHF 5, donc aligné sur le revenu).

| Étape | Indicateur | Source |
| --- | --- | --- |
| Attention | Portée, sauvegardes et partages des guides | Instagram Insights |
| Engagement restaurateur | Restaurants mentionnés qui repartagent | Comptage manuel hebdomadaire |
| Conversation | DM et appels ouverts, réponses | Tâches `manual_*` du centre marketing |
| Lead qualifié | Contacts passés en `qualified` | `marketing_contacts.lifecycle_status` |
| Démo | Démos live réalisées | CRM commercial |
| Signature | Inscriptions approuvées | `signup_applications.status` |
| Activation | Lien Google + QR posés sous 7 jours | Checklist kit partenaire |
| Client | Comptes, réservations, commandes | `auth.users`, `reservations`, `orders` |
| Rétention | Membres du canal, deuxième réservation | Canal, `reservations` |
| Attribution | Visites et conversions par `utm_source` | Après correctif de capture |

### 9.2 Convention UTM

Toutes les URL publiées portent les cinq paramètres, en minuscules, sans accent :

| Paramètre | Valeurs |
| --- | --- |
| `utm_source` | `instagram`, `facebook`, `linkedin`, `tiktok`, `gbp`, `whatsapp`, `telegram`, `tok_actualites`, `email_1to1`, `qr` |
| `utm_medium` | `social`, `story`, `reel`, `bio`, `dm`, `comment`, `group`, `collab`, `qr` |
| `utm_campaign` | `{moteur}_{theme}_{aaaamm}`, par exemple `guide_carouge-terrasses_202611` |
| `utm_content` | Identifiant de l'élément du calendrier ou slug du restaurant |
| `utm_term` | Facultatif : variante A/B |

La veille Instagram utilise déjà `utm_medium=comment` et `utm_campaign=geneve_community` : conserver
ces valeurs.

### 9.3 Prérequis techniques à livrer en semaine 1

1. **Ajouter les UTM aux liens composés pour Meta** (légende Instagram et lien Facebook), à partir de
   l'identifiant de l'élément du calendrier. Niveau 3 : Edge Function de l'orchestrateur.
2. **Capturer la source first-touch** pour les visiteurs anonymes (UTM et référent), puis la
   rattacher à l'inscription, à la réservation et à la commande. Alimenter
   `marketing_attribution_facts`, aujourd'hui sans producteur.
3. **Corriger le suivi `page_view`**, émis uniquement pour un utilisateur connecté sur l'accueil.
4. **En attendant** : poser la question « Comment avez-vous connu TOK ? » à chaque démo et la noter
   dans le CRM.

### 9.4 Rituel hebdomadaire (lundi, 30 minutes)

1. Lire les KPI de la semaine (requêtes agrégées en annexe C, ou rapport planifié Claude).
2. Classer les contenus par conversations générées, pas par likes.
3. Doubler les deux formats gagnants, arrêter les deux plus faibles.
4. Mettre à jour la liste des restaurants à mentionner la semaine suivante.

---

## 10. Garde-fous

- **E-mails et messages de masse** : en Suisse, l'envoi de publicité de masse par télécommunication
  sans consentement préalable est en principe déloyal (art. 3, al. 1, let. o LCD). Les 1 682 adresses
  de prospects ne servent donc qu'à des contacts **individuels et personnalisés**, tracés par les
  tâches `manual_email`, avec un moyen simple de s'opposer. Faire valider l'approche par un juriste
  en cas de doute.
- **Protection des données (nLPD)** : informer la personne de la source de ses coordonnées dès le
  premier contact ; toute opposition est définitive dans le centre marketing.
- **Révélation des coordonnées** : uniquement par le flux audité du centre marketing, jamais par
  extraction SQL directe.
- **Contenu** : faits vérifiés, pas de fausse urgence, pas de faux témoignage, 5 hashtags au maximum,
  concurrents non nommés publiquement, droits photo vérifiés.
- **Plateformes** : aucun achat d'abonnés ou d'engagement, aucune automatisation non officielle des
  DM, respect du règlement de chaque groupe Facebook.
- **Approbation** : chaque contenu passe par l'approbation du centre marketing et la validation
  Telegram ; la publication automatique de la série quotidienne reste une décision explicite.

---

## 11. Plan sur 90 jours

### Semaine 0 — Fondations (5 jours ouvrés)

| Action | Responsable | Livrable |
| --- | --- | --- |
| Correctifs de mesure du § 9.3 | Développement (PR niveau 3) | UTM et source capturés |
| Trier les 44 brouillons et diagnostiquer les 4 échecs de publication | Marketing | Calendrier propre |
| Configurer les réponses automatiques Meta Business Suite | Marketing | 3 parcours actifs |
| Créer le canal WhatsApp ou Telegram « TOK Genève — bons plans » | Marketing | Lien d'adhésion |
| Mettre à jour le lien en bio Instagram avec UTM | Marketing | Bio mesurable |
| Lister 60 restaurants de Carouge à mentionner (données publiques d'annuaire) | Marketing + Claude (Supabase) | Liste priorisée |
| Préparer le kit partenaire dans Google Drive | Marketing | Dossier partageable |
| Demander une autorisation photo et un témoignage aux restaurants déjà signés | Fondateur | Preuves sociales réelles |

### Semaines 1 à 4 — Carouge

- 2 guides et 1 Collab par semaine, stories quotidiennes, drops dès qu'une offre réelle existe.
- 50 conversations restaurateurs 1:1 par semaine (DM, appels, visites), toutes tracées.
- Kit partenaire activé pour chaque signature.

### Semaines 5 à 8 — Plainpalais et Eaux-Vives

- Réutiliser les formats gagnants de Carouge.
- Lancer les posts LinkedIn du fondateur avec les premiers chiffres réels.
- Proposer le sujet à la presse locale lorsque 10 restaurants sont actifs dans un même quartier.

### Semaines 9 à 12 — Amplification

- Concours UGC récompensé en Miamz (barème validé au préalable).
- Démonstration vidéo « réserver depuis ChatGPT » et diffusion de l'angle IA.
- Ouverture d'une troisième zone selon les données : Meyrin, Plan-les-Ouates ou Vernier.

### Objectifs à calibrer après deux semaines

Hypothèses de travail, pas des promesses. Remplacer les taux par les valeurs mesurées dès la
semaine 3.

| Étape hebdomadaire | Hypothèse | Volume par semaine |
| --- | --- | ---: |
| Conversations restaurateurs ouvertes | — | 50 |
| Démos obtenues | 20 % des conversations | 10 |
| Signatures | 25 % des démos | 2 à 3 |

Sur 12 semaines, ces hypothèses donnent 25 à 30 restaurants signés, dont une majorité à Carouge et
Plainpalais. Côté client, viser 10 réservations honorées par restaurant actif et par mois après
activation du kit, et 300 membres du canal à 90 jours.

---

## Annexe A — Scripts 1:1

### DM après mention dans un guide

> Bonjour [Prénom ou nom du restaurant], merci d'avoir partagé notre guide « [titre] » ! On adore
> [détail précis et vrai : plat, terrasse, accueil]. Votre restaurant a déjà une fiche sur TOK, la
> plateforme genevoise de réservation et de commande. Voulez-vous la reprendre en main (photos,
> horaires, menu) ? C'est gratuit et je peux vous montrer en 15 minutes. Si ce n'est pas pour vous,
> dites-le-moi simplement et je ne vous relancerai pas.

### Appel de 30 secondes (14 h 30 – 17 h)

> Bonjour, [prénom] de TOK, une plateforme genevoise de réservation. Je vous appelle parce que votre
> restaurant apparaît déjà dans notre annuaire. Une seule question : aujourd'hui, combien vous coûte
> une table de 10 réservée en ligne ? Chez nous, c'est 5 francs la table, quel que soit le nombre de
> couverts. Avez-vous 15 minutes cette semaine pour que je vous montre votre fiche ?

### E-mail individuel (tâche `manual_email`)

> Objet : Votre fiche [Nom du restaurant] sur TOK
>
> Bonjour [Nom],
>
> [Nom du restaurant] figure dans l'annuaire public de TOK, la plateforme genevoise de réservation
> et de commande. Vous pouvez reprendre la main sur votre fiche gratuitement : photos, horaires et
> menu.
>
> Si vous recevez des réservations par TOK, vous payez 5 CHF par table honorée, quel que soit le
> nombre de couverts, et vous gardez 100 % des pourboires.
>
> Votre fiche : [lien avec UTM `utm_source=email_1to1`]
> Une démo de 15 minutes : [lien de rendez-vous]
>
> Vos coordonnées proviennent de [source publique]. Si vous ne souhaitez plus être contacté,
> répondez simplement « stop ».
>
> [Prénom], TOK

### Relance unique (J+5, si aucune réponse)

> Bonjour [Nom], je me permets une seule relance : voulez-vous que je vous envoie une capture de
> votre fiche TOK avec trois améliorations concrètes ? Sans suite de votre part, je n'insisterai pas.

### Objections fréquentes

| Objection | Réponse |
| --- | --- |
| « Je suis déjà sur une autre plateforme. » | « Gardez-la. TOK s'ajoute sans exclusivité ; comparez simplement le coût d'une table de 10 sur un mois. » |
| « Je n'ai pas le temps. » | « La démo dure 15 minutes, entre deux services. Le Studio crée vos visuels à partir d'une phrase. » |
| « Je ne veux pas de commissions. » | « La réservation est un forfait de 5 CHF par table honorée, pas un pourcentage. » |
| « Retirez ma fiche. » | Respecter immédiatement la demande via le parcours de retrait existant et consigner l'opposition. |

## Annexe B — Modèles de posts

Chaque légende est relue avec `marketing:brand-review` avant approbation. Les URL reçoivent leurs UTM.

**Guide (carrousel Instagram)**

> 6 terrasses chauffées à Carouge pour profiter de l'automne 🍂
> Glissez pour découvrir nos adresses, puis réservez directement sur TOK.
> @[resto1] @[resto2] @[resto3] @[resto4] @[resto5] @[resto6]
> #carouge #geneve #restaurantgeneve #terrasse #tok_suisse

**Restaurant de la semaine (Collab)**

> Cette semaine, on passe en cuisine chez @[restaurant] à Carouge 👨‍🍳
> [Détail vrai sur le restaurant]. Réservez votre table sur TOK, sans attendre.
> #carouge #geneve #[cuisine] #tok_suisse

**Pédagogie restaurateur (Instagram, Facebook, LinkedIn)**

> Une table de 10 réservée en ligne : combien vous coûte-t-elle ?
> Avec une commission par couvert, la facture grimpe avec la taille de la table.
> Avec TOK, c'est 5 CHF la table. Une table de 2 ou une table de 10, même prix.
> Faites le calcul pour votre restaurant 👉 thetok.ch/restaurateurs/alternative-commission-couvert

**Drop (story et canal)**

> Ce soir à [heure] chez [restaurant] : [offre réelle], [nombre réel] places.
> Réservez sur TOK 👉 [lien]

**Fonctionnalité en 30 secondes (reel)**

> POV : vous avez commandé avant d'arriver. Vous vous asseyez, votre plat arrive.
> C'est Zéro attente, chez [restaurant partenaire]. 👉 thetok.ch/zero-attente

Ne publier le reel « Zéro attente » qu'après l'avoir tourné dans des conditions réelles chez un
partenaire consentant.

**LinkedIn du fondateur**

> Il y a 4 050 restaurants dans notre annuaire genevois. 3 840 ne nous ont jamais parlé.
> Plutôt que de les démarcher à froid, on a décidé de les mettre en avant.
> Ce que nous avons appris en [n] semaines : [chiffres réels mesurés].

## Annexe C — Requêtes KPI hebdomadaires (lecture seule, agrégées)

```sql
-- Restaurateurs : pipeline
select lifecycle_status, count(*)
from public.marketing_contacts
group by 1;

select status, count(*)
from public.signup_applications
where created_at > now() - interval '7 days'
group by 1;

-- Clients : demande
select
  (select count(*) from auth.users where created_at > now() - interval '7 days') as comptes_7j,
  (select count(*) from public.reservations where created_at > now() - interval '7 days') as reservations_7j,
  (select count(*) from public.orders where created_at > now() - interval '7 days') as commandes_7j;

-- Social : diffusion
select channel, status, count(*)
from public.marketing_calendar_items
where coalesce(published_at, created_at) > now() - interval '7 days'
group by 1, 2;
```

Ces requêtes ne retournent aucune coordonnée. Elles peuvent alimenter une tâche planifiée Claude qui
produit le rapport du lundi avec le skill `marketing:performance-report`.

# Portail marketing dans TOK Connect

Le MCP canonique `https://www.thetok.ch/mcp` expose 53 opérations du portail
`https://marketing.thetok.ch` : 39 opérations métier, 7 actions agent et 7 actions
d’orchestration. Ce catalogue complète le Studio Marketing des restaurateurs.

## Connexion et révocation

1. Appeler `tok_marketing_connect` depuis le compte administrateur TOK connecté.
2. Ouvrir le lien de consentement valable dix minutes. Se connecter séparément
   au portail marketing avec la double authentification si nécessaire.
3. Vérifier le nom de l’application et le compte puis autoriser la connexion.
4. Vérifier `tok_marketing_connection_status` avant les opérations.

Le compte marketing doit être le même que celui de la connexion OAuth TOK.
La session marketing conserve sa durée native maximale de quatre heures ; le MCP
ne la renouvelle pas. Expiration, déconnexion marketing, retrait du rôle admin,
désactivation du module, révocation ou modification de l’autorisation OAuth
invalident l’accès. `tok_marketing_disconnect` révoque seulement cette liaison.
Ne jamais transmettre mots de passe, codes MFA, cookies ou clés dans les outils.

## Fonctions

| Domaine | Opérations natives couvertes |
| --- | --- |
| Campagnes et calendrier | Lire, créer, modifier, approuver, annuler, terminer les actions manuelles |
| Audiences et consentements | Estimer, rechercher, synchroniser, modifier, exclure un contact |
| Livraisons | Consulter, révéler une cible manuelle, réessayer, déclarer un résultat |
| Automatisations et gouvernance | Lire, modifier, suspendre globalement, simuler et préparer un brouillon |
| IA et mailing | Générer des brouillons, lire les runs, interpréter un brief, rechercher les facettes, préparer les destinataires, importer une image |
| Instagram et fournisseurs | Vérifier Meta, rechercher les publications/commentaires, soumettre et lire les demandes de revue Telegram |
| Prospection et backlinks | Rechercher les sources, gérer cibles, opportunités, brouillons, approbations, résultats et backlinks |
| Série quotidienne | Lire et configurer les séries, avec autorisation native explicite pour la publication automatique |

Chaque outil a un nom `tok_marketing_*` et un objet `args` décrit par son schéma.
Les actions exigent `confirmed_by_user: true` et une `idempotency_key` stable de
8 à 120 caractères. La simulation conserve un reçu et exige donc aussi ces champs.
Après interruption, conserver la clé et consulter l’état natif : une opération
en cours ou ambiguë n’est jamais relancée automatiquement avec une autre clé.

Le catalogue partagé fixe les destinations, actions et paramètres autorisés.
Les contrôles métier restent ceux du BFF : médias, versions concurrentes,
approbations, ciblage, droits fournisseurs, horaires Europe/Zurich et pause globale.
Les demandes Telegram, diffusions, générations et autorisations durables doivent
être demandées explicitement. Une approbation ou une programmation ne prouve pas
la publication. Le lancement groupé historique reste désactivé.

## Livraison et vérifications

Appliquer la migration additive `20261020211506_tok_connect_marketing_native_links.sql`,
puis déployer les deux points d’entrée BFF et la fonction
`tok-connect-remote-mcp` avec son catalogue partagé et son parseur HTTP.
Aucun nouveau secret n’est ajouté : le relais résout les jetons opaques avec le
broker existant ; le BFF réutilise ses paramètres de service.

Le lien et ses empreintes sont privés. Les cinq fonctions SQL sont réservées au
rôle de service. Le consentement utilise les cookies marketing et le CSRF natifs ;
les appels MCP utilisent un jeton OAuth vérifié puis la liaison explicitement
approuvée. Aucun accès RPC ou CRUD arbitraire n’est exposé.

Les tests `tok-connect-marketing-{operations,bff,router}.test.ts` couvrent le
catalogue, le passage par le BFF, les refus et les rejeux. Le test SQL
`src/test/sql/tok_connect_marketing_links_smoke.sql` se rejoue dans une base
PostgreSQL jetable avec les définitions natives OAuth et session marketing.
Les doublures HTTP ne prouvent pas une diffusion chez un fournisseur réel.

Retour arrière : redéployer la version précédente du relais et du BFF ; révoquer
les liaisons si nécessaire. La table additive peut rester sans usage. Ne pas
supprimer les données marketing ni modifier les migrations historiques.

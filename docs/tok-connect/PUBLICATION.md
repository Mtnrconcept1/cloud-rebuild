# Publication Suisse

Identité demandée par le propriétaire : **Raphaël Barman**. Pays : **CH** uniquement.
La vérification effective de cette identité dans le portail reste une étape distincte.

Le package source portable est `plugins/tok-connect`. Il ne contient aucun secret,
compte de revue, `.app.json` ni binding privé de l'installation de développement.
L'endpoint demeure `https://www.thetok.ch/mcp` avec découverte OAuth Supabase.

Les quatre pages publiques ont été ouvertes dans le navigateur : présentation
TOK Connect, contact, confidentialité et CGU. La politique traite les intégrations
TOK Connect et les prestataires IA. Aucune nouvelle déclaration juridique n'est
inventée par le package.

## Préparation de revue

Le manifeste contient exactement cinq cas positifs et trois négatifs, avec les
outils et résultats attendus. Ils constituent une recette à exécuter sur la version
déployée, pas une attestation de réussite. Les tests unitaires ou SQL ne remplacent
pas cette recette dans ChatGPT.

À compléter avant soumission : vidéo réelle
de démonstration accessible aux reviewers, compte client et compte restaurateur
dédiés avec données de test et accès vérifié. Les comptes personnels de production
ne doivent pas être fournis aux reviewers. Les identifiants vont uniquement dans
les champs sécurisés du portail, jamais dans le ZIP.

Vérifier les imports du manifeste, le ciblage Suisse, les scans MCP, le consentement
OAuth et la CSP active. Le développeur autorisé doit compléter les attestations
légales de la plateforme. Une archive préparée, un brouillon téléversé, une demande
de revue et une publication approuvée sont quatre états différents.

## Démonstration à enregistrer

1. Compte de test connecté : recherche multi-cuisine et fiche réelle.
2. Préparation pour cinq convives avec date/heure exactes, sans création involontaire.
3. Demande explicite de réservation sur une cible de recette autorisée, référence
   et statut pending, puis apparition dans l'espace TOK.
4. Compte propriétaire : acceptation native/MCP, statut confirmed, notifications
   et emails vérifiés, puis annulation autorisée.
5. Demande d'accès à un autre compte : refus, sans données privées affichées.

La vidéo doit montrer les interactions et réponses réelles, sans mots de passe,
tokens, données bancaires ou données personnelles non nécessaires. Aucun script
ou screenshot n'est présenté comme un enregistrement déjà réalisé.

Sources : https://developers.openai.com/plugins/build/plugins et
https://developers.openai.com/plugins/deploy/submission.

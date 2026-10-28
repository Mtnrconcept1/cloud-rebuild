# Conception — pièces jointes sécurisées pour l’assistant TOK

Date : 2026-10-28
Niveau de risque : 3 — critique (fichiers utilisateurs, IA, données CRM, mutations restaurant)

## Objectif

Permettre au restaurateur de joindre à `DashboardAdvisor` :

- une image JPEG, PNG ou WebP à associer à un plat existant ;
- un PDF utilisé comme document de référence pour préparer une modification autorisée ;
- un CSV, XLS ou XLSX contenant des contacts à importer dans le CRM restaurant.

Aucune pièce jointe ne doit déclencher une mutation automatique. L’assistant prépare une proposition typée, l’utilisateur la contrôle, puis confirme explicitement l’écriture.

## Décisions d’architecture

### 1. Pièces jointes éphémères

Les fichiers restent en mémoire dans le navigateur pendant la conversation. Ils ne sont pas stockés avant confirmation.

- PDF : jamais persisté par TOK dans ce parcours.
- Image : persistée uniquement après confirmation, dans `restaurant-images`, puis liée au `menu_items.image_url` exact.
- Tableur : le fichier brut n’est jamais persisté. Seuls les contacts normalisés et confirmés sont enregistrés.

### 2. Types d’opérations strictement autorisés

L’éditeur IA conserve son modèle « plan puis appliquer » et ajoute seulement :

- `uploaded_dish_photo` : associer une image jointe à un `menu_items.id` appartenant au restaurant ;
- `crm_contacts_import` : importer un lot borné de contacts dans le CRM du restaurant.

Les cibles existantes restent inchangées. Aucun nom de table, colonne, requête SQL ou URL fourni par l’utilisateur ou par un fichier n’est exécuté.

### 3. Défense contre la prompt injection

Les images et PDF sont considérés comme des données non fiables, jamais comme des instructions.

- Le prompt système indique explicitement d’ignorer toute instruction trouvée dans une pièce jointe.
- La sortie OpenAI est contrainte par un JSON Schema strict.
- La cible, le champ, l’identifiant du plat et l’identifiant de pièce jointe sont revalidés côté serveur.
- Les lignes CRM ne sont jamais transmises au modèle. Le modèle ne reçoit que le nom du fichier, le nombre de contacts et les catégories de colonnes détectées.
- L’empreinte SHA-256 du contenu normalisé est enregistrée dans la proposition. Elle est recalculée lors de la confirmation.

### 4. Défense contre l’injection SQL

- Aucune concaténation SQL dynamique.
- Écritures via RPC PostgreSQL statiques et paramètres JSONB, ou via le SDK Supabase avec valeurs paramétrées.
- Identifiants UUID et champs limités par des allowlists.
- Les valeurs de contact sont normalisées et bornées côté navigateur, côté Edge Function et par contraintes SQL.

### 5. Contenu sensible et fichiers dangereux

- Limites : 3 pièces jointes, image 4 Mo après optimisation, PDF 5 Mo, tableur 2 Mo et 500 contacts.
- Images/PDF : validation extension, MIME et signature binaire côté navigateur et serveur.
- CSV/XLS/XLSX : pré-vérification du conteneur côté navigateur ; seules les lignes normalisées et revalidées arrivent au serveur, avec une empreinte canonique vérifiée entre les étapes de planification et d’application.
- Refus des macros, archives anormales, feuilles cachées et formules dans les tableurs.
- Modération `omni-moderation-latest` en échec fermé sur le prompt, les images et la sortie textuelle proposée.
- Toute image ou tout PDF doit en plus être classé par une sortie JSON stricte comme contenu restaurant autorisé ; un document privé, bancaire, médical, d’identité, un secret, un contenu sensible ou un fichier hors sujet bloque la proposition.
- Les PDF sont refusés s’ils sont chiffrés ou contiennent des actions, scripts, fichiers intégrés ou formulaires actifs ; leur contenu reste une donnée non fiable enfermée dans une hiérarchie d’instructions serveur et un schéma de sortie strict.
- Refus en cas d’indisponibilité de la modération pour une opération avec image ; aucune proposition n’est appliquée sans une sortie modérée et une confirmation humaine.
- Le navigateur affiche un avertissement de ne pas joindre de secrets, données bancaires, données médicales ou documents d’identité.

### 6. Confidentialité CRM

Une nouvelle table `restaurant_crm_contacts` contient uniquement les contacts importés manuellement.

- RLS activée ; aucun accès direct `anon` ou `authenticated`.
- Import et lecture uniquement via RPC `SECURITY DEFINER` avec `search_path` fixé.
- MFA AAL2 obligatoire.
- Propriété du restaurant et abonnement Premium/Élite obligatoires.
- Consentement marketing forcé à `unknown` lors de l’import ; un import ne vaut jamais consentement.
- Un conflit met à jour les coordonnées mais ne réinitialise jamais un consentement existant.

Le CRM fusionne en lecture les profils issus des commandes/réservations avec les contacts importés. Un profil transactionnel gagne sur un doublon importé.

## Flux utilisateur

1. Le restaurateur clique sur le trombone et sélectionne un ou plusieurs fichiers.
2. Le navigateur valide et prépare les fichiers ; les tableurs sont analysés localement.
3. L’utilisateur décrit l’action souhaitée.
4. Le serveur valide, modère et calcule les empreintes, puis demande une proposition structurée au modèle.
5. L’interface affiche le plat/contact ciblé, le fichier utilisé, les avertissements et l’impact exact.
6. L’utilisateur confirme.
7. Le serveur recharge la tâche, vérifie l’expiration, l’empreinte, le propriétaire, la concurrence et les droits CRM.
8. Une seule opération typée est appliquée et journalisée.

## Risques et réponses

- **Fichier remplacé entre plan et confirmation** : comparaison SHA-256.
- **Prompt caché dans une image/PDF** : hiérarchie système, schéma strict, allowlist et revalidation.
- **Liste CRM contenant des formules/macros** : préflight ZIP/XLS, rejet VBA, cellules de formule ignorées.
- **Fuite de PII vers le modèle** : seules les métadonnées agrégées du tableur sont envoyées au modèle.
- **Import sans consentement** : statut `unknown`, badge visible dans le CRM.
- **Mutation d’un autre restaurant** : contrôle propriétaire avant plan et avant application.
- **Course concurrente sur un plat** : comparaison de la valeur précédente avant mise à jour.

## Rollback

1. Revert du commit applicatif : l’interface et les opérations disparaissent immédiatement.
2. La table additive peut rester inactive sans exposer de données, car aucun accès direct n’est accordé.
3. Toute suppression ultérieure de données importées exige une migration séparée et une validation explicite ; aucun rollback destructif automatique.

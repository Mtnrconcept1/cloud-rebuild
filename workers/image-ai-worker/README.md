# Worker d’analyse d’images TOK — 100 % local

Ce worker analyse les images des pages **Actualités** et des galeries restaurant sans API d’IA payante. L’inférence visuelle et les embeddings tournent avec [Ollama](https://ollama.com/) sur une machine contrôlée par TOK. Supabase sert uniquement de stockage, de file de jobs et de base de recherche.

Le chemin par défaut ne lit aucune clé OpenAI et n’effectue aucun appel OpenAI. Le coût logiciel d’inférence est donc nul ; restent uniquement les ressources de la machine et l’hébergement Supabase déjà utilisés par l’application.

## Fonctionnement

1. Le worker réclame les jobs via `claim_image_analysis_jobs` avec la clé `service_role` conservée côté serveur.
2. Il recharge la ligne `restaurant_images` depuis la base et vérifie que l’identifiant, le restaurant, le bucket et le chemin concordent avec le job.
3. Il refuse tout bucket non autorisé, tout chemin hors de l’espace du restaurant et du post Actualités, toute image de plus de 8 Mio et tout contenu dont la signature binaire n’est pas JPEG, PNG ou WebP.
4. `qwen2.5vl:3b` produit le contrat de métadonnées TOK sous forme de JSON structuré strict.
5. `all-minilm` génère un vecteur local de 384 dimensions pour la recherche sémantique.
6. Le RPC `complete_image_analysis_job` finalise atomiquement l’image, le job et le média social lié, puis renvoie un reçu de complétion vérifié par le worker. Le worker n’écrit jamais directement dans `social_post_media`.

Le texte alternatif reste une phrase naturelle d’accessibilité. Les plats, ingrédients, ambiances et mots-clés internes sont stockés dans des champs séparés. Aucun hashtag n’est ajouté à `alt_text`. Le prompt interdit l’identification de personnes et toute déduction d’origine, religion, santé, handicap, orientation sexuelle, opinion politique, nom ou âge exact. La validation rejette également les sorties qui enfreignent ces règles détectables.

## Windows — installation automatique recommandée

L’installateur Windows natif configure le projet TOK, télécharge uniquement les modèles manquants, protège le secret Supabase par ACL, exécute les tests, vérifie Supabase/Ollama et peut installer un démarrage automatique avec reprise après panne.

Depuis PowerShell, à la racine du dépôt :

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\workers\image-ai-worker\setup-windows.ps1 -InstallAutoStart
```

Le script demande la Secret key Supabase de manière masquée. Créer de préférence une clé `sb_secret_...` dédiée au worker dans **Supabase → Project Settings → API Keys** afin de pouvoir la révoquer indépendamment. La clé n’est jamais placée dans les arguments de la tâche planifiée ni dans les logs.

L’état local est disponible sur :

```text
http://127.0.0.1:18080/healthz
http://127.0.0.1:18080/readyz
```

Les logs sont conservés dans `%LOCALAPPDATA%\TOK\image-ai-worker`. Pour relancer manuellement le worker :

```powershell
.\workers\image-ai-worker\run-windows-worker.ps1
```

Pour retirer uniquement le démarrage automatique, sans supprimer la clé locale ni les modèles :

```powershell
.\workers\image-ai-worker\setup-windows.ps1 -RemoveAutoStart
```

Le worker Windows attend qu’Ollama, `qwen2.5vl:3b`, `all-minilm` et Supabase soient réellement disponibles avant de réclamer un job. Son serveur de santé écoute exclusivement sur `127.0.0.1`. Garder le PC protégé par un mot de passe et, idéalement, BitLocker, car la clé locale possède les droits serveur Supabase.

## Démarrage Docker recommandé

Prérequis : Docker avec Compose v2 et environ 8 Gio de RAM disponibles. Le modèle visuel est téléchargé une seule fois dans le volume `ollama-data`.

```bash
cd workers/image-ai-worker
cp .env.example .env
```

Renseigner seulement :

```dotenv
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVEUR
```

Puis lancer :

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f worker
```

Le service `model-init` télécharge automatiquement `qwen2.5vl:3b` et `all-minilm`, puis le worker démarre. Ollama et les endpoints de santé ne sont publiés que sur `127.0.0.1` par défaut.

Vérifications locales :

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/readyz
```

- `/healthz` confirme que le processus vit.
- `/readyz` renvoie `200` uniquement lorsque Supabase et les deux modèles Ollama sont disponibles.

Arrêt :

```bash
docker compose down
```

Ajouter `-v` supprimerait aussi les modèles téléchargés ; ne pas l’utiliser lors d’un simple redémarrage.

## Lancement sans Docker

Installer Ollama, puis :

```bash
ollama pull qwen2.5vl:3b
ollama pull all-minilm
cp workers/image-ai-worker/.env.example workers/image-ai-worker/.env
pnpm --dir workers/image-ai-worker install --frozen-lockfile
pnpm --dir workers/image-ai-worker check
pnpm --dir workers/image-ai-worker start
```

Le modèle visuel exige Ollama 0.7.0 ou plus récent. `docker-compose.yml` utilise une version officielle fixe. `OLLAMA_API_KEY` est uniquement prévu pour un serveur Ollama privé distant ; il n’est pas nécessaire en local.

## Sécurité et fiabilité

- Ne jamais copier `SUPABASE_SERVICE_ROLE_KEY` dans Vite, React, Vercel public env ou le navigateur.
- Les buckets autorisés par défaut sont `restaurant-images` et `social-post-media`; réduire `ALLOWED_STORAGE_BUCKETS` si un déploiement n’en utilise qu’un. L’ancien bucket `images` reste volontairement exclu. Il ne peut être ajouté explicitement que pour un backfill contrôlé, et le worker exige alors le préfixe `uploaded_by` historique.
- Les coordonnées Storage et le contexte arbitraire fournis par un client ne sont jamais utilisés directement. Seul un éventuel `trusted_context` renvoyé par le RPC interne est accepté, avec une liste blanche de champs.
- Les appels réseau ont des timeouts, des reprises limitées et un backoff exponentiel.
- L’empreinte SHA-256 de l’image est enregistrée dans `ai_metadata` pour rendre une reprise vérifiable.
- Après une réponse de finalisation incertaine, le worker vérifie l’état en base. Il ne rétrograde jamais un job potentiellement déjà terminé en échec.
- Les logs sont structurés en JSON et n’affichent aucune clé secrète ni contenu d’image.

## Dimensionnement

`qwen2.5vl:3b` privilégie une installation légère. Sur CPU, une analyse peut prendre plusieurs dizaines de secondes ; une carte GPU compatible accélère fortement le traitement. Garder `BATCH_SIZE=1` à `3` sur une petite machine. Le worker traite volontairement les jobs séquentiellement pour éviter de saturer la mémoire du modèle local.

Variables utiles :

| Variable | Défaut | Rôle |
|---|---:|---|
| `MAX_IMAGE_BYTES` | `8388608` | Taille maximale après téléchargement |
| `OLLAMA_VISION_TIMEOUT_MS` | `300000` | Délai maximal d’analyse locale |
| `HTTP_RETRY_ATTEMPTS` | `3` | Nombre maximal d’essais réseau |
| `POLL_INTERVAL_MS` | `5000` | Pause lorsque la file est vide |
| `BATCH_SIZE` | `1` | Jobs réclamés par cycle, pour éviter plusieurs échecs lors d’une panne locale |
| `HEALTH_HOST` | `127.0.0.1` | Adresse locale de l’endpoint de santé |
| `HEALTH_PORT` | `8080` | Port de santé (l’installateur Windows utilise `18080`) |

## Validation avant mise en service

```bash
pnpm --dir workers/image-ai-worker syntax
pnpm --dir workers/image-ai-worker test
pnpm --dir workers/image-ai-worker check
docker compose -f workers/image-ai-worker/docker-compose.yml config
```

`check` contacte Supabase et vérifie que les deux modèles configurés existent dans Ollama. Les tests unitaires n’utilisent ni réseau, ni clé, ni API payante.

# TOK image AI worker

Ce worker traite les images `restaurant-images` en dehors du frontend. Il reclame les jobs Supabase, telecharge l'image, interroge Ollama, puis ecrit les metadonnees, le texte de recherche et l'embedding via les RPC service-role.

## Prerequis

- Une base Supabase avec la migration `20260706192000_image_metadata_ai.sql` appliquee.
- Une machine serveur qui reste allumee.
- Ollama accessible depuis cette machine.
- Les modeles Ollama configures dans `.env`.
- `SUPABASE_SERVICE_ROLE_KEY` stockee uniquement sur ce serveur.

## Configuration

Copier `.env.example` vers `.env`, puis renseigner :

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_API_KEY= # optionnel, pour un endpoint Ollama heberge protege par Bearer token
OLLAMA_VISION_MODEL=llava
OLLAMA_EMBEDDING_MODEL=all-minilm
```

La cle `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais etre exposee au navigateur, a Vercel public env ou a une page React.
La cle `OLLAMA_API_KEY` est optionnelle et ne sert que si `OLLAMA_URL` pointe vers un service Ollama distant qui exige un token.

## Verification

Depuis la racine du repo :

```bash
pnpm image-ai-worker:check
```

## Lancement

Depuis la racine du repo :

```bash
pnpm image-ai-worker:start
```

Pour la production, lancer ce worker avec un superviseur de processus ou un service d'hebergement adapte afin qu'il redemarre automatiquement en cas d'erreur.

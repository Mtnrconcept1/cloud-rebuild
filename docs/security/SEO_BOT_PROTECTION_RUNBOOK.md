# Protection SEO et anti-scraping de TOK

## Objectif

TOK doit rester entièrement accessible aux moteurs de recherche légitimes tout en limitant l’aspiration massive des API et les requêtes coûteuses. Le HTML public pré-rendu, les sitemaps et les images ne doivent jamais recevoir de challenge générique.

`robots.txt` exprime une préférence aux robots coopératifs. Il ne constitue ni une authentification ni un pare-feu. Les contrôles opposables sont les statuts HTTP, les droits Supabase, les plafonds SQL, les limites de débit et les règles Vercel Firewall.

## Politique des robots

- Autorisés pour la découverte : Googlebot, bingbot, Applebot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot et Perplexity-User.
- Refusés pour l’entraînement ou les jeux de données en masse : GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Bytespider et meta-externalagent.
- Les autres robots coopératifs peuvent explorer les pages publiques.
- Les espaces privés restent accessibles au crawl afin que les moteurs puissent lire leur `X-Robots-Tag: noindex`; ils ne sont jamais mis dans un sitemap.
- L’identité déclarée dans `User-Agent` n’accorde aucun privilège d’API.

## Déploiement Vercel Firewall

Projet unique : `cloud-rebuild-recovered` (`prj_v4X2Bhefbcf12CVIanrvS62q9Vy6`), équipe `team_FvFPXdOD5Vw9DAQS5grAuJAv`.

Les changements Firewall sont d’abord créés comme brouillons. Ils ne sont publiés qu’après observation des journaux et validation humaine.

### Étape 1 — journaliser

Créer les règles suivantes avec l’action de dépassement `log` :

| Règle                  | Condition                            | Fenêtre | Seuil initial | Clé |
| ---------------------- | ------------------------------------ | ------: | ------------: | --- |
| `TOK API burst log`    | chemin commence par `/api/`          |    60 s |           120 | IP  |
| `TOK Edge burst log`   | chemin commence par `/functions/v1/` |    60 s |           120 | IP  |
| `TOK auth burst log`   | chemin commence par `/auth`          |    60 s |            40 | IP  |
| `TOK HTML scraper log` | méthode GET et chemin public         |    60 s |           300 | IP  |

Exemples à adapter après `vercel link` sur le projet exact :

```bash
vercel firewall rules add "TOK API burst log" \
  --condition '{"type":"path","op":"pre","value":"/api/"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 120 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes

vercel firewall rules add "TOK Edge burst log" \
  --condition '{"type":"path","op":"pre","value":"/functions/v1/"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 120 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes
```

Ne pas exécuter `vercel firewall publish` pendant cette étape.

### Étape 2 — observer

Pendant au moins 48 heures :

- comparer IP, JA4, chemin, statut et volume ;
- isoler Google/Bing et les robots IA à l’aide des catégories de bots vérifiés lorsque l’offre Vercel le permet ;
- confirmer que Capacitor iOS/Android, les webhooks et les équipes internes ne dépassent pas les seuils ;
- vérifier les erreurs `429`, `401`, `403` et les latences Supabase ;
- réduire les seuils seulement sur les routes coûteuses confirmées.

Un `User-Agent` ressemblant à Googlebot n’est pas une preuve d’identité.

### Étape 3 — appliquer progressivement

- API de lecture : passer le dépassement de `log` à `rate_limit`/HTTP 429.
- Authentification et formulaires suspects : utiliser un challenge seulement après dépassement, jamais au premier accès.
- HTML public : conserver le CDN et la limitation de débit ; ne pas imposer de challenge aux robots vérifiés.
- Activer les règles managées Bot Protection en `log` avant toute action `deny` ou `challenge`.
- Ne pas activer Attack Mode hors incident actif et borné dans le temps.

La publication finale se fait manuellement après revue :

```bash
vercel firewall rules list --expand
vercel firewall publish
```

## Défense Supabase

Les appels directs vers `*.supabase.co` contournent Vercel. Les règles essentielles doivent donc vivre aussi à la source :

- plafonner `search_restaurants_catalog` à une page bornée et à une profondeur maximale ;
- borner la taille des recherches et des filtres ;
- exposer à terme une projection publique versionnée à colonnes explicites, pas `public.restaurants` directement ;
- faire passer les mutations de tracking par une Edge Function avec limite de taille, idempotence et rate limit ;
- conserver JWT, ownership et quotas sur les fonctions coûteuses ;
- ne jamais exempter une requête d’API uniquement à cause de son `User-Agent`.

## Critères de mise en production

- une URL publique pré-rendue valide retourne 200 et sa propre canonicale ;
- une URL inventée retourne 404 avec la page TOK `noindex` ;
- Googlebot/Bingbot vérifiés reçoivent les pages et sitemaps sans challenge ;
- les routes privées reçoivent `X-Robots-Tag: noindex` et `Cache-Control: private, no-store` ;
- une recherche demandant une limite ou un offset excessif est plafonnée ;
- une rafale API dépasse le seuil en journalisation avant toute activation 429 ;
- l’application web et Capacitor restent fonctionnelles.

## Retour arrière

- désactiver ou remettre en `log` la règle responsable d’un faux positif ;
- ne pas rétablir les limites SQL abusives : elles sont conçues pour conserver le comportement normal ;
- ne jamais remettre la rewrite publique globale vers `/index.html`, car elle réintroduit les soft 404.

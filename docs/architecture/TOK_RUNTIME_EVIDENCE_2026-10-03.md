# État d’exécution TOK observé le 3 octobre 2026

> Photographie distante en lecture seule. La [référence canonique de l’application](./TOK_APPLICATION_REFERENCE.md) décrit l’état versionné et se régénère automatiquement; ce document distingue ce qui a réellement été observé sur Supabase de ce qui est seulement déclaré dans Git.

Les mêmes résultats sont conservés sous forme structurée dans [`tok-runtime-evidence-2026-10-03.json`](./tok-runtime-evidence-2026-10-03.json) afin que les écarts distants soient recherchables dans l’index global.

## Méthode et périmètre

Les contrôles ont utilisé la CLI Supabase authentifiée déjà configurée sur la machine, sans afficher ni enregistrer de clé :

- liste des migrations liées ;
- génération en mémoire des types du schéma `public` ;
- liste des fonctions Edge des projets production et démonstration ;
- comparaison des slugs distants avec les dossiers `supabase/functions/<slug>`.

Les commandes sont en lecture seule. Elles ne prouvent ni la santé fonctionnelle de chaque handler, ni les données métier, ni l’état des fournisseurs tiers.

## Base de production

Projet observé : `wwcrtyoueexyxkkikaos`.

| Contrôle | Résultat observé |
| --- | ---: |
| Migrations locales et distantes alignées | 518 |
| Tables du schéma `public` | 335 |
| Vues du schéma `public` | 4 |
| Noms de fonctions/RPC du schéma `public` | 558 |
| Enums du schéma `public` | 3 |

Le contrat TypeScript versionné dans `src/integrations/supabase/types.ts` ne contient que 140 tables, aucune vue, 85 noms de RPC et 3 enums. Il est donc incomplet par rapport à la production observée : 195 tables, 4 vues et 473 noms de RPC ne sont pas présents dans ce contrat local. Les migrations restent la source versionnée de reproductibilité ; les types doivent être régénérés séparément avant de les considérer exhaustifs.

## Fonctions Edge de production

| Contrôle | Résultat observé |
| --- | ---: |
| Fonctions dans Git | 114 |
| Fonctions actives en production | 118 |
| Fonctions Git absentes de production | 0 |
| Fonctions de production absentes de Git | 4 |

Les quatre fonctions présentes uniquement dans le runtime de production sont :

- `print-sandbox-diagnose`
- `recover-thefork-source-archive`
- `tok-image-truth-probe`
- `tok-places-coverage-probe`

Cet écart doit rester visible : ces fonctions ne sont ni reproductibles ni révisables depuis le dépôt actuel. Leur suppression distante ou leur rapatriement en Git nécessite une décision opérationnelle distincte.

## Projet de démonstration

Projet observé : `hzldfhjfgjcadmpghhhf`.

| Contrôle | Résultat observé |
| --- | ---: |
| Fonctions actives | 114 |
| Fonctions Git absentes du projet | 0 |
| Fonctions du projet absentes de Git | 0 |

Le catalogue des fonctions de démonstration correspond donc exactement aux 114 fonctions versionnées au moment du contrôle.

## Limites de preuve

- L’alignement de 518 migrations confirme l’historique enregistré, pas l’absence de modifications SQL manuelles hors migrations.
- Les nombres de tables, vues, RPC et enums proviennent d’une introspection du schéma `public`; les schémas privés et d’extensions ne sont pas détaillés ici.
- Le statut `ACTIVE` d’une fonction prouve son déploiement, pas la réussite d’un appel réel avec authentification et données valides.
- Les états Vercel, Stripe, OpenAI, Firebase, Resend, Twilio, Cloudprinter, Google et autres fournisseurs ne sont pas déduits de cette photographie Supabase.
- Toute nouvelle vérification doit créer une nouvelle photographie datée ou mettre à jour explicitement celle-ci avec les commandes et résultats observés.

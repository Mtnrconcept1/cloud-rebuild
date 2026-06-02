# Local Git Auto Sync

Ce mecanisme garde le dossier local a jour avec une branche remote sans faire de `git pull` risqué.

## Commandes

Lancer une verification ponctuelle sur la branche courante et son upstream :

```powershell
pnpm git:auto-sync
```

Lancer une verification ponctuelle de `origin/main` uniquement si la branche locale courante est `main` :

```powershell
pnpm git:auto-sync:main
```

Lancer un watcher manuel toutes les 5 minutes :

```powershell
pnpm git:auto-sync:watch
```

Installer la tache Windows Task Scheduler toutes les 5 minutes :

```powershell
pnpm git:auto-sync:install
```

Desinstaller la tache :

```powershell
pnpm git:auto-sync:uninstall
```

## Garde-fous

Le script fait seulement :

```powershell
git fetch --prune origin
git merge --ff-only origin/main
```

Il saute la synchronisation dans les cas suivants :

- le dossier contient des fichiers modifies ou non commités ;
- la branche courante ne correspond pas a la branche configuree ;
- la branche locale est en avance sur le remote ;
- la branche locale et le remote ont diverge ;
- le repo est en detached HEAD.

## Comportement recommande

La tache planifiee cible `main` par defaut. Si Codex ou un developpeur travaille sur une branche `codex/*`, la tache ne change pas de branche et ne tire rien. Elle recommencera automatiquement quand le dossier sera revenu sur `main`.

Les logs de la tache installee sont ecrits dans :

```txt
%LOCALAPPDATA%\TOK\git-auto-sync\git-auto-sync.log
```

Le script execute par la tache est copie dans `%LOCALAPPDATA%` pour rester disponible meme si le repo change de branche.

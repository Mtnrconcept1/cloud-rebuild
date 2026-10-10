# TOK — Affiche animée et décompte de lancement

Studio Remotion et aperçu React de l’animation de lancement TOK. La composition
reprend l’affiche fournie le 10 octobre 2026 et sert aussi de base à la page de
lancement de l’application.

## Voir et exporter

Dans ce dossier, avec Node >= 22.12 et pnpm 10.28.1 :

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm studio
pnpm render
pnpm still
```

- Aperçu interactif : http://127.0.0.1:4178/ (serveur local).
- Composition `TokLaunch` : 1920 × 1080, 30 images/seconde, 21 secondes.
- Composition `TokLaunchMobile` : 1080 × 1920, 30 images/seconde, 21 secondes.
- Export : `out/tok-launch.mp4`, H.264, sans audio.
- Export vertical : `out/tok-launch-mobile.mp4`, H.264, sans audio.
- Image de contrôle : `out/tok-launch.png`.
- `pnpm build` produit l’aperçu statique dans `dist` à servir par HTTP.

## Temps réel et vidéo

La vidéo démarre à **20:00:00:00**, puis **19:23:59:59** après une seconde.
L’animation des chiffres dure 0,32 seconde à chaque changement. Le calcul reste à
vitesse réelle, sans accélération. La dernière seconde du MP4 affiche 19:23:59:40.
Le MP4 est un extrait de 21 secondes, pas un fichier de 480 heures.

Dans l’aperçu, « Démonstration » peut être relancée depuis 20 jours. « Décompte réel »
utilise une échéance fixée à 20 jours après la première ouverture, sauvegardée dans
le stockage local du navigateur. Fermeture, onglet inactif et rechargement ne
remettent pas le compteur à zéro. Il s’arrête à zéro, y compris après rechargement.
Dans l’application, le compteur provient d’une échéance unique enregistrée côté
serveur au moment où l’admin active « Animation de lancement · verrou client ».
Il est purement informatif : atteindre zéro ne donne aucun accès. Seule la
désactivation explicite du flag par l’admin ouvre les parcours clients.

« Figer le mouvement » et la préférence système de mouvement réduit arrêtent les
effets décoratifs ; le compteur continue. Le pointeur déplace les plans selon leur
profondeur. Sur mobile, la mise en scène passe en portrait : titre et logo en haut,
chef et accessoires au centre, compteur et ruban en bas.

## Plans et fidélité

- Décor orange reconstruit sans objets, déplacé en arrière-plan.
- Chef détouré, avec toque, foulard, montre et cloche dans un même plan.
- Atlas transparent de 12 accessoires : tomate, moulin, casserole, toque volante,
  fouet, poêle, basilic, poivron, spaghetti, panneau, logo et piment.
- Découpes de l’atlas rendues individuellement par fenêtres CSS ; basilic réutilisé.
- Titres, bulle, texte du panneau, ruban, quatre cases et chiffres reconstruits en
  HTML/CSS pour conserver leur netteté et permettre l’animation.
- Poussières lumineuses, légères rotations et oscillations à différentes vitesses.

Les images ont été dérivées par l’outil imagegen intégré : il s’agit de détourages
et reconstructions génératifs, pas de calques originaux récupérés ni d’une découpe
pixel pour pixel. De petits détails du chef, des accessoires et du logo varient.
Les articulations du chef ne sont pas animées indépendamment. Les petits fragments
de nourriture sont regroupés avec les accessoires ou remplacés par les particules.
Les instructions de génération sont consignées dans `ASSETS.md`.

Palette : orange #ef7900, rouille #bc4308, crème #fff1d1, encre #181204.
Typographies embarquées : Anton (titres/chiffres), Barlow Condensed (texte).
Les polices et images sont locales ; aucun service externe nécessaire à la lecture.

## Vérifications et maintenance

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

19 tests couvrent les bornes du compteur, 30/60 fps, expiration et stockage refusé.
Les tests applicatifs vérifient aussi la fermeture sur erreur, le rebloquage d’une
session déjà ouverte, l’accès restaurateur au seul dashboard de préparation, et le
fait que zéro ne libère pas un client. La migration inclut un test SQL transactionnel
sur une base PostgreSQL jetable.
Chrome vérifié à 1440 × 960 et 390 × 844 : passage observé à 19:23:59:59,
échéance identique après rechargement, pose figée sans arrêter le compteur,
mouvement réduit respecté, aucun débordement mobile ni erreur JavaScript lors
du parcours final. Export H.264 contrôlé : 21 secondes, 1920 × 1080, 30 fps.
L’application utilise les assets partagés dans `public/launch` et la migration
`20261010220000_launch_animation_access_gate.sql` pour garantir le même état côté
interface, API, Edge Functions et RLS.
Le rendu Remotion utilise uniquement le numéro de frame. L’aperçu utilise l’horloge
réelle pour éviter la dérive des intervalles et rattraper les onglets suspendus.
Le projet est volontairement indépendant du workspace applicatif principal.
Son fichier de verrouillage et ses validations sont propres à ce dossier ; la CI
du dépôt traite `docs/` comme de la documentation et ne valide pas ce studio.

Retour arrière : révoquer le commit ajoutant ce dossier. Aucun état serveur à rétablir.

Documentation utilisée : [Remotion frames](https://www.remotion.dev/docs/use-current-frame),
[export CLI](https://www.remotion.dev/docs/cli/render),
[licence Remotion](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

## Fichiers du livrable

`.gitignore`, `ASSETS.md`, `README.md`, `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`,
`index.html`, `src/Scene.tsx`, `src/countdown.ts`, `src/main.tsx`,
`src/remotion.tsx`, `src/scene.css`, `src/viewer.css`,
`tests/countdown.test.ts`, `public/assets/background.png`,
`public/assets/chef.png`, `public/assets/props.png`.

Les exports vidéo, build et captures restent des livrables locaux non versionnés.

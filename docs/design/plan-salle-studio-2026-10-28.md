# Plan de salle — studio professionnel TOK

## Résultat et périmètre

Refonte de la vraie page `/dashboard/plan-salle` et de ses composants React d'après les six références visuelles : aménagement, bibliothèque, réglages, espaces, service et assistant IA. Les objets du restaurant restent les données affichées. Le changement ajoute les 22 assets transparents générés, optimisés en WebP alpha (1 005 292 octets au total, contre environ 25,6 Mo pour les PNG sources).

La direction visuelle utilise papier ivoire, titres sérif, orange TOK, chêne et assises sauge. Le canevas principal, la bibliothèque et l'inspecteur sont recomposés ; le service dispose d'une file de clients et d'un panneau de détail séparés. Les styles sont limités à cet outil.

## Risque et procédure

**Niveau 3**, proportionné au domaine des réservations : les parcours de placement, sauvegarde et changement de mode restent sensibles même si cette PR est frontend. Branche dédiée `codex/tok-floorplan-studio-20261028`, dans un worktree séparé. Base mise à jour sur `837705c65cedfbfb3406fe9542e4afdf66020938` sans modifier `main`.

Aucune migration, nouvelle politique RLS, route protégée, Edge Function, variable d'environnement, dépendance ou configuration de déploiement n'est modifiée. Les mutations et RPC existants restent utilisés. La PR de fiabilité #907 demeure indépendante. Retour arrière : revert du commit frontend ; les propriétés JSON de présentation sont optionnelles et ignorées par l'ancienne interface.

## Vues et réglages intégrés

- **Aménagement** : canevas, zoom, ajustement automatique, sélection, déplacement, poignées de redimensionnement et rotation, déplacement de la vue, grille et magnétisme, annuler/rétablir, verrouillage et sauvegarde.
- **Bibliothèque** : catégories, recherche, filtres de tables, aperçu du preset, ajout explicite et accès aux réglages. Mobilier existant conservé et nouveaux presets de structure/décor.
- **Réglages** : nom, secteur, forme, capacité, détail des assises et banquettes, dimensions, position, rotation, finition chêne/naturelle/noyer, visibilité/activation, verrou, duplication et suppression.
- **Espaces** : miniatures calculées sur les vrais objets, comptes de tables et couverts, changement de salle, création et renommage, objets masqués et configurations nommées.
- **Service** : tables et occupations réelles, file de réservations recherchable, filtres de service, attribution manuelle/automatique, libération, statuts et détails existants. L'ajustement géométrique du jour est explicite.
- **Assistant IA** : objectif, capacité souhaitée, types de tables, éléments à conserver, import/photo, aperçu et comparaison de réponses réelles, puis application explicite au brouillon.

Les dimensions sont affichées en unités logiques (`u.`) : l'application ne possède pas d'étalonnage physique permettant d'affirmer des centimètres ou des mètres. L'activation réutilise le contrat de visibilité/réservation existant ; aucun faux paramètre indépendant de réservation en ligne n'est ajouté.

## Compatibilité et protections

Les variantes visuelles sont stockées dans `layout.visual_variant`, la finition dans `layout.finish`, et le verrou d'édition dans `layout.locked`. Les `kind` métier et contrats RPC ne changent pas. Le verrou protège les transformations de l'éditeur, sans modifier les droits ni empêcher une réservation.

La géométrie est conservée dans un canevas canonique de 1040 × 760. La taille d'écran agit par un facteur d'affichage distinct du zoom ; les coordonnées du pointeur sont converties en sens inverse. Le redimensionnement suit les axes de l'objet tourné et conserve la poignée opposée. Les hit-tests des objets tournés utilisent la même rotation. Les marges transparentes des images ne changent pas la taille visible des objets.

Le changement Aménagement/Service attend la sauvegarde. Un refus conserve le mode et le brouillon. Les modifications de géométrie et d'affectation sont refusées pendant une sauvegarde en cours. Les rafraîchissements automatiques au retour de focus ne remplacent pas les brouillons de tables, overrides ou affectations. Le navigateur reçoit une protection de sortie lorsqu'il reste des changements.

L'occupation du canevas dépend de la date et du service, indépendamment de la recherche dans la file. Les capacités et chevauchements restent vérifiés sur les réservations de la branche. Les réservations terminées/annulées ne maintiennent pas une occupation.

L'application IA conserve les objets verrouillés, les autres salles, les objets omis et les affectations ; une table reconnue garde son identité et ses paramètres opérationnels. Les nouvelles configurations mémorisent l'ID des objets ; la restauration privilégie cet ID, puis une correspondance secteur/type/nom pour les anciennes configurations.

Un espace vide reste un brouillon tant que son premier objet n'est pas enregistré.

## Limites explicitement conservées

- La sauvegarde globale existante enchaîne plusieurs écritures : cette PR ne la rend pas atomique et ne garantit pas un rollback serveur global après une erreur tardive. Les tests de refus vérifient le brouillon et le mode de l'interface.
- Les anciennes configurations sans ID, ainsi que celles créées avec des objets jamais enregistrés, restent dépendantes des noms pour retrouver les objets après une insertion ou un renommage. Pour conserver une identité durable dans une nouvelle configuration, enregistrer d'abord les nouveaux objets du plan.
- Les réponses IA sont validées au niveau frontend, mais aucun appel IA de production ni mutation réelle de réservation n'est déclenché par la validation locale.
- Le poids de 1 Mo concerne uniquement les 22 nouveaux assets, pas le bundle total de l'application.

## Validation

Les tests couvrent la page réelle avec des données mémoire, les composants, la normalisation, les assets, l'historique, les placements, les conflits, les sauvegardes refusées, le changement de salle, les objets tournés et les limites de capacité. Le réseau est interdit dans les tests d'intégration. Le scénario de sauvegarde lente suspend le RPC mémoire et vérifie qu'une seconde affectation ou libération ne peut écraser l'opération en cours.

Les commandes utilisent directement les binaires Node installés, équivalents aux scripts pnpm du dépôt. La compilation `build:prod` utilise les valeurs publiques fictives prévues dans la CI ; ses étapes SEO dépendant d'un inventaire Supabase réel restent non validées dans cet environnement.

**Validation visuelle à terminer** : le navigateur connecté ne peut joindre le serveur local du conteneur. L'ouverture d'un tunnel public Cloudflare a été refusée par le contrôle automatique, en raison de l'exposition du bundle et des assets à un tiers sans accord explicite. Aucune autre exposition publique n'a été tentée. Le brouillon ouvert dans l'onglet de production n'a pas été modifié.

Avant mise en ligne, contrôler dans un navigateur réel : comparaison aux références, desktop et mobile, manipulation tactile et zoom, débordements des dialogues, retour du focus, impression et sauvegarde/rechargement sur une salle de test. La conformité visuelle exacte n'est pas revendiquée avant ce contrôle.

## Résultats de validation finale

- Tests du domaine et de synchronisation de la carte d'erreurs : **204 réussis dans 19 fichiers**, en mode production.
- TypeScript global : **réussi**, aucune erreur.
- ESLint global : **réussi**, zéro erreur ; 23 warnings préexistants sur des fichiers hors refonte.
- Index applicatif : **régénéré et contrôle réussi**.
- `git diff --check` et `git diff --cached --check` : **réussis**.
- `build:prod` : **réussi**, compilation et post-traitements exécutés avec les valeurs publiques fictives de CI. Les étapes SEO nécessitant l’inventaire réel signalent explicitement leur absence de données.
- Revue croisée : géométrie/assets, composants/UX et Service/persistance ; corrections intégrées, dont couche des plantes, défilement du canevas, perte de sélection et garde des écritures en cours.
- La suite complète du dépôt est laissée à la CI de la PR ; elle sera déclenchée par la mise à jour des références applicatives.

Commandes de qualité utilisées : `node node_modules/eslint/bin/eslint.js .`, `node node_modules/typescript/bin/tsc -p tsconfig.typecheck.json --noEmit --pretty false`, `node node_modules/vitest/vitest.mjs run --mode production <19 fichiers>`, et `node scripts/generate-application-index.mjs --check`. Le build reproduit successivement toutes les commandes du script `build:prod`, avec les variables publiques fictives de CI.

## Fichiers modifiés


- `docs/architecture/TOK_APPLICATION_REFERENCE.md`
- `docs/architecture/tok-application-search-index.json`
- `docs/design/plan-salle-studio-2026-10-28.md`
- `public/floor-plan/01_table-ronde-duo.webp`
- `public/floor-plan/02_table-ronde-quatre.webp`
- `public/floor-plan/03_table-carree.webp`
- `public/floor-plan/04_table-rectangulaire.webp`
- `public/floor-plan/05_table-haute-ronde.webp`
- `public/floor-plan/06_chaise-sable.webp`
- `public/floor-plan/07_tabouret-sauge.webp`
- `public/floor-plan/08_banquette-droite-sauge.webp`
- `public/floor-plan/09_banquette-angle-sauge.webp`
- `public/floor-plan/10_console-service-bois.webp`
- `public/floor-plan/11_mur-droit.webp`
- `public/floor-plan/12_mur-angle.webp`
- `public/floor-plan/13_porte-ouverte.webp`
- `public/floor-plan/14_fenetre-module.webp`
- `public/floor-plan/15_cloison-vitree.webp`
- `public/floor-plan/16_plante-grande.webp`
- `public/floor-plan/17_plante-table.webp`
- `public/floor-plan/18_jardiniere-rectangulaire.webp`
- `public/floor-plan/19_parasol-terrasse.webp`
- `public/floor-plan/20_presentoir-gateau.webp`
- `public/floor-plan/21_buffet-reception.webp`
- `public/floor-plan/22_comptoir-mobile.webp`
- `public/floor-plan/README.md`
- `public/floor-plan/manifest.json`
- `src/components/floor-plan/DynamicTableSvg.tsx`
- `src/components/floor-plan/EventFurnitureSvg.tsx`
- `src/components/floor-plan/FloorPlanAIPanel.tsx`
- `src/components/floor-plan/FloorPlanAssetSprite.tsx`
- `src/components/floor-plan/FloorPlanItemIllustration.tsx`
- `src/components/floor-plan/FloorPlanMiniature.tsx`
- `src/components/floor-plan/FloorPlanSpaces.tsx`
- `src/components/floor-plan/FloorPlanWorkspace.css`
- `src/components/floor-plan/ServiceBoard.tsx`
- `src/components/floor-plan/SimpleReservationQueue.tsx`
- `src/components/floor-plan/StudioCanvas.tsx`
- `src/components/floor-plan/StudioInspector.tsx`
- `src/components/floor-plan/StudioPalette.tsx`
- `src/components/floor-plan/TableConfigDialog.tsx`
- `src/components/floor-plan/TableContextDrawer.tsx`
- `src/components/floor-plan/floorPlanAssets.ts`
- `src/components/floor-plan/floorPlanSheet.ts`
- `src/components/floor-plan/serviceShared.ts`
- `src/data/tok-user-guide-catalog.generated.ts`
- `src/lib/floorPlan.ts`
- `src/lib/floorPlanStudio.ts`
- `src/pages/dashboard/DashboardPlanSalle.tsx`
- `src/test/dashboard-floor-plan-integration.test.tsx`
- `src/test/fixtures/floorPlanPreview.ts`
- `src/test/floor-plan-assets.test.tsx`
- `src/test/floor-plan-automatic-import.test.ts`
- `src/test/floor-plan-page-layout.test.ts`
- `src/test/floor-plan-studio-panels.test.tsx`
- `src/test/floor-plan-studio.test.ts`
- `src/test/floor-plan.test.ts`
- `src/test/service-board.test.tsx`
- `src/test/simple-reservation-queue.test.tsx`
- `src/test/studio-canvas.test.tsx`
- `src/test/table-context-drawer.test.tsx`

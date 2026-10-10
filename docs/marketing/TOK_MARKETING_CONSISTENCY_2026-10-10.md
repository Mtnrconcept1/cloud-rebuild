# Cohérence des campagnes TOK — 10 octobre 2026

## Périmètre et plan avant modification

Risque niveau 3 : génération IA, média public et parcours de validation. Base réelle : 702a9a19501af18b144dff7d1195eada04bacdb0. Worktree isolé `/vercel/sandbox/marketing`, branche `fix/marketing-plan-consistency-20261010`. Aucun changement de main, secret, RLS, migration, paiement ou publication.

1. Reproduire par tests les dates passées/hors fenêtre, le ciblage divergent, les canaux incohérents, les appels à l'action sans destination et les contenus répétés.
2. Durcir `supabase/functions/_shared/marketing-ai-plan.ts` : contrat validé côté serveur, fenêtre réelle, audience identique, destination publique TOK, budget/portée honnêtes et contrat historique compatible.
3. Adapter `supabase/functions/_shared/marketing-ai.ts` et `supabase/functions/ai-marketing-agent/index.ts` : consignes de comparaison factuelle, progression éditoriale, liens UTM, JPEG natif borné et avertissements de génération.
4. Corriger les vues `MarketingAgentView.tsx` et `MarketingCalendarView.tsx` : choix explicite des canaux, modèle Genève complet, heures suisses, date d'approbation future et distinction entre zéro mesuré et audience non calculée.
5. Tester la non-régression marketing, le typecheck, le lint et le build. Mettre à jour l'index documentaire et ouvrir une PR sans merge.

Risques : rejeter un ancien format de plan, élargir implicitement un ciblage, perdre un brouillon sur échec visuel ou contourner l'approbation. Le contrat historique reste lisible ; les nouveaux plans utilisent des contraintes explicites. Un échec média reste visible, jamais une preuve de publication. Les RPC d'approbation et de consentement restent inchangées.

Retour arrière : revert du commit de cette PR. La production et les brouillons existants ne sont pas modifiés par ce lot. Les anciennes dates et audiences doivent être relues dans l'interface ; aucune diffusion automatique n'est autorisée.

## Preuves initiales

42 tests existants ciblés réussis. Les quatre brouillons de la campagne genevoise sont toujours en attente ; une date est passée et un ciblage diffère. RLS activée sur les quatre tables marketing inspectées. Le bucket public social-post-media accepte image/jpeg. La route `/restaurateurs/alternative-commission-couvert` existe déjà.

## Résultat vérifié

- 414 tests marketing/Meta réussis sur 45 fichiers, dont 34 nouveaux tests de régression. Les échecs initiaux ont été observés avant les corrections.
- Typecheck applicatif : réussi. ESLint : zéro erreur, 16 avertissements existants hors des fichiers modifiés.
- Build `pnpm build:prod` complet réussi avec les variables publiques factices exactes du workflow CI. Un premier build sans ces variables a été refusé par le garde-fou de configuration, qui reste inchangé.
- `deno check supabase/functions/ai-marketing-agent/index.ts` réussi avec Deno 2.9.6. Aucune dépendance du projet ni aucun secret modifié.
- Index documentaire régénéré sur le checkout complet et contrôle de fraîcheur réussi.
- Aucun envoi réel, appel payant de génération IA, changement Supabase, approbation, achat publicitaire ou déploiement exécuté. Les fournisseurs sont simulés dans les tests.

Le nouveau modèle Genève sélectionne explicitement Facebook et Instagram et conserve une comparaison conditionnelle au tarif du contrat concurrent. Les campagnes historiques ne sont pas réécrites silencieusement : il faut les relire ou les régénérer avec le nouveau formulaire après livraison. Un visuel manquant est annoncé ; le statut de génération ne vaut jamais autorisation de diffusion. Les liens UTM permettent la mesure mais ne prétendent pas que le suivi des conversions est déjà alimenté.

## Livraison

Branche dédiée uniquement, PR sans merge. Le transfert des onze fichiers validés vers GitHub utilise une tâche ponctuelle limitée à cette branche. L’archive et chaque fichier sont vérifiés par leur empreinte SHA-256 ; la liste de destinations est fixe. Cette tâche ne commite que les onze fichiers de ce lot, puis le connecteur GitHub supprime son fichier temporaire dans un commit de nettoyage. Aucune clé privée n’est exportée et aucune configuration de déploiement production n’est modifiée. Le diff final doit exclure les sitemaps de test, le lockfile Deno temporaire et la tâche ponctuelle.

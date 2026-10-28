# Plan d’implémentation — assistant TOK avec pièces jointes sécurisées

Date : 2026-10-28
Branche : `feat/advisor-secure-attachments`

## Fichiers concernés

1. `src/lib/advisorAttachments.ts` — préparation navigateur, limites, lecture data URL et contrat typé.
2. `src/marketing/mailingRecipients.ts` — réutilisation du préflight CSV/XLS/XLSX pour normaliser les contacts CRM.
3. `src/lib/ai/tokAiClient.ts` — pièces jointes de planification et payload de confirmation.
4. `src/pages/dashboard/DashboardAdvisor.tsx` — trombone, aperçu, suppression, avertissements et confirmations spécifiques.
5. `supabase/functions/_shared/openai.ts` — option de modération intégrée et validation du résultat.
6. `supabase/functions/_shared/advisor-attachments.ts` — validation binaire, empreinte, normalisation CRM et modération autonome.
7. `supabase/functions/ai-restaurant-editor/index.ts` — nouvelles cibles typées, contexte fichier non fiable et application contrôlée.
8. `supabase/migrations/*_advisor_secure_attachments.sql` — table CRM importée, RLS, RPC d’import et de lecture.
9. `src/lib/customerCrm.ts` — source du profil, consentement et fusion déterministe.
10. `src/components/crm/CustomerCrmDashboard.tsx` — lecture des contacts importés et badges explicites.
11. `src/test/advisor-secure-attachments.test.ts` — parser, confidentialité, allowlists et garde-fous.
12. `src/test/customer-crm.test.ts` — contrat migration/RPC et fusion CRM.
13. Index générés de l’application TOK.

## Ordre de travail

### Étape 1 — tests rouges

- Ajouter les tests du parser CSV, déduplication et neutralisation des formules.
- Ajouter les tests textuels des garde-fous Edge Function et migration.
- Générer le nom de migration avec `supabase migration new advisor_secure_attachments` dans un runner dédié.
- Ouvrir une PR brouillon et constater l’échec attendu avant implémentation.

### Étape 2 — parser et contrat frontend

- Ajouter les types d’attachement et les limites.
- Réutiliser le préflight tableur existant.
- Préparer images/PDF/data CRM sans persistance.
- Ajouter les payloads typés au client IA.

### Étape 3 — sécurité serveur

- Valider signature binaire, taille, MIME et identifiant.
- Calculer SHA-256.
- Modérer prompt et images avant appel IA.
- Envoyer les PDF comme `input_file` à faible détail.
- Ne transmettre au modèle aucune ligne CRM ni adresse e-mail/téléphone importés.
- Ajouter les cibles strictes au schéma de sortie.

### Étape 4 — mutations contrôlées

- Image : vérifier le plat, revalider/modérer/hash, uploader, mettre à jour avec contrôle concurrent et supprimer l’objet en cas d’échec.
- CRM : vérifier AAL2, Premium/Élite et propriétaire ; appeler une RPC transactionnelle avec contacts normalisés ; conserver le consentement existant.
- Journaliser uniquement les nombres, types et identifiants, jamais le contenu des fichiers ou les PII.

### Étape 5 — CRM et UX

- Fusionner profils transactionnels et contacts importés avec priorité aux profils transactionnels.
- Afficher `Import manuel` et `Consentement à vérifier`.
- Ajouter le trombone, les cartes de pièces jointes et les boutons de confirmation ciblés.
- Effacer les fichiers de la mémoire après confirmation ou annulation.

### Étape 6 — validation

- Test ciblé pièces jointes.
- Test CRM.
- `pnpm lint`.
- `pnpm typecheck`.
- `pnpm test:prod` via CI en shards.
- `pnpm build`.
- `pnpm docs:application-index` puis vérification.
- Vérifier la migration statiquement, les grants/RLS et les advisors applicables sans appliquer en production.

## Risques

- Régression de l’assistant existant : isoler les nouvelles branches par cible et conserver le flux actuel.
- Dépassement de payload : limites très inférieures aux limites fournisseur, maximum trois fichiers.
- Coût IA PDF : détail `low`, un seul PDF, taille bornée.
- PII CRM : aucune ligne vers OpenAI, audit sans contenu.
- Écriture partielle : import CRM transactionnel ; image supprimée si le patch du plat échoue.

## Stratégie de retour arrière

- Revert unique du commit de fonctionnalité.
- Aucun changement destructif sur les tables historiques.
- La table additive reste inaccessible si le code est retiré.
- Une éventuelle suppression de données nécessite une migration distincte et une validation explicite.

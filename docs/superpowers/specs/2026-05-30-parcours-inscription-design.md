# Parcours d'inscription — durcissement (client, restaurateur, livreur)

**Statut** : design retenu, en attente de revue utilisateur avant plan d'implémentation.

## Objectif

Fiabiliser de bout en bout l'inscription des trois profils (client, restaurateur, livreur) avec trois exigences validées :

1. **Vérification d'email obligatoire** — un compte n'est pleinement utilisable qu'après confirmation de l'adresse. L'inscription client est impossible sans email (déjà imposé côté formulaire et côté Supabase Auth ; on ajoute la confirmation réelle).
2. **Brouillon serveur + lien de reprise** pour restaurateur/livreur — le dossier (champs + documents) est persisté côté serveur dès la soumission, avant même la session, puis l'utilisateur confirme son email et le dossier l'attend, quel que soit l'appareil.
3. **Notifications email des deux côtés** — l'admin est prévenu à chaque nouvelle candidature confirmée ; le demandeur est prévenu à chaque décision (approuvé / corrections / refusé).

Ce design corrige aussi un bug existant : aujourd'hui, si la confirmation d'email est active, le restaurateur/livreur perd silencieusement ses documents et sa candidature.

## Décisions validées

- Vérification d'email : **obligatoire** (lien de confirmation).
- Onboarding restaurateur/livreur : **brouillon serveur + lien de reprise**.
- Notifications : **email à l'admin et au demandeur**.
- Destinataire admin : **tous les utilisateurs `admin`** (repli sur l'env `ADMIN_ALERTS_EMAIL` si défini).
- Planification du worker d'emails : **prérequis bloquant** (voir § Prérequis).

## Constat actuel

Fichiers clés : `src/pages/Auth.tsx`, `src/lib/signup.ts`, `src/lib/auth.tsx`, `src/hooks/useSignupApplication.ts`, `src/components/signup/SignupApplicationStatusCard.tsx`, et les migrations `20260329103000_add_signup_applications_and_verification.sql` + `20260527110835_fix_signup_moderation_flow.sql`.

**Ce qui est déjà solide**

- Email obligatoire au formulaire (`required` + validation) et via `supabase.auth.signUp`.
- Séparation des rôles : le client est actif immédiatement ; restaurateur/livreur créent une candidature `signup_applications` + un restaurant `pending` / courier `pending_approval`. Le rôle privilégié n'est accordé qu'après approbation admin (`admin_review_signup_application`).
- RLS strictes sur `signup_applications`, `signup_application_documents` et le bucket privé `verification-documents`.
- Suivi visible côté demandeur (`SignupApplicationStatusCard`) et revue admin (`/admin/utilisateurs?tab=applications`). Comportement verrouillé par `src/test/signup.test.ts`.

**Ce qui doit changer / est cassé**

- `Auth.tsx` tente un `signInWithPassword` immédiat après `signUp` pour obtenir une session et uploader les documents + appeler `sync_signup_application`. **Ne marche que si la confirmation d'email est désactivée.** Si elle est active : pas de session → documents et candidature **perdus**, sans reprise possible (`/dashboard` bloqué, formulaire disparu).
- Aucune notification : l'admin doit penser à regarder le panneau ; le demandeur ignore qu'il est approuvé.
- `sync_signup_application` (authentifié) repose sur `auth.uid()` : inutilisable depuis une Edge Function en service role (où `auth.uid()` est `NULL`).
- Manques de robustesse inscription : pas de consentement CGU/Confidentialité, mot de passe min. 6 sans confirmation, copie sans accents.

## Architecture cible

### Parcours Client (léger)

1. `/auth?type=client` → nom, email, mot de passe (+ confirmation), case **CGU + Confidentialité** (obligatoire).
2. `supabase.auth.signUp(...)` avec `emailRedirectTo = ${origin}/auth/confirmed?next=…`. Aucune session retournée (confirmation requise).
3. Écran **« Vérifie ta boîte mail »** + bouton **Renvoyer** (cooldown 60 s, `supabase.auth.resend`).
4. Clic sur le lien → `/auth/confirmed` → session active → redirection vers `next` (défaut `/`).
5. Profil + rôle `client` créés par le trigger `handle_new_user` au moment du `signUp` (le `full_name` provient de `options.data`). **Aucun appel serveur supplémentaire** côté client.

On **retire** le `signInWithPassword` de secours et l'appel `sync_signup_application` du chemin client.

### Parcours Restaurateur / Livreur (vérifié, brouillon serveur)

1. `/auth?type=restaurateur|courier` → formulaire complet **mono-page** (identité, infos pro/véhicule, IBAN, **documents**) + case CGU.
2. `supabase.auth.signUp(...)` → on récupère `user.id`, **pas de session**.
3. POST `multipart/form-data` vers l'Edge Function publique **`submit-signup-application`** (service role) : upload des documents + écriture atomique de la candidature au statut **`awaiting_email`** + restaurant `pending` / courier `pending_approval`.
4. Écran **« Compte créé — confirme ton email pour soumettre ton dossier »** + bouton Renvoyer.
5. Clic sur le lien → `/onboarding` → session active. Un **trigger de confirmation d'email** a fait passer le dossier `awaiting_email → pending_review` et **mis en file un email admin**. La page affiche la **carte de statut « En revue »**.
6. L'admin approuve / demande des corrections / refuse depuis `/admin/utilisateurs?tab=applications` → le rôle est accordé ou retiré + **email au demandeur**.
7. Une fois **approuvé**, accès à `/dashboard` (ou `/courier`).

## Modèle de données & backend

### 1. Migration — statut `awaiting_email`

Ajouter `'awaiting_email'` à la contrainte CHECK de `signup_applications.status` :
`('awaiting_email','pending_review','approved','needs_changes','rejected')`. C'est l'état du brouillon tant que l'email n'est pas confirmé ; il reste **invisible de la file admin**.

### 2. Edge Function `submit-signup-application` (nouvelle)

- Publique : `[functions.submit-signup-application] verify_jwt = false` dans `config.toml`. Utilise le service role.
- **Entrée** (`multipart/form-data`) : `user_id` (issu du `signUp`), `role`, champs pro/véhicule, `iban`, fichiers documents.
- **Gardes anti-abus** (admin client) :
  - l'utilisateur existe, `email_confirmed_at IS NULL`, `created_at > now() − 15 min` ;
  - `role ∈ {restaurateur, courier}` ;
  - aucune candidature déjà `pending_review`/`approved` pour `(user_id, role)` ;
  - documents requis présents (selon rôle/véhicule), taille ≤ 10 Mo, MIME en liste blanche (`pdf`, `jpg`, `jpeg`, `png`, `webp`) ;
  - rate-limit par IP via `rate_limit_buckets`.
- **Actions** (service role) : upload des fichiers dans `verification-documents/{user_id}/{role}/{type}-{uuid}.{ext}`, puis appel du RPC `admin_submit_signup_application` (ci-dessous).
- Justification : rien ne s'active avant confirmation d'email **et** approbation admin ; un brouillon forgé est donc inerte. Les gardes bornent l'abus de stockage.

### 3. RPC `admin_submit_signup_application(p_user_id uuid, …)` (nouveau, service-role)

- Jumeau service-role de `sync_signup_application`, mais prend un **`p_user_id` explicite** (au lieu de `auth.uid()`), et force le statut **`awaiting_email`**.
- Écrit de façon atomique : `signup_applications` + `signup_application_documents` + restaurant/courier.
- Les deux RPC (`sync_signup_application` authentifié et `admin_submit_signup_application` service-role) partagent un **helper interne commun** pour éviter la duplication.
- `REVOKE` de `PUBLIC` ; exécuté uniquement via service role.

### 4. `sync_signup_application` (authentifié) — conservé

Utilisé pour la **re-soumission après `needs_changes`** : le demandeur est alors connecté (session), ré-upload ses documents via RLS et resoumet → statut `pending_review`. C'est aussi le chemin de **complétion** depuis `/onboarding` si la soumission initiale sans session a échoué.

### 5. Trigger de promotion sur confirmation d'email

`AFTER UPDATE ON auth.users`, `SECURITY DEFINER`, condition `OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL` :

- `UPDATE signup_applications SET status='pending_review', submitted_at=now() WHERE user_id=NEW.id AND status='awaiting_email'` ;
- pour chaque candidature promue, **insertion dans `email_queue`** d'un email vers chaque admin (jointure `user_roles role='admin'` + email `auth.users`, repli `ADMIN_ALERTS_EMAIL`).

### 6. Notification de décision (dans `admin_review_signup_application`)

Après mise à jour du statut, **insérer dans `email_queue`** un email au demandeur (email récupéré dans `auth.users`) selon la décision :

- `approved` : accès débloqué + lien espace ;
- `needs_changes` : note de revue + lien `/onboarding` ;
- `rejected` : motif.

Entièrement côté serveur ; l'admin n'a rien à faire de plus que sa décision.

### 7. Worker d'emails — colonnes utilisées

`email_queue` : `to_email`, `subject`, `body_html`, `body_text`, `status` (`queued`→`sent`/`failed`), `created_at`, `sent_at`, `error`. Le worker `send-email` traite déjà cette table.

## Frontend & routes

### `Auth.tsx`

- Retrait du `signInWithPassword` de secours et de l'appel `sync_signup_application` côté client.
- Machine à états : `form` → (`signUp`) → `verify-email` (client) ou `verify-email-pro` (restaurateur/livreur, après POST Edge Function).
- Bouton **Renvoyer** (cooldown 60 s) via `supabase.auth.resend({ type: 'signup', email })`.
- Case **consentement CGU + Confidentialité** obligatoire (tous rôles), horodatée dans les métadonnées utilisateur (`options.data`, ex. `cgu_accepted_at`).
- Mot de passe : min **8**, champ **confirmation**, indicateur de robustesse léger.
- Email déjà inscrit : message neutre (« si cet email existe, connecte-toi ou réinitialise ton mot de passe ») sans divulguer l'existence du compte.

### Nouvelles routes

- `/auth/confirmed` — page légère : récupère la session (token géré par supabase-js `detectSessionInUrl`), affiche le succès, redirige vers `next` (défaut `/`). Lien expiré → message + Renvoyer.
- `/onboarding` — **surface canonique restaurateur/livreur** après confirmation, **deux états** :
  - brouillon déjà soumis → **carte de statut** (En revue / Corrections + note / Approuvé → CTA `/dashboard`|`/courier`) ;
  - pas encore de dossier (échec antérieur de l'Edge Function, ou re-soumission `needs_changes`) → **formulaire de complétion** soumis via `sync_signup_application` authentifié.
  - `/onboarding` est donc aussi le **filet de secours** garanti.

### Détails UI

- `getSignupStatusMeta` : ajout du cas `awaiting_email` (« En attente de confirmation d'email »).
- **Accents** : réécriture propre de toute la copie des écrans d'inscription/onboarding. (Nettoyage accents du reste de l'app → backlog Phase 2.)
- **Mobile/Capacitor** : ajouter `/auth/confirmed` et `/onboarding` à l'allow-list de redirection Supabase **et** au universal/custom-scheme link de l'app (infra `setupDeepLinks` existante) pour que la confirmation revienne dans l'app native.

## Cas limites & résilience

1. **`signUp` OK mais Edge Function en échec** → compte sans brouillon. Repli : retenter le POST (upsert idempotent) ; sinon message « confirme ton email puis termine ton dossier » → complétion sur `/onboarding`.
2. **Lien ouvert sur un autre appareil/navigateur** → session établie là-bas → `/onboarding` affiche le statut. Multi-appareils OK.
3. **Email confirmé sans brouillon** → `/onboarding` propose le formulaire de complétion.
4. **Re-clic du lien / re-soumission** → idempotent via `UNIQUE (user_id, requested_role)`.
5. **`awaiting_email` invisible de la file admin** → pas d'approbation prématurée.
6. **`needs_changes`** → re-soumission authentifiée → `pending_review` → admin re-notifié.
7. **Renvoi d'email** → cooldown 60 s client + rate-limit serveur Supabase.
8. **Suppression RGPD** → FK `ON DELETE CASCADE` retirent brouillons + documents ; vérifier que `delete-account` purge aussi les objets `verification-documents` du storage.
9. **Lien expiré** → `/auth/confirmed` affiche « lien expiré » + Renvoyer.

## Prérequis bloquant — planification du worker

`send-email` (et `notification-dispatch`) ne s'exécutent que si un planificateur les invoque. Vérifier la présence d'une planification ; **si absente, l'ajouter** (pg_cron + pg_net invoquant `send-email` chaque minute, pattern Supabase standard). Sans cela, les emails restent en file sans partir. À valider avant de considérer le flux « en place ».

## Tests

- **Assertions SQL** (extension de `src/test/signup.test.ts`) :
  - `awaiting_email` présent dans le CHECK de `signup_applications.status` ;
  - trigger de promotion présent sur `auth.users` (transition `email_confirmed_at`) ;
  - `admin_submit_signup_application` utilise `p_user_id` explicite (jamais `auth.uid()`) et force `awaiting_email` ;
  - `admin_review_signup_application` insère dans `email_queue` ;
  - le chemin client ne référence plus `sync_signup_application`.
- **Edge Function** : tests Deno des helpers de garde/validation (utilisateur récent non confirmé, rôle, taille/MIME, documents requis).
- **Frontend** (testing-library) : après `signUp` client → écran « vérifie ton email » ; Renvoyer désactivé pendant le cooldown ; soumission restaurateur appelle `submit-signup-application` ; consentement requis bloque la soumission ; mot de passe court/non concordant bloqué.
- **Checklist e2e manuelle** (confirmation = vraie boîte mail) : client → confirme → accueil ; restaurateur → brouillon stocké → confirme → admin notifié → approuve → demandeur notifié → accès dashboard ; corrections → re-soumission ; renvoi ; lien multi-appareils.

## Critères de succès

- Aucun compte client sans email confirmé.
- Aucun document perdu, même en confirmant plus tard ou sur un autre appareil.
- Admin notifié à chaque candidature confirmée ; demandeur notifié à chaque décision.
- Aucun rôle privilégié accordé avant approbation admin.
- Les emails **partent** réellement (worker planifié et vérifié).

## Hors périmètre (→ Phase 2 : backlog d'améliorations de l'app)

- Nettoyage des accents/copie sur l'ensemble de l'application (au-delà des écrans d'inscription/onboarding).
- Activation réelle d'OAuth Google/Apple (actuellement en façade) et son extension à l'inscription.
- Vérification par code OTP (alternative au lien) si souhaitée plus tard sur mobile.
- Toute autre amélioration transverse identifiée lors de la revue applicative globale, livrée séparément comme liste priorisée (chaque item = son propre spec).

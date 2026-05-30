# Parcours d'inscription durci — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'inscription fiable de bout en bout : email obligatoire avec confirmation, brouillon serveur + lien de reprise pour restaurateur/livreur (plus de perte de documents), et notifications email admin + demandeur.

**Architecture:** Le client s'inscrit via `supabase.auth.signUp` puis confirme son email (`/auth/confirmed`). Le restaurateur/livreur s'inscrit, puis une Edge Function publique en service role persiste le dossier + documents au statut `awaiting_email` ; un trigger sur `auth.users` promeut le dossier en `pending_review` à la confirmation et notifie l'admin ; la décision admin notifie le demandeur. La page `/onboarding` affiche le statut et sert de filet de secours (re-soumission authentifiée).

**Tech Stack:** Vite + React + TypeScript + shadcn/ui, Supabase (Postgres + RLS + Edge Functions Deno + Storage), Vitest + Testing Library, pg_cron/pg_net.

**Référence spec :** `docs/superpowers/specs/2026-05-30-parcours-inscription-design.md`

**Conventions :** migrations horodatées sous `supabase/migrations/`, fonctions SQL `SECURITY DEFINER SET search_path = public`, Edge Functions avec `verify_jwt=false` validant elles-mêmes. Tests SQL = assertions statiques sur le texte des migrations (`src/test/signup.test.ts`), tests logique = Vitest.

**Copie / accents :** toute la copie utilisateur des écrans créés ou modifiés (`Auth.tsx`, `AuthConfirmed.tsx`, `Onboarding.tsx`, `ProApplicationForm.tsx`) doit être en **français accentué**. Les extraits de code ci-dessous utilisent l'ASCII pour la lisibilité du diff ; applique les accents en écrivant (table de correspondance en § Notes, vérifiée par grep en Task 10). Les chaînes SQL côté serveur restent en ASCII (cohérence avec l'existant).

---

## Task 1: Migration SQL — statut `awaiting_email`, RPC service-role, trigger de confirmation, email de décision

**Files:**
- Test: `src/test/signup.test.ts` (modifier — ajouter un bloc d'assertions)
- Create: `supabase/migrations/20260530120000_signup_email_verification_drafts.sql`

- [ ] **Step 1: Écrire les assertions qui échouent**

Ajouter ce bloc à la fin de `src/test/signup.test.ts`, avant la dernière `});` de fermeture du `describe` racine — ou comme nouveau `describe` :

```ts
describe("signup email verification + server-side draft SQL", () => {
  const draftSql = latestMigrationContaining(/admin_submit_signup_application/i);

  it("ajoute le statut awaiting_email a la contrainte CHECK", () => {
    expect(draftSql).toMatch(/status\s+IN\s*\([^)]*'awaiting_email'/i);
  });

  it("cree un RPC service-role parametre par p_user_id (jamais auth.uid)", () => {
    const fn = extractFunction(draftSql, "admin_submit_signup_application");
    expect(fn).toContain("p_user_id uuid");
    expect(fn).not.toMatch(/auth\.uid\(\)/);
    expect(fn).toContain("'awaiting_email'");
    expect(draftSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_submit_signup_application[\s\S]*TO\s+service_role/i);
  });

  it("promeut les brouillons et notifie l'admin a la confirmation d'email", () => {
    expect(draftSql).toContain("on_auth_user_email_confirmed");
    expect(draftSql).toMatch(/AFTER\s+UPDATE\s+OF\s+email_confirmed_at\s+ON\s+auth\.users/i);
    const trigFn = extractFunction(draftSql, "handle_email_confirmation");
    expect(trigFn).toMatch(/status\s*=\s*'pending_review'/i);
    expect(trigFn).toContain("email_queue");
  });

  it("notifie le demandeur depuis le RPC de revue admin", () => {
    const reviewSql = latestMigrationContaining(/admin_review_signup_application/i);
    const reviewFn = extractFunction(reviewSql, "admin_review_signup_application");
    expect(reviewFn).toContain("email_queue");
    expect(reviewFn).toMatch(/v_applicant_email/i);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `npm test -- src/test/signup.test.ts`
Expected: FAIL — `latestMigrationContaining(/admin_submit_signup_application/i)` lève (aucune migration ne contient ce nom).

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/20260530120000_signup_email_verification_drafts.sql` :

```sql
-- Durcissement inscription :
-- - statut 'awaiting_email' pour les brouillons restaurateur/livreur (avant confirmation email)
-- - RPC service-role admin_submit_signup_application (brouillon sans session, p_user_id explicite)
-- - trigger de promotion awaiting_email -> pending_review a la confirmation d'email + alerte admin
-- - email au demandeur depuis admin_review_signup_application

-- 1. Etendre la contrainte de statut
ALTER TABLE public.signup_applications
  DROP CONSTRAINT IF EXISTS signup_applications_status_check;
ALTER TABLE public.signup_applications
  ADD CONSTRAINT signup_applications_status_check
  CHECK (status IN ('awaiting_email', 'pending_review', 'approved', 'needs_changes', 'rejected'));

-- 2. RPC service-role : ecrit le brouillon (application + documents + restaurant/courier) au statut awaiting_email
CREATE OR REPLACE FUNCTION public.admin_submit_signup_application(
  p_user_id uuid,
  p_requested_role public.app_role,
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_business_name text DEFAULT NULL,
  p_business_registration_number text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_restaurant_name text DEFAULT NULL,
  p_restaurant_description text DEFAULT NULL,
  p_vehicle_type text DEFAULT NULL,
  p_license_plate text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_documents jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (application_id uuid, application_status text, restaurant_id uuid, courier_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application_id uuid;
  v_application_status text;
  v_required_docs text[] := ARRAY['identity_document'];
  v_uploaded_docs text[] := ARRAY[]::text[];
  v_doc jsonb;
  v_doc_type text;
  v_now timestamptz := now();
  v_restaurant_id uuid;
  v_courier_id uuid;
  v_vehicle_type text := lower(COALESCE(NULLIF(trim(p_vehicle_type), ''), 'bicycle'));
  v_role_text text := lower(p_requested_role::text);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: service role required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF v_role_text NOT IN ('restaurateur', 'courier') THEN
    RAISE EXCEPTION 'Unsupported draft role: %', p_requested_role;
  END IF;

  IF NULLIF(trim(COALESCE(p_full_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;

  IF jsonb_typeof(COALESCE(p_documents, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Documents payload must be an array';
  END IF;

  IF v_role_text = 'courier' THEN
    v_required_docs := ARRAY['identity_document', 'work_permit', 'iban_proof'];
    IF v_vehicle_type IN ('scooter', 'car') THEN
      v_required_docs := v_required_docs || ARRAY['vehicle_registration'];
    END IF;
  ELSIF v_role_text = 'restaurateur' THEN
    v_required_docs := ARRAY['identity_document', 'business_registration', 'iban_proof'];
  END IF;

  INSERT INTO public.profiles (user_id, full_name, phone, city, address)
  VALUES (
    p_user_id,
    trim(p_full_name),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), '')
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        city = COALESCE(EXCLUDED.city, public.profiles.city),
        address = COALESCE(EXCLUDED.address, public.profiles.address),
        updated_at = v_now;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'client')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.signup_applications (
    user_id, requested_role, status, full_name, phone, city, address,
    legal_name, business_name, business_registration_number, tax_id,
    restaurant_name, restaurant_description, vehicle_type, license_plate, iban,
    metadata, submitted_at, reviewed_at, reviewed_by, review_note
  )
  VALUES (
    p_user_id, p_requested_role, 'awaiting_email', trim(p_full_name),
    NULLIF(trim(COALESCE(p_phone, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_legal_name, '')), ''),
    NULLIF(trim(COALESCE(p_business_name, '')), ''),
    NULLIF(trim(COALESCE(p_business_registration_number, '')), ''),
    NULLIF(trim(COALESCE(p_tax_id, '')), ''),
    NULLIF(trim(COALESCE(p_restaurant_name, '')), ''),
    NULLIF(trim(COALESCE(p_restaurant_description, '')), ''),
    CASE WHEN v_role_text = 'courier' THEN v_vehicle_type ELSE NULL END,
    NULLIF(trim(COALESCE(p_license_plate, '')), ''),
    NULLIF(trim(COALESCE(p_iban, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb), v_now, NULL, NULL, NULL
  )
  ON CONFLICT (user_id, requested_role) DO UPDATE
    SET status = 'awaiting_email',
        full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, city = EXCLUDED.city,
        address = EXCLUDED.address, legal_name = EXCLUDED.legal_name,
        business_name = EXCLUDED.business_name,
        business_registration_number = EXCLUDED.business_registration_number,
        tax_id = EXCLUDED.tax_id, restaurant_name = EXCLUDED.restaurant_name,
        restaurant_description = EXCLUDED.restaurant_description,
        vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate,
        iban = EXCLUDED.iban, metadata = EXCLUDED.metadata, submitted_at = v_now,
        reviewed_at = NULL, reviewed_by = NULL, review_note = NULL, updated_at = v_now
  RETURNING id, status INTO v_application_id, v_application_status;

  FOR v_doc IN SELECT value FROM jsonb_array_elements(COALESCE(p_documents, '[]'::jsonb))
  LOOP
    v_doc_type := lower(COALESCE(v_doc->>'document_type', ''));
    IF v_doc_type = '' THEN
      RAISE EXCEPTION 'document_type is required for every uploaded document';
    END IF;
    IF COALESCE(v_doc->>'file_path', '') = '' THEN
      RAISE EXCEPTION 'file_path is required for document %', v_doc_type;
    END IF;

    INSERT INTO public.signup_application_documents (
      application_id, user_id, document_type, file_path, file_name,
      mime_type, file_size_bytes, status, reviewed_at, reviewed_by, rejection_reason
    )
    VALUES (
      v_application_id, p_user_id, v_doc_type, v_doc->>'file_path',
      NULLIF(v_doc->>'file_name', ''), NULLIF(v_doc->>'mime_type', ''),
      CASE WHEN NULLIF(v_doc->>'file_size_bytes', '') IS NULL THEN NULL
           ELSE GREATEST((v_doc->>'file_size_bytes')::integer, 0) END,
      'pending', NULL, NULL, NULL
    )
    ON CONFLICT (application_id, document_type) DO UPDATE
      SET file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type, file_size_bytes = EXCLUDED.file_size_bytes,
          status = 'pending', reviewed_at = NULL, reviewed_by = NULL,
          rejection_reason = NULL, updated_at = v_now;
  END LOOP;

  SELECT ARRAY_AGG(document_type ORDER BY document_type) INTO v_uploaded_docs
  FROM public.signup_application_documents WHERE application_id = v_application_id;

  IF COALESCE(v_uploaded_docs, ARRAY[]::text[]) @> v_required_docs IS NOT TRUE THEN
    RAISE EXCEPTION 'Missing required verification documents for role %', p_requested_role;
  END IF;

  IF v_role_text = 'courier' THEN
    INSERT INTO public.couriers (
      user_id, first_name, last_name, phone, status, vehicle_type, license_plate, iban, is_online, updated_at
    )
    VALUES (
      p_user_id, split_part(trim(p_full_name), ' ', 1),
      NULLIF(trim(substr(trim(p_full_name), length(split_part(trim(p_full_name), ' ', 1)) + 1)), ''),
      NULLIF(trim(COALESCE(p_phone, '')), ''), 'pending_approval', v_vehicle_type,
      NULLIF(trim(COALESCE(p_license_plate, '')), ''), NULLIF(trim(COALESCE(p_iban, '')), ''), false, v_now
    )
    ON CONFLICT (user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone,
          vehicle_type = EXCLUDED.vehicle_type, license_plate = EXCLUDED.license_plate, iban = EXCLUDED.iban,
          status = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.status ELSE 'pending_approval' END,
          is_online = CASE WHEN public.couriers.status = 'approved' THEN public.couriers.is_online ELSE false END,
          updated_at = v_now
    RETURNING id INTO v_courier_id;
  ELSIF v_role_text = 'restaurateur' THEN
    SELECT r.id INTO v_restaurant_id FROM public.restaurants r
    WHERE r.owner_id = p_user_id ORDER BY r.created_at ASC LIMIT 1;

    IF v_restaurant_id IS NULL THEN
      INSERT INTO public.restaurants (owner_id, name, description, legal_name, address, city, phone, is_active, status)
      VALUES (
        p_user_id,
        COALESCE(NULLIF(trim(COALESCE(p_restaurant_name, '')), ''), NULLIF(trim(COALESCE(p_business_name, '')), ''), 'Restaurant a valider'),
        NULLIF(trim(COALESCE(p_restaurant_description, '')), ''),
        NULLIF(trim(COALESCE(p_legal_name, '')), ''),
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), 'Adresse a confirmer'),
        COALESCE(NULLIF(trim(COALESCE(p_city, '')), ''), 'Ville a confirmer'),
        NULLIF(trim(COALESCE(p_phone, '')), ''), false, 'pending'
      )
      RETURNING id INTO v_restaurant_id;
    END IF;

    UPDATE public.signup_applications
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('restaurant_id', v_restaurant_id)
    WHERE id = v_application_id;
  END IF;

  RETURN QUERY SELECT v_application_id, v_application_status, v_restaurant_id, v_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_submit_signup_application(
  uuid, public.app_role, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb
) TO service_role;

-- 3. Trigger de promotion a la confirmation d'email + alerte admin
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_subject text;
  v_body text;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_app IN
    UPDATE public.signup_applications
    SET status = 'pending_review', submitted_at = now(), updated_at = now()
    WHERE user_id = NEW.id AND status = 'awaiting_email'
    RETURNING id, requested_role, full_name
  LOOP
    v_subject := 'Nouvelle candidature ' || v_app.requested_role || ' a verifier';
    v_body := 'Une candidature ' || v_app.requested_role || ' (' || COALESCE(v_app.full_name, '') ||
              ') vient d''etre confirmee et attend votre revue dans l''espace admin.';
    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    SELECT u.email, v_subject, v_body,
           jsonb_build_object('application_id', v_app.id, 'kind', 'signup_admin_alert')
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'admin' AND u.email IS NOT NULL;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmation();

-- 4. admin_review_signup_application : email au demandeur (sinon comportement inchange)
CREATE OR REPLACE FUNCTION public.admin_review_signup_application(
  p_application_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL
)
RETURNS TABLE (application_id uuid, application_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_application public.signup_applications%ROWTYPE;
  v_next_status text := lower(trim(COALESCE(p_status, '')));
  v_restaurant_id uuid;
  v_applicant_email text;
BEGIN
  IF NOT v_is_service_role AND NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_next_status NOT IN ('approved', 'needs_changes', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported review status: %', p_status;
  END IF;

  SELECT * INTO v_application FROM public.signup_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup application not found';
  END IF;

  UPDATE public.signup_applications
  SET status = v_next_status,
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE id = p_application_id;

  UPDATE public.signup_application_documents
  SET status = CASE WHEN v_next_status = 'approved' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE WHEN v_next_status = 'approved' THEN NULL
                              ELSE NULLIF(trim(COALESCE(p_review_note, '')), '') END,
      reviewed_at = now(),
      reviewed_by = CASE WHEN v_is_service_role THEN reviewed_by ELSE v_actor_id END,
      updated_at = now()
  WHERE application_id = p_application_id;

  IF v_next_status = 'approved' AND v_application.requested_role <> 'client' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_application.user_id, v_application.requested_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_application.requested_role <> 'client' THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_application.user_id AND role = v_application.requested_role;
  END IF;

  IF v_application.requested_role = 'courier' THEN
    UPDATE public.couriers
    SET status = CASE WHEN v_next_status = 'approved' THEN 'approved'
                      WHEN v_next_status = 'rejected' THEN 'rejected'
                      ELSE 'pending_approval' END,
        is_online = CASE WHEN v_next_status = 'approved' THEN is_online ELSE false END,
        updated_at = now()
    WHERE user_id = v_application.user_id;
  ELSIF v_application.requested_role = 'restaurateur' THEN
    v_restaurant_id := NULLIF(v_application.metadata->>'restaurant_id', '')::uuid;
    IF v_restaurant_id IS NULL THEN
      SELECT id INTO v_restaurant_id FROM public.restaurants
      WHERE owner_id = v_application.user_id ORDER BY created_at ASC LIMIT 1;
    END IF;
    IF v_restaurant_id IS NOT NULL THEN
      UPDATE public.restaurants
      SET status = CASE WHEN v_next_status = 'approved' THEN 'active'
                        WHEN v_next_status = 'rejected' THEN 'rejected'
                        ELSE 'needs_changes' END,
          is_active = (v_next_status = 'approved'),
          updated_at = now()
      WHERE id = v_restaurant_id;
    END IF;
  END IF;

  SELECT email INTO v_applicant_email FROM auth.users WHERE id = v_application.user_id;
  IF v_applicant_email IS NOT NULL THEN
    INSERT INTO public.email_queue (to_email, subject, body_text, metadata)
    VALUES (
      v_applicant_email,
      CASE v_next_status
        WHEN 'approved' THEN 'Votre compte ' || v_application.requested_role || ' est valide'
        WHEN 'needs_changes' THEN 'Corrections demandees sur votre dossier ' || v_application.requested_role
        ELSE 'Votre demande ' || v_application.requested_role || ' a ete refusee'
      END,
      CASE v_next_status
        WHEN 'approved' THEN 'Bonne nouvelle : votre dossier ' || v_application.requested_role ||
          ' a ete approuve. Vous pouvez desormais acceder a votre espace.'
        WHEN 'needs_changes' THEN 'Votre dossier necessite des corrections : ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), 'voir le detail dans l''application') ||
          '. Reprenez votre dossier dans la rubrique onboarding.'
        ELSE 'Votre demande ' || v_application.requested_role || ' a ete refusee. ' ||
          COALESCE(NULLIF(trim(p_review_note), ''), '')
      END,
      jsonb_build_object('application_id', p_application_id, 'kind', 'signup_decision', 'status', v_next_status)
    );
  END IF;

  RETURN QUERY SELECT p_application_id, v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_signup_application(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_application(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `npm test -- src/test/signup.test.ts`
Expected: PASS (tous les `describe`, y compris les assertions existantes inchangées).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260530120000_signup_email_verification_drafts.sql src/test/signup.test.ts
git commit -m "feat(signup): awaiting_email draft RPC, email-confirm promotion trigger, decision emails"
```

---

## Task 2: Planification du worker d'emails (prérequis bloquant)

**Files:**
- Inspect: `supabase/migrations/` (recherche d'une planification existante)
- Create (si absente): `supabase/migrations/20260530121000_schedule_email_worker.sql`

- [ ] **Step 1: Vérifier s'il existe déjà une planification de `send-email`**

Run: `npx rg -n "cron.schedule|send-email|process_email_queue" supabase/migrations`
Expected : si une ligne planifie déjà `send-email` (ou un wrapper invoquant `/functions/v1/send-email`), **arrêter cette tâche** (déjà en place) et le noter. Sinon continuer.

- [ ] **Step 2: Écrire la migration de planification**

Créer `supabase/migrations/20260530121000_schedule_email_worker.sql`. Le secret `INTERNAL_CRON_SECRET` est lu depuis Vault (ne jamais l'inscrire en clair). À appliquer sur le projet hébergé (pg_cron/pg_net y sont disponibles).

```sql
-- Planifie l'envoi des emails en file (email_queue + notification_deliveries)
-- en invoquant l'Edge Function send-email chaque minute via pg_net.
-- Prerequis : secret 'internal_cron_secret' present dans Vault (Project Settings > Vault).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_base text := 'https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1';
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret' LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE NOTICE 'Vault secret internal_cron_secret absent : planification ignoree. Ajoutez-le puis rejouez cette migration.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('send-email-worker') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-email-worker'
  );

  PERFORM cron.schedule('send-email-worker', '* * * * *', format($cron$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-internal-cron-secret', %L),
      body := '{}'::jsonb
    );
  $cron$, v_base || '/send-email', v_secret));
END;
$$;
```

- [ ] **Step 3: Vérifier le rendu (lint SQL léger)**

Run: `npx rg -n "cron.schedule\('send-email-worker'" supabase/migrations/20260530121000_schedule_email_worker.sql`
Expected: la ligne existe. (Application réelle = `npm run supabase:db:push:prod` côté ops, hors périmètre code.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260530121000_schedule_email_worker.sql
git commit -m "feat(ops): schedule send-email worker every minute via pg_cron"
```

---

## Task 3: Helpers de validation de l'Edge Function (purs, testés)

**Files:**
- Create: `supabase/functions/submit-signup-application/validation.ts`
- Test: `src/test/submitSignupValidation.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/test/submitSignupValidation.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  ACCEPTED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  getRequiredDocumentTypes,
  validateSubmissionFields,
} from "../../supabase/functions/submit-signup-application/validation";

describe("submit-signup-application validation", () => {
  it("exige la carte grise pour scooter/voiture", () => {
    expect(getRequiredDocumentTypes("courier", "car")).toContain("vehicle_registration");
    expect(getRequiredDocumentTypes("courier", "bicycle")).not.toContain("vehicle_registration");
    expect(getRequiredDocumentTypes("restaurateur", null)).toEqual([
      "identity_document", "business_registration", "iban_proof",
    ]);
  });

  it("refuse un restaurateur sans IBAN ni immatriculation", () => {
    expect(validateSubmissionFields("restaurateur", { full_name: "A", iban: "", business_registration_number: "" }))
      .toMatch(/IBAN|immatriculation/i);
    expect(validateSubmissionFields("restaurateur", {
      full_name: "A", iban: "CH..", business_registration_number: "CHE..", business_name: "x",
      legal_name: "y", restaurant_name: "z", phone: "1", city: "c", address: "a",
    })).toBeNull();
  });

  it("rejette les roles non pro", () => {
    expect(validateSubmissionFields("client", { full_name: "A" })).toMatch(/role/i);
  });

  it("expose les limites MIME/taille", () => {
    expect(ACCEPTED_MIME_TYPES).toContain("application/pdf");
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `npm test -- src/test/submitSignupValidation.test.ts`
Expected: FAIL — module `validation.ts` introuvable.

- [ ] **Step 3: Écrire `validation.ts`**

Créer `supabase/functions/submit-signup-application/validation.ts` (TypeScript pur, aucun import Deno) :

```ts
export type ProRole = "restaurateur" | "courier";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function getRequiredDocumentTypes(role: string, vehicleType: string | null): string[] {
  if (role === "courier") {
    const base = ["identity_document", "work_permit", "iban_proof"];
    if (["scooter", "car"].includes(String(vehicleType || "").toLowerCase())) {
      base.push("vehicle_registration");
    }
    return base;
  }
  if (role === "restaurateur") {
    return ["identity_document", "business_registration", "iban_proof"];
  }
  return [];
}

export function validateSubmissionFields(
  role: string,
  fields: Record<string, string | undefined>,
): string | null {
  if (role !== "restaurateur" && role !== "courier") {
    return "Role non supporte pour ce parcours (role attendu : restaurateur ou livreur).";
  }
  if (!String(fields.full_name || "").trim()) return "Le nom complet est requis.";
  if (!String(fields.phone || "").trim()) return "Le telephone est requis.";
  if (!String(fields.city || "").trim()) return "La ville est requise.";
  if (!String(fields.address || "").trim()) return "L'adresse est requise.";
  if (!String(fields.iban || "").trim()) return "L'IBAN de versement est requis.";

  if (role === "restaurateur") {
    if (!String(fields.business_name || "").trim()) return "Le nom commercial est requis.";
    if (!String(fields.legal_name || "").trim()) return "La raison sociale est requise.";
    if (!String(fields.business_registration_number || "").trim()) return "Le numero d'immatriculation est requis.";
    if (!String(fields.restaurant_name || "").trim()) return "Le nom du restaurant est requis.";
  }

  if (role === "courier") {
    const vehicle = String(fields.vehicle_type || "").toLowerCase();
    if (["scooter", "car"].includes(vehicle) && !String(fields.license_plate || "").trim()) {
      return "La plaque d'immatriculation est requise pour ce vehicule.";
    }
  }
  return null;
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `npm test -- src/test/submitSignupValidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-signup-application/validation.ts src/test/submitSignupValidation.test.ts
git commit -m "feat(signup): pure validation helpers for submit-signup-application"
```

---

## Task 4: Edge Function `submit-signup-application` + config

**Files:**
- Create: `supabase/functions/submit-signup-application/index.ts`
- Modify: `supabase/config.toml` (ajouter l'entrée verify_jwt)

- [ ] **Step 1: Écrire la fonction**

Créer `supabase/functions/submit-signup-application/index.ts` :

```ts
import {
  HttpError,
  createAdminClient,
  jsonResponse,
} from "../_shared/auth.ts";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { makeLogger } from "../_shared/logging.ts";
import {
  ACCEPTED_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  getRequiredDocumentTypes,
  validateSubmissionFields,
} from "./validation.ts";

const FIELD_KEYS = [
  "full_name", "phone", "city", "address", "legal_name", "business_name",
  "business_registration_number", "tax_id", "restaurant_name",
  "restaurant_description", "vehicle_type", "license_plate", "iban",
];

const ACCOUNT_MAX_AGE_MS = 15 * 60 * 1000;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const log = makeLogger("submit-signup-application");

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Method not allowed");
    }

    const form = await req.formData();
    const userId = String(form.get("user_id") || "").trim();
    const role = String(form.get("role") || "").trim().toLowerCase();

    if (!userId) throw new HttpError(400, "user_id manquant.");

    const fields: Record<string, string> = {};
    for (const key of FIELD_KEYS) {
      const value = form.get(key);
      if (typeof value === "string") fields[key] = value;
    }

    const fieldError = validateSubmissionFields(role, fields);
    if (fieldError) throw new HttpError(400, fieldError);

    const admin = createAdminClient();

    // Garde anti-abus : compte recent, email non confirme, pas de dossier deja en revue/approuve.
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user) throw new HttpError(404, "Utilisateur introuvable.");
    const account = userData.user;
    if (account.email_confirmed_at) throw new HttpError(409, "Email deja confirme : reprenez depuis l'onboarding.");
    const createdAt = account.created_at ? new Date(account.created_at).getTime() : 0;
    if (!createdAt || Date.now() - createdAt > ACCOUNT_MAX_AGE_MS) {
      throw new HttpError(403, "Fenetre de soumission expiree. Confirmez votre email puis completez votre dossier.");
    }

    const { data: existing, error: existingError } = await admin
      .from("signup_applications")
      .select("id, status")
      .eq("user_id", userId)
      .eq("requested_role", role)
      .maybeSingle();
    if (existingError) throw new HttpError(500, existingError.message);
    if (existing && ["pending_review", "approved"].includes(String(existing.status))) {
      throw new HttpError(409, "Une candidature est deja en cours pour ce profil.");
    }

    // Collecte et validation des documents.
    const requiredDocs = getRequiredDocumentTypes(role, fields.vehicle_type || null);
    const uploaded: Array<Record<string, unknown>> = [];
    for (const entry of form.entries()) {
      const [key, value] = entry;
      if (!key.startsWith("document:") || !(value instanceof File)) continue;
      const docType = sanitizeSegment(key.slice("document:".length));
      const file = value;
      if (file.size <= 0) continue;
      if (file.size > MAX_DOCUMENT_BYTES) {
        throw new HttpError(413, `Fichier trop volumineux pour ${docType} (max 10 Mo).`);
      }
      const mime = file.type || "application/octet-stream";
      if (!ACCEPTED_MIME_TYPES.includes(mime)) {
        throw new HttpError(415, `Type de fichier non accepte pour ${docType}.`);
      }
      const ext = sanitizeSegment(file.name.includes(".") ? file.name.split(".").pop() || "bin" : "bin") || "bin";
      const path = `${userId}/${sanitizeSegment(role)}/${docType}-${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from("verification-documents")
        .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "3600" });
      if (uploadError) throw new HttpError(500, `Echec d'upload (${docType}): ${uploadError.message}`);
      uploaded.push({
        document_type: docType,
        file_path: path,
        file_name: file.name,
        mime_type: mime,
        file_size_bytes: file.size,
      });
    }

    const providedTypes = new Set(uploaded.map((d) => String(d.document_type)));
    const missing = requiredDocs.filter((t) => !providedTypes.has(t));
    if (missing.length > 0) {
      throw new HttpError(400, `Documents manquants : ${missing.join(", ")}.`);
    }

    const { data: rpcData, error: rpcError } = await admin.rpc("admin_submit_signup_application", {
      p_user_id: userId,
      p_requested_role: role,
      p_full_name: fields.full_name,
      p_phone: fields.phone ?? null,
      p_city: fields.city ?? null,
      p_address: fields.address ?? null,
      p_legal_name: role === "restaurateur" ? (fields.legal_name ?? null) : null,
      p_business_name: role === "restaurateur" ? (fields.business_name ?? null) : null,
      p_business_registration_number: role === "restaurateur" ? (fields.business_registration_number ?? null) : null,
      p_tax_id: role === "restaurateur" ? (fields.tax_id ?? null) : null,
      p_restaurant_name: role === "restaurateur" ? (fields.restaurant_name ?? null) : null,
      p_restaurant_description: role === "restaurateur" ? (fields.restaurant_description ?? null) : null,
      p_vehicle_type: role === "courier" ? (fields.vehicle_type ?? null) : null,
      p_license_plate: role === "courier" ? (fields.license_plate ?? null) : null,
      p_iban: fields.iban ?? null,
      p_metadata: { onboarding_source: "submit_signup_application" },
      p_documents: uploaded,
    });
    if (rpcError) throw new HttpError(400, rpcError.message);

    return jsonResponse({ ok: true, application: rpcData }, 200, corsHeaders);
  } catch (error: unknown) {
    log.error("submit-signup-application error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status, corsHeaders);
    }
    return jsonResponse({ error: "Erreur interne" }, 500, corsHeaders);
  }
});
```

- [ ] **Step 2: Vérifier que `makeLogger` existe (sinon adapter l'import)**

Run: `npx rg -n "export function makeLogger|export const makeLogger" supabase/functions/_shared/logging.ts`
Expected: une définition de `makeLogger`. (Déjà utilisé par `send-email`.) Si l'API diffère, aligner l'import.

- [ ] **Step 3: Déclarer la fonction comme publique dans `config.toml`**

Ajouter dans `supabase/config.toml`, à la suite des autres entrées `[functions.*]` :

```toml
[functions.submit-signup-application]
verify_jwt = false
```

- [ ] **Step 4: Vérifier le rendu**

Run: `npx rg -n "submit-signup-application" supabase/config.toml`
Expected: l'entrée existe.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-signup-application/index.ts supabase/config.toml
git commit -m "feat(signup): public submit-signup-application edge function (service-role draft)"
```

---

## Task 5: `signup.ts` — statut `awaiting_email`, validation de formulaire centralisée

**Files:**
- Modify: `src/lib/signup.ts`
- Test: `src/test/signupValidation.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/test/signupValidation.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  getSignupStatusMeta,
  validateSignupForm,
  type SignupFormValues,
} from "@/lib/signup";

const base: SignupFormValues = {
  fullName: "Jean Dupont", email: "jean@example.com", password: "motdepasse8",
  passwordConfirm: "motdepasse8", phone: "", city: "", address: "", businessName: "",
  legalName: "", businessRegistrationNumber: "", taxId: "", restaurantName: "",
  restaurantDescription: "", vehicleType: "bicycle", licensePlate: "", iban: "",
  consent: true,
};

describe("validateSignupForm", () => {
  it("accepte un client complet", () => {
    expect(validateSignupForm("client", base)).toBeNull();
  });
  it("exige le consentement", () => {
    expect(validateSignupForm("client", { ...base, consent: false })).toMatch(/conditions|consent/i);
  });
  it("exige un mot de passe d'au moins 8 caracteres", () => {
    expect(validateSignupForm("client", { ...base, password: "court", passwordConfirm: "court" }))
      .toMatch(new RegExp(`${MIN_PASSWORD_LENGTH}`));
  });
  it("exige des mots de passe concordants", () => {
    expect(validateSignupForm("client", { ...base, passwordConfirm: "different8" })).toMatch(/concord/i);
  });
  it("exige les champs pro pour un restaurateur", () => {
    expect(validateSignupForm("restaurateur", base)).toMatch(/telephone|ville|adresse|IBAN|commercial/i);
  });
});

describe("getSignupStatusMeta", () => {
  it("gere awaiting_email", () => {
    expect(getSignupStatusMeta("awaiting_email").label).toMatch(/confirmation/i);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier l'échec**

Run: `npm test -- src/test/signupValidation.test.ts`
Expected: FAIL — exports `MIN_PASSWORD_LENGTH`, `validateSignupForm`, `SignupFormValues` inexistants.

- [ ] **Step 3: Étendre `src/lib/signup.ts`**

Ajouter le cas `awaiting_email` dans `getSignupStatusMeta`. Localiser dans `src/lib/signup.ts` le `switch` de `getSignupStatusMeta` et insérer, avant le `default:` :

```ts
    case "awaiting_email":
      return {
        label: "En attente de confirmation",
        tone: "bg-slate-100 text-slate-700",
        description: "Confirmez votre adresse email pour soumettre votre dossier a la verification.",
      };
```

Puis ajouter en fin de fichier `src/lib/signup.ts` :

```ts
export const MIN_PASSWORD_LENGTH = 8;

export type SignupFormValues = {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phone: string;
  city: string;
  address: string;
  businessName: string;
  legalName: string;
  businessRegistrationNumber: string;
  taxId: string;
  restaurantName: string;
  restaurantDescription: string;
  vehicleType: string;
  licensePlate: string;
  iban: string;
  consent: boolean;
};

export function validateSignupForm(role: SignupRole, form: SignupFormValues): string | null {
  if (!form.fullName.trim()) return "Le nom complet est requis.";
  if (!form.email.trim()) return "L'email est requis.";
  if (!form.password || form.password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (form.password !== form.passwordConfirm) {
    return "Les mots de passe ne concordent pas.";
  }
  if (!form.consent) {
    return "Vous devez accepter les conditions d'utilisation et la politique de confidentialite.";
  }

  if (role === "restaurateur") {
    if (!form.phone.trim()) return "Le telephone est requis.";
    if (!form.city.trim()) return "La ville est requise.";
    if (!form.address.trim()) return "L'adresse est requise.";
    if (!form.businessName.trim()) return "Le nom commercial est requis.";
    if (!form.legalName.trim()) return "La raison sociale est requise.";
    if (!form.businessRegistrationNumber.trim()) return "Le numero d'immatriculation est requis.";
    if (!form.restaurantName.trim()) return "Le nom du restaurant est requis.";
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
  }

  if (role === "courier") {
    if (!form.phone.trim()) return "Le telephone est requis.";
    if (!form.city.trim()) return "La ville est requise.";
    if (!form.address.trim()) return "L'adresse est requise.";
    if (!form.iban.trim()) return "L'IBAN de versement est requis.";
    if (["scooter", "car"].includes(form.vehicleType) && !form.licensePlate.trim()) {
      return "La plaque d'immatriculation est requise pour ce vehicule.";
    }
  }

  return null;
}
```

- [ ] **Step 4: Lancer le test et vérifier le succès**

Run: `npm test -- src/test/signupValidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signup.ts src/test/signupValidation.test.ts
git commit -m "feat(signup): centralized form validation + awaiting_email status meta"
```

---

## Task 6: Composant réutilisable `ProApplicationForm`

But : extraire les champs pro/livreur + section documents pour les réutiliser dans `Auth` (initial) et `Onboarding` (complétion/re-soumission). DRY.

**Files:**
- Create: `src/components/signup/ProApplicationForm.tsx`

- [ ] **Step 1: Écrire le composant**

Créer `src/components/signup/ProApplicationForm.tsx` :

```tsx
import { Loader2, Upload } from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import CityAutocomplete from "@/components/CityAutocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COURIER_VEHICLE_OPTIONS } from "@/lib/courier";
import {
  getRequiredSignupDocuments,
  type SignupDocumentType,
  type SignupFormValues,
  type SignupRole,
} from "@/lib/signup";

type ProApplicationFormProps = {
  role: Exclude<SignupRole, "client">;
  form: SignupFormValues;
  onFieldChange: <K extends keyof SignupFormValues>(key: K, value: SignupFormValues[K]) => void;
  documents: Partial<Record<SignupDocumentType, File | null>>;
  onDocumentChange: (type: SignupDocumentType, file: File | null) => void;
  loading?: boolean;
  showIdentityFields?: boolean;
};

export default function ProApplicationForm({
  role,
  form,
  onFieldChange,
  documents,
  onDocumentChange,
  loading = false,
  showIdentityFields = true,
}: ProApplicationFormProps) {
  const requiredDocuments = getRequiredSignupDocuments(role, form.vehicleType);

  return (
    <div className="space-y-6">
      {showIdentityFields ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Telephone</Label>
            <Input id="phone" value={form.phone}
              onChange={(e) => onFieldChange("phone", e.target.value)} placeholder="+41 79 000 00 00" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Ville</Label>
            <CityAutocomplete id="city" value={form.city}
              onValueChange={(v) => onFieldChange("city", v)}
              onCitySelect={(c) => onFieldChange("city", c)} placeholder="Ville de rattachement" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address">Adresse</Label>
            <AddressAutocomplete id="address" value={form.address}
              onValueChange={(v) => onFieldChange("address", v)}
              onAddressSelect={(address, city) => {
                onFieldChange("address", address);
                if (city) onFieldChange("city", city);
              }} placeholder="Rue, numero, code postal" />
          </div>
        </div>
      ) : null}

      {role === "restaurateur" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="businessName">Nom commercial</Label>
            <Input id="businessName" value={form.businessName}
              onChange={(e) => onFieldChange("businessName", e.target.value)} placeholder="Tok Rive Gauche" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legalName">Raison sociale</Label>
            <Input id="legalName" value={form.legalName}
              onChange={(e) => onFieldChange("legalName", e.target.value)} placeholder="Tok Sarl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessRegistrationNumber">Numero d'immatriculation</Label>
            <Input id="businessRegistrationNumber" value={form.businessRegistrationNumber}
              onChange={(e) => onFieldChange("businessRegistrationNumber", e.target.value)} placeholder="CHE-123.456.789" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxId">Numero TVA (optionnel)</Label>
            <Input id="taxId" value={form.taxId}
              onChange={(e) => onFieldChange("taxId", e.target.value)} placeholder="CHE-123.456 TVA" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurantName">Nom du restaurant</Label>
            <Input id="restaurantName" value={form.restaurantName}
              onChange={(e) => onFieldChange("restaurantName", e.target.value)} placeholder="Le Comptoir Tok" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban-restaurateur">IBAN de versement</Label>
            <Input id="iban-restaurateur" value={form.iban}
              onChange={(e) => onFieldChange("iban", e.target.value)} placeholder="CH93 0076 2011 6238 5295 7" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="restaurantDescription">Description du restaurant (optionnel)</Label>
            <Textarea id="restaurantDescription" value={form.restaurantDescription}
              onChange={(e) => onFieldChange("restaurantDescription", e.target.value)}
              placeholder="Cuisine, positionnement, specialites..." />
          </div>
        </div>
      ) : null}

      {role === "courier" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="vehicleType">Vehicule</Label>
            <Select value={form.vehicleType} onValueChange={(v) => onFieldChange("vehicleType", v)}>
              <SelectTrigger id="vehicleType"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COURIER_VEHICLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban-courier">IBAN de versement</Label>
            <Input id="iban-courier" value={form.iban}
              onChange={(e) => onFieldChange("iban", e.target.value)} placeholder="CH93 0076 2011 6238 5295 7" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="licensePlate">Plaque d'immatriculation</Label>
            <Input id="licensePlate" value={form.licensePlate}
              onChange={(e) => onFieldChange("licensePlate", e.target.value)}
              placeholder="Obligatoire pour scooter ou voiture" />
          </div>
        </div>
      ) : null}

      {requiredDocuments.length > 0 ? (
        <div className="space-y-4 rounded-2xl border bg-card p-4">
          <div>
            <p className="font-medium">Documents a fournir</p>
            <p className="text-sm text-muted-foreground">
              Les fichiers sont stockes dans un espace prive et revus par l'administration.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {requiredDocuments.map((requirement) => {
              const selectedFile = documents[requirement.type];
              return (
                <label key={requirement.type}
                  className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed p-4 transition-colors hover:border-primary/50 hover:bg-muted/20">
                  <div className="space-y-1">
                    <p className="font-medium">{requirement.label}</p>
                    <p className="text-xs text-muted-foreground">{requirement.description}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{selectedFile ? selectedFile.name : "Aucun fichier selectionne"}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : requirement.accept}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </div>
                  </div>
                  <Input type="file" className="hidden" accept={requirement.accept}
                    onChange={(e) => onDocumentChange(requirement.type, e.target.files?.[0] || null)}
                    disabled={loading} />
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation des types**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur sur `ProApplicationForm.tsx` (les types `SignupFormValues`/`SignupRole` viennent de la Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/signup/ProApplicationForm.tsx
git commit -m "feat(signup): extract reusable ProApplicationForm component"
```

---

## Task 7: Helper de soumission initiale (Edge Function) côté client

**Files:**
- Create: `src/lib/signupSubmission.ts`

- [ ] **Step 1: Écrire le helper**

Créer `src/lib/signupSubmission.ts` :

```ts
import { getSupabase } from "@/integrations/supabase/client";
import type { SignupDocumentType, SignupFormValues, SignupRole } from "@/lib/signup";

const FIELD_KEYS: Array<keyof SignupFormValues> = [
  "fullName", "phone", "city", "address", "businessName", "legalName",
  "businessRegistrationNumber", "taxId", "restaurantName", "restaurantDescription",
  "vehicleType", "licensePlate", "iban",
];

const SNAKE_BY_KEY: Partial<Record<keyof SignupFormValues, string>> = {
  fullName: "full_name",
  businessName: "business_name",
  legalName: "legal_name",
  businessRegistrationNumber: "business_registration_number",
  taxId: "tax_id",
  restaurantName: "restaurant_name",
  restaurantDescription: "restaurant_description",
  vehicleType: "vehicle_type",
  licensePlate: "license_plate",
};

/**
 * Soumet le dossier restaurateur/livreur sans session (juste apres signUp),
 * via l'Edge Function publique submit-signup-application (service role).
 */
export async function submitInitialProApplication(input: {
  userId: string;
  role: Exclude<SignupRole, "client">;
  form: SignupFormValues;
  documents: Partial<Record<SignupDocumentType, File | null>>;
}): Promise<void> {
  const body = new FormData();
  body.append("user_id", input.userId);
  body.append("role", input.role);

  for (const key of FIELD_KEYS) {
    const snake = SNAKE_BY_KEY[key] ?? key;
    body.append(snake, String(input.form[key] ?? ""));
  }

  for (const [type, file] of Object.entries(input.documents)) {
    if (file) body.append(`document:${type}`, file, file.name);
  }

  const { error } = await getSupabase().functions.invoke("submit-signup-application", { body });
  if (error) throw error;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/lib/signupSubmission.ts
git commit -m "feat(signup): client helper to submit pro application via edge function"
```

---

## Task 8: Refonte de `Auth.tsx`

Objectif : machine à états (formulaire → vérif email), consentement + mot de passe confirmé, suppression du fallback et de l'appel `sync_signup_application` côté client, usage de `ProApplicationForm`, bouton Renvoyer, redirections.

**Files:**
- Modify: `src/pages/Auth.tsx`

- [ ] **Step 1: Remplacer les imports et l'état du formulaire**

Dans `src/pages/Auth.tsx`, remplacer le bloc d'imports `@/lib/signup` (lignes ~8-16) et l'usage local par :

```tsx
import {
  MIN_PASSWORD_LENGTH,
  SIGNUP_ROLE_META,
  validateSignupForm,
  type SignupDocumentType,
  type SignupFormValues,
  type SignupRole,
} from "@/lib/signup";
import ProApplicationForm from "@/components/signup/ProApplicationForm";
import { submitInitialProApplication } from "@/lib/signupSubmission";
import { Checkbox } from "@/components/ui/checkbox";
```

Remplacer le type local `SignupFormState` et `EMPTY_SIGNUP_FORM` par l'usage de `SignupFormValues` ; définir le vide :

```tsx
const EMPTY_SIGNUP_FORM: SignupFormValues = {
  fullName: "", email: "", password: "", passwordConfirm: "", phone: "", city: "",
  address: "", businessName: "", legalName: "", businessRegistrationNumber: "", taxId: "",
  restaurantName: "", restaurantDescription: "", vehicleType: "bicycle", licensePlate: "",
  iban: "", consent: false,
};
```

Supprimer la fonction locale `getSignupValidationError` (remplacée par `validateSignupForm`) et `splitCourierName` (la logique nom→prénom est désormais côté SQL).

- [ ] **Step 2: Ajouter l'état de vérification email + cooldown**

Après les `useState` existants, ajouter :

```tsx
const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
const [resendCooldown, setResendCooldown] = useState(0);

useEffect(() => {
  if (resendCooldown <= 0) return;
  const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
  return () => clearInterval(timer);
}, [resendCooldown]);

const handleResendConfirmation = async () => {
  if (!pendingVerificationEmail || resendCooldown > 0) return;
  setResendCooldown(60);
  const { error } = await supabase.auth.resend({ type: "signup", email: pendingVerificationEmail });
  if (error) {
    toast({ title: "Renvoi impossible", description: error.message, variant: "destructive" });
  } else {
    toast({ title: "Email renvoye", description: "Verifie ta boite mail (et tes spams)." });
  }
};
```

- [ ] **Step 3: Réécrire `handleSubmit`**

Remplacer entièrement la fonction `handleSubmit` (lignes ~225-364) par :

```tsx
const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault();
  setLoading(true);

  try {
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email: signupForm.email,
        password: signupForm.password,
      });
      if (error) throw error;
      return;
    }

    const validationError = validateSignupForm(roleMode, signupForm);
    if (validationError) throw new Error(validationError);

    const isPro = roleMode !== "client";
    const redirectPath = isPro
      ? "/onboarding"
      : `/auth/confirmed?next=${encodeURIComponent(postAuthRedirectTarget || "/")}`;

    const signUpResponse = await supabase.auth.signUp({
      email: signupForm.email,
      password: signupForm.password,
      options: {
        data: {
          full_name: signupForm.fullName,
          role: roleMode,
          cgu_accepted_at: new Date().toISOString(),
        },
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    if (signUpResponse.error) throw signUpResponse.error;

    const newUserId = signUpResponse.data.user?.id;

    if (isPro) {
      if (!newUserId) {
        throw new Error("Compte cree mais identifiant indisponible. Confirme ton email puis termine ton dossier.");
      }
      await submitInitialProApplication({
        userId: newUserId,
        role: roleMode,
        form: signupForm,
        documents,
      });
    }

    setPendingVerificationEmail(signupForm.email);
    setResendCooldown(60);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Une erreur est survenue.";
    toast({ title: "Erreur", description: message, variant: "destructive" });
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 4: Ajouter l'écran « Vérifie ta boîte mail »**

Juste après le bloc `if (user && roles.length === 1) { ... }` (avant le `return` principal du formulaire), insérer :

```tsx
if (pendingVerificationEmail) {
  const isPro = roleMode !== "client";
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4 py-10">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-3">
          <img src={LOGO_URL} alt="Tok" className="mx-auto h-16 w-auto object-contain" />
          <CardTitle className="font-display text-2xl">Verifie ta boite mail</CardTitle>
          <CardDescription>
            Nous avons envoye un lien de confirmation a <strong>{pendingVerificationEmail}</strong>.
            {isPro
              ? " Ton dossier est enregistre : confirme ton email pour le soumettre a la verification."
              : " Clique sur le lien pour activer ton compte."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" variant="outline" disabled={resendCooldown > 0}
            onClick={handleResendConfirmation}>
            {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : "Renvoyer l'email"}
          </Button>
          <button type="button" onClick={() => { setPendingVerificationEmail(null); setIsLogin(true); }}
            className="w-full text-sm text-muted-foreground transition-colors hover:text-primary">
            Retour a la connexion
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Remplacer les blocs de champs pro + ajouter mot de passe confirmé et consentement**

(a) Remplacer les deux gros blocs `{!isLogin && roleMode === "restaurateur" ? (...)}` et `{!isLogin && roleMode === "courier" ? (...)}` **et** le bloc `{showDocumentSection ? (...)}` par un unique :

```tsx
{showExtendedIdentityFields ? (
  <ProApplicationForm
    role={roleMode as Exclude<SignupRole, "client">}
    form={signupForm}
    onFieldChange={updateSignupField}
    documents={documents}
    onDocumentChange={handleDocumentChange}
    loading={loading}
    showIdentityFields={false}
  />
) : null}
```

(b) Sous le champ mot de passe (après le `</div>` du bloc password, ~ligne 515), ajouter le champ de confirmation (visible uniquement en inscription) :

```tsx
{!isLogin ? (
  <div className="space-y-2">
    <Label htmlFor="passwordConfirm">Confirmer le mot de passe</Label>
    <Input id="passwordConfirm" type="password" value={signupForm.passwordConfirm}
      onChange={(e) => updateSignupField("passwordConfirm", e.target.value)}
      placeholder="********" required minLength={MIN_PASSWORD_LENGTH} />
  </div>
) : null}
```

(c) Juste avant le `<Button type="submit" ...>`, ajouter la case de consentement (inscription uniquement) :

```tsx
{!isLogin ? (
  <label className="flex items-start gap-3 text-sm text-muted-foreground">
    <Checkbox checked={signupForm.consent}
      onCheckedChange={(v) => updateSignupField("consent", v === true)} className="mt-0.5" />
    <span>
      J'accepte les{" "}
      <a href="/cgu" target="_blank" rel="noreferrer" className="underline hover:text-primary">conditions d'utilisation</a>{" "}
      et la{" "}
      <a href="/politique-confidentialite" target="_blank" rel="noreferrer" className="underline hover:text-primary">politique de confidentialite</a>.
    </span>
  </label>
) : null}
```

- [ ] **Step 6: Vérifier la compilation et le lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint -- src/pages/Auth.tsx`
Expected: aucune erreur. (Retirer tous les symboles désormais inutilisés : `getMissingSignupDocuments`, `uploadVerificationDocument`, `getRequiredSignupDocuments`, `SignupDocumentType` si plus référencés, `Select*`, `Textarea`, etc. — supprimer les imports morts signalés par le lint.)

- [ ] **Step 7: Commit**

```bash
git add src/pages/Auth.tsx
git commit -m "feat(signup): mandatory email verification flow + consent + server-side pro draft"
```

---

## Task 9: Pages `/auth/confirmed` et `/onboarding` + routes

**Files:**
- Create: `src/pages/AuthConfirmed.tsx`
- Create: `src/pages/Onboarding.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Écrire `AuthConfirmed.tsx`**

Créer `src/pages/AuthConfirmed.tsx` :

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { normalizeInternalNavigationTarget } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOGO_URL } from "@/lib/constants";

export default function AuthConfirmed() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [waited, setWaited] = useState(false);

  const next = normalizeInternalNavigationTarget(searchParams.get("next") || "/", "/");

  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const timer = setTimeout(() => navigate(next, { replace: true }), 1200);
      return () => clearTimeout(timer);
    }
  }, [loading, user, next, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/10 px-4 py-10">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center space-y-3">
          <img src={LOGO_URL} alt="Tok" className="mx-auto h-16 w-auto object-contain" />
          <CardTitle className="font-display text-2xl">
            {user ? "Email confirme" : waited ? "Lien expire ou deja utilise" : "Confirmation en cours..."}
          </CardTitle>
          <CardDescription>
            {user
              ? "Ton compte est actif. Redirection en cours..."
              : waited
                ? "Reconnecte-toi, ou demande un nouveau lien depuis la page de connexion."
                : "Merci de patienter quelques secondes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {!user && !waited ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : null}
          {!user && waited ? (
            <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
              Retour a la connexion
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Écrire `Onboarding.tsx`**

Créer `src/pages/Onboarding.tsx`. Affiche le statut si un dossier existe ; sinon propose la complétion (chemin authentifié via `uploadVerificationDocument` + `sync_signup_application`).

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSignupApplication } from "@/hooks/useSignupApplication";
import ProApplicationForm from "@/components/signup/ProApplicationForm";
import SignupApplicationStatusCard from "@/components/signup/SignupApplicationStatusCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LOGO_URL } from "@/lib/constants";
import {
  getMissingSignupDocuments,
  getRequiredSignupDocuments,
  uploadVerificationDocument,
  validateSignupForm,
  type SignupDocumentType,
  type SignupFormValues,
  type SignupRole,
} from "@/lib/signup";

const EMPTY: SignupFormValues = {
  fullName: "", email: "", password: "x".repeat(8), passwordConfirm: "x".repeat(8),
  phone: "", city: "", address: "", businessName: "", legalName: "",
  businessRegistrationNumber: "", taxId: "", restaurantName: "", restaurantDescription: "",
  vehicleType: "bicycle", licensePlate: "", iban: "", consent: true,
};

export default function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const { data: applications, isLoading, refetch } = useSignupApplication();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [role, setRole] = useState<Exclude<SignupRole, "client">>("restaurateur");
  const [form, setForm] = useState<SignupFormValues>(EMPTY);
  const [documents, setDocuments] = useState<Partial<Record<SignupDocumentType, File | null>>>({});
  const [submitting, setSubmitting] = useState(false);

  const list = useMemo(() => (Array.isArray(applications) ? applications : []), [applications]);
  const proApplication = list.find((a) => a.requested_role === "restaurateur" || a.requested_role === "courier");

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  const onField = <K extends keyof SignupFormValues>(key: K, value: SignupFormValues[K]) =>
    setForm((c) => ({ ...c, [key]: value }));
  const onDocument = (type: SignupDocumentType, file: File | null) =>
    setDocuments((c) => ({ ...c, [type]: file }));

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const validationError = validateSignupForm(role, { ...form, consent: true });
      if (validationError) throw new Error(validationError);

      const required = getRequiredSignupDocuments(role, form.vehicleType);
      const missing = getMissingSignupDocuments(required, documents);
      if (missing.length > 0) {
        throw new Error(`Documents manquants : ${missing.map((m) => m.label).join(", ")}.`);
      }

      const uploaded = [];
      for (const requirement of required) {
        const file = documents[requirement.type];
        if (!file) continue;
        uploaded.push(await uploadVerificationDocument({
          userId: user.id, role, documentType: requirement.type, file,
        }));
      }

      const { error } = await getSupabase().rpc("sync_signup_application", {
        p_requested_role: role,
        p_full_name: form.fullName,
        p_phone: form.phone,
        p_city: form.city,
        p_address: form.address,
        p_legal_name: role === "restaurateur" ? form.legalName : null,
        p_business_name: role === "restaurateur" ? form.businessName : null,
        p_business_registration_number: role === "restaurateur" ? form.businessRegistrationNumber : null,
        p_tax_id: role === "restaurateur" ? form.taxId : null,
        p_restaurant_name: role === "restaurateur" ? form.restaurantName : null,
        p_restaurant_description: role === "restaurateur" ? form.restaurantDescription : null,
        p_vehicle_type: role === "courier" ? form.vehicleType : null,
        p_license_plate: role === "courier" ? form.licensePlate : null,
        p_iban: form.iban,
        p_metadata: { onboarding_source: "onboarding_complete" },
        p_documents: uploaded,
      });
      if (error) throw error;

      toast({ title: "Dossier soumis", description: "Ton dossier est en cours de verification." });
      setDocuments({});
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary/10 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center space-y-2">
          <img src={LOGO_URL} alt="Tok" className="mx-auto h-16 w-auto object-contain" />
          <h1 className="font-display text-2xl font-bold">Ton dossier professionnel</h1>
        </div>

        {proApplication ? (
          <SignupApplicationStatusCard
            application={proApplication}
            title="Suivi de ta candidature"
            emptyDescription="Aucun dossier en cours."
          />
        ) : (
          <Card className="shadow-lg border-0">
            <CardHeader>
              <CardTitle className="text-xl">Termine ton dossier</CardTitle>
              <CardDescription>
                Renseigne tes informations professionnelles et ajoute les justificatifs requis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs value={role} onValueChange={(v) => setRole(v as Exclude<SignupRole, "client">)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="restaurateur">Restaurateur</TabsTrigger>
                  <TabsTrigger value="courier">Livreur</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="onboarding-fullname">Nom complet</label>
                  <input id="onboarding-fullname"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.fullName} onChange={(e) => onField("fullName", e.target.value)}
                    placeholder="Jean Dupont" />
                </div>
              </div>
              <ProApplicationForm role={role} form={form} onFieldChange={onField}
                documents={documents} onDocumentChange={onDocument} loading={submitting} />
              <Button className="w-full" disabled={submitting} onClick={handleComplete}>
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Envoi...</>
                  : <><FileText className="mr-2 h-4 w-4" />Soumettre mon dossier</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {proApplication?.status === "approved" ? (
          <Button className="w-full" onClick={() => navigate(proApplication.requested_role === "courier" ? "/courier" : "/dashboard")}>
            Acceder a mon espace
          </Button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Câbler les routes dans `App.tsx`**

Dans `src/App.tsx`, ajouter les imports lazy près des autres pages client (après la ligne `import Auth from "./pages/Auth";`) :

```tsx
const AuthConfirmed = lazy(() => import("./pages/AuthConfirmed"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
```

Puis ajouter les routes juste après `<Route path="/auth" element={<Auth />} />` :

```tsx
<Route path="/auth/confirmed" element={<AuthConfirmed />} />
<Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
```

- [ ] **Step 4: Vérifier compilation, lint et build**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AuthConfirmed.tsx src/pages/Onboarding.tsx src/App.tsx
git commit -m "feat(signup): /auth/confirmed + /onboarding (status + recovery) routes"
```

---

## Task 10: Vérification globale + checklist e2e

**Files:** aucun (vérification)

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: PASS (dont `signup.test.ts`, `signupValidation.test.ts`, `submitSignupValidation.test.ts`, et les tests existants `auth-provider.test.tsx`).

- [ ] **Step 2: Lint + build de production**

Run: `npm run lint && npm run build`
Expected: lint sans erreur ; build réussi (les routes lazy `AuthConfirmed`/`Onboarding` se compilent).

- [ ] **Step 3: Passe accents + vérification RGPD**

Appliquer la table de correspondance accents (§ Notes) à la copie des écrans in-scope, puis vérifier qu'il ne reste pas d'occurrences évidentes :

Run: `npx rg -n "Creer|telephone|boite mail|verifie|Numero|specialites|confidentialite|deja|acceder" src/pages/Auth.tsx src/pages/AuthConfirmed.tsx src/pages/Onboarding.tsx src/components/signup/ProApplicationForm.tsx`
Expected: aucune occurrence (sinon corriger).

Vérifier la purge RGPD des documents de vérification :

Run: `npx rg -n "verification-documents" supabase/functions/delete-account/index.ts`
Expected : une suppression des objets storage du préfixe `{user_id}/`. Si absente, ajouter le nettoyage (ou consigner un suivi explicite dans le commit).

- [ ] **Step 4: Checklist e2e manuelle (nécessite Supabase dev + vraie boîte mail)**

Documenter le résultat de chaque scénario (la confirmation d'email ne peut pas être automatisée ici) :

- [ ] Confirmation email activée dans le projet Supabase (Auth > Providers > Email > Confirm email = ON), et `/auth/confirmed` + `/onboarding` ajoutés aux Redirect URLs.
- [ ] Client : inscription → écran « Verifie ta boite mail » → clic lien → `/auth/confirmed` → redirection accueil, connecté.
- [ ] Renvoyer : bouton désactivé 60 s, second email reçu.
- [ ] Restaurateur : inscription (formulaire + documents) → dossier visible en base au statut `awaiting_email` → clic lien → `/onboarding` affiche « En revue » → un email admin est en file (`email_queue`).
- [ ] Admin : `/admin/utilisateurs?tab=applications` → approuver → le rôle `restaurateur` est accordé, email au demandeur en file, accès `/dashboard` OK.
- [ ] `needs_changes` : la note s'affiche, re-soumission depuis `/onboarding` repasse en `pending_review`.
- [ ] Worker : après une minute, les lignes `email_queue` passent `queued → sent` (sinon revoir Task 2).
- [ ] Mobile (si testé) : le lien de confirmation rouvre l'app native sur `/auth/confirmed`/`/onboarding`.

- [ ] **Step 5: Commit éventuel de notes**

Si des ajustements de copie/al­lowlist sont nécessaires, les committer :

```bash
git add -A
git commit -m "chore(signup): e2e checklist fixes"
```

---

## Notes d'implémentation

- **`profiles` vs `user_profiles`** : `handle_new_user`, `sync_signup_application` et `admin_submit_signup_application` écrivent dans `public.profiles` (full_name, phone, city, address) — table distincte de `user_profiles`. Ne pas confondre.
- **Pas de helper SQL partagé** entre `sync_signup_application` (authentifié, re-soumission) et `admin_submit_signup_application` (service-role, brouillon initial) : choix délibéré pour ne pas casser les assertions verrouillées de `signup.test.ts` et rester cohérent avec le style maison (les deux fonctions coexistent déjà en double dans l'historique).
- **Rate-limit** : la création de comptes est déjà bornée par les limites natives de GoTrue (signups/IP) ; la garde « compte < 15 min + email non confirmé + pas de dossier en revue » de l'Edge Function borne l'abus de brouillon. Un rate-limit applicatif additionnel (`rate_limit_buckets`) est une amélioration future optionnelle.
- **Confirmation d'email** : doit être activée côté projet Supabase (réglage hébergé, pas dans `config.toml`). Sans elle, `signUp` renvoie une session immédiate et l'écran « vérifie ton email » ne s'affichera pas — le réglage hébergé est donc un prérequis du parcours.
- **Passe accents (copie des écrans in-scope)** — appliquer ces corrections aux chaînes utilisateur des fichiers `Auth.tsx`, `AuthConfirmed.tsx`, `Onboarding.tsx`, `ProApplicationForm.tsx` (liste non exhaustive, corriger toute autre occurrence visible) :
  - `Creer` → `Créer` · `cree`/`creee` → `créé`/`créée` · `verifie`/`verifier`/`verification` → `vérifie`/`vérifier`/`vérification`
  - `telephone` → `téléphone` · `Numero` → `Numéro` · `Vehicule` → `Véhicule` · `Immatriculation` (ok) · `specialites` → `spécialités`
  - `boite mail` → `boîte mail` · `deja` → `déjà` · `acceder`/`acces` → `accéder`/`accès` · `valide` (contexte) → `validé`
  - `selectionne` → `sélectionné` · `prive` → `privé` · `revus` (ok) · `enregistre` → `enregistré` · `expire` → `expiré` · `Reconnecte` → `Reconnecte` (impératif, ok)
  - `Telephone`, `Adresse` (ok), `confidentialite` → `confidentialité` · `conditions d'utilisation` (ok)
- **RGPD `delete-account`** — vérifier (Task 10) que la fonction `supabase/functions/delete-account/index.ts` supprime aussi les objets du bucket `verification-documents` du préfixe `{user_id}/`. Les lignes `signup_applications`/`signup_application_documents` sont déjà purgées par `ON DELETE CASCADE` ; seuls les fichiers de storage peuvent subsister. Si non géré, le corriger ou le consigner comme suivi.
```

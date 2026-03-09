

# Plan : Buckets, Edge Functions, Triggers, Fonctions et Migrations manquants

## Analyse des manques identifiés

### 1. Storage Buckets manquants

Le composant `ImageUpload` utilise un bucket par défaut `"image"` qui n'existe pas. Les usages actuels :
- **Profil** (`Profil.tsx`) : upload avatar → bucket `"image"` (par défaut)
- **Restaurant** (`DashboardRestaurant.tsx`) : upload photo restaurant → bucket `"image"` (par défaut)
- **Menu** (`DashboardMenu.tsx`) : upload photo plat → bucket `"image"` (par défaut)
- **Photos** (`DashboardPhotos.tsx`) : upload media → bucket `"image"` (par défaut)
- **Factures** (`DashboardInvoiceSettings.tsx`) : bucket `"invoice-logos"` (existe deja)

**Buckets a creer :**
- `images` (public) : bucket general pour avatars, photos restaurant, menu, media

### 2. Edge Functions manquantes dans config.toml

`generate-invoices` existe en code mais n'est pas declaree dans `supabase/config.toml`. Il faut l'ajouter avec `verify_jwt = false`.

### 3. Triggers manquants

La base n'a aucun trigger actuellement (confirm par le schema). Triggers necessaires :
- **`on_auth_user_created`** : Le trigger pour `handle_new_user()` (cree un profil + role `client`) est defini comme fonction mais le trigger lui-meme n'est pas attache a `auth.users`. **IMPORTANT** : on ne peut PAS attacher de triggers aux tables du schema `auth` via migrations. Ce trigger doit etre configure directement. On va creer un trigger alternatif ou verifier s'il existe deja.
- **`on_review_change`** : Recalculer automatiquement `rating` et `review_count` dans `restaurants` apres INSERT/UPDATE/DELETE sur `reviews`.
- **`on_order_status_change`** : Notifier l'utilisateur quand le statut d'une commande change.
- **`update_updated_at`** : Mettre a jour automatiquement `updated_at` sur les tables qui en ont.

### 4. Fonctions SQL manquantes

- **`update_updated_at_column()`** : Fonction trigger pour MAJ auto de `updated_at`
- **Trigger function pour reviews** : Auto-recompute stats apres chaque review

### 5. Migration pour corriger le bucket par defaut

Le composant `ImageUpload` utilise `bucket = "image"` mais le bucket n'existe pas. Il faut soit creer le bucket, soit corriger le nom par defaut dans le composant.

---

## Plan d'implementation

### Etape 1 — Migration SQL
Creer une migration qui :
1. Cree la fonction `update_updated_at_column()` 
2. Attache des triggers `updated_at` sur toutes les tables concernees (restaurants, orders, delivery_tracking, restaurant_media, etc.)
3. Cree un trigger `after_review_change` sur `reviews` qui appelle `recompute_restaurant_review_stats`
4. Cree un trigger `after_order_status_update` sur `orders` qui insere une notification via `enqueue_notification`

### Etape 2 — Creer le bucket `images`
Via migration ou manuellement, creer le bucket storage public `images`.

### Etape 3 — Mettre a jour config.toml
Ajouter `[functions.generate-invoices]` avec `verify_jwt = false`.

### Etape 4 — Corriger ImageUpload.tsx
Changer le bucket par defaut de `"image"` a `"images"`.

### Etape 5 — Trigger handle_new_user
Verifier si le trigger existe sur `auth.users`. Si non, l'ajouter dans la migration (note : Supabase autorise `CREATE TRIGGER ON auth.users` via migrations si c'est un trigger qui appelle une fonction dans `public`).

---

## Detail technique

### Migration SQL
```sql
-- 1. updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2. Attach updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- (+ other tables with updated_at)

-- 3. Auto-recompute review stats
CREATE OR REPLACE FUNCTION public.trigger_recompute_review_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM recompute_restaurant_review_stats(COALESCE(NEW.restaurant_id, OLD.restaurant_id));
  RETURN NULL;
END; $$;

CREATE TRIGGER after_review_change AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION trigger_recompute_review_stats();

-- 4. Auto-notify on order status change
CREATE OR REPLACE FUNCTION public.trigger_order_status_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM enqueue_notification(NEW.user_id, 'Commande mise à jour', 
      'Votre commande est maintenant : ' || NEW.status, 'order_update', 'transactional',
      json_build_object('order_id', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER after_order_status_update AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION trigger_order_status_notification();

-- 5. handle_new_user trigger on auth.users
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Fichiers modifies
- `supabase/config.toml` : ajouter generate-invoices
- `src/components/ImageUpload.tsx` : bucket `"image"` → `"images"`


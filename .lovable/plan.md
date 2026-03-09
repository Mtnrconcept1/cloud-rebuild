

# Plan : Industrialisation du MVP vers un produit exploitable

L'audit identifie 4 couches manquantes. Voici le plan d'implementation concret, priorise par impact.

---

## Couche 1 : Verite metier (logique serveur)

### 1.1 — Validation serveur des reservations (anti-conflit + capacite)
Creer une fonction SQL `validate_and_create_reservation()` qui :
- Calcule les couverts deja reserves pour le meme restaurant/date/service
- Compare avec `max_covers` du service (depuis `opening_hours`)
- Rejette si capacite depassee
- Verifie les doublons (meme user, meme date/heure/restaurant)
- Remplace l'insert direct depuis `ReservationDialog.tsx`

### 1.2 — Validation serveur des commandes
Creer une edge function `validate-order` qui :
- Verifie que les items du menu existent et sont disponibles (`is_available = true`)
- Verifie les prix (compare prix envoyes vs prix en base)
- Verifie la coherence du total
- Verifie les quotas anti-gaspi (`quantity_available`)
- Decremente les stocks anti-gaspi / flash sale de maniere atomique
- Remplace l'appel direct a `create_order_with_items` depuis le front

### 1.3 — Promotions dynamiques depuis la base
Supprimer `getPromosForDate()` (promotions hardcodees) dans `ReservationDialog.tsx` — deja fait partiellement, les promos viennent de `meal_formulas`. Nettoyer le code mort.

### 1.4 — Gestion no-show et annulations
Ajouter une table `reservation_slots` ou enrichir la logique existante :
- Fonction SQL `cancel_reservation()` avec politique d'annulation (delai minimum)
- Champ `no_show` sur `reservations` + tracking automatique (trigger qui marque no-show si date passee et status toujours "pending")

---

## Couche 2 : Transactions et paiement

### 2.1 — Integration Stripe
Activer Stripe via le connecteur Lovable pour :
- Checkout session a la validation du panier
- Webhook pour confirmer le paiement avant de creer la commande
- Gestion des remboursements
- Separation autorisation/capture

### 2.2 — Idempotence des commandes
Ajouter un champ `idempotency_key` sur `orders` (unique) pour empecher les doubles commandes en cas de retry reseau. Le `checkout_id` existant peut servir de base.

### 2.3 — Table audit_log
```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb DEFAULT '{}',
  new_data jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);
```
Avec un trigger generique pour les tables sensibles (orders, reservations, restaurants).

---

## Couche 3 : Operations et exploitation

### 3.1 — Edge function pour emails transactionnels
Remplacer le `sendOrderConfirmationEmail` simule (simple `console.log` apres un `setTimeout`) par une vraie edge function utilisant le modele Lovable AI pour generer le contenu et un service email (ou au minimum, stocker l'email en base dans une table `email_queue`).

### 3.2 — Table email_queue + notification_deliveries amelioree
```sql
CREATE TABLE email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text DEFAULT 'queued',
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);
```

### 3.3 — Admin dashboard enrichi
- Ajouter des KPIs globaux : revenu total, commissions, GMV, taux d'annulation
- Liste des commandes recentes avec filtres
- Moderation des avis (deja en partie dans AdminAvis)
- Logs d'audit consultables

### 3.4 — Trigger no-show automatique
Fonction SQL appelee par un cron (ou edge function scheduled) qui marque les reservations passees non confirmees comme `no_show`.

---

## Couche 4 : Securite et confiance plateforme

### 4.1 — Rate limiting sur les edge functions
Ajouter un middleware de rate limiting basique dans les edge functions sensibles (validate-order, generate-invoices).

### 4.2 — Validation server-side stricte
- La fonction `create_order_with_items` doit verifier les prix en base (pas confiance au front)
- Ajouter une contrainte unique sur `(restaurant_id, user_id, date, time)` pour les reservations

### 4.3 — RLS manquants
- `restaurant_media` : ajouter politique SELECT publique (actuellement seuls owners/admins voient)
- `notifications` : ajouter politique INSERT pour le systeme (SECURITY DEFINER fonctionne deja via `enqueue_notification`)

### 4.4 — Trigger audit generique
```sql
CREATE OR REPLACE FUNCTION log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;
```
Attache sur `orders`, `reservations`, `restaurants`.

---

## Fichiers crees / modifies

### Nouveaux fichiers
- `supabase/functions/validate-order/index.ts` — validation + creation commande server-side
- `supabase/functions/send-email/index.ts` — envoi email via queue

### Migrations SQL
1. Table `audit_log` + trigger generique + attachement
2. Table `email_queue`
3. Fonction `validate_and_create_reservation()` avec verification capacite
4. Fonction `cancel_reservation()` avec regles d'annulation
5. Trigger auto no-show sur reservations
6. Contrainte unique reservations anti-doublon
7. Ajout `idempotency_key` unique sur orders
8. Politique RLS SELECT publique sur `restaurant_media`
9. Prix verification dans `create_order_with_items`

### Fichiers modifies
- `src/pages/Panier.tsx` — appeler `validate-order` edge function au lieu de `create_order_with_items` directement
- `src/components/ReservationDialog.tsx` — appeler `validate_and_create_reservation` RPC, supprimer `getPromosForDate` mort
- `src/lib/email-service.ts` — appeler l'edge function `send-email` au lieu de simuler
- `src/pages/admin/AdminHome.tsx` — enrichir avec KPIs globaux, logs d'audit, commandes recentes
- `supabase/config.toml` — ajouter `validate-order` et `send-email`

---

## Ordre d'execution

1. Migrations SQL (audit_log, email_queue, fonctions de validation, contraintes)
2. Edge functions (validate-order, send-email)
3. Config.toml
4. Modifications frontend (Panier, ReservationDialog, email-service, AdminHome)


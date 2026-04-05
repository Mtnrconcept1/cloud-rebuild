-- ============================================================
-- Launch Offer Packs for Restaurant Onboarding
-- ============================================================

-- 1. Pack definitions (admin-managed)
CREATE TABLE IF NOT EXISTS public.launch_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_chf numeric(10, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  badge_label text,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Restaurant pack purchases
CREATE TABLE IF NOT EXISTS public.restaurant_launch_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  pack_id uuid NOT NULL REFERENCES public.launch_packs(id) ON DELETE RESTRICT,
  purchased_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'in_progress', 'completed', 'cancelled')),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  paid_at timestamptz,
  completed_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, pack_id)
);

-- 3. Per-service fulfillment tracking
CREATE TABLE IF NOT EXISTS public.launch_pack_service_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_pack_id uuid NOT NULL REFERENCES public.restaurant_launch_packs(id) ON DELETE CASCADE,
  service_slug text NOT NULL,
  service_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_pack_id, service_slug)
);

-- Indexes
CREATE INDEX idx_restaurant_launch_packs_restaurant ON public.restaurant_launch_packs (restaurant_id);
CREATE INDEX idx_restaurant_launch_packs_status ON public.restaurant_launch_packs (status);
CREATE INDEX idx_launch_pack_fulfillments_pack ON public.launch_pack_service_fulfillments (restaurant_pack_id);

-- Updated_at triggers
CREATE TRIGGER set_updated_at_launch_packs
  BEFORE UPDATE ON public.launch_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_restaurant_launch_packs
  BEFORE UPDATE ON public.restaurant_launch_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_launch_pack_fulfillments
  BEFORE UPDATE ON public.launch_pack_service_fulfillments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.launch_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_launch_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.launch_pack_service_fulfillments ENABLE ROW LEVEL SECURITY;

-- launch_packs: public read for active packs
CREATE POLICY "launch_packs_public_read" ON public.launch_packs
  FOR SELECT USING (is_active = true);

-- launch_packs: admin full access
CREATE POLICY "launch_packs_admin_all" ON public.launch_packs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- restaurant_launch_packs: owner can read their own
CREATE POLICY "restaurant_launch_packs_owner_read" ON public.restaurant_launch_packs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
    )
  );

-- restaurant_launch_packs: admin full access
CREATE POLICY "restaurant_launch_packs_admin_all" ON public.restaurant_launch_packs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- fulfillments: owner can read
CREATE POLICY "fulfillments_owner_read" ON public.launch_pack_service_fulfillments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_launch_packs rlp
      JOIN public.restaurants r ON r.id = rlp.restaurant_id
      WHERE rlp.id = restaurant_pack_id AND r.owner_id = auth.uid()
    )
  );

-- fulfillments: admin full access
CREATE POLICY "fulfillments_admin_all" ON public.launch_pack_service_fulfillments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Seed data: 4 launch packs
-- ============================================================

INSERT INTO public.launch_packs (slug, name, description, price_chf, position, badge_label, services) VALUES
(
  'decouverte',
  'Pack Decouverte',
  'L''essentiel pour demarrer sur la plateforme. Accompagnement personnalise et creation de votre menu digital.',
  490.00,
  1,
  NULL,
  '[
    {"service": "mise_en_place", "label": "Mise en place", "tier": "basic", "description": "Configuration de votre compte et parametres de base"},
    {"service": "menu_creation", "label": "Creation de menu", "max_items": 20, "description": "Digitalisation de votre carte jusqu''a 20 plats"}
  ]'::jsonb
),
(
  'essentiel',
  'Pack Essentiel',
  'Donnez une image professionnelle a votre restaurant avec des photos de qualite et une presence en ligne soignee.',
  990.00,
  2,
  NULL,
  '[
    {"service": "mise_en_place", "label": "Mise en place", "tier": "standard", "description": "Configuration complete de votre compte"},
    {"service": "menu_creation", "label": "Creation de menu", "max_items": 40, "description": "Digitalisation de votre carte jusqu''a 40 plats"},
    {"service": "product_photography", "label": "Photos produits", "quantity": 10, "description": "Seance photo professionnelle de 10 plats"},
    {"service": "social_media_setup", "label": "Reseaux sociaux", "description": "Configuration de vos profils et liens sociaux"}
  ]'::jsonb
),
(
  'pro',
  'Pack Pro',
  'La formule complete pour un lancement reussi : photos, campagne publicitaire et plan de salle inclus.',
  1990.00,
  3,
  'Populaire',
  '[
    {"service": "mise_en_place", "label": "Mise en place", "tier": "standard", "description": "Configuration complete de votre compte"},
    {"service": "menu_creation", "label": "Creation de menu", "max_items": null, "description": "Digitalisation illimitee de votre carte"},
    {"service": "product_photography", "label": "Photos produits", "quantity": 25, "description": "Seance photo professionnelle de 25 plats"},
    {"service": "social_media_setup", "label": "Reseaux sociaux", "description": "Configuration de vos profils et liens sociaux"},
    {"service": "advertising_campaign", "label": "Campagne publicitaire", "quantity": 1, "budget_chf": 200, "description": "1 campagne sponsorisee avec 200 CHF de budget"},
    {"service": "floor_plan_design", "label": "Plan de salle", "description": "Creation de votre plan de salle digital"}
  ]'::jsonb
),
(
  'premium',
  'Pack Premium',
  'L''accompagnement VIP pour un lancement premium : account manager dedie, photos completes et 3 campagnes publicitaires.',
  3490.00,
  4,
  'VIP',
  '[
    {"service": "mise_en_place", "label": "Mise en place", "tier": "priority", "description": "Configuration prioritaire avec accompagnement dedie"},
    {"service": "menu_creation", "label": "Creation de menu", "max_items": null, "description": "Digitalisation illimitee + strategie de carte"},
    {"service": "product_photography", "label": "Photos produits", "quantity": null, "description": "Seance photo complete : tous les plats + ambiance"},
    {"service": "social_media_setup", "label": "Reseaux sociaux", "months_management": 3, "description": "Configuration + gestion pendant 3 mois"},
    {"service": "advertising_campaign", "label": "Campagnes publicitaires", "quantity": 3, "budget_chf": 500, "description": "3 campagnes sponsorisees avec 500 CHF de budget total"},
    {"service": "floor_plan_design", "label": "Plan de salle", "description": "Creation de votre plan de salle digital"},
    {"service": "account_manager", "label": "Account manager dedie", "description": "Un interlocuteur dedie pour votre lancement"}
  ]'::jsonb
);

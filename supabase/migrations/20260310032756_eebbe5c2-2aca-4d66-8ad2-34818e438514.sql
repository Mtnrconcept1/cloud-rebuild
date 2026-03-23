
-- Fixed find_nearby_couriers (use full expression in ORDER BY)
CREATE OR REPLACE FUNCTION public.find_nearby_couriers(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5.0,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  courier_id uuid, user_id uuid, distance_km double precision,
  rating numeric, acceptance_rate numeric, vehicle_type text
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    c.id AS courier_id, c.user_id,
    (6371 * acos(
      cos(radians(p_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.current_lat))
    )) AS distance_km,
    c.rating, c.acceptance_rate, c.vehicle_type
  FROM public.couriers c
  WHERE c.is_online = true
    AND c.status = 'approved'
    AND c.current_lat IS NOT NULL
    AND c.current_lng IS NOT NULL
    AND (6371 * acos(
      cos(radians(p_lat)) * cos(radians(c.current_lat)) *
      cos(radians(c.current_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(c.current_lat))
    )) <= p_radius_km
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_jobs dj
      WHERE dj.courier_id = c.id
        AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')
    )
  ORDER BY
    (1.0 / GREATEST(
      (6371 * acos(
        cos(radians(p_lat)) * cos(radians(c.current_lat)) *
        cos(radians(c.current_lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(c.current_lat))
      )), 0.1
    )) * c.rating * (c.acceptance_rate / 100.0) DESC
  LIMIT p_limit;
$$;

-- RLS for all new tables
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Couriers RLS
CREATE POLICY "couriers_own_profile_select" ON public.couriers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "couriers_own_profile_insert" ON public.couriers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "couriers_own_profile_update" ON public.couriers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "couriers_admin_all" ON public.couriers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "couriers_client_active_order" ON public.couriers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.dispatch_jobs dj JOIN public.orders o ON o.id = dj.order_id WHERE dj.courier_id = couriers.id AND o.user_id = auth.uid() AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff'))
);

-- Courier documents RLS
CREATE POLICY "courier_docs_own" ON public.courier_documents FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_documents.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "courier_docs_admin" ON public.courier_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier shifts RLS
CREATE POLICY "courier_shifts_own" ON public.courier_shifts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_shifts.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "courier_shifts_admin" ON public.courier_shifts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier locations RLS
CREATE POLICY "courier_locations_own_insert" ON public.courier_locations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "courier_locations_own_select" ON public.courier_locations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_locations.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "courier_locations_client_active" ON public.courier_locations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.dispatch_jobs dj JOIN public.orders o ON o.id = dj.order_id WHERE dj.courier_id = courier_locations.courier_id AND o.user_id = auth.uid() AND dj.status IN ('accepted', 'arriving_pickup', 'picked_up', 'arriving_dropoff')));
CREATE POLICY "courier_locations_admin" ON public.courier_locations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch jobs RLS
CREATE POLICY "dispatch_jobs_courier_select" ON public.dispatch_jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "dispatch_jobs_courier_update" ON public.dispatch_jobs FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_jobs.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "dispatch_jobs_client_select" ON public.dispatch_jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = dispatch_jobs.order_id AND o.user_id = auth.uid()));
CREATE POLICY "dispatch_jobs_admin" ON public.dispatch_jobs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Dispatch attempts RLS
CREATE POLICY "dispatch_attempts_courier" ON public.dispatch_attempts FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = dispatch_attempts.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "dispatch_attempts_admin" ON public.dispatch_attempts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Courier earnings RLS
CREATE POLICY "courier_earnings_own" ON public.courier_earnings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.couriers c WHERE c.id = courier_earnings.courier_id AND c.user_id = auth.uid()));
CREATE POLICY "courier_earnings_admin" ON public.courier_earnings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Payment transactions RLS
CREATE POLICY "payment_transactions_own" ON public.payment_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "payment_transactions_admin" ON public.payment_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User wallets RLS
CREATE POLICY "wallets_own" ON public.user_wallets FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "wallets_admin" ON public.user_wallets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Conversations RLS
CREATE POLICY "conversations_participant" ON public.conversations FOR ALL TO authenticated USING (auth.uid() = ANY(participant_ids));
CREATE POLICY "conversations_admin" ON public.conversations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Messages RLS
CREATE POLICY "messages_participant" ON public.messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND auth.uid() = ANY(c.participant_ids)));
CREATE POLICY "messages_admin" ON public.messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Promo codes RLS
CREATE POLICY "promo_codes_public_read" ON public.promo_codes FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "promo_codes_admin" ON public.promo_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "promo_codes_restaurant" ON public.promo_codes FOR ALL TO authenticated USING (restaurant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = promo_codes.restaurant_id AND r.owner_id = auth.uid()));

-- Promo code uses RLS
CREATE POLICY "promo_uses_own" ON public.promo_code_uses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "promo_uses_admin" ON public.promo_code_uses FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Referral codes RLS
CREATE POLICY "referral_own" ON public.referral_codes FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "referral_public_read" ON public.referral_codes FOR SELECT TO authenticated USING (true);

-- Support tickets RLS
CREATE POLICY "support_tickets_own" ON public.support_tickets FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "support_tickets_admin" ON public.support_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Support messages RLS
CREATE POLICY "support_messages_own" ON public.support_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "support_messages_admin" ON public.support_messages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

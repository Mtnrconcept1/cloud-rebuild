import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";

export type ReservationAvailabilitySlot = {
  slot_time: string;
  shift_id: string | null;
  service_key: string;
  available: boolean;
  reason: string | null;
  capacity_remaining: number;
  requires_guarantee: boolean;
  requires_deposit: boolean;
  deposit_amount: number;
  no_show_fee: number;
  risk_level: string;
};

export function normalizeReservationTime(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

export function sortReservationAvailability(
  slots: ReservationAvailabilitySlot[],
) {
  return [...slots].sort((left, right) =>
    normalizeReservationTime(left.slot_time).localeCompare(normalizeReservationTime(right.slot_time), "fr"),
  );
}

export function formatAvailabilityReason(reason: string | null | undefined) {
  switch (reason) {
    case "passed":
      return "Créneau passé";
    case "capacity_reached":
      return "Complet";
    default:
      return "Indisponible";
  }
}

export async function fetchReservationAvailability(input: {
  restaurantId: string;
  date: Date;
  partySize: number;
  channel?: string;
}) {
  const { data, error } = await (supabase.rpc as any)(
    "quote_reservation_availability",
    {
      p_restaurant_id: input.restaurantId,
      p_date: format(input.date, "yyyy-MM-dd"),
      p_party_size: input.partySize,
      p_channel: input.channel || "online",
    },
  );

  if (error) throw error;

  return sortReservationAvailability((data || []) as ReservationAvailabilitySlot[]);
}

export async function createReservationHold(input: {
  restaurantId: string;
  date: Date;
  time: string;
  partySize: number;
  metadata?: Record<string, unknown>;
  sourceChannel?: string;
}) {
  const { data, error } = await (supabase.rpc as any)(
    "create_reservation_hold",
    {
      p_restaurant_id: input.restaurantId,
      p_date: format(input.date, "yyyy-MM-dd"),
      p_time: input.time,
      p_party_size: input.partySize,
      p_metadata: input.metadata || {},
      p_source_channel: input.sourceChannel || "web",
    },
  );

  if (error) throw error;

  return (data as string | null) || null;
}

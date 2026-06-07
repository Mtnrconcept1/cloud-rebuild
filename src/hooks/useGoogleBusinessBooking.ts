import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import type {
  AdminGoogleBusinessBookingSetup,
  GoogleBookingAction,
  GoogleBookingStatus,
  GoogleBusinessBookingSetup,
  PreviousBookingProvider,
} from "@/lib/googleBusinessBooking";

const supabase = getSupabase();

function firstRow<T>(data: T[] | T | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export type RestaurantGoogleBookingPatch = {
  restaurantId: string;
  googleBusinessUrl?: string | null;
  previousBookingProvider?: PreviousBookingProvider | "" | null;
  needsGoogleHelp?: boolean | null;
  confirmationScreenshotUrl?: string | null;
  action?: GoogleBookingAction | null;
};

export type AdminGoogleBookingFilters = {
  status?: GoogleBookingStatus | "all";
  helpOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type AdminGoogleBookingPatch = {
  restaurantId: string;
  status?: GoogleBookingStatus | null;
  adminNotes?: string | null;
  lastAdminContactAt?: string | null;
  confirmationScreenshotUrl?: string | null;
  needsGoogleHelp?: boolean | null;
};

export function useRestaurantGoogleBookingSetup(restaurantId?: string | null) {
  return useQuery({
    queryKey: ["restaurant-google-booking-setup", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("restaurant_get_google_booking_setup", {
        p_restaurant_id: restaurantId,
      });
      if (error) throw error;
      return firstRow<GoogleBusinessBookingSetup>(data);
    },
  });
}

export function useUpdateRestaurantGoogleBookingSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: RestaurantGoogleBookingPatch) => {
      const { data, error } = await (supabase.rpc as any)("restaurant_update_google_booking_setup", {
        p_restaurant_id: patch.restaurantId,
        p_google_business_url: patch.googleBusinessUrl ?? null,
        p_previous_booking_provider: patch.previousBookingProvider ?? null,
        p_needs_google_help: patch.needsGoogleHelp ?? null,
        p_confirmation_screenshot_url: patch.confirmationScreenshotUrl ?? null,
        p_action: patch.action ?? "save",
      });
      if (error) throw error;
      return firstRow<GoogleBusinessBookingSetup>(data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["restaurant-google-booking-setup", variables.restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-google-booking-setups"] });
    },
  });
}

export function useAdminGoogleBookingSetups(filters: AdminGoogleBookingFilters) {
  return useQuery({
    queryKey: ["admin-google-booking-setups", filters],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_google_booking_setups", {
        p_status: filters.status && filters.status !== "all" ? filters.status : null,
        p_help_only: Boolean(filters.helpOnly),
        p_search: filters.search?.trim() || null,
        p_limit: filters.limit ?? 100,
        p_offset: filters.offset ?? 0,
      });
      if (error) throw error;
      return (data || []) as AdminGoogleBusinessBookingSetup[];
    },
  });
}

export function useAdminUpdateGoogleBookingSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: AdminGoogleBookingPatch) => {
      const { data, error } = await (supabase.rpc as any)("admin_update_google_booking_setup", {
        p_restaurant_id: patch.restaurantId,
        p_google_booking_status: patch.status ?? null,
        p_admin_notes: patch.adminNotes ?? null,
        p_last_admin_contact_at: patch.lastAdminContactAt ?? null,
        p_confirmation_screenshot_url: patch.confirmationScreenshotUrl ?? null,
        p_needs_google_help: patch.needsGoogleHelp ?? null,
      });
      if (error) throw error;
      return firstRow<AdminGoogleBusinessBookingSetup>(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-google-booking-setups"] });
    },
  });
}

export async function trackGoogleBookingEvent(
  restaurantId: string,
  eventType:
    | "google_booking_link_copied"
    | "google_booking_help_requested"
    | "google_booking_configured_confirmed"
    | "google_booking_link_clicked"
    | "google_booking_reservation_started"
    | "google_booking_reservation_completed",
  metadata: Record<string, unknown> = {},
) {
  if (!restaurantId) return null;
  const { data, error } = await (supabase.rpc as any)("track_google_booking_event", {
    p_restaurant_id: restaurantId,
    p_event_type: eventType,
    p_metadata: metadata,
  });
  if (error) {
    console.warn("Google Business booking tracking failed:", error.message);
    return null;
  }
  return data;
}

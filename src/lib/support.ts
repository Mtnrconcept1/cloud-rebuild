import { supabase } from "@/integrations/supabase/client";

export type SupportTicketRow = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  restaurant_id?: string | null;
  support_messages?: SupportMessageRow[] | null;
};

export type SupportMessageRow = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender_role?: string | null;
};

type SupabaseLikeError = {
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export function isSupabaseMissingColumnError(error: SupabaseLikeError | null | undefined, column: string) {
  if (!error) return false;

  const details = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  return details.includes(column.toLowerCase()) && (details.includes("column") || details.includes("schema cache"));
}

export async function createSupportTicket(input: {
  subject: string;
  description: string;
  category: string;
  priority?: string;
  restaurantId?: string | null;
  source?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Authentification requise");
  }

  const ticketPayload: Record<string, unknown> = {
    user_id: userData.user.id,
    subject: input.subject,
    description: input.description,
    category: input.category,
    priority: input.priority || "medium",
  };

  if (input.restaurantId) {
    ticketPayload.restaurant_id = input.restaurantId;
  }

  let ticketResponse = await supabase
    .from("support_tickets")
    .insert(ticketPayload as any)
    .select("id")
    .single();

  if (
    ticketResponse.error &&
    "restaurant_id" in ticketPayload &&
    isSupabaseMissingColumnError(ticketResponse.error, "restaurant_id")
  ) {
    delete ticketPayload.restaurant_id;
    ticketResponse = await supabase
      .from("support_tickets")
      .insert(ticketPayload as any)
      .select("id")
      .single();
  }

  if (ticketResponse.error) throw ticketResponse.error;

  const { error: messageError } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticketResponse.data.id,
      sender_id: userData.user.id,
      content: input.description,
    } as any);

  if (messageError) throw messageError;

  return ticketResponse.data.id as string;
}

export async function appendSupportMessage(ticketId: string, content: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Authentification requise");
  }

  const { error } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      sender_id: userData.user.id,
      content,
    } as any);

  if (error) throw error;
}

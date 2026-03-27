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

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: userData.user.id,
      subject: input.subject,
      description: input.description,
      category: input.category,
      priority: input.priority || "medium",
      restaurant_id: input.restaurantId || null,
      source: input.source || "web",
    } as any)
    .select("id")
    .single();

  if (ticketError) throw ticketError;

  const { error: messageError } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticket.id,
      sender_id: userData.user.id,
      sender_role: "customer",
      content: input.description,
      is_internal: false,
    } as any);

  if (messageError) throw messageError;

  return ticket.id as string;
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
      sender_role: "customer",
      content,
      is_internal: false,
    } as any);

  if (error) throw error;
}

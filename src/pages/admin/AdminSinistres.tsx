import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bot, CalendarClock, ClipboardList, MessageSquareText, Search, ShieldAlert, Store, User } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const supabase = getSupabase();

type SupportIncidentRow = {
  id: string;
  user_id: string | null;
  restaurant_id: string | null;
  order_id: string | null;
  reservation_id: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  status: string;
  subject: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  restaurants?: { name?: string | null } | null;
  orders?: { order_number?: string | null } | null;
  reservations?: { order_reference?: string | null } | null;
  customer?: { full_name?: string | null; phone?: string | null } | null;
};

type SupportMessageRow = {
  id: string;
  author_role: string;
  body: string;
  visibility: string;
  created_at: string;
};

type AiConversationRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
};

type AiMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "normal":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function statusClass(status: string) {
  if (["closed", "resolved"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (status === "waiting_customer") return "bg-sky-100 text-sky-800";
  if (status === "waiting_restaurant") return "bg-violet-100 text-violet-800";
  return "bg-red-100 text-red-800";
}

function isChatIncident(row: SupportIncidentRow) {
  const metadata = asRecord(row.metadata);
  const source = String(metadata.source || "");

  return source === "ai-client-chat"
    || source === "ai-client-support"
    || Boolean(metadata.conversation_id)
    || Boolean(metadata.ai_support_ticket_id);
}

async function fetchChatIncidents() {
  const { data, error } = await (supabase as any)
    .from("support_incidents")
    .select(`
      id,
      user_id,
      restaurant_id,
      order_id,
      reservation_id,
      category,
      priority,
      status,
      subject,
      description,
      metadata,
      last_message_at,
      created_at,
      updated_at,
      restaurants (
        name
      ),
      orders (
        order_number
      ),
      reservations (
        order_reference
      )
    `)
    .order("updated_at", { ascending: false })
    .limit(150);

  if (error) throw error;

  const rows = ((data || []) as SupportIncidentRow[]).filter(isChatIncident);
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[];
  if (userIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone")
    .in("user_id", userIds);

  const profilesByUserId = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]));

  return rows.map((row) => ({
    ...row,
    customer: row.user_id ? profilesByUserId.get(row.user_id) || null : null,
  }));
}

async function fetchIncidentConversation(incident: SupportIncidentRow | null) {
  if (!incident) return { supportMessages: [], conversation: null, aiMessages: [] };

  const metadata = asRecord(incident.metadata);
  const metadataConversationId = typeof metadata.conversation_id === "string" ? metadata.conversation_id : null;

  const [supportMessagesResult, conversationResult] = await Promise.all([
    (supabase as any)
      .from("support_incident_messages")
      .select("id, author_role, body, visibility, created_at")
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: true }),
    metadataConversationId
      ? (supabase as any)
          .from("ai_conversations")
          .select("id, title, status, created_at")
          .eq("id", metadataConversationId)
          .maybeSingle()
      : (supabase as any)
          .from("ai_conversations")
          .select("id, title, status, created_at")
          .eq("support_incident_id", incident.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  if (supportMessagesResult.error) throw supportMessagesResult.error;
  if (conversationResult.error) throw conversationResult.error;

  const conversation = conversationResult.data as AiConversationRow | null;
  if (!conversation?.id) {
    return {
      supportMessages: (supportMessagesResult.data || []) as SupportMessageRow[],
      conversation: null,
      aiMessages: [] as AiMessageRow[],
    };
  }

  const { data: aiMessages, error: aiMessagesError } = await (supabase as any)
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  if (aiMessagesError) throw aiMessagesError;

  return {
    supportMessages: (supportMessagesResult.data || []) as SupportMessageRow[],
    conversation,
    aiMessages: (aiMessages || []) as AiMessageRow[],
  };
}

export default function AdminSinistres() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedIncident, setSelectedIncident] = useState<SupportIncidentRow | null>(null);

  const { data: incidents = [], isLoading, error } = useQuery({
    queryKey: ["admin-chat-sinistres"],
    queryFn: fetchChatIncidents,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-chat-sinistre-detail", selectedIncident?.id],
    queryFn: () => fetchIncidentConversation(selectedIncident),
    enabled: Boolean(selectedIncident?.id),
  });

  useEffect(() => {
    const incidentId = searchParams.get("incident");
    if (!incidentId || selectedIncident?.id === incidentId || incidents.length === 0) return;

    const incident = incidents.find((row) => row.id === incidentId);
    if (incident) setSelectedIncident(incident);
  }, [incidents, searchParams, selectedIncident?.id]);

  const filteredIncidents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return incidents.filter((incident) => {
      if (statusFilter === "open" && ["closed", "resolved"].includes(incident.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && incident.status !== statusFilter) return false;
      if (priorityFilter !== "all" && incident.priority !== priorityFilter) return false;

      if (!term) return true;

      const metadata = asRecord(incident.metadata);
      const haystack = [
        incident.subject,
        incident.description,
        incident.category,
        incident.priority,
        incident.status,
        incident.restaurants?.name,
        incident.orders?.order_number,
        incident.reservations?.order_reference,
        incident.customer?.full_name,
        incident.customer?.phone,
        metadata.ticket_summary,
        metadata.conversation_id,
      ].join(" ").toLowerCase();

      return haystack.includes(term);
    });
  }, [incidents, priorityFilter, search, statusFilter]);

  const counters = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((incident) => !["closed", "resolved"].includes(incident.status)).length,
    urgent: incidents.filter((incident) => incident.priority === "urgent" || incident.priority === "high").length,
  }), [incidents]);

  const openIncident = (incident: SupportIncidentRow) => {
    setSelectedIncident(incident);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("incident", incident.id);
      return next;
    });
  };

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Support admin"
        title="Sinistres chat"
        description="Plaintes remontées par le chat support avec résumé, contexte commande/réservation et transcription complète conservée côté backend."
        icon={ShieldAlert}
        tone="orange"
        visualLabel="Sinistres"
        stats={[
          { label: "Tickets chat", value: counters.total, icon: MessageSquareText },
          { label: "Ouverts", value: counters.open, icon: ShieldAlert },
          { label: "Prioritaires", value: counters.urgent, icon: CalendarClock },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            File des sinistres remontés par le chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher client, restaurant, commande, résumé ou conversation"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Ouverts</SelectItem>
                <SelectItem value="waiting_admin">À traiter</SelectItem>
                <SelectItem value="waiting_customer">Attente client</SelectItem>
                <SelectItem value="waiting_restaurant">Attente restaurant</SelectItem>
                <SelectItem value="resolved">Résolus</SelectItem>
                <SelectItem value="closed">Fermés</SelectItem>
                <SelectItem value="all">Tous</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger><SelectValue placeholder="Priorité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Impossible de charger les sinistres chat.
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucun sinistre chat ne correspond aux filtres courants.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredIncidents.map((incident) => {
                const metadata = asRecord(incident.metadata);
                const summary = String(metadata.ticket_summary || incident.description || "Aucun résumé disponible.");

                return (
                  <div
                    key={incident.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openIncident(incident)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openIncident(incident);
                      }
                    }}
                    className="rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/20"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={priorityClass(incident.priority)}>{incident.priority}</Badge>
                          <Badge className={statusClass(incident.status)}>{incident.status}</Badge>
                          <Badge variant="outline">{incident.category}</Badge>
                        </div>
                        <p className="break-words text-base font-semibold">{incident.subject}</p>
                        <p className="line-clamp-2 break-words text-sm text-muted-foreground">{summary}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{incident.customer?.full_name || "Client inconnu"}</span>
                          <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" />{incident.restaurants?.name || "Restaurant inconnu"}</span>
                          <span>{formatDateTime(incident.last_message_at || incident.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        {incident.order_id ? (
                          <Button asChild variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>
                            <Link to={`/admin/commandes-reservations?tab=orders&operation=${incident.order_id}`}>
                              Commande
                            </Link>
                          </Button>
                        ) : null}
                        {incident.reservation_id ? (
                          <Button asChild variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>
                            <Link to={`/admin/commandes-reservations?tab=reservations&operation=${incident.reservation_id}`}>
                              Réservation
                            </Link>
                          </Button>
                        ) : null}
                        <Button variant="secondary" size="sm">Voir discussion</Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedIncident)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedIncident(null);
            setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("incident");
              return next;
            });
          }
        }}
      >
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedIncident?.subject || "Sinistre chat"}</DialogTitle>
            <DialogDescription>
              Résumé, messages support et transcription IA complète.
            </DialogDescription>
          </DialogHeader>

          {selectedIncident ? (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedIncident.customer?.full_name || "Client inconnu"}</p>
                  {selectedIncident.customer?.phone ? <p className="text-xs text-muted-foreground">{selectedIncident.customer.phone}</p> : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Restaurant</p>
                  <p className="font-medium">{selectedIncident.restaurants?.name || "Restaurant inconnu"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Badge className={priorityClass(selectedIncident.priority)}>{selectedIncident.priority}</Badge>
                    <Badge className={statusClass(selectedIncident.status)}>{selectedIncident.status}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Dernière activité</p>
                  <p className="font-medium">{formatDateTime(selectedIncident.last_message_at || selectedIncident.updated_at)}</p>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <p className="mb-2 text-sm font-semibold">Résumé de la discussion</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {String(asRecord(selectedIncident.metadata).ticket_summary || selectedIncident.description || "Aucun résumé disponible.")}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  <p className="font-semibold">Conversation conservée dans le ticket</p>
                </div>
                {detailLoading ? (
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                ) : detail?.supportMessages.length ? (
                  <div className="space-y-2">
                    {detail.supportMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-xl border p-3 text-sm",
                          message.author_role === "client" ? "bg-primary/5" : "bg-muted/30",
                        )}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{message.author_role}</Badge>
                          <span>{formatDateTime(message.created_at)}</span>
                          <span>{message.visibility}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-6">{message.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Aucun message support lié à ce sinistre.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <p className="font-semibold">Transcription IA complète</p>
                </div>
                {detailLoading ? (
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                ) : detail?.aiMessages.length ? (
                  <div className="space-y-2">
                    {detail.aiMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "rounded-xl border p-3 text-sm",
                          message.role === "user" ? "bg-background" : "bg-muted/30",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={message.role === "user" ? "secondary" : "outline"}>{message.role}</Badge>
                          <span>{formatDateTime(message.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Aucune transcription IA rattachée. Le résumé du ticket reste disponible ci-dessus.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

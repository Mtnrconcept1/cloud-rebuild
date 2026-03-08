import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, Dot, ShieldAlert, UserCheck, X } from "lucide-react";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithProfile = ReservationRow & { customer: Pick<ProfileRow, "full_name" | "phone"> | null };
type ReservationMetadata = { service?: string; promo?: string; discount?: number; risk_level?: string; no_show_risk?: boolean; key_notes?: string[] };
type ServiceFilter = "all" | "lunch" | "dinner";
type SortBy = "time" | "party_size" | "status";
const SERVICE_CUTOFF_HOUR = 16;

const isJsonRecord = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";
const toService = (reservation: ReservationRow): ServiceFilter => { const hour = Number.parseInt(getSafeTime(reservation.time).split(":")[0] || "0", 10); return hour < SERVICE_CUTOFF_HOUR ? "lunch" : "dinner"; };

const extractMetadata = (reservation: ReservationRow): ReservationMetadata => {
  if (!isJsonRecord(reservation.metadata)) return {};
  const riskValue = reservation.metadata.risk_level;
  const keyNotes = reservation.metadata.key_notes;
  return {
    service: typeof reservation.metadata.service === "string" ? reservation.metadata.service.toLowerCase() : undefined,
    promo: typeof reservation.metadata.promo === "string" ? reservation.metadata.promo : undefined,
    discount: typeof reservation.metadata.discount === "number" ? reservation.metadata.discount : undefined,
    risk_level: typeof riskValue === "string" ? riskValue : undefined,
    no_show_risk: typeof reservation.metadata.no_show_risk === "boolean" ? reservation.metadata.no_show_risk : undefined,
    key_notes: Array.isArray(keyNotes) && keyNotes.every((item) => typeof item === "string") ? (keyNotes as string[]) : undefined,
  };
};

export default function DashboardReservations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [isCompactMode, setIsCompactMode] = useState(false);

  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) setIsCompactMode(true); }, []);

  const { data: restaurant } = useQuery({ queryKey: ["my-restaurant", user?.id], queryFn: async () => { const { data } = await supabase.from("restaurants").select("id").eq("owner_id", user!.id).maybeSingle(); return data; }, enabled: !!user });

  const { data: reservations = [] } = useQuery({
    queryKey: ["dashboard-all-reservations", restaurant?.id],
    queryFn: async () => {
      const { data: reservationRows, error: reservationError } = await supabase.from("reservations").select("*").eq("restaurant_id", restaurant!.id).order("date", { ascending: true }).order("time", { ascending: true });
      if (reservationError) throw reservationError;
      if (!reservationRows?.length) return [] as ReservationWithProfile[];
      const userIds = Array.from(new Set(reservationRows.map((r) => r.user_id).filter(Boolean)));
      const { data: profilesData } = await supabase.from("profiles").select("user_id, full_name, phone").in("user_id", userIds);
      const profilesByUserId = new Map((profilesData || []).map((p) => [p.user_id, p]));
      return reservationRows.map((r) => ({ ...r, customer: profilesByUserId.get(r.user_id) || null }));
    },
    enabled: !!restaurant,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { const { error } = await supabase.from("reservations").update({ status }).eq("id", id); if (error) throw error; return { id, status }; },
    onMutate: async ({ id, status }) => {
      const queryKey = ["dashboard-all-reservations", restaurant?.id];
      await queryClient.cancelQueries({ queryKey });
      const previousReservations = queryClient.getQueryData<ReservationWithProfile[]>(queryKey) || [];
      queryClient.setQueryData<ReservationWithProfile[]>(queryKey, (current = []) => current.map((r) => (r.id === id ? { ...r, status } : r)));
      return { previousReservations, queryKey };
    },
    onError: (error: Error, _variables, context) => { if (context?.queryKey) queryClient.setQueryData(context.queryKey, context.previousReservations); toast({ title: "Erreur de mise à jour", description: error.message, variant: "destructive" }); },
    onSuccess: ({ status }) => { toast({ title: "Statut mis à jour", description: `La réservation est maintenant "${status}".` }); },
    onSettled: (_data, _error, _variables, context) => { if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey }); },
  });

  const statusOptions = useMemo(() => { const u = Array.from(new Set(reservations.map((r) => r.status))).sort(); return ["all", ...u]; }, [reservations]);

  const groupedReservations = useMemo(() => {
    const filtered = reservations.filter((r) => {
      if (r.date !== selectedDate) return false;
      if (serviceFilter !== "all") { const ms = extractMetadata(r).service; const ds = ms === "lunch" || ms === "dinner" ? ms : toService(r); if (ds !== serviceFilter) return false; }
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "party_size" && b.party_size !== a.party_size) return b.party_size - a.party_size;
      if (sortBy === "status") { const bs = a.status.localeCompare(b.status, "fr"); if (bs !== 0) return bs; }
      return getSafeTime(a.time).localeCompare(getSafeTime(b.time), "fr");
    });
    const grouped = new Map<string, ReservationWithProfile[]>();
    sorted.forEach((r) => { const slot = getSafeTime(r.time); grouped.set(slot, [...(grouped.get(slot) || []), r]); });
    return Array.from(grouped.entries()).map(([slot, items]) => ({ slot, items, reservationCount: items.length, totalGuests: items.reduce((sum, i) => sum + (i.party_size || 0), 0) }));
  }, [reservations, selectedDate, serviceFilter, statusFilter, sortBy]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-3xl font-bold">Réservations</h1>
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setIsCompactMode((p) => !p)}>{isCompactMode ? "Vue détaillée" : "Mode compact"}</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p><Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p><Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as ServiceFilter)}><SelectTrigger><SelectValue placeholder="Tous les services" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="lunch">Lunch</SelectItem><SelectItem value="dinner">Dinner</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue placeholder="Tous les statuts" /></SelectTrigger><SelectContent>{statusOptions.map((s) => (<SelectItem key={s} value={s}>{s === "all" ? "Tous" : s}</SelectItem>))}</SelectContent></Select></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Tri</p><Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}><SelectTrigger><SelectValue placeholder="Trier" /></SelectTrigger><SelectContent><SelectItem value="time">Heure d'arrivée</SelectItem><SelectItem value="party_size">Taille du groupe</SelectItem><SelectItem value="status">Statut</SelectItem></SelectContent></Select></div>
        </div>
        {groupedReservations.length > 0 ? (
          <div className="space-y-4">
            {groupedReservations.map((group) => (
              <section key={group.slot} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-semibold"><Dot className="h-4 w-4" /><span>{group.slot}</span></div>
                  <p className="text-muted-foreground">{group.reservationCount} réservation(s) · {group.totalGuests} couverts</p>
                </div>
                <div className="space-y-2">
                  {group.items.map((reservation) => {
                    const metadata = extractMetadata(reservation);
                    const hasNoShowRisk = metadata.no_show_risk || metadata.risk_level === "high";
                    const keyNotes = metadata.key_notes || [];
                    const compactBase = isCompactMode ? "p-3" : "p-4";
                    return (
                      <article key={reservation.id} className={`rounded-xl border bg-card ${compactBase}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{reservation.customer?.full_name || "Client inconnu"}</span>
                              <OrderStatusBadge status={reservation.status} />
                              <Badge variant="secondary">{reservation.party_size} pers.</Badge>
                            </div>
                            {!isCompactMode && (<p className="text-sm text-muted-foreground">{new Date(reservation.date).toLocaleDateString("fr-FR")} · {getSafeTime(reservation.time)}{reservation.customer?.phone ? ` · ${reservation.customer.phone}` : ""}</p>)}
                            <div className="flex flex-wrap gap-2">
                              {(metadata.promo || typeof metadata.discount === "number") && (<Badge variant="outline" className="text-[11px]">Promo {metadata.promo ? `· ${metadata.promo}` : ""}{typeof metadata.discount === "number" ? ` · -${metadata.discount}` : ""}</Badge>)}
                              {hasNoShowRisk && (<Badge variant="destructive" className="text-[11px]"><ShieldAlert className="mr-1 h-3 w-3" />Risque no-show</Badge>)}
                              {keyNotes.slice(0, 2).map((note) => (<Badge key={note} variant="outline" className="text-[11px]">{note}</Badge>))}
                              {reservation.notes && !isCompactMode && (<Badge variant="outline" className="text-[11px]"><AlertTriangle className="mr-1 h-3 w-3" />{reservation.notes}</Badge>)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "arrived" })} disabled={updateStatusMutation.isPending}><UserCheck className="mr-1 h-4 w-4" />Arrivée</Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "no_show" })} disabled={updateStatusMutation.isPending} className="text-destructive"><X className="mr-1 h-4 w-4" />No-show</Button>
                            <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: reservation.status === "confirmed" ? "pending" : "confirmed" })} disabled={updateStatusMutation.isPending}><Check className="mr-1 h-4 w-4" />{reservation.status === "confirmed" ? "Réservée" : "Confirmée"}</Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (<p className="py-10 text-center text-muted-foreground">Aucune réservation pour les filtres sélectionnés.</p>)}
      </div>
    </DashboardLayout>
  );
}

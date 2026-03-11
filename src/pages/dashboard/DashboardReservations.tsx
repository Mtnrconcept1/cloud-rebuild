import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardRestaurant } from "./DashboardContext";
import type { Database, Json } from "@/integrations/supabase/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, CreditCard, Dot, ShieldAlert, UserCheck, Utensils, X } from "lucide-react";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ReservationWithProfile = ReservationRow & { customer: Pick<ProfileRow, "full_name" | "phone"> | null };
type ReservationMetadata = {
  service?: string;
  promo?: string;
  discount?: number;
  formula_applied?: string;
  formula_discount_percent?: number;
  formula_discount_amount?: number;
  risk_level?: string;
  no_show_risk?: boolean;
  key_notes?: string[];
  payment_method?: string;
  card_last4?: string;
  preorder_items?: Array<{ name: string; quantity: number }>;
};
type ServiceFilter = "all" | "lunch" | "dinner";
type SortBy = "time" | "party_size" | "status";
const SERVICE_CUTOFF_HOUR = 16;

const isJsonRecord = (value: Json): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
const getSafeTime = (value: string | null | undefined) => (value && value.slice(0, 5)) || "00:00";
const toService = (reservation: ReservationRow): ServiceFilter => { const hour = Number.parseInt(getSafeTime(reservation.time).split(":")[0] || "0", 10); return hour < SERVICE_CUTOFF_HOUR ? "lunch" : "dinner"; };
const toNumber = (value: Json | undefined): number | undefined => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const extractMetadata = (reservation: ReservationRow): ReservationMetadata => {
  const meta = isJsonRecord(reservation.metadata) ? reservation.metadata : {};
  const riskValue = meta.risk_level;
  const keyNotes = meta.key_notes;

  // Combine preorder items from column (priority) and metadata
  const columnItems = Array.isArray(reservation.preorder_items) ? reservation.preorder_items : [];
  const metaItems = Array.isArray(meta.preorder_items) ? meta.preorder_items : [];
  const preorderItems = columnItems.length > 0 ? columnItems : metaItems;

  return {
    service: typeof meta.service === "string" ? meta.service.toLowerCase() : undefined,
    promo: typeof meta.promo === "string" ? meta.promo : undefined,
    discount: toNumber(meta.discount) ?? toNumber(meta.promo_discount_percent),
    formula_applied: typeof meta.formula_applied === "string" ? meta.formula_applied : undefined,
    formula_discount_percent: toNumber(meta.formula_discount_percent),
    formula_discount_amount: toNumber(meta.formula_discount_amount),
    risk_level: typeof riskValue === "string" ? riskValue : undefined,
    no_show_risk: typeof meta.no_show_risk === "boolean" ? meta.no_show_risk : undefined,
    key_notes: Array.isArray(keyNotes) && keyNotes.every((item) => typeof item === "string") ? (keyNotes as string[]) : undefined,
    payment_method: typeof meta.payment_method === "string" ? meta.payment_method : undefined,
    card_last4: typeof meta.card_last4 === "string" ? meta.card_last4 : undefined,
    preorder_items: preorderItems.length > 0 ? (preorderItems as any[]) : undefined,
  };
};

export default function DashboardReservations() {
  const { selectedId } = useDashboardRestaurant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [isCompactMode, setIsCompactMode] = useState(false);

  useEffect(() => { if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) setIsCompactMode(true); }, []);

  const restaurant = selectedId ? { id: selectedId } : null;

  const { data: reservations = [] } = useQuery({
    queryKey: ["dashboard-all-reservations", restaurant?.id],
    queryFn: async () => {
      const { data: reservationRows, error: reservationError } = await supabase.from("reservations").select("*").eq("restaurant_id", restaurant!.id).order("date", { ascending: true }).order("time", { ascending: true });
      if (reservationError) throw reservationError;
      if (!reservationRows?.length) return [] as ReservationWithProfile[];

      // Use SECURITY DEFINER function to fetch customer profiles (bypasses profiles RLS)
      const { data: profilesData } = await supabase.rpc("get_reservation_customers" as any, { p_restaurant_id: restaurant!.id });
      const profilesByUserId = new Map((profilesData || []).map((p: any) => [p.user_id, { full_name: p.full_name, phone: p.phone }]));
      return reservationRows.map((r) => ({ ...r, customer: (profilesByUserId.get(r.user_id) as Pick<ProfileRow, "full_name" | "phone">) || null })) as ReservationWithProfile[];
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
    onError: (error: Error, _variables, context) => { if (context?.queryKey) queryClient.setQueryData(context.queryKey, context.previousReservations); toast({ title: "Erreur de mise a jour", description: error.message, variant: "destructive" }); },
    onSuccess: ({ status }) => { toast({ title: "Statut mis a jour", description: `La reservation est maintenant "${status}".` }); },
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
          <h1 className="font-display text-3xl font-bold">Reservations</h1>
          <Button variant="outline" size="sm" className="sm:hidden" onClick={() => setIsCompactMode((p) => !p)}>{isCompactMode ? "Vue detaillee" : "Mode compact"}</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p><Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p><Select value={serviceFilter} onValueChange={(v) => setServiceFilter(v as ServiceFilter)}><SelectTrigger><SelectValue placeholder="Tous les services" /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="lunch">Lunch</SelectItem><SelectItem value="dinner">Dinner</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Statut</p><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue placeholder="Tous les statuts" /></SelectTrigger><SelectContent>{statusOptions.map((s) => (<SelectItem key={s} value={s}>{s === "all" ? "Tous" : s}</SelectItem>))}</SelectContent></Select></div>
          <div className="space-y-1"><p className="text-xs uppercase tracking-wide text-muted-foreground">Tri</p><Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}><SelectTrigger><SelectValue placeholder="Trier" /></SelectTrigger><SelectContent><SelectItem value="time">Heure d'arrivee</SelectItem><SelectItem value="party_size">Taille du groupe</SelectItem><SelectItem value="status">Statut</SelectItem></SelectContent></Select></div>
        </div>
        {groupedReservations.length > 0 ? (
          <div className="space-y-4">
            {groupedReservations.map((group) => (
              <section key={group.slot} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-semibold"><Dot className="h-4 w-4" /><span>{group.slot}</span></div>
                  <p className="text-muted-foreground">{group.reservationCount} reservation(s) - {group.totalGuests} couverts</p>
                </div>
                <div className="space-y-2">
                  {group.items.map((reservation) => {
                    const metadata = extractMetadata(reservation);
                    const hasNoShowRisk = metadata.no_show_risk || metadata.risk_level === "high";
                    const keyNotes = metadata.key_notes || [];
                    const offerName = metadata.formula_applied || metadata.promo;
                    const offerDiscountPercent = metadata.formula_discount_percent ?? metadata.discount;
                    const offerDiscountAmount = metadata.formula_discount_amount;
                    const offerLabel = metadata.formula_applied ? "Formule" : "Promo";
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
                            {!isCompactMode && (<p className="text-sm text-muted-foreground">{new Date(reservation.date).toLocaleDateString("fr-FR")} - {getSafeTime(reservation.time)}{reservation.customer?.phone ? ` - ${reservation.customer.phone}` : ""}</p>)}
                            <div className="flex flex-wrap gap-2">
                              {(offerName || typeof offerDiscountPercent === "number") && (
                                <Badge variant="outline" className="text-[11px]">
                                  {offerLabel}
                                  {offerName ? ` - ${offerName}` : ""}
                                  {typeof offerDiscountPercent === "number" ? ` - -${offerDiscountPercent}%` : ""}
                                  {typeof offerDiscountAmount === "number" && offerDiscountAmount > 0 ? ` - -${offerDiscountAmount.toFixed(2)} CHF` : ""}
                                </Badge>
                              )}
                              {hasNoShowRisk && (<Badge variant="destructive" className="text-[11px]"><ShieldAlert className="mr-1 h-3 w-3" />Risque no-show</Badge>)}
                              {keyNotes.slice(0, 2).map((note) => (<Badge key={note} variant="outline" className="text-[11px]">{note}</Badge>))}
                              {reservation.notes && !isCompactMode && (<Badge variant="outline" className="text-[11px]"><AlertTriangle className="mr-1 h-3 w-3" />{reservation.notes}</Badge>)}
                            </div>

                            {/* Extra details logic: preorder items and payment info */}
                            {!isCompactMode && (
                              <div className="mt-4 space-y-3 pt-3 border-t">
                                {metadata.preorder_items && metadata.preorder_items.length > 0 && (
                                  <div className="space-y-1.5">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                                      <Utensils className="h-3 w-3" /> Plats reserves
                                    </p>
                                    <div className="grid grid-cols-1 gap-1.5">
                                      {metadata.preorder_items.map((item, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm bg-muted/20 p-2 rounded-lg">
                                          <span className="font-bold text-primary text-xs">x{item.quantity}</span>
                                          <span className="font-medium">{item.name}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                  {metadata.payment_method && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <CreditCard className="h-3.5 w-3.5" />
                                      <span>Paiement : <strong className="text-foreground uppercase">{metadata.payment_method}</strong></span>
                                      {metadata.card_last4 && (
                                        <span className="bg-secondary px-1.5 py-0.5 rounded font-mono">**** {metadata.card_last4}</span>
                                      )}
                                    </div>
                                  )}
                                  {reservation.total_amount > 0 && (
                                    <div className="text-sm font-bold text-primary">
                                      Total : {Number(reservation.total_amount).toFixed(2)} CHF
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "arrived" })} disabled={updateStatusMutation.isPending}><UserCheck className="mr-1 h-4 w-4" />Arrivee</Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: "no_show" })} disabled={updateStatusMutation.isPending} className="text-destructive"><X className="mr-1 h-4 w-4" />No-show</Button>
                            <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: reservation.id, status: reservation.status === "confirmed" ? "pending" : "confirmed" })} disabled={updateStatusMutation.isPending}><Check className="mr-1 h-4 w-4" />{reservation.status === "confirmed" ? "Reservee" : "Confirmee"}</Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (<p className="py-10 text-center text-muted-foreground">Aucune reservation pour les filtres selectionnes.</p>)}
      </div>
    </DashboardLayout>
  );
}

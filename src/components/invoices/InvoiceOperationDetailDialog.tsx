import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  CreditCard,
  HandCoins,
  MapPin,
  Phone,
  Receipt,
  Store,
  UserRound,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getPointsDiscountAmount } from "@/lib/comptaCommissionSources";
import {
  getOrderTypePresentation,
  getReservationFeaturePresentation,
  normalizeOrderHistoryRow,
  normalizeReservationHistoryRow,
  type AdminOrderHistoryItem,
  type AdminReservationHistoryItem,
} from "@/pages/admin/adminOrdersReservationsShared";

const supabase = getSupabase();

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type InvoiceOperationTarget =
  | { kind: "order"; id: string; reference: string }
  | { kind: "reservation"; id: string; reference: string };

type OperationDetailResult =
  | { kind: "order"; item: AdminOrderHistoryItem }
  | { kind: "reservation"; item: AdminReservationHistoryItem };

type Props = {
  target: InvoiceOperationTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatAmount(value: number) {
  return `${value.toFixed(2)} CHF`;
}

function formatDateTime(value: string) {
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status || "").trim().toLowerCase();

  if (["paid", "delivered", "completed", "confirmed"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["cancelled", "canceled", "failed", "no_show", "refunded"].includes(normalized)) {
    return "bg-red-100 text-red-800";
  }

  if (["pending", "awaiting_payment", "processing"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-slate-100 text-slate-700";
}

function renderMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Metadata</h3>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </section>
  );
}

function SummaryBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function OrderDetailContent({ order }: { order: AdminOrderHistoryItem }) {
  const orderType = getOrderTypePresentation(order.orderType);
  const tokCoveredMiamzAmount = getPointsDiscountAmount(order.metadata);
  const hasTokCoveredMiamz = tokCoveredMiamzAmount > 0;

  return (
    <>
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Commande</Badge>
          {orderType.label ? <Badge className={orderType.className}>{orderType.label}</Badge> : null}
          <Badge className={getStatusBadgeClass(order.status)}>{order.status}</Badge>
          {hasTokCoveredMiamz ? (
            <Badge className="bg-fuchsia-100 text-fuchsia-800">
              Miamz Tok {formatAmount(tokCoveredMiamzAmount)}
            </Badge>
          ) : null}
          {order.paymentStatus ? (
            <Badge variant="secondary" className={getStatusBadgeClass(order.paymentStatus)}>
              Paiement {order.paymentStatus}
            </Badge>
          ) : null}
        </div>
        <h2 className="mt-3 break-words text-xl font-semibold">
          {order.orderNumber || `Commande ${order.id.slice(0, 8)}`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {order.restaurant.name} · {order.customer.displayName}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryBlock icon={Receipt} label="Montant" value={formatAmount(order.totalAmount)} />
            <SummaryBlock icon={CalendarDays} label="Date" value={formatDateTime(order.createdAt)} />
            <SummaryBlock icon={Store} label="Restaurant" value={order.restaurant.name} />
            <SummaryBlock icon={UserRound} label="Client" value={order.customer.displayName} />
            {hasTokCoveredMiamz ? (
              <SummaryBlock
                icon={HandCoins}
                label="Miamz pris en charge"
                value={formatAmount(tokCoveredMiamzAmount)}
              />
            ) : null}
          </div>

          {hasTokCoveredMiamz ? (
            <section className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <HandCoins className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-700" />
                  <div>
                    <h3 className="text-sm font-semibold text-fuchsia-950">Miamz pris en charge par Tok</h3>
                    <p className="mt-1 text-sm text-fuchsia-900">
                      Reduction fidélité appliquée au client et financee par Tok sur cette commande.
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-base font-semibold text-fuchsia-950">
                  {formatAmount(tokCoveredMiamzAmount)}
                </p>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Coordonnees</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserRound className="h-4 w-4 text-primary" />
                  Client
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{order.customer.displayName}</p>
                  {order.customer.phone ? (
                    <p className="inline-flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {order.customer.phone}
                    </p>
                  ) : null}
                  {order.customer.address || order.customer.city ? (
                    <p className="inline-flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5" />
                      {[order.customer.address, order.customer.city].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Store className="h-4 w-4 text-primary" />
                  Restaurant
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{order.restaurant.name}</p>
                  {order.deliveryAddress ? (
                    <p className="inline-flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5" />
                      {order.deliveryAddress}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Articles</h3>
            {order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} x {formatAmount(item.unitPrice)}
                        </p>
                      </div>
                      <p className="font-semibold">{formatAmount(item.totalPrice)}</p>
                    </div>
                    {item.modifiers.length > 0 ? (
                      <div className="mt-3 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
                        <p className="mb-2 font-medium text-foreground">Options</p>
                        <div className="space-y-1">
                          {item.modifiers.map((modifier, index) => (
                            <p key={`${item.id}-${modifier.name}-${index}`}>
                              {modifier.quantity} x {modifier.name} · {formatAmount(modifier.unitPrice)}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Aucun article detaille disponible pour cette commande.
              </div>
            )}
          </section>

          {order.notes ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Notes</h3>
              <div className="max-w-full whitespace-pre-wrap break-words rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {order.notes}
              </div>
            </section>
          ) : null}

          {renderMetadata(order.metadata)}
        </div>
      </div>
    </>
  );
}

function ReservationDetailContent({ reservation }: { reservation: AdminReservationHistoryItem }) {
  const feature = getReservationFeaturePresentation(reservation.feature);

  return (
    <>
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Reservation</Badge>
          {feature ? <Badge className={feature.className}>{feature.label}</Badge> : null}
          <Badge className={getStatusBadgeClass(reservation.status)}>{reservation.status}</Badge>
        </div>
        <h2 className="mt-3 break-words text-xl font-semibold">{reservation.reference}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {reservation.restaurant.name} · {reservation.customer.displayName}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryBlock icon={Users} label="Couverts" value={`${reservation.partySize} pers.`} />
            <SummaryBlock icon={Receipt} label="Montant" value={formatAmount(reservation.totalAmount)} />
            <SummaryBlock icon={CalendarDays} label="Date" value={formatDate(reservation.reservationDate)} />
            <SummaryBlock icon={Clock3} label="Heure" value={reservation.displayTime} />
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Coordonnees</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UserRound className="h-4 w-4 text-primary" />
                  Client
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{reservation.customer.displayName}</p>
                  {reservation.customer.phone ? (
                    <p className="inline-flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {reservation.customer.phone}
                    </p>
                  ) : null}
                  {reservation.customer.address || reservation.customer.city ? (
                    <p className="inline-flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5" />
                      {[reservation.customer.address, reservation.customer.city].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Store className="h-4 w-4 text-primary" />
                  Restaurant
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{reservation.restaurant.name}</p>
                  <p className="inline-flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Créee le {formatDateTime(reservation.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Details de réservation</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <p className="mb-2 inline-flex items-center gap-2 font-medium text-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Horaires
                </p>
                <p>Heure affichee : {reservation.displayTime}</p>
                {reservation.reservationTime && reservation.reservationTime !== reservation.displayTime ? (
                  <p>Heure système : {reservation.reservationTime}</p>
                ) : null}
              </div>

              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <p className="mb-2 inline-flex items-center gap-2 font-medium text-foreground">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Paiement
                </p>
                <p>Méthode : {reservation.paymentMethod || "-"}</p>
                <p>Frais TOK : {formatAmount(reservation.billingFeeChf)}</p>
                {reservation.orderReference ? <p>Reference : {reservation.orderReference}</p> : null}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Precommandes</h3>
            {reservation.preorderItems.length > 0 ? (
              <div className="space-y-3">
                {reservation.preorderItems.map((item, index) => (
                  <div key={`${reservation.id}-${item.name}-${index}`} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} x {formatAmount(item.unitPrice)}
                        </p>
                      </div>
                      <p className="font-semibold">{formatAmount(item.totalPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Aucune précommande rattachee à cette réservation.
              </div>
            )}
          </section>

          {reservation.specialRequests ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Demandes speciales</h3>
              <div className="max-w-full whitespace-pre-wrap break-words rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {reservation.specialRequests}
              </div>
            </section>
          ) : null}

          {reservation.notes ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Notes</h3>
              <div className="max-w-full whitespace-pre-wrap break-words rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {reservation.notes}
              </div>
            </section>
          ) : null}

          {renderMetadata(reservation.metadata)}
        </div>
      </div>
    </>
  );
}

async function fetchOrderDetail(id: string): Promise<OperationDetailResult | null> {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(`
      id,
      order_number,
      created_at,
      status,
      payment_status,
      total_amount,
      delivery_address,
      notes,
      metadata,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      ),
      customer:profiles!orders_user_id_fkey_profiles (
        user_id,
        full_name,
        phone,
        city,
        address
      ),
      order_items (
        id,
        quantity,
        unit_price,
        total_price,
        metadata,
        menu_items (
          name
        ),
        anti_waste_offers (
          title
        ),
        order_item_modifiers (
          name,
          quantity,
          unit_price
        )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    kind: "order",
    item: normalizeOrderHistoryRow(data as Record<string, unknown>),
  };
}

async function fetchReservationDetail(id: string): Promise<OperationDetailResult | null> {
  const { data, error } = await (supabase as any)
    .from("reservations")
    .select(`
      id,
      created_at,
      date,
      time,
      reservation_time,
      status,
      feature,
      total_amount,
      party_size,
      notes,
      special_requests,
      order_reference,
      payment_method,
      billing_fee_chf,
      metadata,
      preorder_items,
      restaurant_id,
      user_id,
      restaurants (
        id,
        name
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const profileMap = new Map<string, ProfileRow>();
  const restaurantId = String(data.restaurant_id || "").trim();
  const userId = String(data.user_id || "").trim();

  if (restaurantId) {
    const { data: profileRows, error: profileError } = await supabase.rpc("get_reservation_customers" as any, {
      p_restaurant_id: restaurantId,
    });

    if (!profileError) {
      for (const profile of profileRows || []) {
        if (profile?.user_id) {
          profileMap.set(String(profile.user_id), profile as ProfileRow);
        }
      }
    }
  }

  if (userId && !profileMap.has(userId)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone, city, address, id, avatar_url, created_at, current_tier, loyalty_points, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.user_id) {
      profileMap.set(profile.user_id, profile as ProfileRow);
    }
  }

  return {
    kind: "reservation",
    item: normalizeReservationHistoryRow(data as Record<string, unknown>, profileMap),
  };
}

export function InvoiceOperationDetailDialog({ target, open, onOpenChange }: Props) {
  const detailQuery = useQuery({
    queryKey: ["invoice-operation-detail", target?.kind, target?.id],
    queryFn: async () => {
      if (!target) return null;
      return target.kind === "order"
        ? fetchOrderDetail(target.id)
        : fetchReservationDetail(target.id);
    },
    enabled: open && !!target,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100vw-1rem)] max-w-[760px] flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh]">
        <DialogTitle className="sr-only">
          {target?.kind === "order" ? "Detail de commande" : "Detail de réservation"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Consultation d&apos;une operation ouverte depuis une ligne de facturé.
        </DialogDescription>

        {detailQuery.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Chargement du détail...</div>
        ) : null}

        {detailQuery.error ? (
          <div className="p-6 text-sm text-destructive">
            Impossible de charger le détail. {detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)}
          </div>
        ) : null}

        {!detailQuery.isLoading && !detailQuery.error && !detailQuery.data ? (
          <div className="p-6 text-sm text-muted-foreground">
            Cette operation n&apos;est plus disponible.
          </div>
        ) : null}

        {detailQuery.data?.kind === "order" ? <OrderDetailContent order={detailQuery.data.item} /> : null}
        {detailQuery.data?.kind === "reservation" ? <ReservationDetailContent reservation={detailQuery.data.item} /> : null}
      </DialogContent>
    </Dialog>
  );
}

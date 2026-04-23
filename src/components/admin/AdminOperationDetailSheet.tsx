import {
  CalendarDays,
  Clock3,
  CreditCard,
  FileText,
  MapPin,
  Package,
  Phone,
  Receipt,
  Store,
  UserRound,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getOrderTypePresentation,
  getReservationFeaturePresentation,
  type AdminOrderHistoryItem,
  type AdminReservationHistoryItem,
} from "@/pages/admin/adminOrdersReservationsShared";

type SelectedOperation =
  | { kind: "order"; item: AdminOrderHistoryItem }
  | { kind: "reservation"; item: AdminReservationHistoryItem }
  | null;

type Props = {
  operation: SelectedOperation;
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
      <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
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

  return (
    <>
      <SheetHeader className="border-b px-6 py-5 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Commande</Badge>
          {orderType.label ? <Badge className={orderType.className}>{orderType.label}</Badge> : null}
          <Badge className={getStatusBadgeClass(order.status)}>{order.status}</Badge>
          {order.paymentStatus ? (
            <Badge variant="secondary" className={getStatusBadgeClass(order.paymentStatus)}>
              Paiement {order.paymentStatus}
            </Badge>
          ) : null}
        </div>
        <SheetTitle className="text-xl">
          {order.orderNumber || `Commande ${order.id.slice(0, 8)}`}
        </SheetTitle>
        <SheetDescription>
          {order.restaurant.name} · {order.customer.displayName}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="space-y-6 px-6 py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryBlock icon={Receipt} label="Montant" value={formatAmount(order.totalAmount)} />
            <SummaryBlock icon={CalendarDays} label="Date" value={formatDateTime(order.createdAt)} />
            <SummaryBlock icon={Store} label="Restaurant" value={order.restaurant.name} />
            <SummaryBlock icon={UserRound} label="Client" value={order.customer.displayName} />
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
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {order.notes}
              </div>
            </section>
          ) : null}

          {renderMetadata(order.metadata)}
        </div>
      </ScrollArea>
    </>
  );
}

function ReservationDetailContent({ reservation }: { reservation: AdminReservationHistoryItem }) {
  const feature = getReservationFeaturePresentation(reservation.feature);

  return (
    <>
      <SheetHeader className="border-b px-6 py-5 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Reservation</Badge>
          {feature ? <Badge className={feature.className}>{feature.label}</Badge> : null}
          <Badge className={getStatusBadgeClass(reservation.status)}>{reservation.status}</Badge>
        </div>
        <SheetTitle className="text-xl">{reservation.reference}</SheetTitle>
        <SheetDescription>
          {reservation.restaurant.name} · {reservation.customer.displayName}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="flex-1">
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
                    Creee le {formatDateTime(reservation.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Details de reservation</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <p className="mb-2 inline-flex items-center gap-2 font-medium text-foreground">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Horaires
                </p>
                <p>Heure affichee : {reservation.displayTime}</p>
                {reservation.reservationTime && reservation.reservationTime !== reservation.displayTime ? (
                  <p>Heure systeme : {reservation.reservationTime}</p>
                ) : null}
              </div>

              <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                <p className="mb-2 inline-flex items-center gap-2 font-medium text-foreground">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Paiement
                </p>
                <p>Methode : {reservation.paymentMethod || "-"}</p>
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
                Aucune precommande rattachee a cette reservation.
              </div>
            )}
          </section>

          {reservation.specialRequests ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Demandes speciales</h3>
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {reservation.specialRequests}
              </div>
            </section>
          ) : null}

          {reservation.notes ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Notes</h3>
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                {reservation.notes}
              </div>
            </section>
          ) : null}

          {renderMetadata(reservation.metadata)}
        </div>
      </ScrollArea>
    </>
  );
}

export default function AdminOperationDetailSheet({ operation, onOpenChange }: Props) {
  return (
    <Sheet open={!!operation} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        {operation?.kind === "order" ? <OrderDetailContent order={operation.item} /> : null}
        {operation?.kind === "reservation" ? <ReservationDetailContent reservation={operation.item} /> : null}
        {!operation ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            Selectionnez une operation.
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

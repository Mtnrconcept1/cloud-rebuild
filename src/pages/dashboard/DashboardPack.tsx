import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { useDashboardRestaurant } from "./DashboardContext";
import { useLaunchPacks, useRestaurantLaunchPack } from "@/hooks/useLaunchPack";
import {
  getServiceIcon,
  getStatusColor,
  getStatusLabel,
  getPurchaseStatusLabel,
  computePackProgress,
  formatServiceDetail,
  type ServiceFulfillment,
  type LaunchPack,
  type PackService,
} from "@/lib/launchPacks";
import { invokeSupabaseFunction } from "@/lib/session";
import PaymentMethodSelector from "@/components/cart/PaymentMethodSelector";
import type { PaymentMethodId } from "@/lib/paymentMethods";
import { toast } from "sonner";
import {
  Package,
  Rocket,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const ALLOWED_PAYMENT_METHODS: PaymentMethodId[] = [
  "card",
  "twint",
];

function FulfillmentCard({ f, service }: { f: ServiceFulfillment; service?: PackService }) {
  const Icon = getServiceIcon(f.service_slug);
  const detail = service ? formatServiceDetail(service) : null;
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border bg-card">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium text-sm">{f.service_label}</h4>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
              f.status
            )}`}
          >
            {getStatusLabel(f.status)}
          </span>
        </div>
        {detail && (
          <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        )}
        {f.scheduled_at && (
          <p className="text-xs text-muted-foreground mt-1">
            Planifie le{" "}
            {new Date(f.scheduled_at).toLocaleDateString("fr-CH", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        {f.notes && (
          <p className="text-xs text-muted-foreground mt-1">{f.notes}</p>
        )}
      </div>
    </div>
  );
}

function PackSelectionCard({
  pack,
  onSelect,
  featured,
}: {
  pack: LaunchPack;
  onSelect: (pack: LaunchPack) => void;
  featured: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 ${
        featured
          ? "border-primary ring-2 ring-primary/20"
          : "border-border"
      } bg-card hover:shadow-md transition-all`}
    >
      {pack.badge_label && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          {pack.badge_label}
        </div>
      )}
      <h3 className="font-bold">{pack.name}</h3>
      <p className="text-2xl font-bold mt-2">
        {pack.price_chf.toLocaleString("fr-CH")} <span className="text-sm text-muted-foreground font-normal">CHF</span>
      </p>
      <ul className="space-y-1.5 mt-3 flex-1">
        {(pack.services as PackService[]).map((svc) => {
          const detail = formatServiceDetail(svc);
          return (
            <li key={svc.service} className="flex items-start gap-2 text-sm">
              <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>
                {svc.label}
                {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <Button
        className="w-full mt-4"
        variant={featured ? "default" : "outline"}
        onClick={() => onSelect(pack)}
      >
        Choisir
      </Button>
    </div>
  );
}

function CheckoutDialog({
  open,
  onOpenChange,
  selectedPack,
  onCheckout,
  checkingOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPack: LaunchPack | null;
  onCheckout: (paymentMethod: PaymentMethodId) => void;
  checkingOut: boolean;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");

  if (!selectedPack) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{selectedPack.name}</DialogTitle>
          <DialogDescription>
            {selectedPack.price_chf.toLocaleString("fr-CH")} CHF — Paiement unique
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Services recap */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Services inclus</p>
            <ul className="space-y-1.5">
              {(selectedPack.services as PackService[]).map((svc) => (
                <li key={svc.service} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  <span>{svc.label}</span>
                  {formatServiceDetail(svc) && (
                    <span className="text-muted-foreground">({formatServiceDetail(svc)})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Payment method */}
          <PaymentMethodSelector
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            allowedMethods={ALLOWED_PAYMENT_METHODS}
          />

          {/* Total + CTA */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{selectedPack.price_chf.toLocaleString("fr-CH")} CHF</p>
            </div>
            <Button
              size="lg"
              onClick={() => onCheckout(paymentMethod)}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Payer maintenant
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({
  onSelectPack,
}: {
  onSelectPack: (pack: LaunchPack) => void;
}) {
  const { data: packs, isLoading } = useLaunchPacks();

  return (
    <div className="space-y-8">
      {/* Promo card */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h3 className="text-xl font-bold">Lancez-vous avec un pack</h3>
            <p className="text-muted-foreground text-sm">
              Mise en place, photos professionnelles, campagnes publicitaires —
              choisissez le pack qui correspond a vos besoins.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pack selection */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : packs && packs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {packs.map((pack) => (
            <PackSelectionCard
              key={pack.id}
              pack={pack}
              onSelect={onSelectPack}
              featured={pack.slug === "pro"}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPack() {
  const { selectedId } = useDashboardRestaurant();
  const { data: restaurantPack, isLoading } = useRestaurantLaunchPack(selectedId);
  const { data: packs = [] } = useLaunchPacks();
  const [searchParams] = useSearchParams();

  const [selectedPack, setSelectedPack] = useState<LaunchPack | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const paymentStatus = searchParams.get("status");
  const fulfillments = restaurantPack?.launch_pack_service_fulfillments ?? [];
  const progress = computePackProgress(fulfillments);

  function handleSelectPack(pack: LaunchPack) {
    setSelectedPack(pack);
    setDialogOpen(true);
  }

  async function handleCheckout(paymentMethod: PaymentMethodId) {
    if (!selectedPack || !selectedId) return;
    setCheckingOut(true);

    try {
      const { data: checkoutData, error: checkoutError } = await invokeSupabaseFunction<{
        url?: string;
        session_id?: string;
      }>("create-checkout", {
        body: {
          checkout_kind: "launch-pack",
          items: [
            {
              name: `Pack de lancement - ${selectedPack.name}`,
              price: selectedPack.price_chf,
              quantity: 1,
            },
          ],
          payment_method: paymentMethod,
          return_url: `${window.location.origin}/dashboard/pack`,
          order_metadata: {
            checkout_kind: "launch-pack",
            pack_id: selectedPack.id,
            restaurant_id: selectedId,
          },
        },
      });

      if (checkoutError || !checkoutData?.url) {
        throw new Error(
          (checkoutError as Error | null)?.message || "Impossible de creer la session de paiement."
        );
      }

      window.location.href = checkoutData.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de la creation du paiement."
      );
      setCheckingOut(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Accompagnement"
          title="Pack de lancement"
          description="Suivez l'achat, l'activation et les services inclus dans votre pack de lancement restaurant."
          icon={Package}
          tone="violet"
          visualLabel="Pack"
          stats={[
            { label: "Packs disponibles", value: packs?.length || 0, icon: Package },
            { label: "Statut", value: restaurantPack ? getPurchaseStatusLabel(restaurantPack.status) : "Aucun", icon: CheckCircle2 },
            { label: "Services", value: fulfillments.length, icon: Rocket },
          ]}
        />

        {/* Payment status banners */}
        {paymentStatus === "success" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-800 text-sm">Paiement confirme !</p>
              <p className="text-xs text-green-700 mt-0.5">
                Votre pack a ete active. Notre equipe vous contactera sous 48h.
              </p>
            </div>
          </div>
        )}
        {paymentStatus === "cancelled" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Paiement annule</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Vous pouvez re-essayer en selectionnant un pack ci-dessous.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !restaurantPack ? (
          <EmptyState onSelectPack={handleSelectPack} />
        ) : (
          <div className="space-y-6">
            {/* Pack overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {restaurantPack.launch_packs.name}
                  </CardTitle>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      restaurantPack.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : restaurantPack.status === "in_progress"
                        ? "bg-amber-100 text-amber-700"
                        : restaurantPack.status === "paid"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {getPurchaseStatusLabel(restaurantPack.status)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {restaurantPack.launch_packs.description && (
                  <p className="text-sm text-muted-foreground">
                    {restaurantPack.launch_packs.description}
                  </p>
                )}

                {/* Progress bar */}
                {fulfillments.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progression</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fulfillments.filter((f) => f.status === "completed").length} /{" "}
                      {fulfillments.length} services termines
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service fulfillments */}
            {fulfillments.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Services inclus</h2>
                <div className="grid gap-3">
                  {fulfillments.map((f) => (
                    <FulfillmentCard
                      key={f.id}
                      f={f}
                      service={(restaurantPack.launch_packs.services as PackService[]).find(
                        (service) => service.service === f.service_slug,
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Support link */}
            <Card>
              <CardContent className="flex items-center justify-between py-4">
                <p className="text-sm text-muted-foreground">
                  Une question sur votre pack ?
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/dashboard/support">Contacter le support</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Checkout dialog */}
        <CheckoutDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          selectedPack={selectedPack}
          onCheckout={handleCheckout}
          checkingOut={checkingOut}
        />
      </div>
    </DashboardLayout>
  );
}

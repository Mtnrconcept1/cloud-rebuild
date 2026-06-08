import { Check, X, Rocket, ChevronDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import { useLaunchPacks } from "@/hooks/useLaunchPack";
import {
  getServiceIcon,
  formatServiceDetail,
  formatLaunchPackAiQuota,
  type LaunchPack,
  type PackService,
  type LaunchPackServiceSlug,
} from "@/lib/launchPacks";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/integrations/supabase/client";
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { invokeSupabaseFunction } from "@/lib/session";
import { toast } from "sonner";
import PaymentMethodSelector from "@/components/cart/PaymentMethodSelector";
import type { PaymentMethodId } from "@/lib/paymentMethods";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const supabase = getSupabase();

// All possible services for comparison table
const ALL_SERVICES: { slug: LaunchPackServiceSlug; label: string }[] = [
  { slug: "mise_en_place", label: "Mise en place" },
  { slug: "menu_creation", label: "Création de menu" },
  { slug: "product_photography", label: "Photos produits" },
  { slug: "social_media_setup", label: "Réseaux sociaux" },
  { slug: "advertising_campaign", label: "Campagne publicitaire" },
  { slug: "floor_plan_design", label: "Plan de salle" },
  { slug: "ai_review_replies", label: "Réponses IA aux avis" },
  { slug: "account_manager", label: "Account manager dédié" },
];

const FAQ_ITEMS = [
  {
    q: "Quand les services sont-ils délivrés ?",
    a: "Après votre inscription et le paiement du pack, notre équipe vous contacte sous 48h pour planifier chaque service. La mise en place et la création de menu sont généralement réalisées dans la première semaine.",
  },
  {
    q: "Puis-je changer de pack après achat ?",
    a: "Oui, vous pouvez passer à un pack supérieur à tout moment. La différence de prix sera calculée et vous sera facturée. Le downgrade n'est pas possible une fois les services commencés.",
  },
  {
    q: "Comment fonctionnent les photos incluses dans les packs premium ?",
    a: "Les packs premium n'incluent pas de photographe sur place. Ils comprennent un outil de retouche automatique TOK : vous importez vos photos de plats, puis le studio les améliore en visuels premium prêts à publier.",
  },
  {
    q: "Comment fonctionne le budget publicitaire inclus ?",
    a: "Le budget est utilisé pour des campagnes sponsorisées sur la plateforme Tok (placement en avant, bannières, notifications push). Notre équipe marketing crée et gère les campagnes pour vous.",
  },
  {
    q: "Le paiement est-il unique ou récurrent ?",
    a: "Le paiement est unique. Il n'y a aucun abonnement ni frais caché. Les services inclus dans votre pack sont délivrés une seule fois lors de votre lancement.",
  },
];

const ALLOWED_PAYMENT_METHODS: PaymentMethodId[] = [
  "card",
  "twint",
];

type Restaurant = { id: string; name: string };

function PackCard({
  pack,
  featured,
  onSelect,
  loading,
}: {
  pack: LaunchPack;
  featured: boolean;
  onSelect: (pack: LaunchPack) => void;
  loading: boolean;
}) {
  const aiQuota = formatLaunchPackAiQuota(pack);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        featured
          ? "border-primary shadow-lg ring-2 ring-primary/20 scale-[1.02]"
          : "border-border shadow-sm hover:shadow-md"
      } bg-card transition-all`}
    >
      {pack.badge_label && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          {pack.badge_label}
        </div>
      )}

      <div className="space-y-4 flex-1">
        <h3 className="text-xl font-bold">{pack.name}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {pack.description}
        </p>

        <div className="pt-2">
          <span className="text-4xl font-bold">{pack.price_chf.toLocaleString("fr-CH")}</span>
          <span className="text-muted-foreground ml-1">CHF</span>
          <p className="text-xs text-muted-foreground mt-1">Paiement unique</p>
        </div>

        {aiQuota ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            Credits IA inclus: {aiQuota}
          </div>
        ) : null}

        <ul className="space-y-3 pt-4">
          {(pack.services as PackService[]).map((svc) => {
            const Icon = getServiceIcon(svc.service);
            const detail = formatServiceDetail(svc);
            return (
              <li key={svc.service} className="flex items-start gap-3">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-green-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{svc.label}</span>
                  </div>
                  {detail && (
                    <p className="text-xs text-muted-foreground ml-6">{detail}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="pt-6">
        <Button
          className="w-full"
          variant={featured ? "default" : "outline"}
          onClick={() => onSelect(pack)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Choisir ce pack
        </Button>
      </div>
    </div>
  );
}

function ComparisonTable({ packs }: { packs: LaunchPack[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-muted-foreground">Service</th>
            {packs.map((pack) => (
              <th key={pack.id} className="text-center py-3 px-4 font-semibold">
                {pack.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_SERVICES.map((svc) => (
            <tr key={svc.slug} className="border-b last:border-0">
              <td className="py-3 px-4 font-medium">{svc.label}</td>
              {packs.map((pack) => {
                const found = (pack.services as PackService[]).find(
                  (s) => s.service === svc.slug
                );
                return (
                  <td key={pack.id} className="text-center py-3 px-4">
                    {found ? (
                      <div className="flex flex-col items-center gap-1">
                        <Check className="h-5 w-5 text-green-500" />
                        {formatServiceDetail(found) && (
                          <span className="text-xs text-muted-foreground">
                            {formatServiceDetail(found)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <X className="h-5 w-5 text-gray-300 mx-auto" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-b">
            <td className="py-3 px-4 font-medium">Credits IA</td>
            {packs.map((pack) => (
              <td key={pack.id} className="text-center py-3 px-4 text-xs text-muted-foreground">
                {formatLaunchPackAiQuota(pack) || "-"}
              </td>
            ))}
          </tr>
          <tr className="border-t-2 font-bold">
            <td className="py-3 px-4">Prix</td>
            {packs.map((pack) => (
              <td key={pack.id} className="text-center py-3 px-4">
                {pack.price_chf.toLocaleString("fr-CH")} CHF
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} className="border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left font-medium hover:bg-muted/50 transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            {item.q}
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${
                openIndex === i ? "rotate-180" : ""
              }`}
            />
          </button>
          {openIndex === i && (
            <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CheckoutDialog({
  open,
  onOpenChange,
  selectedPack,
  restaurants,
  onCheckout,
  checkingOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPack: LaunchPack | null;
  restaurants: Restaurant[];
  onCheckout: (restaurantId: string, paymentMethod: PaymentMethodId) => void;
  checkingOut: boolean;
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [selectedRestaurant, setSelectedRestaurant] = useState(restaurants[0]?.id || "");

  useEffect(() => {
    if (restaurants.length > 0 && !selectedRestaurant) {
      setSelectedRestaurant(restaurants[0].id);
    }
  }, [restaurants, selectedRestaurant]);

  if (!selectedPack) return null;
  const aiQuota = formatLaunchPackAiQuota(selectedPack);

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
          {/* Restaurant selector */}
          {restaurants.length > 1 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Restaurant</label>
              <select
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
            {aiQuota ? (
              <p className="rounded-lg bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
                Credits IA inclus: {aiQuota}
              </p>
            ) : null}
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
              onClick={() => onCheckout(selectedRestaurant, paymentMethod)}
              disabled={checkingOut || !selectedRestaurant}
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

function SuccessBanner() {
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-start gap-4">
      <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="font-semibold text-green-800">Paiement confirmé !</h3>
        <p className="text-sm text-green-700 mt-1">
          Votre pack de lancement a été activé avec succès. Notre équipe vous contactera
          sous 48h pour planifier les services. Vous pouvez suivre l'avancement dans votre{" "}
          <Link to="/dashboard/pack" className="underline font-medium">
            dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function CancelledBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
      <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="font-semibold text-amber-800">Paiement annulé</h3>
        <p className="text-sm text-amber-700 mt-1">
          Le paiement a été annulé. Vous pouvez réessayer à tout moment en sélectionnant un pack ci-dessous.
        </p>
      </div>
    </div>
  );
}

export default function PacksRestaurateur() {
  const { data: packs, isLoading } = useLaunchPacks();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedPack, setSelectedPack] = useState<LaunchPack | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const paymentStatus = searchParams.get("status");

  // Fetch user's restaurants if authenticated
  useEffect(() => {
    if (!user?.id) {
      setRestaurants([]);
      return;
    }
    supabase
      .from("restaurants")
      .select("id, name")
      .eq("owner_id", user.id)
      .then(({ data }) => setRestaurants((data as Restaurant[]) || []));
  }, [user?.id]);

  function handleSelectPack(pack: LaunchPack) {
    if (!user) {
      // Not authenticated — redirect to auth
      window.location.href = "/auth";
      return;
    }
    if (restaurants.length === 0) {
      toast.error("Vous devez d'abord créer un restaurant pour acheter un pack.");
      return;
    }
    setSelectedPack(pack);
    setDialogOpen(true);
  }

  async function handleCheckout(restaurantId: string, paymentMethod: PaymentMethodId) {
    if (!selectedPack) return;
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
          return_url: buildCheckoutReturnUrl("/packs-restaurateur"),
          order_metadata: {
            checkout_kind: "launch-pack",
            pack_id: selectedPack.id,
            restaurant_id: restaurantId,
          },
        },
      });

      if (checkoutError || !checkoutData?.url) {
        throw new Error(
          (checkoutError as Error | null)?.message || "Impossible de créer la session de paiement."
        );
      }

      window.location.href = checkoutData.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(
        error instanceof Error ? error.message : "Erreur lors de la création du paiement."
      );
      setCheckingOut(false);
    }
  }

  return (
    <div className="container py-12 md:py-20 space-y-20">
      {/* Payment status banners */}
      {paymentStatus === "success" && <SuccessBanner />}
      {paymentStatus === "cancelled" && <CancelledBanner />}

      {/* Hero */}
      <div className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-medium text-sm">
          <Rocket className="h-4 w-4" /> Offres de lancement
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold">
          Lancez votre restaurant sur Tok
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
          Choisissez le pack qui correspond à vos besoins. Mise en place, photos
          professionnelles, campagnes publicitaires — on s'occupe de tout pour
          que votre lancement soit un succès.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <a href="#packs-restaurateur">Comparer les packs</a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/contact?subject=demo-restaurateur">Demander une démo</Link>
          </Button>
        </div>
      </div>

      {/* Pack cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : packs && packs.length > 0 ? (
        <>
          <section id="packs-restaurateur" className="grid scroll-mt-28 grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                featured={pack.slug === "pro"}
                onSelect={handleSelectPack}
                loading={checkingOut && selectedPack?.id === pack.id}
              />
            ))}
          </section>

          {/* Comparison table */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center">
              Comparaison détaillée
            </h2>
            <div className="border rounded-2xl bg-card overflow-hidden">
              <ComparisonTable packs={packs} />
            </div>
          </section>
        </>
      ) : (
        <p className="text-center text-muted-foreground">
          Aucun pack disponible pour le moment.
        </p>
      )}

      {/* CTA */}
      <section className="text-center space-y-6 py-12 px-8 rounded-3xl bg-primary/5">
        <h2 className="text-3xl font-bold">Prêt à vous lancer ?</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Rejoignez les restaurateurs qui font confiance à TOK.
          Comparez les packs, demandez une démo ou créez votre compte restaurateur.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <Link to="/auth">Créer mon compte restaurateur</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/contact?subject=demo-restaurateur">Demander une démo</Link>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-8">
        <h2 className="text-3xl font-bold text-center">
          Questions fréquentes
        </h2>
        <FaqSection />
      </section>

      {/* Checkout dialog */}
      <CheckoutDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedPack={selectedPack}
        restaurants={restaurants}
        onCheckout={handleCheckout}
        checkingOut={checkingOut}
      />
    </div>
  );
}

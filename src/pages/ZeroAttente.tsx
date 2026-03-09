import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Timer, Utensils, Clock, CheckCircle2, ChevronLeft,
  Armchair, ChefHat, Zap, ArrowRight, Plus, Minus, Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FeatureWizard, WizardBackButton, WizardNextButton } from "@/components/FeatureWizard";
import ReservationDetailModal from "@/components/ReservationDetailModal";

type Step = "info" | "restaurant" | "menu" | "confirm";

export default function ZeroAttente() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelectedRestaurantId = searchParams.get("restaurant");
  const [step, setStep] = useState<Step>("info");
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [arrivalTime, setArrivalTime] = useState("19:30");
  const [partySize, setPartySize] = useState(2);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-zero-wait", preSelectedRestaurantId],
    queryFn: async () => {
      if (preSelectedRestaurantId) {
        const { data: specific } = await supabase.from("restaurants").select("*").eq("id", preSelectedRestaurantId).single();
        const { data: others } = await supabase.from("restaurants").select("*").eq("is_active", true).neq("id", preSelectedRestaurantId).order("rating", { ascending: false }).limit(8);
        return specific ? [specific, ...(others || [])] : (others || []);
      }
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(9);
      return data || [];
    },
  });

  useEffect(() => {
    if (preSelectedRestaurantId && restaurants && !selectedRestaurant) {
      const found = restaurants.find((r: any) => r.id === preSelectedRestaurantId);
      if (found) setSelectedRestaurant(found);
    }
  }, [preSelectedRestaurantId, restaurants, selectedRestaurant]);

  const { data: menuItems } = useQuery({
    queryKey: ["menu-zero-wait", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", selectedRestaurant.id).eq("is_available", true).order("category");
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  const updateQty = (id: string, d: number) => setQuantities((p) => {
    const n = Math.max(0, (p[id] || 0) + d);
    if (n === 0) { const { [id]: _, ...r } = p; return r; }
    return { ...p, [id]: n };
  });

  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => {
    const it = menuItems.find((m: any) => m.id === id);
    return s + (it ? Number(it.price) * q : 0);
  }, 0) : 0;

  const categories = menuItems ? [...new Set(menuItems.map((i: any) => i.category || "Autres"))] as string[] : [];

  const handleConfirmReservation = async () => {
    if (!user) {
      toast({ title: "Connectez-vous", description: "Vous devez être connecté pour réserver.", variant: "destructive" });
      return;
    }
    if (!selectedRestaurant || !menuItems) return;

    setLoading(true);

    const preorderItems = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menuItems.find((m: any) => m.id === id);
        return {
          menu_item_id: id,
          name: item?.name || "",
          quantity: qty,
          unit_price: Number(item?.price || 0),
          total_price: Number(item?.price || 0) * qty,
        };
      });

    const { data, error } = await (supabase.rpc as any)("validate_and_create_reservation", {
      p_restaurant_id: selectedRestaurant.id,
      p_date: arrivalDate,
      p_time: arrivalTime,
      p_party_size: partySize,
      p_feature: "zero-attente",
      p_metadata: {
        feature: "zero-attente",
        preorder_items: preorderItems,
        total_amount: subtotal,
        arrival_date: arrivalDate,
        arrival_time: arrivalTime,
      },
      p_notes: `[Zéro Attente] ${count} plat(s) précommandé(s) - Total: ${subtotal.toFixed(2)} CHF`,
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setReservationId(data);
      setStep("confirm");
    }
  };

  const handleGoToReservations = () => {
    setShowDetailModal(true);
  };

  const preorderItemsForModal = menuItems ? Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const item = menuItems.find((m: any) => m.id === id);
      return {
        name: item?.name || "",
        quantity: qty,
        unit_price: Number(item?.price || 0),
        total_price: Number(item?.price || 0) * qty,
      };
    }) : [];

  const detailForModal = reservationId ? {
    id: reservationId,
    date: arrivalDate,
    time: arrivalTime,
    party_size: partySize,
    status: "pending",
    feature: "zero-attente",
    notes: `[Zéro Attente] ${count} plat(s) précommandé(s) - Total: ${subtotal.toFixed(2)} CHF`,
    total_amount: subtotal,
    created_at: new Date().toISOString(),
    metadata: { feature: "zero-attente" } as any,
    preorder_items: preorderItemsForModal as any,
    restaurant_name: selectedRestaurant?.name || "",
  } : null;

  return (
    <>
    <FeatureWizard
      title="Zéro attente"
      subtitle="Réservez, précommandez, arrivez et c'est servi"
      icon={Timer}
      colorClass="indigo-500"
      steps={([
        { id: "info", label: "Heure" },
        { id: "restaurant", label: "Restaurant" },
        { id: "menu", label: "Menu" },
        { id: "confirm", label: "Confirmer" },
      ] as const).filter(s => s.id !== "restaurant" || !preSelectedRestaurantId)}
      currentStepId={step}
      onStepChange={(id) => setStep(id as Step)}
    >
      <div className="space-y-8">
        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { icon: Armchair, title: "Réservez", desc: "Choisissez votre heure", color: "indigo" },
            { icon: Utensils, title: "Précommandez", desc: "Sélectionnez vos plats", color: "indigo" },
            { icon: ChefHat, title: "Synchronisé", desc: "Le chef lance selon votre ETA", color: "indigo" },
            { icon: Zap, title: "0 attente", desc: "Arrivez, asseyez-vous, dégustez", color: "indigo" },
          ].map((item, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 text-center space-y-2 relative">
              <item.icon className="h-6 w-6 text-indigo-500 mx-auto" />
              <h3 className="font-semibold text-sm">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
              {i < 3 && <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />}
            </div>
          ))}
        </div>

        {step === "info" && (
          <div className="rounded-xl border bg-card p-5 space-y-4 animate-in fade-in-50">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500" />
              Date, heure et convives
            </h2>
            <div className="grid gap-3 sm:grid-cols-[160px_120px_100px] items-center">
              <Input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              <Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className="w-32" />
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} className="w-20" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Le chef démarrera la préparation automatiquement selon votre ETA</p>
            <WizardNextButton
              onClick={() => {
                if (preSelectedRestaurantId && selectedRestaurant) setStep("menu");
                else setStep("restaurant");
              }}
              label={preSelectedRestaurantId && selectedRestaurant ? `Réserver chez ${selectedRestaurant.name}` : "Choisir un restaurant"}
              colorClass="indigo-500"
            />
          </div>
        )}

        {step === "restaurant" && (
          <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
            <WizardBackButton onClick={() => setStep("info")} label="Heure" />
            <div className="rounded-lg bg-indigo-500/5 p-3 flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-indigo-500" />
              <span>Arrivée le <strong>{arrivalDate}</strong> à <strong>{arrivalTime}</strong> · <strong>{partySize}</strong> convive(s)</span>
            </div>
            <h2 className="font-display text-xl font-semibold">Restaurants compatibles Zéro Attente</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants?.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRestaurant(r); setQuantities({}); setStep("menu"); }}
                  className="text-left rounded-xl border-2 overflow-hidden hover:border-indigo-500/30 border-border transition-all"
                >
                  <img src={r.image_url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=200&fit=crop"} alt={r.name} className="w-full h-32 object-cover" />
                  <div className="p-3">
                    <p className="font-bold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p>
                    <Badge variant="outline" className="mt-1 text-[10px] gap-1"><Timer className="h-2.5 w-2.5" />Zéro attente</Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
            <WizardBackButton
              onClick={() => setStep(preSelectedRestaurantId && selectedRestaurant ? "info" : "restaurant")}
              label={preSelectedRestaurantId && selectedRestaurant ? "Heure" : "Restaurant"}
            />
            <div className="rounded-lg bg-indigo-500/5 p-3 text-sm flex items-center gap-2">
              <Timer className="h-4 w-4 text-indigo-500" />
              Arrivée {arrivalDate} {arrivalTime} · {partySize} convive(s) · {selectedRestaurant?.name}
            </div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                {menuItems?.filter((i: any) => (i.category || "Autres") === cat).map((item: any) => {
                  const q = quantities[item.id] || 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {q > 0 && <>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold">{q}</span>
                        </>}
                        <Button size="icon" variant={q > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {count > 0 && (
              <div className="sticky bottom-4 rounded-xl border bg-card/90 backdrop-blur-xl p-4 shadow-lg space-y-2 mt-8 animate-in slide-in-from-bottom-4">
                <div className="flex justify-between text-sm">
                  <span>{count} article{count > 1 ? "s" : ""} · {partySize} convive(s)</span>
                  <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-indigo-600">
                  <ChefHat className="h-3 w-3" />
                  <span>Le chef synchronisera la préparation avec votre arrivée le {arrivalDate} à {arrivalTime}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>{subtotal.toFixed(2)} CHF</span>
                </div>
                <Button onClick={handleConfirmReservation} disabled={loading} className="w-full bg-indigo-500 hover:opacity-90 gap-2 mt-2">
                  {loading ? "Réservation en cours..." : "Confirmer la réservation"}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8">
            <div className="rounded-2xl bg-indigo-500/5 border border-indigo-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-indigo-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Réservation confirmée !</h2>
              <p className="text-sm text-muted-foreground">Votre table et vos plats précommandés sont réservés.</p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restaurant</span>
                <span className="font-medium">{selectedRestaurant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Arrivée prévue</span>
                <span className="font-medium">{arrivalDate} {arrivalTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Convives</span>
                <span className="font-medium">{partySize}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Articles précommandés</span>
                <span className="font-medium">{count} plat{count > 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
              </div>
            </div>
            <div className="rounded-lg bg-indigo-500/5 p-3 flex items-center gap-2 text-sm text-indigo-600">
              <ChefHat className="h-4 w-4" />
              <span>Le chef sera synchronisé avec votre arrivée</span>
            </div>
            <WizardNextButton
              onClick={handleGoToReservations}
              label="Voir mes réservations"
              colorClass="indigo-500"
            />
          </div>
        )}
      </div>
    </FeatureWizard>
    <ReservationDetailModal
      reservation={detailForModal}
      open={showDetailModal}
      onOpenChange={(open) => {
        setShowDetailModal(open);
        if (!open) navigate("/reservations");
      }}
    />
    </>
  );
}

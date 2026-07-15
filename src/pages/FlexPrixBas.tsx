import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingDown, Clock, Leaf, Zap, CheckCircle2,
  Timer, Coins, ChevronRight, ChevronLeft, ShoppingCart,
  Plus, Minus, Shield, Gift,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PUBLIC_MENU_ITEMS_LIMIT } from "@/lib/queryLimits";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientMenuItems, getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();

const FLEX_WINDOWS = [
  { id: "short", label: "Offre 1h", start: "19:00", end: "20:00", savings: 15, co2Saved: 8 },
  { id: "medium", label: "Offre 1h30", start: "19:00", end: "20:30", savings: 25, co2Saved: 15 },
  { id: "large", label: "Offre 2h", start: "18:30", end: "20:30", savings: 35, co2Saved: 22 },
  { id: "max", label: "Offre Max", start: "18:00", end: "21:00", savings: 45, co2Saved: 30 },
];

const FLASH_DEALS = [
  {
    id: "poke",
    name: "Poke Bowl Fraîcheur",
    original: 18.50,
    discounted: 9.90,
    image: "/images/poke-bowls.jpeg",
    tag: "Prix Coûtant"
  },
  {
    id: "burger",
    name: "Burger Gourmet Deluxe",
    original: 22.00,
    discounted: 12.00,
    image: "/images/smash-burgers.jpeg",
    tag: "Populaire"
  },
  {
    id: "sushi",
    name: "Plateau Sushi Premium",
    original: 35.00,
    discounted: 19.00,
    image: "/images/poke-bowls.jpeg",
    tag: "Édition Limitée"
  },
];

type Step = "window" | "restaurant" | "menu" | "confirm";

export default function FlexPrixBas() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("window");
  const [selectedWindow, setSelectedWindow] = useState<typeof FLEX_WINDOWS[0] | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants-flex"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("is_active", true).eq("delivery_available", true).order("rating", { ascending: false }).limit(9);
      return data || [];
    },
    enabled: !isCommercialDemoClient,
  });
  const restaurants = isCommercialDemoClient && commercialDemoFrame
    ? getCommercialDemoClientRestaurants(commercialDemoFrame.snapshot)
    : restaurantsQuery.data;

  const menuItemsQuery = useQuery({
    queryKey: ["menu-flex", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", selectedRestaurant.id).eq("is_available", true).order("category").limit(PUBLIC_MENU_ITEMS_LIMIT);
      return data || [];
    },
    enabled: Boolean(selectedRestaurant && !isCommercialDemoClient),
  });
  const menuItems = isCommercialDemoClient && commercialDemoFrame
    ? getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, selectedRestaurant?.id)
    : menuItemsQuery.data;

  const updateQty = (id: string, d: number) => setQuantities((p) => { const n = Math.max(0, (p[id] || 0) + d); if (n === 0) { const { [id]: _, ...r } = p; return r; } return { ...p, [id]: n }; });
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => { const it = menuItems.find((m) => m.id === id); return s + (it ? Number(it.price) * q : 0); }, 0) : 0;
  const discount = selectedWindow ? subtotal * (selectedWindow.savings / 100) : 0;
  const finalTotal = subtotal - discount;

  const handleAddToCart = () => {
    if (!selectedRestaurant || !menuItems || !selectedWindow) return;
    clearCart();
    setOrderMode("delivery");

    // Save Flex window and savings to cart metadata
    updateCartMetadata({
      feature: "flex-prix-bas",
      window: selectedWindow,
      savingsPercent: selectedWindow.savings
    });

    const factor = 1 - selectedWindow.savings / 100;
    Object.entries(quantities).forEach(([id, qty]) => {
      const item = menuItems.find((m) => m.id === id);
      if (item && qty > 0) for (let i = 0; i < qty; i++) addItem({ menuItemId: item.id, name: item.name, price: Math.round(Number(item.price) * factor * 100) / 100, restaurantId: selectedRestaurant.id, restaurantName: selectedRestaurant.name });
    });
    setStep("confirm");
  };

  const handleCheckout = () => {
    toast({ title: "Offres activées", description: `${selectedWindow?.label} · -${selectedWindow?.savings}% · ${selectedWindow?.start}–${selectedWindow?.end}` });
    navigate("/panier");
  };

  const categories = menuItems ? [...new Set(menuItems.map((i) => i.category || "Autres"))] as string[] : [];
  const stepIdx = (s: Step) => ["window", "restaurant", "menu", "confirm"].indexOf(s);

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center"><Gift className="h-6 w-6 text-emerald-500" /></div>
          <div><h1 className="font-display text-2xl font-bold">Offres</h1><p className="text-muted-foreground text-xs">Acceptez une fenêtre flexible et payez moins cher</p></div>
        </div>

        <div className="flex items-center gap-1">
          {(["window", "restaurant", "menu", "confirm"] as Step[]).map((s, i) => {
            const labels = ["Fenêtre", "Restaurant", "Menu", "Confirmer"];
            return (<div key={s} className="flex items-center gap-1 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s === step ? "bg-emerald-500 text-white" : stepIdx(s) < stepIdx(step) ? "bg-emerald-200 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>{stepIdx(s) < stepIdx(step) ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</div>
              <span className={`text-[11px] hidden sm:inline ${s === step ? "font-semibold" : "text-muted-foreground"}`}>{labels[i]}</span>
              {i < 3 && <div className="flex-1 h-0.5 bg-secondary rounded" />}
            </div>);
          })}
        </div>

        {step === "window" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-r from-emerald-500/5 to-green-500/5 border border-emerald-500/10 p-5 space-y-3">
              <h2 className="font-semibold">Comment ça marche ?</h2>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {[{ icon: Timer, t: "Fenêtre flexible", d: "1h à 3h" }, { icon: Zap, t: "Algo optimisé", d: "Meilleur moment" }, { icon: Leaf, t: "Éco-responsable", d: "Moins de CO₂" }].map((x, i) => (
                  <div key={i} className="rounded-xl border bg-card p-3 space-y-1"><x.icon className="h-5 w-5 text-emerald-500" /><p className="font-semibold text-xs">{x.t}</p><p className="text-[10px] text-muted-foreground">{x.d}</p></div>
                ))}
              </div>
            </div>

            {/* Flash Deals Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500 fill-amber-500" /> Ventes Flash à Prix Coûtant</h3>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 animate-pulse">Offres limitées</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {FLASH_DEALS.map((deal) => (
                  <div key={deal.id} className="group relative rounded-2xl border overflow-hidden bg-card hover:shadow-md transition-all cursor-pointer border-amber-200">
                    <div className="aspect-[4/3] relative">
                      <img src={deal.image} alt={deal.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                      <Badge className="absolute top-3 left-3 bg-amber-500 border-none shadow-lg">{deal.tag}</Badge>
                    </div>
                    <div className="p-3 space-y-1">
                      <h4 className="font-bold text-sm line-clamp-1">{deal.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold">{deal.discounted.toFixed(2)} CHF</span>
                        <span className="text-[10px] text-muted-foreground line-through">{deal.original.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="font-bold">1. Choisissez votre fenêtre de flexibilité</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FLEX_WINDOWS.map((win) => (
                  <button key={win.id} onClick={() => setSelectedWindow(win)} className={`text-left rounded-xl border-2 p-5 transition-all ${selectedWindow?.id === win.id ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-emerald-500/30"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className={selectedWindow?.id === win.id ? "border-emerald-500 text-emerald-600" : ""}>{win.label}</Badge>
                      <span className="text-lg font-bold text-emerald-600">-{win.savings}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2"><Clock className="h-4 w-4" /><span>{win.start} – {win.end}</span></div>
                    <div className="flex items-center gap-2 text-xs text-emerald-600"><Leaf className="h-3.5 w-3.5" /><span>-{win.co2Saved}% CO₂</span></div>
                  </button>
                ))}
              </div>
              <Button onClick={() => setStep("restaurant")} disabled={!selectedWindow} className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2">Choisir un restaurant <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}

        {step === "restaurant" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("window")} className="gap-1"><ChevronLeft className="h-4 w-4" /> Fenêtre</Button>
            <div className="rounded-lg bg-emerald-500/5 p-3 flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4 text-emerald-500" /><span>{selectedWindow?.label} · {selectedWindow?.start}–{selectedWindow?.end} · <strong className="text-emerald-600">-{selectedWindow?.savings}%</strong></span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants?.map((r: any) => (
                <button key={r.id} onClick={() => { setSelectedRestaurant(r); setQuantities({}); setStep("menu"); }} className="text-left rounded-xl border-2 overflow-hidden hover:border-emerald-500/30 border-border transition-all">
                  <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-32 object-cover" />
                  <div className="p-3"><p className="font-bold text-sm">{r.name}</p><p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p></div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("restaurant")} className="gap-1"><ChevronLeft className="h-4 w-4" /> Restaurant</Button>
            <div className="rounded-lg bg-emerald-500/5 p-3 text-sm flex items-center gap-2"><TrendingDown className="h-4 w-4 text-emerald-500" />{selectedWindow?.label} · -{selectedWindow?.savings}% · {selectedRestaurant?.name}</div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                {menuItems?.filter((i) => (i.category || "Autres") === cat).map((item) => {
                  const q = quantities[item.id] || 0;
                  const original = Number(item.price);
                  const discounted = Math.round(original * (1 - (selectedWindow?.savings || 0) / 100) * 100) / 100;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <div className="flex items-center gap-2"><span className="text-sm font-bold text-emerald-600">{discounted.toFixed(2)} CHF</span><span className="text-xs text-muted-foreground line-through">{original.toFixed(2)}</span></div>
                      </div>
                      <div className="flex items-center gap-1">
                        {q > 0 && (
                          <>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                            <span className="w-5 text-center text-sm font-semibold">{q}</span>
                          </>
                        )}
                        <Button size="icon" variant={q > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {count > 0 && (
              <div className="sticky bottom-4 rounded-xl border bg-card p-4 shadow-lg space-y-2">
                <div className="flex justify-between text-sm"><span>{count} article{count > 1 ? "s" : ""}</span><span className="text-muted-foreground line-through">{subtotal.toFixed(2)} CHF</span></div>
                <div className="flex justify-between text-sm"><span className="text-emerald-600 font-medium">Réduction Flex -{selectedWindow?.savings}%</span><span className="text-emerald-600 font-bold">-{discount.toFixed(2)} CHF</span></div>
                <div className="flex justify-between font-bold"><span>Total</span><span>{finalTotal.toFixed(2)} CHF</span></div>
                <Button onClick={handleAddToCart} className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2"><ShoppingCart className="h-4 w-4" /> Valider</Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-6 text-center space-y-2"><Gift className="h-12 w-12 text-emerald-500 mx-auto" /><h2 className="font-display text-xl font-bold">Offres activées !</h2></div>
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{selectedRestaurant?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fenêtre</span><span className="font-medium">{selectedWindow?.start}–{selectedWindow?.end}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Réduction</span><span className="font-medium text-emerald-600">-{selectedWindow?.savings}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CO₂ économisé</span><span className="font-medium text-emerald-600">-{selectedWindow?.co2Saved}%</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total</span><span className="font-bold">{finalTotal.toFixed(2)} CHF</span></div>
            </div>
            <Button onClick={handleCheckout} className="w-full bg-emerald-500 hover:bg-emerald-600 gap-2" size="lg">Procéder au paiement <ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </main>
  );
}

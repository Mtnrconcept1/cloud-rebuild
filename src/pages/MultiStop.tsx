import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import {
  MapPin, Plus, Minus, Trash2, Route, Coins, Clock,
  ChevronRight, ChevronLeft, CheckCircle2, Navigation, Share2,
  ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PUBLIC_MENU_ITEMS_LIMIT } from "@/lib/queryLimits";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { getCommercialDemoClientMenuItems, getCommercialDemoClientRestaurants } from "@/lib/commercialDemoClientCatalog";

const supabase = getSupabase();

interface DeliveryStop {
  id: string;
  label: string;
  address: string;
  recipient: string;
}

type Step = "stops" | "restaurant" | "menu" | "confirm";

export default function MultiStop() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const { addItem, clearCart, updateCartMetadata } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("stops");
  const [stops, setStops] = useState<DeliveryStop[]>([
    { id: "1", label: "Maison", address: "", recipient: "Moi" },
  ]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const restaurantsQuery = useQuery({
    queryKey: ["restaurants-multistop"],
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
    queryKey: ["menu-multistop", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", selectedRestaurant.id).eq("is_available", true).order("category").limit(PUBLIC_MENU_ITEMS_LIMIT);
      return data || [];
    },
    enabled: Boolean(selectedRestaurant && !isCommercialDemoClient),
  });
  const menuItems = isCommercialDemoClient && commercialDemoFrame
    ? getCommercialDemoClientMenuItems(commercialDemoFrame.snapshot, selectedRestaurant?.id)
    : menuItemsQuery.data;

  const addStop = () => {
    if (stops.length >= 4) return;
    const labels = ["Maison", "Ami(e)", "Parents", "Bureau"];
    setStops([...stops, { id: Date.now().toString(), label: labels[stops.length] || `Stop ${stops.length + 1}`, address: "", recipient: "" }]);
  };

  const removeStop = (id: string) => {
    if (stops.length <= 1) return;
    setStops(stops.filter((s) => s.id !== id));
  };

  const updateStop = (id: string, field: keyof DeliveryStop, value: string) => {
    setStops(stops.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const baseFee = 5.90;
  const perStopFee = 1.50;
  const totalWithoutSharing = stops.length * baseFee;
  const totalWithSharing = baseFee + (stops.length - 1) * perStopFee;
  const deliverySavings = totalWithoutSharing - totalWithSharing;

  const updateQty = (id: string, d: number) => setQuantities((p) => { const n = Math.max(0, (p[id] || 0) + d); if (n === 0) { const { [id]: _, ...r } = p; return r; } return { ...p, [id]: n }; });
  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => { const it = menuItems.find((m) => m.id === id); return s + (it ? Number(it.price) * q : 0); }, 0) : 0;

  const handleAddToCart = () => {
    if (!selectedRestaurant || !menuItems) return;
    clearCart();

    // Save stops and multi-stop flag to cart metadata
    updateCartMetadata({
      feature: "multi-stop",
      stops: stops.map(s => ({ address: s.address, label: s.label, recipient: s.recipient })),
      deliveryFee: totalWithSharing
    });

    Object.entries(quantities).forEach(([id, qty]) => {
      const item = menuItems.find((m) => m.id === id);
      if (item && qty > 0) for (let i = 0; i < qty; i++) addItem({ menuItemId: item.id, name: item.name, price: Number(item.price), restaurantId: selectedRestaurant.id, restaurantName: selectedRestaurant.name });
    });
    setStep("confirm");
  };

  const handleCheckout = () => {
    toast({ title: "Multi-stop confirmé", description: `${stops.length} adresses · ${totalWithSharing.toFixed(2)} CHF livraison` });
    navigate("/panier");
  };

  const categories = menuItems ? [...new Set(menuItems.map((i) => i.category || "Autres"))] as string[] : [];
  const allAddressesFilled = stops.every((s) => s.address.trim().length > 0);

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center"><Route className="h-6 w-6 text-orange-500" /></div>
          <div><h1 className="font-display text-2xl font-bold">Multi-stop</h1><p className="text-muted-foreground text-xs">Un trajet, plusieurs livraisons</p></div>
        </div>

        {step === "stops" && (<div className="space-y-4">
          <div className="rounded-xl bg-orange-500/5 border border-orange-500/10 p-4">
            <div className="flex items-start gap-3"><Navigation className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" /><p className="text-sm text-muted-foreground">Commandez pour plusieurs adresses en un seul parcours. L'itinéraire est optimisé et les frais partagés.</p></div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Adresses de livraison</h2>
            <Badge variant="outline">{stops.length}/4 stops</Badge>
          </div>

          <div className="space-y-3">
            {stops.map((stop, index) => (
              <div key={stop.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold">{index + 1}</div>
                    <Input value={stop.label} onChange={(e) => updateStop(stop.id, "label", e.target.value)} className="w-24 h-7 text-xs font-semibold border-dashed" />
                  </div>
                  {stops.length > 1 && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeStop(stop.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
                <div>
                  {isCommercialDemoClient ? (
                    <Input
                      value={stop.address}
                      onChange={(event) => updateStop(stop.id, "address", event.target.value)}
                      placeholder="Adresse de livraison démo..."
                      className="text-sm"
                    />
                  ) : (
                    <AddressAutocomplete
                      value={stop.address}
                      onValueChange={(value) => updateStop(stop.id, "address", value)}
                      onAddressSelect={(address) => updateStop(stop.id, "address", address)}
                      placeholder="Adresse de livraison..."
                      inputClassName="text-sm"
                    />
                  )}
                </div>
                <Input value={stop.recipient} onChange={(e) => updateStop(stop.id, "recipient", e.target.value)} placeholder="Destinataire..." className="text-sm" />
              </div>
            ))}
          </div>

          {stops.length < 4 && <Button variant="outline" onClick={addStop} className="w-full border-dashed gap-2"><Plus className="h-4 w-4" />Ajouter une adresse</Button>}

          {stops.length > 1 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold flex items-center gap-2"><Coins className="h-4 w-4 text-orange-500" />Frais de livraison</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Séparées ({stops.length} x {baseFee.toFixed(2)} CHF)</span><span className="line-through">{totalWithoutSharing.toFixed(2)} CHF</span></div>
                <div className="flex justify-between font-medium"><span>Multi-stop optimisé</span><span>{totalWithSharing.toFixed(2)} CHF</span></div>
                <div className="flex justify-between text-green-600 font-bold border-t pt-2"><span>Économies</span><span>{deliverySavings.toFixed(2)} CHF</span></div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /><span>Temps estimé : {10 + stops.length * 8} min</span></div>
            </div>
          )}

          <Button onClick={() => setStep("restaurant")} disabled={!allAddressesFilled} className="w-full bg-orange-500 hover:bg-orange-600 gap-2">Choisir un restaurant <ChevronRight className="h-4 w-4" /></Button>
        </div>)}

        {step === "restaurant" && (<div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("stops")} className="gap-1"><ChevronLeft className="h-4 w-4" /> Adresses</Button>
          <div className="rounded-lg bg-orange-500/5 p-3 flex items-center gap-2 text-sm"><Route className="h-4 w-4 text-orange-500" /><span>{stops.length} adresses · Livraison {totalWithSharing.toFixed(2)} CHF</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {restaurants?.map((r: any) => (
              <button key={r.id} onClick={() => { setSelectedRestaurant(r); setQuantities({}); setStep("menu"); }} className="text-left rounded-xl border-2 overflow-hidden hover:border-orange-500/30 border-border transition-all">
                <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-32 object-cover" />
                <div className="p-3"><p className="font-bold text-sm">{r.name}</p><p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p></div>
              </button>
            ))}
          </div>
        </div>)}

        {step === "menu" && (<div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("restaurant")} className="gap-1"><ChevronLeft className="h-4 w-4" /> Restaurant</Button>
          <div className="rounded-lg bg-orange-500/5 p-3 text-sm flex items-center gap-2"><Route className="h-4 w-4 text-orange-500" />{stops.length} stops · {selectedRestaurant?.name}</div>
          {categories.map((cat) => (<div key={cat} className="space-y-2">
            <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
            {menuItems?.filter((i) => (i.category || "Autres") === cat).map((item) => {
              const q = quantities[item.id] || 0; return (
                <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                  {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm">{item.name}</p>{item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}<p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p></div>
                  <div className="flex items-center gap-1">{q > 0 && <><Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button><span className="w-5 text-center text-sm font-semibold">{q}</span></>}<Button size="icon" variant={q > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button></div>
                </div>
              );
            })}
          </div>))}
          {count > 0 && <div className="sticky bottom-4 rounded-xl border bg-card p-4 shadow-lg space-y-2">
            <div className="flex justify-between text-sm"><span>{count} article{count > 1 ? "s" : ""}</span><span className="font-bold">{subtotal.toFixed(2)} CHF</span></div>
            <div className="flex justify-between text-xs text-muted-foreground"><span>Livraison multi-stop ({stops.length} adresses)</span><span>{totalWithSharing.toFixed(2)} CHF</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{(subtotal + totalWithSharing).toFixed(2)} CHF</span></div>
            <Button onClick={handleAddToCart} className="w-full bg-orange-500 hover:bg-orange-600 gap-2"><ShoppingCart className="h-4 w-4" /> Valider</Button>
          </div>}
        </div>)}

        {step === "confirm" && (<div className="space-y-6">
          <div className="rounded-2xl bg-orange-500/5 border border-orange-500/20 p-6 text-center space-y-2"><CheckCircle2 className="h-12 w-12 text-orange-500 mx-auto" /><h2 className="font-display text-xl font-bold">Multi-stop confirmé !</h2></div>
          <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{selectedRestaurant?.name}</span></div>
            {stops.map((s, i) => <div key={s.id} className="flex justify-between"><span className="text-muted-foreground">Stop {i + 1} – {s.label}</span><span className="font-medium">{s.address}</span></div>)}
            <div className="flex justify-between"><span className="text-muted-foreground">Livraison</span><span className="font-medium">{totalWithSharing.toFixed(2)} CHF</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total</span><span className="font-bold">{(subtotal + totalWithSharing).toFixed(2)} CHF</span></div>
          </div>
          <Button onClick={handleCheckout} className="w-full bg-orange-500 hover:bg-orange-600 gap-2" size="lg">Procéder au paiement <ChevronRight className="h-4 w-4" /></Button>
        </div>)}
      </div>
    </main>
  );
}

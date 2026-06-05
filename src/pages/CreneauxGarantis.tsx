import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Clock, Shield, ChevronRight, ChevronLeft, Zap,
  CreditCard, CheckCircle2, Timer, Plus, Minus, ShoppingCart,
  CalendarIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { PUBLIC_MENU_ITEMS_LIMIT } from "@/lib/queryLimits";

const supabase = getSupabase();

interface GuaranteeLevel {
  id: string;
  label: string;
  windowMinutes: number;
  description: string;
  compensation: string;
  premium: number;
  popular?: boolean;
}

const GUARANTEE_LEVELS: GuaranteeLevel[] = [
  {
    id: "ultra",
    label: "Ultra précis",
    windowMinutes: 15,
    description: "Livraison dans une fenêtre de 15 minutes autour de l'heure choisie",
    compensation: "100% remboursé si hors fenêtre",
    premium: 0,
    popular: true,
  },
  {
    id: "standard",
    label: "Standard",
    windowMinutes: 30,
    description: "Livraison dans une fenêtre de 30 minutes autour de l'heure choisie",
    compensation: "5 CHF de crédit si hors fenêtre",
    premium: 0,
  },
  {
    id: "relaxed",
    label: "Flexible",
    windowMinutes: 60,
    description: "Livraison dans une fenêtre de 60 minutes autour de l'heure choisie",
    compensation: "2 CHF de crédit si hors fenêtre",
    premium: 0,
  },
];

function computeWindow(time: string, windowMinutes: number) {
  const [h, m] = time.split(":").map(Number);
  const totalMin = h * 60 + m;
  const half = Math.floor(windowMinutes / 2);
  const startMin = Math.max(0, totalMin - half);
  const endMin = Math.min(23 * 60 + 59, totalMin + half);
  const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${fmt(startMin)} – ${fmt(endMin)}`;
}

type Step = "when" | "restaurant" | "menu" | "confirm";

export default function CreneauxGarantis() {
  const { replaceCartItems } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("when");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<GuaranteeLevel | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const deliveryDate = date ? format(date, "yyyy-MM-dd") : "";
  const canProceedFromWhen = !!deliveryDate && !!time && !!selectedLevel;
  const windowLabel = time && selectedLevel ? computeWindow(time, selectedLevel.windowMinutes) : "";

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-guaranteed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false })
        .limit(12);
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menu-creneau", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("is_available", true)
        .order("category")
        .limit(PUBLIC_MENU_ITEMS_LIMIT);
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  const updateQty = (id: string, d: number) =>
    setQuantities((p) => {
      const n = Math.max(0, (p[id] || 0) + d);
      if (n === 0) {
        const { [id]: _, ...r } = p;
        return r;
      }
      return { ...p, [id]: n };
    });

  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems
    ? Object.entries(quantities).reduce((s, [id, q]) => {
        const it = menuItems.find((m) => m.id === id);
        return s + (it ? Number(it.price) * q : 0);
      }, 0)
    : 0;

  const guaranteedMetadata = {
    feature: "creneaux-garantis",
    is_guaranteed_delivery_slot: true,
    delivery_schedule_mode: "scheduled",
    delivery_date: deliveryDate,
    delivery_time: time,
    scheduled_delivery_label: deliveryDate && time ? `${deliveryDate} à ${time}` : windowLabel,
    guaranteed_delivery_window: windowLabel,
    guaranteed_delivery_level_id: selectedLevel?.id || null,
    guaranteed_delivery_level_label: selectedLevel?.label || null,
    guaranteed_delivery_window_minutes: selectedLevel?.windowMinutes || null,
    guaranteed_delivery_compensation: selectedLevel?.compensation || null,
    guaranteed_delivery_premium: selectedLevel?.premium || 0,
    guarantee: selectedLevel,
    window: windowLabel,
    date: deliveryDate,
    time,
  };

  const handleAddToCart = () => {
    if (!selectedRestaurant || !menuItems || !selectedLevel || !deliveryDate || !time) return;

    const nextItems = Object.entries(quantities)
      .map(([id, qty]) => {
        const item = menuItems.find((m) => m.id === id);
        if (!item || qty <= 0) return null;
        return {
          menuItemId: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: qty,
          restaurantId: selectedRestaurant.id,
          restaurantName: selectedRestaurant.name,
          metadata: {
            ...guaranteedMetadata,
            source_feature: "creneaux-garantis",
          },
        };
      })
      .filter(Boolean) as Array<{
        menuItemId: string;
        name: string;
        price: number;
        quantity: number;
        restaurantId: string;
        restaurantName: string;
        metadata: Record<string, unknown>;
      }>;

    if (nextItems.length === 0) return;

    replaceCartItems(nextItems, guaranteedMetadata, "delivery");
    setStep("confirm");
  };

  const handleCheckout = () => {
    toast({
      title: "Créneau garanti activé",
      description: `Livraison le ${date ? format(date, "dd/MM/yyyy") : ""} entre ${windowLabel} · ${selectedLevel?.compensation}`,
    });
    navigate("/panier");
  };

  const categories = menuItems ? [...new Set(menuItems.map((i) => i.category || "Autres"))] as string[] : [];
  const stepIdx = (s: Step) => ["when", "restaurant", "menu", "confirm"].indexOf(s);

  return (
    <main className="min-h-screen bg-background">
      <div className="container px-4 py-8 space-y-6 overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Shield className="h-6 w-6 text-blue-500" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold">Créneaux garantis</h1>
            <p className="text-muted-foreground text-xs">
              Choisissez quand vous voulez être livré — on vous garantit le créneau
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {(["when", "restaurant", "menu", "confirm"] as Step[]).map((s, i) => {
            const labels = ["Quand", "Restaurant", "Menu", "Confirmer"];
            return (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    s === step
                      ? "bg-blue-500 text-white"
                      : stepIdx(s) < stepIdx(step)
                        ? "bg-blue-200 text-blue-700"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {stepIdx(s) < stepIdx(step) ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-[11px] hidden sm:inline ${s === step ? "font-semibold" : "text-muted-foreground"}`}>
                  {labels[i]}
                </span>
                {i < 3 && <div className="flex-1 h-0.5 bg-secondary rounded" />}
              </div>
            );
          })}
        </div>

        {step === "when" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: Timer, t: "Vous choisissez l'heure", d: "Date et heure de livraison" },
                { icon: Zap, t: "On garantit le créneau", d: "Préparation synchronisée" },
                { icon: CreditCard, t: "Compensation auto", d: "Remboursé si hors fenêtre" },
              ].map((x, i) => (
                <div key={i} className="rounded-xl border bg-card p-3 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0 sm:space-y-1">
                  <x.icon className="h-5 w-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-xs">{x.t}</p>
                    <p className="text-[10px] text-muted-foreground">{x.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold">
                  <CalendarIcon className="h-4 w-4 text-blue-500" />
                  Date de livraison
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "EEEE d MMMM yyyy", { locale: fr }) : "Choisir une date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      locale={fr}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Heure souhaitée
                </Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="max-w-[200px]"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="font-semibold text-sm">Niveau de garantie</h2>
              {GUARANTEE_LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level)}
                  className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                    selectedLevel?.id === level.id
                      ? "border-blue-500 bg-blue-500/5"
                      : "border-border hover:border-blue-500/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Shield
                      className={`h-5 w-5 shrink-0 mt-0.5 ${
                        selectedLevel?.id === level.id ? "text-blue-500" : "text-muted-foreground"
                      }`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold">{level.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          ± {level.windowMinutes / 2} min
                        </Badge>
                        {level.popular && (
                          <Badge className="bg-blue-500 text-white text-[10px]">Populaire</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{level.description}</p>
                      <div className="pt-1">
                        <p className="text-sm font-semibold text-blue-600">{level.compensation}</p>
                        <p className="text-xs text-green-600 font-medium">Inclus</p>
                      </div>
                    </div>
                  </div>
                  {selectedLevel?.id === level.id && time && (
                    <div className="mt-3 pt-3 border-t text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span>
                        Fenêtre de livraison : <strong>{computeWindow(time, level.windowMinutes)}</strong>
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {canProceedFromWhen && (
              <div className="rounded-xl border bg-blue-500/5 p-4 text-sm space-y-1">
                <p>
                  <strong>Livraison le {format(date!, "EEEE d MMMM", { locale: fr })}</strong> entre{" "}
                  <strong>{windowLabel}</strong>
                </p>
                <p className="text-muted-foreground">{selectedLevel!.compensation}</p>
              </div>
            )}

            <Button
              onClick={() => setStep("restaurant")}
              disabled={!canProceedFromWhen}
              className="w-full bg-blue-500 hover:bg-blue-600 gap-2"
            >
              Choisir un restaurant
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {step === "restaurant" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("when")} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Modifier le créneau
            </Button>
            <div className="rounded-lg bg-blue-500/5 p-3 flex items-start gap-2 text-sm">
              <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span className="break-words">
                {date ? format(date, "dd/MM/yyyy") : ""} · {windowLabel} ·{" "}
                <strong>{selectedLevel?.compensation}</strong>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants?.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedRestaurant(r);
                    setQuantities({});
                    setStep("menu");
                  }}
                  className="text-left rounded-xl border-2 overflow-hidden hover:border-blue-500/30 border-border transition-all"
                >
                  <img
                    src={r.image_url || "/images/kebab-box-spread.jpeg"}
                    alt={r.name}
                    className="w-full h-32 object-cover"
                  />
                  <div className="p-3">
                    <p className="font-bold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.cuisine_type} · {r.city}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("restaurant")} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Restaurant
            </Button>
            <div className="rounded-lg bg-blue-500/5 p-3 text-sm flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span className="break-words">{windowLabel} · {selectedRestaurant?.name}</span>
            </div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                {menuItems
                  ?.filter((i) => (i.category || "Autres") === cat)
                  .map((item) => {
                    const q = quantities[item.id] || 0;
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                          )}
                          <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {q > 0 && (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateQty(item.id, -1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-5 text-center text-sm font-semibold">{q}</span>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant={q > 0 ? "outline" : "default"}
                            className="h-7 w-7"
                            onClick={() => updateQty(item.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
            {count > 0 && (
              <div className="sticky bottom-4 rounded-xl border bg-card p-4 shadow-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {count} article{count > 1 ? "s" : ""}
                  </span>
                  <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Créneau garanti</span>
                  <span>Inclus</span>
                </div>
                <Button onClick={handleAddToCart} className="w-full bg-blue-500 hover:bg-blue-600 gap-2">
                  <ShoppingCart className="h-4 w-4" /> Valider
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-blue-500/5 border border-blue-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-blue-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Commande prête !</h2>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restaurant</span>
                <span className="font-medium">{selectedRestaurant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{date ? format(date, "EEEE d MMMM", { locale: fr }) : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créneau</span>
                <span className="font-medium">{windowLabel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Garantie</span>
                <span className="font-medium text-blue-600 text-right">{selectedLevel?.compensation}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{subtotal.toFixed(2)} CHF</span>
              </div>
            </div>
            <Button
              onClick={handleCheckout}
              className="w-full bg-blue-500 hover:bg-blue-600 gap-2"
              size="lg"
            >
              Procéder au paiement
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

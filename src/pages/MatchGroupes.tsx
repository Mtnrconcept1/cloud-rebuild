import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Users, Leaf, TrendingDown, MapPin, Clock,
  ChevronRight, ChevronLeft, CheckCircle2, Sparkles, Truck,
  Plus, Minus, ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type Step = "browse" | "restaurant" | "menu" | "confirm";

export default function MatchGroupes() {
  const { addItem, clearCart, updateCartMetadata, cartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("browse");
  const [address, setAddress] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [createMode, setCreateMode] = useState(false);

  // Fetch real group orders from Supabase
  const { data: realGroups, isLoading: loadingGroups } = useQuery({
    queryKey: ["order-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_groups" as any)
        .select("*, restaurants(id, name, cuisine_type, image_url, city), group_members(count)")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-group-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false });
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menu-group", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("is_available", true)
        .order("category");
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  // Mutation to create a group
  const createGroupMutation = useMutation({
    mutationFn: async (vars: { restaurantId: string; area: string; timeSlot: string }) => {
      if (!user) throw new Error("Connection requise");
      const { data, error } = await supabase
        .from("order_groups" as any)
        .insert({
          restaurant_id: vars.restaurantId,
          creator_id: user.id,
          area: vars.area || "Genève",
          time_slot: vars.timeSlot,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["order-groups"] });
      handleJoinGroup(data);
    }
  });

  // Mutation to join a group
  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user) throw new Error("Connection requise");
      const { error } = await supabase
        .from("group_members" as any)
        .upsert({ group_id: groupId, user_id: user.id });
      if (error) throw error;
    }
  });

  const updateQty = (id: string, d: number) => setQuantities((p) => {
    const n = Math.max(0, (p[id] || 0) + d);
    if (n === 0) { const { [id]: _, ...r } = p; return r; }
    return { ...p, [id]: n };
  });

  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => {
    const it = menuItems.find((m) => m.id === id);
    return s + (it ? Number(it.price) * q : 0);
  }, 0) : 0;

  const currentGroup = (realGroups as any[])?.find((g: any) => g.id === cartMetadata.groupId);
  const savingsPercent = (currentGroup as any)?.discount_percentage || 25;
  const discount = subtotal * (savingsPercent / 100);
  const finalTotal = subtotal - discount;

  const handleJoinGroup = async (group: any) => {
    if (!user) return navigate("/auth");

    try {
      const memberCount = group.group_members?.[0]?.count || 1;
      if (memberCount >= group.max_members) {
        toast({ title: "Groupe complet", description: "Désolé, ce groupe a atteint sa capacité maximale.", variant: "destructive" });
        return;
      }

      await joinGroupMutation.mutateAsync(group.id);
      updateCartMetadata({ groupId: group.id });

      const resId = group.restaurant_id || group.restaurantId;
      const restaurant = restaurants?.find((r: any) => r.id === resId);
      if (restaurant) {
        setSelectedRestaurant(restaurant);
        setQuantities({});
        setStep("menu");
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateGroup = (r: any) => {
    if (!user) return navigate("/auth");
    createGroupMutation.mutate({
      restaurantId: r.id,
      area: address || "Ma position",
      timeSlot: "19:30 – 20:00",
    });
  };

  const handleAddToCart = () => {
    if (!selectedRestaurant || !menuItems) return;
    clearCart();
    setOrderMode("delivery");
    // Re-apply metadata since clearCart clears it
    updateCartMetadata({ groupId: cartMetadata.groupId });

    const factor = 1 - savingsPercent / 100;
    Object.entries(quantities).forEach(([id, qty]) => {
      const item = menuItems.find((m) => m.id === id);
      if (item && qty > 0) {
        for (let i = 0; i < qty; i++) {
          addItem({
            menuItemId: item.id,
            name: item.name,
            price: Math.round(Number(item.price) * factor * 100) / 100,
            restaurantId: selectedRestaurant.id,
            restaurantName: selectedRestaurant.name,
            metadata: { groupId: cartMetadata.groupId }
          });
        }
      }
    });
    setStep("confirm");
  };

  const handleCheckout = () => {
    toast({
      title: "Groupe rejoint !",
      description: `${selectedRestaurant?.name} · -${savingsPercent}%`
    });
    navigate("/panier");
  };

  const categories = menuItems ? [...new Set(menuItems.map((i) => i.category || "Autres"))] as string[] : [];

  return (
    <main className="min-h-screen bg-background">
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Match de groupes</h1>
            <p className="text-muted-foreground text-xs">Regroupez vos commandes, baissez les prix et le CO₂</p>
          </div>
        </div>

        {step === "browse" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                <TrendingDown className="h-5 w-5 text-violet-500 mx-auto mb-1" />
                <p className="text-xl font-bold">-25%</p>
                <p className="text-xs text-muted-foreground">Prix moyen</p>
              </div>
              <div className="rounded-xl bg-green-500/5 border border-green-500/10 p-4 text-center">
                <Leaf className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-xl font-bold">-45%</p>
                <p className="text-xs text-muted-foreground">CO₂ réduit</p>
              </div>
              <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-4 text-center">
                <Users className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                <p className="text-xl font-bold">{realGroups?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Groupes actifs</p>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground shrink-0" />
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Votre adresse pour trouver des groupes proches..." className="border-0 shadow-none focus-visible:ring-0" />
              </div>
            </div>

            {!createMode ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold">Groupes à proximité</h2>
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" />En direct
                  </Badge>
                </div>
                {loadingGroups ? (
                  <div className="text-center py-10 text-muted-foreground animate-pulse">Chargement des groupes...</div>
                ) : (
                  <div className="space-y-3">
                    {realGroups?.map((group: any) => {
                      const res = group.restaurants;
                      const memberCount = group.group_members?.[0]?.count || 1;
                      return (
                        <div key={group.id} className="rounded-xl border-2 overflow-hidden border-border hover:border-violet-500/30 transition-all">
                          <div className="flex gap-4 p-4">
                            <img src={res?.image_url || "/images/kebab-box-spread.jpeg"} alt={res?.name} className="w-20 h-20 rounded-lg object-cover shrink-0" />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <h3 className="font-bold">{res?.name}</h3>
                                <Badge className="bg-violet-500 text-white text-xs">-{group.discount_percentage}%</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{res?.cuisine_type}</p>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{group.area}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{group.time_slot}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(memberCount / group.max_members) * 100}%` }} />
                                </div>
                                <span className="text-xs font-medium">{memberCount}/{group.max_members}</span>
                              </div>
                            </div>
                          </div>
                          <div className="px-4 pb-4">
                            <Button
                              onClick={() => handleJoinGroup(group)}
                              variant="outline"
                              className="w-full border-violet-500 text-violet-600 hover:bg-violet-500/10 gap-2"
                              size="sm"
                              disabled={joinGroupMutation.isPending}
                            >
                              <Truck className="h-4 w-4" />Rejoindre et commander
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {realGroups?.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-xl">
                        Aucun groupe actif pour le moment.
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-2xl bg-violet-500/5 border border-violet-500/10 p-6 text-center space-y-3">
                  <Users className="h-8 w-8 text-violet-500 mx-auto" />
                  <h3 className="font-semibold text-lg">Aucun groupe ne vous convient ?</h3>
                  <p className="text-sm text-muted-foreground">Créez votre propre groupe et baissez les prix ensemble.</p>
                  <Button onClick={() => setCreateMode(true)} className="bg-violet-500 hover:bg-violet-600 gap-2">Créer un groupe <ChevronRight className="h-4 w-4" /></Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setCreateMode(false)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Retour
                </Button>
                <h2 className="font-display text-xl font-semibold">Choisir un restaurant pour votre groupe</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {restaurants?.map((r: any) => (
                    <button key={r.id} onClick={() => handleCreateGroup(r)} className="text-left rounded-xl border-2 overflow-hidden hover:border-violet-500/30 border-border transition-all">
                      <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-32 object-cover" />
                      <div className="p-3">
                        <p className="font-bold text-sm">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => { setStep("browse"); setCreateMode(false); }} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Retour
            </Button>
            <div className="rounded-lg bg-violet-500/5 p-3 text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-violet-500" />
              {selectedRestaurant?.name} · <strong className="text-violet-600">-{savingsPercent}%</strong>
            </div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                {menuItems?.filter((i) => (i.category || "Autres") === cat).map((item) => {
                  const q = quantities[item.id] || 0;
                  const original = Number(item.price);
                  const discounted = Math.round(original * (1 - savingsPercent / 100) * 100) / 100;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-violet-600">{discounted.toFixed(2)} CHF</span>
                          <span className="text-xs text-muted-foreground line-through">{original.toFixed(2)}</span>
                        </div>
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
                <div className="flex justify-between text-sm">
                  <span>{count} article{count > 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground line-through">{subtotal.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between text-sm text-violet-600 font-medium">
                  <span>Réduction groupe -{savingsPercent}%</span>
                  <span>-{discount.toFixed(2)} CHF</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>{finalTotal.toFixed(2)} CHF</span>
                </div>
                <Button onClick={handleAddToCart} className="w-full bg-violet-500 hover:bg-violet-600 gap-2">
                  <ShoppingCart className="h-4 w-4" /> Valider ma commande
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-violet-500/5 border border-violet-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-violet-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Commande prête !</h2>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Restaurant</span><span className="font-medium">{selectedRestaurant?.name}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total</span><span className="font-bold">{finalTotal.toFixed(2)} CHF</span></div>
            </div>
            <Button onClick={handleCheckout} className="w-full bg-violet-500 hover:bg-violet-600 gap-2" size="lg">
              Aller au panier <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Phone, Clock, Star, Bike, Percent, Leaf, Utensils, ShoppingBag, ShoppingCart, Zap, ArrowLeft, Info, UtensilsCrossed, MessageSquare, DollarSign, ChevronRight } from "lucide-react";
import MenuItemCard from "@/components/MenuItemCard";
import ReviewForm from "@/components/ReviewForm";
import ReservationDialog from "@/components/ReservationDialog";
import ReservationWidget from "@/components/ReservationWidget";
import PriceRangeIcons from "@/components/PriceRangeIcons";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/cart";
import { trackEvent } from "@/lib/analytics";

export default function RestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { addItem, setOrderMode, orderMode, items: cartItems, updateCartMetadata } = useCart();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [reservationOpen, setReservationOpen] = useState(false);
  const [showReserveChoice, setShowReserveChoice] = useState(false);
  const [reservationDefaults, setReservationDefaults] = useState<{ date?: Date; time?: string; partySize?: number; }>({});

  useEffect(() => {
    if (searchParams.get("reserve") === "true") {
      const timeParam = searchParams.get("time");
      if (timeParam) setReservationDefaults({ date: new Date(), time: timeParam, partySize: 2 });
      setReservationOpen(true);
    }
  }, [searchParams]);

  const { data: restaurant } = useQuery({
    queryKey: ["restaurant", id],
    queryFn: async () => { const { data } = await supabase.from("restaurants").select("*").eq("id", id!).single(); return data; },
    enabled: !!id,
  });

  useEffect(() => {
    if (id && restaurant) {
      trackEvent({ eventType: "page_view", eventData: { page: "restaurant_detail", restaurant_name: restaurant.name }, restaurantId: id, cuisineType: restaurant.cuisine_type || undefined, city: restaurant.city });
    }
  }, [id, restaurant]);

  const { data: menuItems } = useQuery({
    queryKey: ["menu-items", id],
    queryFn: async () => { const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", id!).eq("is_available", true).order("category"); return data || []; },
    enabled: !!id,
  });

  const { data: reviews } = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () => { const { data } = await supabase.from("reviews").select("*").eq("restaurant_id", id!).order("created_at", { ascending: false }); return data || []; },
    enabled: !!id,
  });

  const { data: formulas } = useQuery({
    queryKey: ["restaurant-formulas", id],
    queryFn: async () => { const { data } = await supabase.from("meal_formulas").select("*, meal_formula_categories(*)").eq("restaurant_id", id!).eq("is_active", true); return data || []; },
    enabled: !!id,
  });

  const { data: isFavorite } = useQuery({
    queryKey: ["favorite", id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.from("favorites").select("id").eq("restaurant_id", id!).eq("user_id", user.id).maybeSingle();
      return !!data;
    },
    enabled: !!id,
  });

  const toggleFavorite = async () => {
    if (!user) return toast({ title: "Connectez-vous", variant: "destructive" });
    if (isFavorite) await supabase.from("favorites").delete().eq("restaurant_id", id!).eq("user_id", user.id);
    else await supabase.from("favorites").insert({ restaurant_id: id!, user_id: user.id });
    queryClient.invalidateQueries({ queryKey: ["favorite", id] });
  };

  const ratingDistribution = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    const counts = Array(10).fill(0) as number[];
    reviews.forEach((r) => { const idx = Math.min(Math.max(Math.round(Number(r.rating) || 0) - 1, 0), 9); counts[idx]++; });
    const max = Math.max(...counts, 1);
    return [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => ({ score, count: counts[score - 1], percent: Math.round((counts[score - 1] / max) * 100) }));
  }, [reviews]);

  const avgRating10 = useMemo(() => {
    if (!reviews || reviews.length === 0) return (Number(restaurant?.rating) || 0) * 2;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return sum / reviews.length;
  }, [reviews, restaurant?.rating]);

  if (!restaurant) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const categories = [...new Set(menuItems?.map((i) => i.category || "Autres"))];
  const avgRating = avgRating10.toFixed(1);
  const reviewCount = restaurant.review_count || reviews?.length || 0;

  const handleWidgetReserve = (date: Date, time: string, partySize: number) => {
    setReservationDefaults({ date, time, partySize });
    setReservationOpen(true);
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="relative h-72 md:h-96">
        <Button variant="ghost" size="icon" className="absolute top-4 left-4 z-20 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white border-white/10" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-20 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white border-white/10" onClick={toggleFavorite}><Heart className={isFavorite ? "h-5 w-5 fill-red-500 text-red-500" : "h-5 w-5"} /></Button>
        <img src={restaurant.image_url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=600&fit=crop"} alt={restaurant.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              {restaurant.cuisine_type && <Badge className="bg-white/20 backdrop-blur-sm text-white border-white/20">{restaurant.cuisine_type}</Badge>}
              {restaurant.delivery_available && <Badge className="bg-blue-500/80 backdrop-blur-sm text-white border-0"><Bike className="h-3 w-3 mr-1" /> Livraison</Badge>}
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold text-white">{restaurant.name}</h1>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 bg-primary rounded-lg px-3 py-1.5"><Star className="h-4 w-4 fill-primary-foreground text-primary-foreground" /><span className="font-bold text-primary-foreground text-sm">{avgRating}/10</span></div>
              <span className="text-white/80 text-sm">{reviewCount} avis</span><span className="text-white/50">·</span><span className="text-white/80"><PriceRangeIcons range={restaurant.price_range || 2} /></span>
            </div>
          </div>
        </div>
      </div>
      <div className="container py-6 md:py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 space-y-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground p-4 rounded-xl bg-card border">
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" />{restaurant.address}, {restaurant.city}</span>
              {restaurant.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-primary" />{restaurant.phone}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <button onClick={() => setShowReserveChoice(!showReserveChoice)} className="group flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border-2 border-transparent hover:border-primary/50 hover:bg-secondary/50 transition-all w-full">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0"><Utensils className="h-5 w-5 text-primary" /></div>
                  <div className="text-left"><span className="font-bold text-sm block">Réserver une table</span><span className="text-[10px] text-muted-foreground">Garantie de place</span></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                </button>
                {showReserveChoice && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-background border-2 border-primary/20 rounded-2xl shadow-xl p-3 space-y-2">
                    <button onClick={() => { setShowReserveChoice(false); setReservationOpen(true); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/50 transition-all text-left group">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Utensils className="h-5 w-5 text-primary" /></div>
                      <div><p className="font-semibold text-sm">Réservation classique</p><p className="text-xs text-muted-foreground">Réserver avec promos</p></div>
                    </button>
                    <button onClick={() => { setShowReserveChoice(false); navigate(`/zero-attente?restaurant=${id}`); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-indigo-500/5 transition-all text-left group border-2 border-indigo-500/20">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0"><Zap className="h-5 w-5 text-indigo-500" /></div>
                      <div><p className="font-semibold text-sm text-indigo-600">Zéro Attente</p><p className="text-xs text-muted-foreground">Précommandez, tout sera prêt</p></div>
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setOrderMode('delivery')} disabled={!restaurant.delivery_available} className={`group flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${restaurant.delivery_available ? orderMode === 'delivery' ? 'bg-blue-50 border-blue-200' : 'bg-secondary/30 border-transparent hover:border-primary/50 hover:bg-secondary/50' : 'bg-secondary/10 opacity-50 cursor-not-allowed'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${orderMode === 'delivery' ? 'bg-blue-500/20' : 'bg-blue-500/10'}`}><Bike className="h-5 w-5 text-blue-500" /></div>
                <div className="text-left"><span className="font-bold text-sm block">Livraison</span><span className="text-[10px] text-muted-foreground">2.99 CHF</span></div>
              </button>
              <button onClick={() => setOrderMode('takeaway')} className={`group flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${orderMode === 'takeaway' ? 'bg-miamz-green/10 border-miamz-green/30' : 'bg-secondary/30 border-transparent hover:border-miamz-green/50 hover:bg-secondary/50'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shrink-0 ${orderMode === 'takeaway' ? 'bg-miamz-green/20' : 'bg-miamz-green/10'}`}><ShoppingBag className="h-5 w-5 text-miamz-green" /></div>
                <div className="text-left"><span className="font-bold text-sm block">Emporter</span><span className="text-[10px] text-miamz-green font-bold">0.00 CHF</span></div>
              </button>
            </div>
            <Tabs defaultValue="menu" className="space-y-6">
              <TabsList className="w-full justify-start bg-transparent border-b rounded-none p-0 h-auto gap-0">
                <TabsTrigger value="apropos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><Info className="h-4 w-4" />À propos</TabsTrigger>
                <TabsTrigger value="menu" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><UtensilsCrossed className="h-4 w-4" />Menu</TabsTrigger>
                <TabsTrigger value="avis" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-5 py-3 font-semibold text-sm gap-1.5"><MessageSquare className="h-4 w-4" />Avis ({reviewCount})</TabsTrigger>
              </TabsList>
              <TabsContent value="apropos" className="space-y-6 mt-0">
                {restaurant.description && (
                  <div className="space-y-3"><h2 className="font-display text-xl font-bold">L'histoire du restaurant</h2><p className="text-muted-foreground leading-relaxed">{restaurant.description}</p></div>
                )}
                <div className="space-y-3"><h2 className="font-display text-xl font-bold">Informations pratiques</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="p-4 rounded-xl bg-secondary/30 flex items-start gap-3"><Clock className="h-5 w-5 text-primary mt-0.5" /><div><h3 className="font-semibold mb-2">Horaires d'ouverture</h3><p className="text-sm text-muted-foreground">Lundi - Dimanche: 11h30 - 22h30</p></div></div><div className="p-4 rounded-xl bg-secondary/30 flex items-start gap-3"><Info className="h-5 w-5 text-primary mt-0.5" /><div><h3 className="font-semibold mb-2">Détails</h3><ul className="text-sm text-muted-foreground space-y-1"><li>Cuisine : {restaurant.cuisine_type || "Non spécifié"}</li><li>Fourchette de prix : <PriceRangeIcons range={restaurant.price_range || 2} /></li></ul></div></div></div></div>
              </TabsContent>
              <TabsContent value="menu" className="space-y-8 mt-0">
                {formulas && formulas.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><Percent className="h-5 w-5 text-primary" /><h2 className="font-display text-xl font-bold">Formules et Menus (-{formulas[0].discount_percent}%)</h2></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {formulas.map((formula: any) => (
                        <div key={formula.id} className="p-4 border-2 border-primary/20 bg-primary/5 rounded-2xl space-y-2">
                          <h3 className="font-bold text-lg">{formula.name}</h3>
                          {formula.description && <p className="text-sm text-muted-foreground">{formula.description}</p>}
                          <div className="flex gap-2 text-xs font-semibold text-primary">{formula.meal_formula_categories?.map((c: any) => c.category).join(' + ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-8">
                  {categories.map((category) => (
                    <div key={category} id={category.replace(/\s+/g, '-').toLowerCase()} className="space-y-4 scroll-mt-24">
                      <h2 className="font-display text-xl font-bold border-b pb-2">{category}</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {menuItems?.filter((item) => (item.category || "Autres") === category).map((item) => (
                          <MenuItemCard key={item.id} id={item.id} name={item.name} description={item.description} price={item.price} imageUrl={item.image_url} category={item.category} restaurantId={item.restaurant_id} restaurantName={restaurant.name} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="avis" className="space-y-8 mt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-6">
                    <div className="text-center p-6 bg-secondary/20 rounded-2xl border">
                      <p className="font-display text-5xl font-bold text-primary">{avgRating}</p>
                      <div className="flex justify-center my-2">{[1, 2, 3, 4, 5].map((s) => (<Star key={s} className={`h-4 w-4 ${s <= Math.round(Number(avgRating) / 2) ? "fill-primary text-primary" : "text-muted"}`} />))}</div>
                      <p className="text-sm text-muted-foreground">{reviewCount} avis vérifiés</p>
                    </div>
                    <div className="space-y-2">
                      {ratingDistribution.map(({ score, count, percent }) => (
                        <div key={score} className="flex items-center gap-3 text-sm">
                          <span className="w-6 font-medium text-right">{score}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${percent}%` }} /></div>
                          <span className="w-8 text-muted-foreground text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-6">
                    {user && <ReviewForm restaurantId={id!} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ["reviews", id] }); }} />}
                    <div className="space-y-4">
                      {reviews?.map((review) => (
                        <div key={review.id} className="p-4 border rounded-xl bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2 py-0.5 rounded font-bold text-sm"><Star className="h-3.5 w-3.5 fill-primary" />{(Number(review.rating) * 2).toFixed(1)}/10</div>
                            <span className="text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</span>
                          </div>
                          {review.comment && <p className="text-sm leading-relaxed">{review.comment}</p>}
                        </div>
                      ))}
                      {(!reviews || reviews.length === 0) && <p className="text-center text-muted-foreground py-8">Aucun avis pour ce restaurant. Soyez le premier !</p>}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="w-full lg:w-80 shrink-0">
            <div className="sticky top-24 space-y-4">
              <ReservationWidget restaurantId={id!} restaurantName={restaurant.name} onReserve={handleWidgetReserve} />
              {cartItems.length > 0 && cartItems[0].restaurantId === id && (
                <Button className="w-full h-14 text-lg font-bold shadow-xl" onClick={() => navigate("/panier")}><ShoppingCart className="mr-2 h-5 w-5" /> Voir mon panier ({cartItems.reduce((acc, item) => acc + item.quantity, 0)})</Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <ReservationDialog isOpen={reservationOpen} onOpenChange={setReservationOpen} restaurantId={id!} restaurantName={restaurant.name} defaultValues={reservationDefaults} />
    </main>
  );
}
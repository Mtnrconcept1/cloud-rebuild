import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Layers, Trash2, Clock, ChevronRight, ChevronLeft,
  Sparkles, ArrowRight, CheckCircle2, ShoppingCart, MapPin,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { calculateDistance } from "@/lib/geo";
import { FeatureWizard, WizardBackButton, WizardNextButton } from "@/components/FeatureWizard";

interface CourseSelection {
  id: string; // Unique ID for each selection to allow duplicates
  course: string;
  restaurantId: string;
  restaurantName: string;
  itemId: string;
  itemName: string;
  price: number;
  image: string;
  lat: number;
  lng: number;
}

const COURSES = ["Entrée", "Plat", "Dessert"];

type Step = "courses" | "confirm";

export default function MultiRestaurant() {
  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("courses");
  const [activeCourse, setActiveCourse] = useState(0);
  const [selections, setSelections] = useState<CourseSelection[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-multi"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, image_url, rating, city, latitude, longitude")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false });
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menu-multi", selectedRestaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurantId!)
        .eq("is_available", true)
        .order("category");
      return data || [];
    },
    enabled: !!selectedRestaurantId,
  });

  const currentCourse = COURSES[activeCourse];

  // The first selected restaurant defines the origin for the 500m radius
  const originRestaurant = selections.length > 0 ? {
    id: selections[0].restaurantId,
    lat: selections[0].lat,
    lng: selections[0].lng,
    name: selections[0].restaurantName
  } : null;

  const filteredRestaurants = useMemo(() => {
    if (!restaurants) return [];
    // Show all restaurants initially (no slice)
    if (!originRestaurant) return restaurants;

    return restaurants.filter(r => {
      if (r.id === originRestaurant.id) return true;
      if (!r.latitude || !r.longitude) return false;
      const dist = calculateDistance(originRestaurant.lat, originRestaurant.lng, r.latitude, r.longitude);
      return dist <= 500;
    });
  }, [restaurants, originRestaurant]);

  const selectItem = (item: any, restaurant: any) => {
    const newSelection: CourseSelection = {
      id: crypto.randomUUID(),
      course: currentCourse,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      itemId: item.id,
      itemName: item.name,
      price: Number(item.price),
      image: item.image_url || "",
      lat: restaurant.latitude || 0,
      lng: restaurant.longitude || 0,
    };

    setSelections([...selections, newSelection]);

    toast({
      title: "Plat ajouté",
      description: `${item.name} (${currentCourse})`
    });
  };

  const removeSelection = (id: string) => {
    setSelections(selections.filter((s) => s.id !== id));
  };

  const total = selections.reduce((sum, s) => sum + s.price, 0);
  const uniqueRestaurants = new Set(selections.map((s) => s.restaurantId)).size;

  const handleCheckout = () => {
    clearCart();
    setOrderMode("delivery");

    updateCartMetadata({
      feature: "multi-restaurant",
      courses: selections.map(s => ({ course: s.course, restaurant: s.restaurantName }))
    });

    selections.forEach((s) => {
      addItem({
        menuItemId: s.itemId,
        name: `[${s.course}] ${s.itemName}`,
        price: s.price,
        restaurantId: s.restaurantId,
        restaurantName: s.restaurantName,
        metadata: { course: s.course }
      });
    });

    toast({
      title: "Repas multi-restos validé !",
      description: `${selections.length} plats de ${uniqueRestaurants} restaurant${uniqueRestaurants > 1 ? "s" : ""} · ${total.toFixed(2)} CHF`,
    });
    navigate("/panier");
  };

  const selectedRestaurant = restaurants?.find((r: any) => r.id === selectedRestaurantId);

  return (
    <FeatureWizard
      title="Multi-restaurants"
      subtitle="Entrée + plat + dessert de restaurants différents, livrés ensemble"
      icon={Layers}
      colorClass="pink-500"
      steps={[
        { id: "courses", label: "Choix des plats" },
        { id: "confirm", label: "Confirmation" }
      ]}
      currentStepId={step}
      onStepChange={(id) => setStep(id as Step)}
    >
      <div className="space-y-8">
        {/* How it works */}
        <div className="rounded-xl bg-pink-500/5 border border-pink-500/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-pink-500" />
            <h3 className="font-semibold text-sm">Composez votre repas idéal</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 bg-background/50 p-2 rounded-lg border border-pink-500/10">
              <Badge variant="outline" className="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-pink-500 text-white border-none">1</Badge>
              <span>Plusieurs plats possibles par étape</span>
            </div>
            <div className="flex items-center gap-2 bg-background/50 p-2 rounded-lg border border-pink-500/10">
              <Badge variant="outline" className="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-pink-500 text-white border-none">2</Badge>
              <span>Périmètre de 500m après le 1er choix</span>
            </div>
            <div className="flex items-center gap-2 bg-background/50 p-2 rounded-lg border border-pink-500/10">
              <Badge variant="outline" className="h-5 w-5 rounded-full p-0 flex items-center justify-center bg-pink-500 text-white border-none">3</Badge>
              <span>Livraison unique synchronisée</span>
            </div>
          </div>
        </div>

        {step === "courses" && (
          <>
            {/* Radius Warning */}
            {originRestaurant && (
              <div className="flex items-center gap-2 text-xs font-medium text-pink-600 bg-pink-500/5 p-3 rounded-lg border border-pink-500/20 animate-in fade-in slide-in-from-top-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>Restreint aux restaurants à moins de 500m de <strong>{originRestaurant.name}</strong></span>
                <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px] hover:bg-pink-500/10" onClick={() => setSelections([])}>Réinitialiser</Button>
              </div>
            )}

            {/* Course tabs */}
            <div className="flex gap-2">
              {COURSES.map((course, i) => {
                const courseSelections = selections.filter((s) => s.course === course);
                return (
                  <button
                    key={course}
                    onClick={() => { setActiveCourse(i); setSelectedRestaurantId(null); }}
                    className={`flex-1 rounded-xl border-2 p-3 text-center transition-all ${i === activeCourse
                      ? "border-pink-500 bg-pink-500/5"
                      : "border-border hover:border-pink-500/30"
                      }`}
                  >
                    <p className="font-semibold text-sm">{course}</p>
                    <p className="text-[10px] mt-0.5 font-medium">
                      {courseSelections.length > 0
                        ? <span className="text-green-600 flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" />{courseSelections.length} plat(s)</span>
                        : <span className="text-muted-foreground">À choisir</span>
                      }
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Restaurant/Menu selection */}
            {!selectedRestaurantId ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold">
                    Choisir un restaurant pour : <span className="text-pink-600">{currentCourse}</span>
                  </h2>
                  <Badge variant="secondary" className="text-[10px]">{filteredRestaurants.length} dispos</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredRestaurants.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRestaurantId(r.id)}
                      className="text-left rounded-xl border-2 overflow-hidden hover:border-pink-500/30 border-border transition-all flex flex-col h-full bg-card"
                    >
                      <div className="relative">
                        <img
                          src={r.image_url || "/images/kebab-box-spread.jpeg"}
                          alt={r.name}
                          className="w-full h-24 object-cover"
                        />
                        {originRestaurant && r.id !== originRestaurant.id && (
                          <div className="absolute top-1 right-1">
                            <Badge className="bg-green-500 text-[8px] h-4">Proche</Badge>
                          </div>
                        )}
                      </div>
                      <div className="p-2 flex-1">
                        <p className="font-bold text-xs truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.cuisine_type} · {r.city}</p>
                      </div>
                    </button>
                  ))}
                  {filteredRestaurants.length === 0 && (
                    <div className="col-span-full py-12 text-center space-y-2 border-2 border-dashed rounded-2xl">
                      <MapPin className="h-8 w-8 text-muted-foreground mx-auto opacity-20" />
                      <p className="text-sm text-muted-foreground">Aucun restaurant à proximité immédiate.</p>
                      <Button variant="link" size="sm" onClick={() => setSelections([])}>Réinitialiser le périmètre</Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
                <WizardBackButton onClick={() => setSelectedRestaurantId(null)} label="Restaurants" />
                <div className="rounded-xl bg-pink-500/5 p-4 flex items-center justify-between border border-pink-500/10">
                  <div className="flex items-center gap-3">
                    <div className="bg-pink-500 text-white p-2 rounded-lg"><Layers className="h-4 w-4" /></div>
                    <div>
                      <p className="text-xs font-bold text-pink-600 uppercase tracking-widest">{currentCourse}</p>
                      <p className="font-bold text-sm">{selectedRestaurant?.name}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {menuItems?.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => selectItem(item, selectedRestaurant)}
                      className="w-full text-left flex items-center gap-3 p-3 border-2 rounded-xl transition-all border-border hover:border-pink-500/30 bg-card group"
                    >
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm group-hover:text-pink-600 transition-colors">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <p className="text-[10px] text-muted-foreground bg-muted w-fit px-1.5 rounded mt-1">{item.category}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="font-bold text-sm text-primary">{Number(item.price).toFixed(2)} CHF</span>
                        <div className="h-8 w-8 rounded-full bg-pink-500/10 text-pink-600 flex items-center justify-center group-hover:bg-pink-500 group-hover:text-white transition-all shadow-sm">
                          <Plus className="h-4 w-4" />
                        </div>
                      </div>
                    </button>
                  ))}
                  {menuItems?.length === 0 && (
                    <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm space-y-2">
                      <p>Aucun plat disponible pour le moment.</p>
                    </div>
                  )}
                </div>
                <div className="pt-6 border-t mt-4">
                  <Button
                    className="w-full bg-pink-500 hover:bg-pink-600"
                    onClick={() => setSelectedRestaurantId(null)}
                  >
                    Valider mes choix pour ce restaurant
                  </Button>
                </div>
              </div>
            )}

            {/* Current selections summary */}
            {selections.length > 0 && (
              <div className="rounded-2xl border-2 border-pink-500/20 bg-card p-5 space-y-4 sticky bottom-4 shadow-2xl animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-pink-500" />
                    Votre sélection ({selections.length})
                  </h3>
                  <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-600">
                    {uniqueRestaurants} resto{uniqueRestaurants > 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {selections.map((sel) => (
                    <div key={sel.id} className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="text-[8px] h-4 px-1 shrink-0 bg-pink-500/10 text-pink-700 border-none font-bold uppercase">{sel.course}</Badge>
                        <span className="truncate font-medium">{sel.itemName}</span>
                        <span className="text-[10px] text-muted-foreground italic truncate">at {sel.restaurantName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold">{sel.price.toFixed(2)} CHF</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive" onClick={() => removeSelection(sel.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-dashed space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm font-bold">Total</span>
                    <span className="text-lg font-black text-pink-600">{total.toFixed(2)} CHF</span>
                  </div>
                  {selections.length >= 2 ? (
                    <WizardNextButton
                      onClick={() => setStep("confirm")}
                      label="Voir le récapitulatif"
                      colorClass="pink-500"
                    />
                  ) : (
                    <div className="bg-muted p-2 rounded text-center">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Min. 2 plats requis pour valider</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {step === "confirm" && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8">
            <WizardBackButton onClick={() => setStep("courses")} label="Modifier ma sélection" />
            <div className="rounded-2xl bg-pink-500/5 border border-pink-500/20 p-8 text-center space-y-3">
              <div className="bg-pink-500 text-white w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-pink-500/20">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="font-display text-2xl font-bold">Menu Multi-Resto complet !</h2>
              <p className="text-sm text-muted-foreground">Vos {selections.length} plats de {uniqueRestaurants} restaurants différents vont être synchronisés.</p>
            </div>

            <div className="rounded-2xl border-2 border-muted bg-card overflow-hidden">
              <div className="bg-muted/50 p-3 px-4 border-b">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Détails du menu</p>
              </div>
              <div className="p-4 space-y-3">
                {selections.map((sel) => (
                  <div key={sel.id} className="flex justify-between items-start gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-pink-600 uppercase tracking-tighter">{sel.course}</span>
                      <span className="text-sm font-medium">{sel.itemName}</span>
                      <span className="text-[10px] text-muted-foreground italic">{sel.restaurantName}</span>
                    </div>
                    <span className="font-bold text-sm whitespace-nowrap">{sel.price.toFixed(2)} CHF</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dashed pt-3 mt-2">
                  <span className="font-bold truncate">Total (plats)</span>
                  <span className="font-black text-lg text-pink-600">{total.toFixed(2)} CHF</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-pink-500/5 p-4 flex items-start gap-3 text-xs text-pink-700 border border-pink-500/10 italic">
              <Clock className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Miamz gère la logistique : Bien que venant de plusieurs adresses, tous vos plats arriveront dans un seul sac à la même heure.</p>
            </div>

            <WizardNextButton
              onClick={handleCheckout}
              label="Procéder au panier"
              colorClass="pink-500"
            />
          </div>
        )}
      </div>
    </FeatureWizard>
  );
}

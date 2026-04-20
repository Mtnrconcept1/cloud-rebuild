import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calculator, Leaf, Flame, Heart, Ban,
  Sparkles, ShoppingCart, CheckCircle2,
  Target, Coins, Zap, UtensilsCrossed, Users,
  Building2, ArrowLeft, PenSquare
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureWizard, WizardCartSummary, WizardNextButton } from "@/components/FeatureWizard";
import { resolveMenuItemImageUrl } from "@/lib/menu-item-images";

const supabase = getSupabase();

interface DietTag {
  id: string;
  label: string;
  icon: any;
  color: string;
}

const DIET_TAGS: DietTag[] = [
  { id: "vegan", label: "Vegan", icon: Leaf, color: "green" },
  { id: "protein", label: "Protéines", icon: Flame, color: "red" },
  { id: "low-cal", label: "< 800 kcal", icon: Target, color: "blue" },
  { id: "no-lactose", label: "Sans lactose", icon: Ban, color: "orange" },
  { id: "no-gluten", label: "Sans gluten", icon: Ban, color: "amber" },
  { id: "anti-inflam", label: "Anti-inflammatoire", icon: Heart, color: "pink" },
];

function getCourseType(category: string | null): "starter" | "main" | "dessert" | "other" {
  if (!category) return "main";
  const c = category.toLowerCase();
  if (c.includes("entrée") || c.includes("starter") || c.includes("salade") || c.includes("apéritif") || c.includes("soupe") || c.includes("tapas") || c.includes("mezze")) return "starter";
  if (c.includes("dessert") || c.includes("glace") || c.includes("sucré") || c.includes("pâtisserie") || c.includes("sweet")) return "dessert";
  if (c.includes("boisson") || c.includes("drink") || c.includes("vin") || c.includes("bière")) return "other";
  return "main";
}

export default function BudgetAuto() {
  const { addItem, clearCart, updateCartMetadata, setOrderMode } = useCart();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [peopleCount, setPeopleCount] = useState(1);
  const [budget, setBudget] = useState(25);
  const [desiredCourses, setDesiredCourses] = useState({ starter: false, main: true, dessert: false });
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [showResults, setShowResults] = useState(false);

  // Sequential & Multi-tier Selection State
  const [currentPersonIndex, setCurrentPersonIndex] = useState(1);
  const [lockedRestaurantId, setLockedRestaurantId] = useState<string | null>(null);
  const [viewingRestaurantId, setViewingRestaurantId] = useState<string | null>(null);
  const [personChoices, setPersonChoices] = useState<any[]>([]);

  // Editing Combo State
  const [editingCombo, setEditingCombo] = useState<any | null>(null);
  const [customS, setCustomS] = useState<any>(null);
  const [customM, setCustomM] = useState<any>(null);
  const [customD, setCustomD] = useState<any>(null);

  const [confirmed, setConfirmed] = useState(false);

  // Fetch preferences
  const { data: prefs } = useQuery({
    queryKey: ["user-preferences", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch all distinct cuisine types
  const { data: cuisineTypes } = useQuery({
    queryKey: ["budget-auto-cuisines"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("cuisine_type")
        .eq("is_active", true);
      const types = Array.from(
        new Set((data || []).map((r: any) => r.cuisine_type).filter(Boolean))
      ).sort() as string[];
      return types;
    },
  });

  // Fetch menu items
  const cuisineKey = Array.from(selectedCuisines).sort().join(",");
  const { data: menuItemsRaw } = useQuery({
    queryKey: ["budget-auto-items", cuisineKey],
    queryFn: async () => {
      let query = supabase
        .from("menu_items")
        .select("*, restaurants(id, name, city, image_url, cuisine_type)")
        .eq("is_available", true);

      if (selectedCuisines.size > 0) {
        const { data: matchRests } = await supabase
          .from("restaurants")
          .select("id")
          .eq("is_active", true)
          .in("cuisine_type", Array.from(selectedCuisines));
        const rIds = (matchRests || []).map((r: any) => r.id);
        if (rIds.length === 0) return [];
        query = query.in("restaurant_id", rIds);
      }

      const { data } = await query;
      const allItems = data || [];

      // Filter out duplicate items (same name & restaurant_id) which may exist in DDB
      const uniqueItems = [];
      const seenNames = new Set();
      for (const item of allItems) {
        const key = `${item.restaurant_id}-${item.name.toLowerCase()}`;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          uniqueItems.push(item);
        }
      }
      return uniqueItems;
    },
  });

  // Sync state with fetched prefs
  useEffect(() => {
    if (prefs) {
      if ((prefs as any).max_budget) setBudget(Number((prefs as any).max_budget));
      if ((prefs as any).dietary_tags) setSelectedTags(new Set((prefs as any).dietary_tags));
    }
  }, [prefs]);

  // Sync editing custom items when editingCombo changes
  useEffect(() => {
    if (editingCombo) {
      setCustomS(editingCombo.items.find((i: any) => getCourseType(i.category) === 'starter') || null);
      setCustomM(editingCombo.items.find((i: any) => getCourseType(i.category) === 'main') || null);
      setCustomD(editingCombo.items.find((i: any) => getCourseType(i.category) === 'dessert') || null);
    }
  }, [editingCombo]);

  const savePrefsMutation = useMutation({
    mutationFn: async (newPrefs: { max_budget: number; dietary_tags: string[] }) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_preferences" as any)
        .upsert({
          user_id: user.id,
          max_budget: newPrefs.max_budget,
          dietary_tags: newPrefs.dietary_tags,
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-preferences"] }),
  });

  const generateProposals = () => {
    if (!menuItemsRaw) return [];

    let items = menuItemsRaw;
    const activeRestId = lockedRestaurantId || viewingRestaurantId;
    if (activeRestId) {
      items = items.filter((i: any) => i.restaurant_id === activeRestId);
    }

    const byRestaurant = new Map<string, any[]>();
    for (const item of items) {
      const rId = item.restaurant_id;
      if (!byRestaurant.has(rId)) byRestaurant.set(rId, []);
      byRestaurant.get(rId)!.push(item);
    }

    const proposals = [];

    for (const [rId, rItems] of byRestaurant.entries()) {
      const starters = rItems.filter(i => getCourseType(i.category) === 'starter');
      const mains = rItems.filter(i => getCourseType(i.category) === 'main');
      const desserts = rItems.filter(i => getCourseType(i.category) === 'dessert');

      const sChoices = desiredCourses.starter ? starters : [null];
      const mChoices = desiredCourses.main ? mains : [null];
      const dChoices = desiredCourses.dessert ? desserts : [null];

      if (desiredCourses.starter && starters.length === 0) continue;
      if (desiredCourses.main && mains.length === 0) continue;
      if (desiredCourses.dessert && desserts.length === 0) continue;

      const validCombos = [];
      for (const s of sChoices) {
        for (const m of mChoices) {
          for (const d of dChoices) {
            const combo = [s, m, d].filter(Boolean);
            if (combo.length === 0) continue;

            const price = combo.reduce((sum, item) => sum + Number(item.price), 0);
            if (price <= budget) {
              validCombos.push({ items: combo, price });
            }
          }
        }
      }

      validCombos.sort((a, b) => a.price - b.price); // Cheapest first

      const distinctCombos = [];
      const seenIds = new Set();

      for (const combo of validCombos) {
        const idStr = combo.items.map((i: any) => i.id).sort().join(',');
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          distinctCombos.push(combo);
          if (distinctCombos.length >= 6) break; // Offer max 6 variations per restaurant
        }
      }

      for (let idx = 0; idx < distinctCombos.length; idx++) {
        const combo = distinctCombos[idx];
        const info = combo.items[0]?.restaurants;
        proposals.push({
          id: `combo-${rId}-${idx}`,
          restaurantId: rId,
          restaurant: info,
          items: combo.items,
          pricePerPerson: combo.price,
        });
      }
    }

    proposals.sort((a, b) => a.pricePerPerson - b.pricePerPerson); // Cheapest overall first
    return proposals;
  };

  const allProposals = generateProposals();

  // Extract unique restaurants for Step 1
  const restaurantOptions: any[] = [];
  if (currentPersonIndex === 1 && !viewingRestaurantId && allProposals.length > 0) {
    const rMap = new Map();
    for (const p of allProposals) {
      if (!rMap.has(p.restaurantId)) {
        rMap.set(p.restaurantId, { ...p.restaurant, minPrice: p.pricePerPerson, count: 1 });
      } else {
        const r = rMap.get(p.restaurantId);
        r.count++;
        if (p.pricePerPerson < r.minPrice) r.minPrice = p.pricePerPerson;
      }
    }
    restaurantOptions.push(...rMap.values());
  }

  // Edit Feature Data
  const editItemsScope = menuItemsRaw?.filter(i => i.restaurant_id === editingCombo?.restaurantId) || [];
  const editStarters = editItemsScope.filter(i => getCourseType(i.category) === 'starter');
  const editMains = editItemsScope.filter(i => getCourseType(i.category) === 'main');
  const editDesserts = editItemsScope.filter(i => getCourseType(i.category) === 'dessert');
  const customPrice = (customS ? Number(customS.price) : 0) + (customM ? Number(customM.price) : 0) + (customD ? Number(customD.price) : 0);
  const isOverBudget = customPrice > budget;

  const cartTotal = personChoices.reduce((sum: number, c: any) => sum + c.pricePerPerson, 0);

  const toggleCourse = (course: keyof typeof desiredCourses) => {
    setDesiredCourses(prev => {
      const next = { ...prev, [course]: !prev[course] };
      if (!next.starter && !next.main && !next.dessert) return prev;
      return next;
    });
  };

  const toggleCuisine = (cuisine: string) => {
    const next = new Set(selectedCuisines);
    if (next.has(cuisine)) next.delete(cuisine);
    else next.add(cuisine);
    setSelectedCuisines(next);
  };

  const openEditor = (combo: any) => {
    setEditingCombo(combo);
  };

  const saveEditedCombo = () => {
    if (isOverBudget) return;
    const items = [customS, customM, customD].filter(Boolean);
    const mockCombo = {
      ...editingCombo,
      id: `custom-${Date.now()}`,
      items,
      pricePerPerson: customPrice,
    };
    handleSelectCombo(mockCombo);
    setEditingCombo(null);
  };

  const handleSelectCombo = (combo: any) => {
    const newChoices = [...personChoices, { ...combo, personIndex: currentPersonIndex }];
    setPersonChoices(newChoices);

    if (currentPersonIndex === 1) {
      setLockedRestaurantId(combo.restaurantId);
    }

    if (currentPersonIndex < peopleCount) {
      setCurrentPersonIndex(prev => prev + 1);
      toast({
        title: `Menu choisi pour la personne ${currentPersonIndex}`,
        description: "Au tour de la personne suivante !",
      });
    } else {
      // Last person completed their choice, automatically navigate to cart
      clearCart();
      setOrderMode("delivery");
      updateCartMetadata({
        feature: "budget-auto",
        maxBudget: budget,
        peopleCount: peopleCount,
        dietaryTags: Array.from(selectedTags)
      });

      newChoices.forEach((c: any, pIdx: number) => {
        c.items.forEach((item: any) => {
          addItem({
            menuItemId: item.id,
            name: `${item.name} (Pers. ${pIdx + 1})`,
            price: Number(item.price),
            restaurantId: item.restaurant_id,
            restaurantName: c.restaurant?.name || "Restaurant",
            metadata: { budget_optimized: true, personIndex: pIdx + 1 }
          });
        });
      });

      toast({
        title: "Toutes les sélections sont faites !",
        description: "Redirection vers le panier...",
      });
      navigate("/panier");
    }
  };

  const handleCheckout = () => {
    clearCart();
    setOrderMode("delivery");
    updateCartMetadata({
      feature: "budget-auto",
      maxBudget: budget,
      peopleCount,
      dietaryTags: Array.from(selectedTags)
    });

    personChoices.forEach((combo: any, pIdx: number) => {
      combo.items.forEach((item: any) => {
        addItem({
          menuItemId: item.id,
          name: `${item.name} (Pers. ${pIdx + 1})`,
          price: Number(item.price),
          restaurantId: item.restaurant_id,
          restaurantName: combo.restaurant?.name || "Restaurant",
          metadata: { budget_optimized: true, personIndex: pIdx + 1 }
        });
      });
    });
    setConfirmed(true);
  };

  const handleGoToCart = () => {
    navigate("/panier");
  };

  const handleGoBack = () => {
    if (editingCombo) {
      setEditingCombo(null);
    } else if (currentPersonIndex === 1 && viewingRestaurantId) {
      setViewingRestaurantId(null);
    } else if (currentPersonIndex > 1) {
      // Revert one person
      const newChoices = [...personChoices];
      newChoices.pop();
      setPersonChoices(newChoices);
      setCurrentPersonIndex(prev => prev - 1);
      if (currentPersonIndex === 2) {
        setLockedRestaurantId(null);
        setViewingRestaurantId(null); // Return to restaurant selection for person 1
      }
    } else {
      // Reset everything
      setShowResults(false);
      setCurrentPersonIndex(1);
      setLockedRestaurantId(null);
      setViewingRestaurantId(null);
      setPersonChoices([]);
      setEditingCombo(null);
    }
  };

  const handleStartProcess = () => {
    setShowResults(true);
    setCurrentPersonIndex(1);
    setLockedRestaurantId(null);
    setViewingRestaurantId(null);
    setPersonChoices([]);
    setEditingCombo(null);
  };

  const steps = [{ id: "preferences", label: "Critères" }];
  if (showResults && !confirmed) {
    for (let i = 1; i <= peopleCount; i++) {
      steps.push({ id: `person-${i}`, label: `Personne ${i}` });
    }
  }
  if (confirmed) steps.push({ id: "confirm", label: "Confirmation" });

  const currentStepId = confirmed ? "confirm" : showResults ? `person-${Math.min(currentPersonIndex, peopleCount)}` : "preferences";

  return (
    <FeatureWizard
      title="Budget automatique"
      subtitle={showResults ? "Sélectionnez le menu parfait pour chaque personne" : "Menus optimisés selon vos objectifs et vos critères"}
      icon={Calculator}
      colorClass="cyan-500"
      steps={steps}
      currentStepId={currentStepId}
    >
      <div className="space-y-8">
        {!showResults && !confirmed && (
          <>
            {/* Number of People */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-cyan-500" />
                  Nombre de personnes
                </h2>
                <span className="text-2xl font-bold text-cyan-600">{peopleCount}</span>
              </div>
              <Slider
                value={[peopleCount]}
                onValueChange={(v) => setPeopleCount(v[0])}
                min={1}
                max={10}
                step={1}
                className="py-2"
              />
            </div>

            {/* Budget Per Person */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Coins className="h-5 w-5 text-cyan-500" />
                  Budget max par personne
                </h2>
                <span className="text-2xl font-bold text-cyan-600">{budget} CHF</span>
              </div>
              <Slider
                value={[budget]}
                onValueChange={(v) => { setBudget(v[0]); savePrefsMutation.mutate({ max_budget: v[0], dietary_tags: Array.from(selectedTags) }); }}
                min={10}
                max={100}
                step={5}
                className="py-2"
              />
            </div>

            {/* Desired Courses */}
            <div className="space-y-3">
              <h2 className="font-semibold">Plats souhaités</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleCourse("starter")}
                  className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${desiredCourses.starter ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 font-bold" : "border-border"}`}
                >
                  Entrée
                </button>
                <button
                  onClick={() => toggleCourse("main")}
                  className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${desiredCourses.main ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 font-bold" : "border-border"}`}
                >
                  Plat
                </button>
                <button
                  onClick={() => toggleCourse("dessert")}
                  className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${desiredCourses.dessert ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 font-bold" : "border-border"}`}
                >
                  Dessert
                </button>
              </div>
            </div>

            {/* Cuisine Types */}
            {cuisineTypes && cuisineTypes.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-cyan-500" />
                  Types de cuisine (Optionnel)
                </h2>
                <div className="flex flex-wrap gap-2">
                  {cuisineTypes.map((cuisine) => (
                    <button
                      key={cuisine}
                      onClick={() => toggleCuisine(cuisine)}
                      className={`px-3 py-2 rounded-full border-2 text-sm transition-all ${selectedCuisines.has(cuisine) ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 font-medium" : "border-border"}`}
                    >
                      {cuisine}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={handleStartProcess}
              className="w-full bg-cyan-500 hover:bg-cyan-600 gap-2"
              size="lg"
            >
              <Sparkles className="h-5 w-5" />
              Rechercher des menus
            </Button>
          </>
        )}

        {showResults && !confirmed && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h2 className="font-display text-xl font-bold flex items-center gap-2">
                  {currentPersonIndex > 1 || viewingRestaurantId || editingCombo ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2 rounded-full" onClick={handleGoBack}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {editingCombo
                    ? "Personnaliser le Menu"
                    : currentPersonIndex === 1 && !viewingRestaurantId
                      ? "1. Choisissez un restaurant"
                      : `Choix du menu - Personne ${Math.min(currentPersonIndex, peopleCount)}`}
                </h2>
                {lockedRestaurantId && currentPersonIndex <= peopleCount && !editingCombo && (
                  <p className="text-xs text-muted-foreground mt-1 ml-10">
                    Les plats pour la personne {currentPersonIndex} proviendront du même restaurant.
                  </p>
                )}
              </div>
              {currentPersonIndex === 1 && !viewingRestaurantId && !editingCombo && (
                <Button variant="ghost" size="sm" onClick={() => setShowResults(false)} className="text-muted-foreground">
                  Filtres
                </Button>
              )}
            </div>

            {editingCombo ? (
              // Customization Editor
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="rounded-xl border bg-card p-6 space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div>
                      <h3 className="font-bold text-lg">Modification du menu</h3>
                      <p className="text-sm text-cyan-600 font-medium">{editingCombo.restaurant?.name}</p>
                    </div>
                  </div>

                  {desiredCourses.starter && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">Entrée</label>
                      <Select
                        value={customS?.id || ""}
                        onValueChange={(val) => setCustomS(editStarters.find(s => s.id === val))}
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Aucune entrée sélectionnée" /></SelectTrigger>
                        <SelectContent>
                          {editStarters.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.price} CHF)</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {desiredCourses.main && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">Plat principal</label>
                      <Select
                        value={customM?.id || ""}
                        onValueChange={(val) => setCustomM(editMains.find(m => m.id === val))}
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Aucun plat sélectionné" /></SelectTrigger>
                        <SelectContent>
                          {editMains.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.price} CHF)</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {desiredCourses.dessert && (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">Dessert</label>
                      <Select
                        value={customD?.id || ""}
                        onValueChange={(val) => setCustomD(editDesserts.find(d => d.id === val))}
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Aucun dessert sélectionné" /></SelectTrigger>
                        <SelectContent>
                          {editDesserts.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.price} CHF)</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-xl bg-cyan-50 border border-cyan-100 p-5 shadow-sm">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Total pour ce menu</p>
                    <p className={`text-2xl font-bold ${isOverBudget ? 'text-destructive' : 'text-cyan-600'}`}>
                      {customPrice.toFixed(2)} CHF
                    </p>
                    {isOverBudget && <p className="text-xs text-destructive font-bold mt-1">Dépasse le budget de {budget} CHF</p>}
                  </div>
                  <Button
                    className="bg-cyan-500 hover:bg-cyan-600 px-8"
                    size="lg"
                    disabled={isOverBudget || ([customS, customM, customD].filter(Boolean).length === 0)}
                    onClick={saveEditedCombo}
                  >
                    Valider ce menu
                  </Button>
                </div>
              </div>
            ) : currentPersonIndex <= peopleCount ? (
              // Navigation: Either Restaurant List or Menu List
              currentPersonIndex === 1 && !viewingRestaurantId ? (
                // Restaurant List View
                restaurantOptions.length === 0 ? (
                  <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground shadow-sm">
                    <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Aucun restaurant ne correspond à tous vos critères.</p>
                    <p className="text-sm mt-1">Essayez d'augmenter le budget ou de réduire les plats souhaités.</p>
                    <Button variant="outline" className="mt-6" onClick={() => setShowResults(false)}>Ajuster les critères</Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {restaurantOptions.map(r => (
                      <div
                        key={r.id}
                        className="rounded-xl border bg-card p-4 hover:border-cyan-500 hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => setViewingRestaurantId(r.id)}
                      >
                        <div className="flex gap-4 items-center">
                          <div className="w-20 h-20 rounded-xl bg-muted overflow-hidden shrink-0">
                            <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg leading-tight truncate group-hover:text-cyan-600 transition-colors">{r.name}</h3>
                            <p className="text-sm text-muted-foreground truncate">{r.cuisine_type || "Cuisine variée"}</p>
                            <Badge variant="secondary" className="mt-3 font-semibold bg-cyan-50 text-cyan-700 border-cyan-100 hover:bg-cyan-100">
                              Menus dès {r.minPrice.toFixed(2)} CHF
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // Menu List View
                allProposals.length === 0 ? (
                  <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground shadow-sm">
                    <Calculator className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-foreground">Aucun menu disponible pour ce restaurant.</p>
                    <Button variant="outline" className="mt-6" onClick={handleGoBack}>Retour</Button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {allProposals.map((combo: any) => (
                      <div key={combo.id} className="rounded-xl border bg-card overflow-hidden hover:border-cyan-500/30 transition-colors flex flex-col shadow-sm">
                        <div className="p-4 border-b bg-muted/20 flex justify-between items-start">
                          <div>
                            <Badge variant="outline" className="mb-2 bg-background">{combo.items.length} plats optimisés</Badge>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="font-extrabold text-cyan-600 text-lg">{combo.pricePerPerson.toFixed(2)} CHF</p>
                          </div>
                        </div>

                        <div className="p-4 space-y-3 flex-1 bg-background">
                          {combo.items.map((item: any) => (
                            <div key={item.id} className="flex gap-3 items-center text-sm">
                              <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted border shrink-0">
                                <img
                                  src={resolveMenuItemImageUrl({
                                    name: item.name,
                                    description: item.description,
                                    category: item.category,
                                    imageUrl: item.image_url,
                                  })}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium leading-snug truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{Number(item.price).toFixed(2)} CHF</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="p-4 pt-3 flex gap-2 bg-muted/10 border-t mt-auto">
                          <Button
                            variant="outline"
                            onClick={() => openEditor(combo)}
                            className="flex-1 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                          >
                            <PenSquare className="h-4 w-4 mr-2" />
                            Modifier
                          </Button>
                          <Button
                            onClick={() => handleSelectCombo(combo)}
                            className="flex-1 bg-cyan-500 hover:bg-cyan-600 font-bold shadow-sm"
                          >
                            Sélect.
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )
            ) : (
              // Recap View
              <div className="space-y-6 animate-in zoom-in-95">
                <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/20 p-8 text-center space-y-3 shadow-sm">
                  <CheckCircle2 className="h-16 w-16 text-cyan-500 mx-auto drop-shadow-sm" />
                  <h2 className="font-display text-2xl font-bold">Sélection terminée !</h2>
                  <p className="text-muted-foreground max-w-sm mx-auto">Voici un récapitulatif des menus parfaitement ajustés à votre groupe.</p>
                </div>

                <div className="space-y-4">
                  {personChoices.map((choice, i) => (
                    <div key={i} className="rounded-xl border bg-card p-5 shadow-sm">
                      <div className="flex justify-between items-center mb-3 pb-3 border-b">
                        <span className="font-extrabold text-cyan-600 text-lg">Personne {choice.personIndex}</span>
                        <span className="font-extrabold text-lg">{choice.pricePerPerson.toFixed(2)} CHF</span>
                      </div>
                      <div className="space-y-2">
                        {choice.items.map((item: any) => (
                          <div key={item.id} className="text-sm flex items-center justify-between gap-3 font-medium">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-md overflow-hidden bg-muted border shrink-0">
                                <img
                                  src={resolveMenuItemImageUrl({
                                    name: item.name,
                                    description: item.description,
                                    category: item.category,
                                    imageUrl: item.image_url,
                                  })}
                                  alt={item.name}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <span className="truncate">{item.name}</span>
                            </div>
                            <span className="shrink-0 text-muted-foreground">{Number(item.price).toFixed(2)} CHF</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <WizardCartSummary
                  count={personChoices.reduce((sum, c) => sum + c.items.length, 0)}
                  subtotal={cartTotal}
                  colorClass="cyan-500"
                  total={cartTotal}
                  onValidate={handleCheckout}
                  validateLabel="Valider ma sélection"
                />
              </div>
            )}
          </div>
        )}

        {confirmed && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-cyan-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Panier validé !</h2>
              <p className="text-muted-foreground">Les menus ont été ajoutés à votre panier.</p>
            </div>

            <WizardNextButton
              onClick={handleGoToCart}
              label="Procéder au paiement"
              colorClass="cyan-500"
            />
          </div>
        )}
      </div>
    </FeatureWizard>
  );
}

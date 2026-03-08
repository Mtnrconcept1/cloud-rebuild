import {
  Search,
  ChevronRight,
  Bike,
  TrendingUp,
  UtensilsCrossed,
  Coffee,
  Salad,
  Pizza,
  IceCream,
  Flame,
  Tag,
  Star,
  MapPinned,
  Heart,
  Shield,
  Users,
  Route,
  Layers,
  ChefHat,
  Timer,
  ShieldCheck,
  Calculator,
  Repeat,
  Sparkles,
  Trophy,
  Store,
  ArrowRight,
  Gift,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RestaurantCard from "@/components/RestaurantCard";
import NearbyRestaurantsMap from "@/components/NearbyRestaurantsMap";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import PromoCarousel from "@/components/PromoCarousel";
import LoyaltyStatus from "@/components/LoyaltyStatus";
import { useAuth } from "@/lib/auth";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useEffect, useRef } from "react";
import { trackEvent, setAnalyticsUser, getActiveSponsoredRestaurants } from "@/lib/analytics";
import { prioritizeSponsoredCards } from "@/lib/sponsoredPlacement";

const CATEGORIES = [
  { label: "Tout", icon: UtensilsCrossed, query: "" },
  { label: "Pizza", icon: Pizza, query: "pizza" },
  { label: "Burgers", icon: Flame, query: "burger" },
  { label: "Café", icon: Coffee, query: "café" },
  { label: "Salades", icon: Salad, query: "salade" },
  { label: "Desserts", icon: IceCream, query: "dessert" },
];

const QUICK_FILTERS = [
  { label: "Livraison", icon: Bike },
  { label: "Offres", icon: Tag },
  { label: "Mieux notés", icon: Star },
];

export default function Index() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeFeatures = useActiveFeatures();
  const heroRef = useRef<HTMLDivElement>(null);

  // Analytics: set user and track page view
  useEffect(() => {
    setAnalyticsUser(user?.id || null);
    if (user) {
      trackEvent({ eventType: "page_view", eventData: { page: "home" } });
    }
  }, [user]);

  // Fetch sponsored restaurants
  const { data: sponsoredCampaigns } = useQuery({
    queryKey: ["sponsored-home"],
    queryFn: () => getActiveSponsoredRestaurants("home"),
  });

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY;
          // Apply only if the hero is visible (approximate)
          if (scrolled < 800) {
            heroRef.current?.style.setProperty("--scroll-y", `${scrolled}px`);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { data: restaurants } = useQuery({
    queryKey: ["popular-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .order("rating", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  const { data: allRestaurants } = useQuery({
    queryKey: ["all-restaurants-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, cuisine_type, rating, city, address")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: nearbyRestaurants } = useQuery({
    queryKey: ["nearby-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(4);
      return data || [];
    },
  });

  const { data: topRated } = useQuery({
    queryKey: ["top-rated-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .order("rating", { ascending: false })
        .limit(4);
      return data || [];
    },
  });

  const { data: donatedMeals } = useQuery({
    queryKey: ["donated-meals-total"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_total_donated_meals");
      if (error) {
        console.error("Error fetching donated meals:", error);
        return 0;
      }
      return Number(data) || 0;
    },
  });

  const { data: donatedPoints } = useQuery({
    queryKey: ["donated-points-total"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_total_donated_points");
      if (!error) return Number(data) || 0;

      const { data: rows, error: fallbackError } = await supabase
        .from("solidarity_donations" as any)
        .select("points_amount");
      if (fallbackError) {
        console.error("Error fetching donated points:", fallbackError);
        return 0;
      }
      return (rows || []).reduce((sum: number, r: any) => sum + (r.points_amount || 0), 0);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/recherche?q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate("/recherche");
    }
  };

  const handleCategoryClick = (query: string) => {
    setActiveCategory(query);
    if (query) {
      trackEvent({ eventType: "category_click", eventData: { category: query } });
      navigate(`/recherche?q=${encodeURIComponent(query)}`);
    }
  };

  const sponsoredCards = (sponsoredCampaigns || [])
    .map((camp: any) => {
      const r = camp.restaurants;
      if (!r) return null;
      return {
        ...r,
        campaign_id: camp.id,
        promo_image: camp.image_url || null,
      };
    })
    .filter(Boolean) as any[];

  const nearbyCards = prioritizeSponsoredCards((nearbyRestaurants || []) as any[], sponsoredCards, {
    topSlots: 3,
    maxItems: (nearbyRestaurants || []).length || undefined,
  });

  const topRatedCards = prioritizeSponsoredCards((topRated || []) as any[], sponsoredCards, {
    topSlots: 3,
    maxItems: (topRated || []).length || undefined,
  });

  const popularCards = prioritizeSponsoredCards((restaurants || []) as any[], sponsoredCards, {
    topSlots: 3,
    maxItems: (restaurants || []).length || undefined,
  });

  return (
    <main className="min-h-screen pb-20">
      {/* Hero Section */}
      <section ref={heroRef} className="relative overflow-hidden border-b">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-[url('/fond.jpg')] bg-cover bg-center md:bg-[url('/fond2.jpg')] blur-[2px] will-change-transform"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * 0.4))" }}
          aria-hidden="true"
        />

        {/* Centered blurry white circle behind logo & text */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] md:w-[700px] md:h-[700px] bg-white/80 blur-[30px] rounded-full pointer-events-none will-change-transform"
          style={{ transform: "translate(calc(-50% + var(--scroll-y, 0px) * -0.1), calc(-50% + var(--scroll-y, 0px) * 0.2))" }}
        />
        {/* Micro vignette */}
        <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.10)] pointer-events-none" />

        <div
          className="container relative px-4 py-28 md:py-40 flex flex-col items-center text-center space-y-8 will-change-transform"
          style={{ transform: "translateY(calc(var(--scroll-y, 0px) * -0.15))" }}
        >
          <img
            src="/logo.png"
            alt="Deliveroom"
            className="h-28 sm:h-36 md:h-48 w-auto object-contain drop-shadow-lg"
          />

          <div className="space-y-4 max-w-3xl">
            <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[0.8] flex flex-wrap items-center justify-center gap-x-2">
  <span className="newspaper-snippet">
    Commandez malin,
  </span>
  <span className="text-primary italic">mangez bien.</span>
</h1>
            <p className="text-base sm:text-lg md:text-xl text max-w-2xl mx-auto leading-relaxed">
              Le réflexe food... simple, rentable, solidaire !
            </p>
          </div>

          {/* ===== BADGES (comme ton image 1) ===== */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {[
              { icon: Star, label: "4.8/5" },
              { icon: Timer, label: "Dès 25 min" },
              { icon: Store, label: "Restaurants partenaires" },
            ].map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.label}
                  className="flex items-center gap-2 px-4 py-2 rounded-full
                             bg-white/75 backdrop-blur-md border border-white/70
                             shadow-[0_10px_25px_rgba(0,0,0,0.10)]"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/12">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/75">{b.label}</span>
                </div>
              );
            })}
          </div>

          {/* ===== BOUTONS (comme ton image 1) ===== */}
          <div className="w-full max-w-md sm:max-w-lg pt-2 flex flex-col items-center gap-3">
            {/* CTA orange */}
            <Link
              to="/recherche"
              className="group relative w-full overflow-hidden rounded-full
                         bg-gradient-to-b from-primary to-primary/90
                         px-8 py-4 text-white font-semibold text-base
                         shadow-[0_16px_40px_rgba(0,0,0,0.18)]
                         transition hover:translate-y-[-1px]
                         hover:shadow-[0_22px_55px_rgba(0,0,0,0.22)]
                         focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.35),_transparent_55%)] opacity-60" />
              <span className="relative flex items-center justify-center gap-3">
                Explorer les restaurants
                <span className="inline-flex items-center justify-center rounded-full bg-white/15 p-1">
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>

            {/* Secondaire “glass” sombre */}
            <Link
              to="/ventes-flash"
              className="w-full rounded-full px-8 py-4 text-foreground/90 font-semibold text-base
                         bg-white/50 backdrop-blur-md border border-white/40
                         shadow-[0_14px_35px_rgba(0,0,0,0.10)]
                         transition hover:bg-white/35 hover:text-foreground
                         focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              Voir les offres du jour
            </Link>

            {/* Tertiaire “glass” subtil */}
            <Link
              to="/recherche?mode=reservation"
              className="w-full rounded-full px-8 py-4 text-foreground/80 font-semibold text-base
                         bg-white/50 backdrop-blur-sm border border-white/20
                         shadow-[0_8px_25px_rgba(0,0,0,0.05)]
                         transition hover:bg-white/20 hover:text-foreground
                         focus:outline-none focus:ring-2 focus:ring-foreground/10"
            >
              Réserver une table
            </Link>
          </div>

          {/* Chips bas (tu peux les garder, elles matchent bien) */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {[
              { icon: Bike, label: "Livraison rapide", color: "text-primary" },
              { icon: Trophy, label: "Programme fidélité", color: "text-amber-500" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 px-4 py-2 rounded-full
                           bg-white/80 backdrop-blur-sm border border-white shadow-sm"
              >
                <item.icon className={`h-4 w-4 ${item.color}`} />
                <span className="text-sm font-semibold text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Premium Hero Carousel */}
      <section className="pt-4 pb-8 md:pt-6 md:pb-12 bg-miamz-warm/20">
        <div className="container px-4">
          <PromoCarousel />
        </div>
      </section>

      {/* Floating Search & Quick Filters */}
      <section className="sticky top-16 z-30 bg-background pb-4 border-b">
        <div className="container space-y-4 pt-4">
          <form
            onSubmit={handleSearch}
            className="flex items-center gap-2 max-w-2xl mx-auto bg-card rounded-2xl shadow-lg border-2 border-primary/5 p-1.5 focus-within:border-primary/20 transition-all"
          >
            <div className="flex items-center gap-2 text-muted-foreground pl-3">
              <Search className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Envie de sushi, pizza ou d'un burger ?"
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-base"
            />
            <Button type="submit" size="lg" className="shrink-0 rounded-xl px-6 font-bold">
              Trouver
            </Button>
          </form>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-4 justify-center">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.query;
              return (
                <button
                  key={cat.label}
                  onClick={() => handleCategoryClick(cat.query)}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl shrink-0 transition-all text-sm font-bold
                    ${isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                      : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Loyalty Status for Logged Users */}
      {user && (
        <section className="py-8 bg-gradient-to-b from-background to-secondary/10">
          <div className="container">
            <LoyaltyStatus />
          </div>
        </section>
      )}

      {/* Impact Solidaire Counter */}
      <section className="py-12 bg-pink-500/5 border-b border-pink-500/10">
        <div className="container">
          <div className="max-w-4xl mx-auto rounded-3xl bg-white/40 backdrop-blur-xl p-8 md:p-10 shadow-[0_8px_32px_0_rgba(236,72,153,0.15)] border border-white/60 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-pink-500/20 transition-colors" />

            <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl bg-gradient-to-br from-pink-400/20 to-pink-600/20 border border-pink-500/20 flex items-center justify-center shrink-0 animate-pulse">
                <Heart className="h-10 w-10 md:h-14 md:h-14 text-pink-500 fill-pink-500" />
              </div>

              <div className="flex-1 text-center md:text-left space-y-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-600">
                    Impact Solidaire Miamz
                  </h2>
                  <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                    Grâce à vos dons de Miamz, nous offrons ensemble des repas nutritifs à ceux qui en
                    ont le plus besoin.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center md:justify-start gap-6 pt-2">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Repas distribués
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-black text-foreground tabular-nums">
                        {donatedMeals?.toLocaleString() || "0"}
                      </span>
                      <span className="text-lg font-bold text-pink-500">repas</span>
                    </div>
                  </div>

                  <div className="w-px h-12 bg-pink-500/10 hidden md:block" />

                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Points récoltés
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-black text-foreground tabular-nums">
                        {donatedPoints?.toLocaleString() || "0"}
                      </span>
                      <span className="text-lg font-bold text-pink-500">pts</span>
                    </div>
                  </div>

                  <div className="w-px h-12 bg-pink-500/10 hidden md:block" />

                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Prochain objectif
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">5 000</span>
                      <span className="text-xs font-medium text-pink-500/70">repas d'ici Pâques</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recommandations personnalisées */}
      {nearbyCards.length > 0 && (
        <section className="py-20 bg-background">
          <div className="container space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-pink-500 font-bold text-xs uppercase tracking-widest">
                  <Heart className="h-3.5 w-3.5 fill-pink-500" />
                  Pour vous
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-bold">Susceptible de vous plaire</h2>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1" asChild>
                <Link to="/recherche">
                  Découvrir plus <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {nearbyCards.map((r: any, i: number) => (
                <div key={r.id} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <RestaurantCard
                    id={r.id}
                    name={r.name}
                    cuisine={r.cuisine_type || ""}
                    rating={Number(r.rating) || 0}
                    reviewCount={r.review_count || 0}
                    imageUrl={
                      r.image_url ||
                      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=450&fit=crop"
                    }
                    priceRange={r.price_range || 2}
                    deliveryAvailable={r.delivery_available || false}
                    city={r.city}
                    address={r.address || ""}
                    sponsoredCampaignId={r.campaign_id || undefined}
                    sponsoredPromoImage={r.promo_image || undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Meilleurs établissements */}
      {topRatedCards.length > 0 && (
        <section className="py-20 bg-secondary/10">
          <div className="container space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-xs uppercase tracking-widest">
                  <Star className="h-3.5 w-3.5 fill-amber-500" />
                  Incontournables
                </div>
                <h2 className="font-display text-2xl md:text-3xl font-bold">Meilleurs établissements</h2>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1" asChild>
                <Link to="/recherche">
                  Voir tout le classement <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topRatedCards.map((r: any, i: number) => (
                <div key={r.id} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <RestaurantCard
                    id={r.id}
                    name={r.name}
                    cuisine={r.cuisine_type || ""}
                    rating={Number(r.rating) || 0}
                    reviewCount={r.review_count || 0}
                    imageUrl={
                      r.image_url ||
                      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=450&fit=crop"
                    }
                    priceRange={r.price_range || 2}
                    deliveryAvailable={r.delivery_available || false}
                    city={r.city}
                    address={r.address || ""}
                    sponsoredCampaignId={r.campaign_id || undefined}
                    sponsoredPromoImage={r.promo_image || undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Restaurants populaires */}
      <section className="py-20 bg-background">
        <div className="container space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest">
                <TrendingUp className="h-3.5 w-3.5" />
                Tendances
              </div>
              <h2 className="font-display text-2xl md:text-3xl font-bold">Populaires en ce moment</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1" asChild>
              <Link to="/recherche">
                Plus de choix <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {popularCards.map((r: any, i: number) => (
              <div key={`${r.id}-${r.campaign_id || "organic"}`} className="animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <RestaurantCard
                  id={r.id}
                  name={r.name}
                  cuisine={r.cuisine_type || ""}
                  rating={Number(r.rating) || 0}
                  reviewCount={r.review_count || 0}
                  imageUrl={
                    r.image_url ||
                    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=450&fit=crop"
                  }
                  priceRange={r.price_range || 2}
                  deliveryAvailable={r.delivery_available || false}
                  city={r.city}
                  address={r.address || ""}
                  sponsoredCampaignId={r.campaign_id || undefined}
                  sponsoredPromoImage={r.promo_image || undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Carte des restaurants à proximité */}
      <section className="py-10 md:py-14">
        <div className="container space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <MapPinned className="h-4 w-4 text-blue-500" />
              </div>
              <h2 className="font-display text-xl md:text-2xl font-semibold">Restaurants à proximité</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-1" asChild>
              <Link to="/recherche">
                Voir la liste <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <NearbyRestaurantsMap restaurants={allRestaurants || []} />
        </div>
      </section>

      {/* Fonctionnalités exclusives */}
      <section className="py-10 md:py-14 bg-gradient-to-b from-background to-secondary/20">
        <div className="container space-y-6">
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-display text-2xl md:text-3xl font-bold">Fonctionnalités exclusives</h2>
            </div>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Des innovations uniques pour une expérience food inédite
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { icon: Shield, label: "Créneaux garantis", desc: "Livraison ponctuelle ou remboursé", to: "/creneaux-garantis", bg: "bg-blue-500/10", fg: "text-blue-500" },
              { icon: Gift, label: "Offres", desc: "Fenêtre flexible, prix réduit", to: "/flex-prix-bas", bg: "bg-emerald-500/10", fg: "text-emerald-500" },
              { icon: Users, label: "Match groupes", desc: "Commandez ensemble, payez moins", to: "/match-groupes", bg: "bg-violet-500/10", fg: "text-violet-500" },
              { icon: Route, label: "Multi-stop", desc: "Un trajet, plusieurs adresses", to: "/multi-stop", bg: "bg-orange-500/10", fg: "text-orange-500" },
              { icon: Layers, label: "Multi-restos", desc: "Plats de différents restos", to: "/multi-restaurant", bg: "bg-pink-500/10", fg: "text-pink-500" },
              { icon: ChefHat, label: "Chef's Table", desc: "Plats off-menu en édition limitée", to: "/chefs-table", bg: "bg-amber-500/10", fg: "text-amber-500" },
              { icon: Timer, label: "Zéro attente", desc: "Précommande synchronisée", to: "/zero-attente", bg: "bg-indigo-500/10", fg: "text-indigo-500" },
              { icon: ShieldCheck, label: "Garantie qualité", desc: "Chaud garanti ou remboursé", to: "/garantie-qualite", bg: "bg-teal-500/10", fg: "text-teal-500" },
              { icon: Calculator, label: "Budget auto", desc: "Menus optimisés par objectifs", to: "/budget-auto", bg: "bg-cyan-500/10", fg: "text-cyan-500" },
              { icon: Repeat, label: "Abonnement", desc: "Repas récurrents planifiés", to: "/abonnement", bg: "bg-purple-500/10", fg: "text-purple-500" },
            ].filter((feat) => activeFeatures.has(feat.to.slice(1))).map((feat) => {
              const Icon = feat.icon;
              return (
                <Link
                  key={feat.to}
                  to={feat.to}
                  className="group rounded-xl border bg-card p-4 space-y-2 hover:shadow-md hover:-translate-y-0.5 transition-all"
                >
                  <div className={`w-10 h-10 rounded-lg ${feat.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${feat.fg}`} />
                  </div>
                  <h3 className="font-semibold text-sm leading-tight">{feat.label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-snug">{feat.desc}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Livraison CTA */}
      <section className="py-10 md:py-14">
        <div className="container">
          <div className="rounded-2xl bg-primary/5 border border-primary/10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-6 md:gap-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bike className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 text-center md:text-left space-y-2">
              <h2 className="font-display text-2xl font-semibold">Livraison à domicile</h2>
              <p className="text-muted-foreground">
                Faites-vous livrer vos plats préférés directement chez vous. Rapide, simple et délicieux.
              </p>
            </div>
            <Button size="lg" asChild>
              <Link to="/recherche">Commander maintenant</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-secondary/20">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Miamz" className="h-8 w-auto object-contain" />
            <p>&copy; 2026 Miamz. Tous droits réservés.</p>
          </div>
          <div className="flex gap-6">
            <Link to="/a-propos" className="hover:text-foreground transition-colors">
              À propos
            </Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
            <Link to="/aide" className="hover:text-foreground transition-colors font-semibold text-primary">
              Aide (FAQ)
            </Link>
            <Link to="/cgu" className="hover:text-foreground transition-colors">
              CGU
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

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
      <footer className="border-t bg-card">
        <div className="container py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <img src="/logo.png" alt="Miamz" className="h-10 w-auto object-contain" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                Le réflexe food simple, rentable et solidaire. Commandez, réservez, et savourez.
              </p>
              <div className="flex gap-3">
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Découvrir</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/recherche" className="hover:text-foreground transition-colors">Restaurants</Link>
                <Link to="/anti-gaspi" className="hover:text-foreground transition-colors">Anti-gaspi</Link>
                <Link to="/ventes-flash" className="hover:text-foreground transition-colors">Ventes flash</Link>
                <Link to="/chefs-table" className="hover:text-foreground transition-colors">Chef's Table</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Informations</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/a-propos" className="hover:text-foreground transition-colors">À propos</Link>
                <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
                <Link to="/aide" className="hover:text-foreground transition-colors">Centre d'aide</Link>
                <Link to="/cgu" className="hover:text-foreground transition-colors">CGU</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Restaurateur</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/auth?type=restaurateur" className="hover:text-foreground transition-colors">Devenir partenaire</Link>
                <Link to="/dashboard" className="hover:text-foreground transition-colors">Espace pro</Link>
              </nav>
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bientôt disponible</p>
                <div className="flex gap-2">
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    App Store
                  </div>
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.414l2.937 1.7a1 1 0 010 1.728l-2.937 1.699-2.495-2.495 2.495-2.632zM5.864 2.659l10.937 6.333-2.302 2.302-8.635-8.635z"/></svg>
                    Google Play
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>&copy; 2026 Miamz. Tous droits réservés.</p>
            <div className="flex gap-4">
              <Link to="/cgu" className="hover:text-foreground transition-colors">Conditions</Link>
              <Link to="/cgu" className="hover:text-foreground transition-colors">Confidentialité</Link>
              <Link to="/cgu" className="hover:text-foreground transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

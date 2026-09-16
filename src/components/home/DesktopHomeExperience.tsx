import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  Compass,
  Crown,
  Flame,
  Heart,
  Leaf,
  MapPin,
  MoonStar,
  Sparkles,
  SunMedium,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import RestaurantCard from "@/components/RestaurantCard";
import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { Json } from "@/integrations/supabase/types";
import type { HomeRestaurantCandidate } from "@/lib/homeRestaurantDiscovery";
import { isReservationCalendarDateDisabled } from "@/lib/reservationAvailability";
import { buildRestaurantSeoPath } from "@/lib/restaurantSlugs";

const DENSE_RAIL_SIZE = 6;
const FULL_RAIL_SIZE = 8;

const BENEFITS = [
  { icon: Flame, title: "Vente flash", body: "Jusqu’à -50% sur une sélection de tables", color: "text-[#ef3219]" },
  { icon: Leaf, title: "Anti gaspi", body: "Des tables à prix réduits en dernière minute", color: "text-emerald-700" },
  { icon: AlarmClock, title: "Zéro attente", body: "Votre table est prête à votre arrivée", color: "text-[#ff4a1f]" },
  { icon: Heart, title: "Restaurants d’exception", body: "Sélectionnés par TOK", color: "text-[#ff3c1f]" },
  { icon: Users, title: "Pour toutes les occasions", body: "En amoureux, entre amis, en famille", color: "text-[#ff4a1f]" },
] as const;

type DesktopCandidate = HomeRestaurantCandidate & {
  slug?: string | null;
  price_range?: number | null;
  delivery_available?: boolean | null;
  opening_hours?: Json | null;
  supports_reservation?: boolean | null;
  promo_image?: string | null;
  campaign_title?: string | null;
  campaign_body?: string | null;
  campaign_creative?: unknown;
};

type DesktopHomeExperienceProps = {
  offers: DesktopCandidate[];
  local: DesktopCandidate[];
  lunch: DesktopCandidate[];
  dinner: DesktopCandidate[];
  trending: DesktopCandidate[];
  catalogue: DesktopCandidate[];
  nearby: DesktopCandidate[];
  city?: string | null;
  trendingMode?: "trending" | "discover";
};

type CoordinatePin = {
  restaurant: DesktopCandidate;
  left: number;
  top: number;
};

function uniqueCards(groups: readonly (readonly DesktopCandidate[])[], limit: number) {
  const seen = new Set<string>();
  const result: DesktopCandidate[] = [];

  for (const group of groups) {
    for (const restaurant of group) {
      const id = String(restaurant?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(restaurant);
      if (result.length >= limit) return result;
    }
  }

  return result;
}

function buildCoordinatePins(restaurants: DesktopCandidate[]): CoordinatePin[] {
  const coordinates = restaurants
    .map((restaurant) => ({
      restaurant,
      latitude: Number(restaurant.latitude),
      longitude: Number(restaurant.longitude),
    }))
    .filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude));

  if (coordinates.length === 0) return [];

  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates.map(({ longitude }) => longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const hasLatitudeRange = maxLatitude > minLatitude;
  const hasLongitudeRange = maxLongitude > minLongitude;

  return coordinates.map(({ restaurant, latitude, longitude }) => {
    const latitudeRatio = hasLatitudeRange ? (latitude - minLatitude) / (maxLatitude - minLatitude) : 0.5;
    const longitudeRatio = hasLongitudeRange ? (longitude - minLongitude) / (maxLongitude - minLongitude) : 0.5;

    return {
      restaurant,
      left: 12 + longitudeRatio * 76,
      top: 88 - latitudeRatio * 76,
    };
  });
}

function candidatePath(restaurant: DesktopCandidate) {
  return buildRestaurantSeoPath({
    id: restaurant.id,
    name: restaurant.name,
    city: restaurant.city || undefined,
    slug: restaurant.slug || null,
  });
}

function RestaurantGrid({ restaurants, columns = "dense" }: { restaurants: DesktopCandidate[]; columns?: "dense" | "full" }) {
  return (
    <div
      className={
        columns === "full"
          ? "grid min-w-0 grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4"
          : "grid min-w-0 grid-cols-2 gap-4 2xl:grid-cols-3"
      }
    >
      {restaurants.map((restaurant, index) => (
        <div key={`${restaurant.id}-${restaurant.campaign_id || "organic"}-${index}`} className="min-w-0">
          <RestaurantCard
            id={restaurant.id}
            name={restaurant.name}
            cuisine={String(restaurant.cuisine_type || "")}
            rating={Number(restaurant.rating) || 0}
            reviewCount={Number(restaurant.review_count) || 0}
            imageUrl={String(restaurant.image_url || "")}
            priceRange={Number(restaurant.price_range) || 2}
            deliveryAvailable={Boolean(restaurant.delivery_available)}
            city={String(restaurant.city || "Genève")}
            address={String(restaurant.address || "")}
            slug={restaurant.slug || null}
            openingHours={restaurant.opening_hours}
            supportsReservation={restaurant.supports_reservation}
            sponsoredCampaignId={restaurant.campaign_id ? String(restaurant.campaign_id) : undefined}
            sponsoredPromoImage={restaurant.promo_image || undefined}
            sponsoredCampaignTitle={restaurant.campaign_title || undefined}
            sponsoredCampaignBody={restaurant.campaign_body || undefined}
            sponsoredCampaignCreative={restaurant.campaign_creative}
          />
        </div>
      ))}
    </div>
  );
}

function Rail({
  title,
  subtitle,
  icon,
  restaurants,
  href,
  fullWidth = false,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  restaurants: DesktopCandidate[];
  href: string;
  fullWidth?: boolean;
}) {
  if (restaurants.length === 0) return null;

  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[#ef3219]">{icon}</span>
            <h2 className="truncate text-[19px] font-black leading-none tracking-[-0.025em] text-slate-950 xl:text-[21px]">{title}</h2>
          </div>
          {subtitle ? <p className="mt-1.5 text-[11px] font-semibold text-slate-500 xl:text-xs">{subtitle}</p> : null}
        </div>
        <Link to={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-700 transition hover:text-[#ef3219]">
          Voir tout <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <RestaurantGrid restaurants={restaurants} columns={fullWidth ? "full" : "dense"} />
    </section>
  );
}

export default function DesktopHomeExperience({
  offers,
  local,
  lunch,
  dinner,
  trending,
  catalogue,
  nearby,
  city = "Genève",
  trendingMode = "discover",
}: DesktopHomeExperienceProps) {
  const navigate = useNavigate();
  const [partySize, setPartySize] = useState("2");
  const [time, setTime] = useState("19:30");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const offerCards = uniqueCards([offers], DENSE_RAIL_SIZE);
  const favoriteCards = uniqueCards([trending, local, catalogue], DENSE_RAIL_SIZE);
  const localCards = uniqueCards([local, catalogue], DENSE_RAIL_SIZE);
  const lunchCards = uniqueCards([lunch, catalogue], FULL_RAIL_SIZE);
  const dinnerCards = uniqueCards([dinner, catalogue], FULL_RAIL_SIZE);
  const trendingCards = uniqueCards([trending, catalogue], FULL_RAIL_SIZE);
  const bestCards = uniqueCards([trending, local, lunch, dinner, catalogue], FULL_RAIL_SIZE);
  const nearbyCards = uniqueCards([nearby, local, catalogue], 5);
  const mapPins = useMemo(() => buildCoordinatePins(nearbyCards), [nearbyCards]);

  const cityLabel = String(city || "Genève");
  const citySearchHref = `/recherche?city=${encodeURIComponent(cityLabel)}`;

  const searchForTable = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({
      city: cityLabel,
      date: format(selectedDate, "yyyy-MM-dd"),
      time,
      party_size: partySize,
    });
    navigate(`/recherche?${params.toString()}`);
  };

  return (
    <div data-testid="desktop-home-reference-shell" className="hidden bg-white text-slate-950 lg:block">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid min-h-[64px] w-full max-w-[1800px] grid-cols-5 px-5 xl:px-8 2xl:px-10">
          {BENEFITS.map(({ icon: Icon, title, body, color }, index) => (
            <div key={title} className={`flex min-w-0 items-center gap-2 px-2 py-2.5 xl:gap-3 xl:px-4 ${index > 0 ? "border-l border-slate-200" : ""}`}>
              <Icon className={`h-6 w-6 shrink-0 xl:h-7 xl:w-7 ${color}`} />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[11px] font-black xl:text-[12px]">{title}</p>
                <p className="mt-0.5 line-clamp-2 text-[9px] font-medium text-slate-500 xl:text-[9.5px]">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <CuisineCategoryStrip />

      <div className="mx-auto w-full max-w-[1800px] space-y-10 px-5 pb-14 pt-6 xl:px-8 2xl:px-10">
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px] 2xl:gap-7">
          <div className="min-w-0 space-y-9">
            {offerCards.length > 0 ? (
              <Rail
                title="Offres du moment"
                subtitle="De vraies offres actives, jamais de faux rabais"
                restaurants={offerCards}
                icon={<Sparkles className="h-5 w-5 fill-[#ff9f1a] text-[#ff5a1f]" />}
                href="/recherche?sort=promotion&promo=true"
              />
            ) : null}

            <Rail
              title="Les tables préférées des Genevois"
              subtitle="Les adresses qui se distinguent en ce moment"
              restaurants={favoriteCards}
              icon={<Flame className="h-5 w-5 fill-[#ff4a1f]" />}
              href={citySearchHref}
            />

            <Rail
              title="Autour de Genève"
              subtitle="Davantage d’adresses à découvrir près de vous"
              restaurants={localCards}
              icon={<MapPin className="h-5 w-5 fill-[#ff4a1f]/15" />}
              href={citySearchHref}
            />
          </div>

          <aside className="min-w-0 space-y-4">
            <form onSubmit={searchForTable} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.07)] xl:p-5">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#ef3219]" />
                <h2 className="text-[17px] font-black tracking-[-0.03em] xl:text-[18px]">Réservez votre table</h2>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) setSelectedDate(date);
                  }}
                  disabled={(date) => isReservationCalendarDateDisabled(date)}
                  locale={fr}
                  initialFocus
                  className="mx-auto"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="relative">
                  <span className="sr-only">Nombre de personnes</span>
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                  <select
                    value={partySize}
                    onChange={(event) => setPartySize(event.target.value)}
                    aria-label="Nombre de personnes"
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[12px] font-bold outline-none transition focus:border-[#ff3b1c] focus:ring-2 focus:ring-orange-100"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((size) => (
                      <option key={size} value={size}>{size} personne{size > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </label>

                <label className="relative">
                  <span className="sr-only">Heure de réservation</span>
                  <AlarmClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                  <select
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    aria-label="Heure de réservation"
                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[12px] font-bold outline-none transition focus:border-[#ff3b1c] focus:ring-2 focus:ring-orange-100"
                  >
                    {["11:30", "12:00", "12:30", "13:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"].map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </label>
              </div>

              <Button type="submit" className="mt-3 h-11 w-full rounded-xl bg-[#ff3b1c] text-[12px] font-black text-white shadow-[0_9px_18px_rgba(255,59,28,0.23)] hover:bg-[#ec3018]">
                Rechercher une table <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </form>

            <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-black tracking-[-0.03em] xl:text-[18px]">Restaurants à proximité</h2>
                <Link to={citySearchHref} className="shrink-0 text-[10px] font-black text-blue-600 hover:underline">Voir la liste →</Link>
              </div>

              <div className="relative h-[190px] overflow-hidden rounded-xl border border-slate-200 bg-[#e9f3ec] [background-image:linear-gradient(rgba(255,255,255,.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.72)_1px,transparent_1px)] [background-size:28px_28px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,rgba(65,160,255,.16),transparent_24%),linear-gradient(120deg,transparent_32%,rgba(255,255,255,.8)_33%,rgba(255,255,255,.8)_38%,transparent_39%),linear-gradient(25deg,transparent_58%,rgba(255,255,255,.78)_59%,rgba(255,255,255,.78)_64%,transparent_65%)]" />
                {mapPins.map(({ restaurant, left, top }) => (
                  <Link
                    key={restaurant.id}
                    to={candidatePath(restaurant)}
                    aria-label={`Voir ${restaurant.name} sur la carte`}
                    className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#ff4a1f] text-white shadow-[0_4px_9px_rgba(0,0,0,0.2)] transition hover:scale-110"
                    style={{ left: `${left}%`, top: `${top}%` }}
                  >
                    <MapPin className="h-4 w-4 fill-white/20" />
                  </Link>
                ))}
                <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,.18)]" aria-label="Centre de Genève" />
                <span className="absolute bottom-2 right-2 rounded-full bg-white px-2 py-1 text-[9px] font-black shadow">Autour de Genève</span>
              </div>

              <div className="mt-3 space-y-1.5">
                {nearbyCards.map((restaurant) => (
                  <Link key={restaurant.id} to={candidatePath(restaurant)} className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 transition hover:bg-slate-50">
                    <img
                      src={restaurant.image_url || "/images/tok-restaurant-placeholder.svg"}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-black">{restaurant.name}</span>
                      <span className="block text-[9px] font-medium text-slate-500">À proximité</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <Link to="/reservations" className="flex min-h-[76px] items-center justify-between rounded-[20px] bg-[linear-gradient(90deg,#ff501d,#ff2e17)] px-5 text-white shadow-[0_12px_24px_rgba(255,58,26,0.24)] transition hover:brightness-105">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><Heart className="h-5 w-5" /></span>
                <span>
                  <span className="block text-[14px] font-black">Mes réservations</span>
                  <span className="block text-[10px] font-semibold text-white/85">Retrouvez vos prochaines tables TOK</span>
                </span>
              </div>
              <CalendarDays className="h-8 w-8" />
            </Link>
          </aside>
        </div>

        <div className="space-y-11 border-t border-slate-200 pt-9">
          <Rail
            title="Pour ce midi"
            subtitle="Une sélection variée pour déjeuner à Genève"
            restaurants={lunchCards}
            icon={<SunMedium className="h-6 w-6 text-amber-500" />}
            href={citySearchHref}
            fullWidth
          />

          <Rail
            title="Ce soir à Genève"
            subtitle="Des tables pour votre soirée, dans le design TOK que vous connaissez"
            restaurants={dinnerCards}
            icon={<MoonStar className="h-6 w-6 text-indigo-500" />}
            href={citySearchHref}
            fullWidth
          />

          <Rail
            title={trendingMode === "trending" ? "Tendances en ce moment" : "À découvrir"}
            subtitle={trendingMode === "trending" ? "Les adresses qui concentrent le plus de signaux positifs" : "Encore plus d’adresses TOK à explorer"}
            restaurants={trendingCards}
            icon={trendingMode === "trending" ? <TrendingUp className="h-6 w-6" /> : <Compass className="h-6 w-6" />}
            href={citySearchHref}
            fullWidth
          />

          <Rail
            title="Nos meilleures adresses"
            subtitle="Une sélection large pour que la page reste riche et vivante"
            restaurants={bestCards}
            icon={<Crown className="h-6 w-6 fill-[#ff9d19] text-[#f04b1d]" />}
            href="/recherche?sort=note"
            fullWidth
          />
        </div>
      </div>
    </div>
  );
}

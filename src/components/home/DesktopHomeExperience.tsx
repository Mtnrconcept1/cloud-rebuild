import { type FormEvent, useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  Crown,
  Flame,
  Heart,
  Leaf,
  MapPin,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import DesktopRestaurantCard from "@/components/home/DesktopRestaurantCard";
import type { HomeRestaurantCandidate } from "@/lib/homeRestaurantDiscovery";

type DesktopCandidate = HomeRestaurantCandidate & {
  slug?: string | null;
  supports_reservation?: boolean | null;
};

type DesktopHomeExperienceProps = {
  offers: DesktopCandidate[];
  favorites: DesktopCandidate[];
  best: DesktopCandidate[];
  nearby: DesktopCandidate[];
  city?: string | null;
};

type CoordinatePin = {
  restaurant: DesktopCandidate;
  left: number;
  top: number;
};

const BENEFITS = [
  { icon: Flame, title: "Vente flash", body: "Jusqu’à -50% sur une sélection de tables", color: "text-[#ef3219]" },
  { icon: Leaf, title: "Anti gaspi", body: "Des tables à prix réduits en dernière minute", color: "text-emerald-700" },
  { icon: AlarmClock, title: "Zéro attente", body: "Votre table est prête à votre arrivée", color: "text-[#ff4a1f]" },
  { icon: Heart, title: "Restaurants d’exception", body: "Sélectionnés par Tok", color: "text-[#ff3c1f]" },
  { icon: Users, title: "Pour toutes les occasions", body: "En amoureux, entre amis, en famille", color: "text-[#ff4a1f]" },
] as const;

function uniqueCards(primary: DesktopCandidate[], fallback: DesktopCandidate[], limit = 4) {
  const seen = new Set<string>();
  const result: DesktopCandidate[] = [];
  for (const restaurant of [...primary, ...fallback]) {
    const id = String(restaurant?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(restaurant);
    if (result.length >= limit) break;
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

function Rail({
  title,
  subtitle,
  icon,
  restaurants,
  compact = false,
  href,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  restaurants: DesktopCandidate[];
  compact?: boolean;
  href: string;
}) {
  if (restaurants.length === 0) return null;

  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#ef3219]">{icon}</span>
            <h2 className="truncate text-[17px] font-black leading-none tracking-[-0.025em] text-slate-950">{title}</h2>
            {subtitle ? <span className="hidden truncate text-[10px] font-medium text-slate-500 xl:inline">{subtitle}</span> : null}
          </div>
        </div>
        <Link to={href} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black text-slate-700 hover:text-[#ef3219]">
          Voir tout <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2.5 xl:grid-cols-4">
        {restaurants.map((restaurant) => (
          <DesktopRestaurantCard key={restaurant.id} restaurant={restaurant} compact={compact} />
        ))}
      </div>
    </section>
  );
}

export default function DesktopHomeExperience({
  offers,
  favorites,
  best,
  nearby,
  city = "Genève",
}: DesktopHomeExperienceProps) {
  const navigate = useNavigate();
  const [partySize, setPartySize] = useState("2");
  const [time, setTime] = useState("19:30");
  const today = useMemo(() => new Date(), []);
  const selectedDate = useMemo(() => {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [today]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric" }).format(today),
    [today],
  );
  const calendarDays = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    const mondayFirstOffset = (first.getDay() + 6) % 7;
    return [
      ...Array.from({ length: mondayFirstOffset }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ];
  }, [today]);

  const fallback = [...offers, ...favorites, ...best, ...nearby];
  const offerCards = uniqueCards(offers, [], 4);
  const favoriteCards = uniqueCards(favorites, [...nearby, ...best, ...offers], 4);
  const bestCards = uniqueCards(best, [...offers, ...nearby, ...favorites], 4);
  const nearbyCards = uniqueCards(nearby, fallback, 5);
  const mapPins = buildCoordinatePins(nearbyCards);

  const searchForTable = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({
      city: String(city || "Genève"),
      date: selectedDate,
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

      <div className="mx-auto grid w-full max-w-[1800px] grid-cols-[minmax(0,1fr)_340px] gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-5 xl:px-8 2xl:px-10">
        <div className="min-w-0 space-y-3.5">
          <Rail
            title="Offres du moment"
            restaurants={offerCards}
            icon={<Sparkles className="h-5 w-5 fill-[#ff9f1a] text-[#ff5a1f]" />}
            href="/recherche?sort=promotion&promo=true"
          />
          <Rail
            title="Les tables préférées des Genevois"
            subtitle="Ces adresses font la fierté de Genève"
            restaurants={favoriteCards}
            icon={<Flame className="h-5 w-5 fill-[#ff4a1f]" />}
            href={`/recherche?city=${encodeURIComponent(String(city || "Genève"))}`}
          />
          <Rail
            title="Nos meilleures adresses"
            subtitle="Une sélection Tok pour tous les gourmets"
            restaurants={bestCards}
            compact
            icon={<Crown className="h-5 w-5 fill-[#ff9d19] text-[#f04b1d]" />}
            href="/recherche?sort=note"
          />
        </div>

        <aside className="min-w-0 space-y-3.5">
          <form onSubmit={searchForTable} className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-[0_4px_18px_rgba(15,23,42,0.05)] xl:p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#ef3219]" />
              <h2 className="text-[16px] font-black tracking-[-0.03em] xl:text-[17px]">Réservez votre table</h2>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_150px]">
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between text-[12px] font-black capitalize">
                  <span>{monthLabel}</span>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center text-[9px] font-bold text-slate-500">
                  {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <span key={day}>{day}</span>)}
                  {calendarDays.map((day, index) => (
                    <span
                      key={`${day ?? "empty"}-${index}`}
                      className={`mx-auto grid h-5 w-5 place-items-center rounded-full text-[9px] ${day === today.getDate() ? "bg-[#ff3b1c] font-black text-white" : "text-slate-700"}`}
                    >
                      {day || ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 xl:flex xl:flex-col">
                <label className="relative">
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                  <select
                    value={partySize}
                    onChange={(event) => setPartySize(event.target.value)}
                    aria-label="Nombre de personnes"
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[11px] font-bold outline-none focus:border-[#ff3b1c]"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((size) => <option key={size} value={size}>{size} personne{size > 1 ? "s" : ""}</option>)}
                  </select>
                </label>
                <label className="relative">
                  <AlarmClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-700" />
                  <select
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    aria-label="Heure de réservation"
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[11px] font-bold outline-none focus:border-[#ff3b1c]"
                  >
                    {["18:30", "19:00", "19:30", "20:00", "20:30", "21:00"].map((slot) => <option key={slot}>{slot}</option>)}
                  </select>
                </label>
                <button type="submit" className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff3b1c] px-4 text-[11px] font-black text-white shadow-[0_9px_18px_rgba(255,59,28,0.23)] transition hover:bg-[#ec3018] xl:mt-auto">
                  Rechercher une table <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          <section className="rounded-[18px] border border-slate-200 bg-white p-3.5 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-black tracking-[-0.03em] xl:text-[17px]">Restaurants à proximité</h2>
              <Link to={`/recherche?city=${encodeURIComponent(String(city || "Genève"))}`} className="shrink-0 text-[10px] font-black text-blue-600 hover:underline">Voir sur la carte →</Link>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_130px]">
              <div className="relative h-[155px] overflow-hidden rounded-xl border border-slate-200 bg-[#e9f3ec] [background-image:linear-gradient(rgba(255,255,255,.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.72)_1px,transparent_1px)] [background-size:28px_28px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,rgba(65,160,255,.16),transparent_24%),linear-gradient(120deg,transparent_32%,rgba(255,255,255,.8)_33%,rgba(255,255,255,.8)_38%,transparent_39%),linear-gradient(25deg,transparent_58%,rgba(255,255,255,.78)_59%,rgba(255,255,255,.78)_64%,transparent_65%)]" />
                {mapPins.map(({ restaurant, left, top }) => (
                  <Link
                    key={restaurant.id}
                    to={`/restaurant/${restaurant.id}`}
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

              <div className="grid grid-cols-2 gap-1.5 overflow-hidden xl:block xl:space-y-1.5">
                {nearbyCards.map((restaurant) => (
                  <Link key={restaurant.id} to={`/restaurant/${restaurant.id}`} className="flex min-w-0 items-center gap-2 rounded-lg p-1 transition hover:bg-slate-50">
                    <img src={restaurant.image_url || "/images/tok-restaurant-placeholder.svg"} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" loading="lazy" />
                    <span className="min-w-0">
                      <span className="block truncate text-[9.5px] font-black">{restaurant.name}</span>
                      <span className="block text-[8.5px] font-medium text-slate-500">À proximité</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <Link to="/reservations" className="flex h-[72px] items-center justify-between rounded-[18px] bg-[linear-gradient(90deg,#ff501d,#ff2e17)] px-5 text-white shadow-[0_12px_24px_rgba(255,58,26,0.24)] transition hover:brightness-105">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/16"><Heart className="h-5 w-5 fill-white/15" /></span>
              <span>
                <span className="block text-[14px] font-black">Mes réservations</span>
                <span className="block text-[10px] font-semibold text-white/85">Retrouvez vos prochaines tables TOK</span>
              </span>
            </div>
            <CalendarDays className="h-8 w-8" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

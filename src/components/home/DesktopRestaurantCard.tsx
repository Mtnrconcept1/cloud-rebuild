import { CalendarDays, Clock3, Heart, Star, Users } from "lucide-react";
import { Link } from "react-router-dom";

import type { HomeRestaurantCandidate } from "@/lib/homeRestaurantDiscovery";
import { getOptimizedImageUrl } from "@/lib/optimizedImages";
import { buildRestaurantSeoPath } from "@/lib/restaurantSlugs";
import { cn } from "@/lib/utils";

type DesktopRestaurant = HomeRestaurantCandidate & {
  slug?: string | null;
  price_range?: number | null;
  discount_percent?: number | null;
  max_discount_percent?: number | null;
  best_discount_percent?: number | null;
  supports_reservation?: boolean | null;
};

function discountLabel(restaurant: DesktopRestaurant) {
  const discount = Number(
    restaurant.discount_percent
      ?? restaurant.max_discount_percent
      ?? restaurant.best_discount_percent
      ?? 0,
  );
  if (!Number.isFinite(discount) || discount <= 0) return null;
  return `-${Math.round(discount)}%`;
}

export default function DesktopRestaurantCard({
  restaurant,
  compact = false,
}: {
  restaurant: DesktopRestaurant;
  compact?: boolean;
}) {
  const path = buildRestaurantSeoPath({
    id: restaurant.id,
    name: restaurant.name,
    city: restaurant.city || undefined,
    slug: restaurant.slug || null,
  });
  const image = getOptimizedImageUrl(restaurant.image_url || "/images/tok-restaurant-placeholder.svg", "card");
  const rating = Number(restaurant.rating || 0);
  const reviews = Number(restaurant.review_count || 0);
  const offer = discountLabel(restaurant);
  const cuisine = String(restaurant.cuisine_type || "Restaurant");
  const canReserve = restaurant.supports_reservation === true;

  return (
    <article className="group min-w-0 overflow-hidden rounded-[9px] border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_7px_18px_rgba(15,23,42,0.12)]">
      <div className={cn("relative overflow-hidden bg-slate-100", compact ? "h-[72px]" : "h-[88px]")}>
        <Link to={path} aria-label={`Voir ${restaurant.name}`}>
          <img
            src={image}
            alt={restaurant.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]"
            loading="lazy"
            decoding="async"
          />
        </Link>
        {offer ? (
          <span className="absolute left-0 top-0 rounded-br-lg bg-[#f5221b] px-2 py-1 text-[11px] font-black text-white shadow-sm">
            {offer}
          </span>
        ) : null}
        <Link
          to="/profil?tab=favoris"
          aria-label="Voir mes favoris"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/38 text-white backdrop-blur-sm transition hover:bg-black/55"
        >
          <Heart className="h-4 w-4" />
        </Link>
      </div>

      <div className={cn("min-w-0", compact ? "px-2.5 pb-2 pt-1.5" : "px-2.5 pb-2.5 pt-2")}>
        <Link to={path} className="block truncate text-[13px] font-black leading-tight text-slate-950 hover:text-[#ef3219]">
          {restaurant.name}
        </Link>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-[9.5px] font-semibold text-slate-500">
          {rating > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-black text-[#ed5b18]">
              {rating.toFixed(1)} <Star className="h-2.5 w-2.5 fill-[#f59e0b] text-[#f59e0b]" />
            </span>
          ) : null}
          {reviews > 0 ? <span className="shrink-0">({reviews.toLocaleString("fr-CH")})</span> : null}
          <span className="text-slate-300">•</span>
          <span className="truncate">{cuisine}</span>
        </div>

        {!compact ? (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-[#fafafa] px-1.5 text-[9px] font-bold text-slate-700">
              <CalendarDays className="h-3 w-3 text-[#f12c1a]" /> Aujourd’hui
            </span>
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-[#fafafa] px-1.5 text-[9px] font-bold text-slate-700">
              <Clock3 className="h-3 w-3 text-[#f12c1a]" /> Horaires
            </span>
            <span className="inline-flex h-6 items-center gap-1 rounded-md bg-[#fafafa] px-1.5 text-[9px] font-bold text-slate-700">
              <Users className="h-3 w-3" /> Table
            </span>
          </div>
        ) : null}

        <div className={cn("flex items-center justify-between gap-2", compact ? "mt-1" : "mt-1.5")}>
          <span className={cn("truncate text-[9px] font-bold", canReserve ? "text-emerald-700" : "text-slate-500")}>
            {canReserve ? "● Voir les créneaux" : "Voir les détails"}
          </span>
          {canReserve ? (
            <Link
              to={`${path}?reserve=true`}
              className="shrink-0 text-[9px] font-black text-[#ef3219] hover:underline"
            >
              Réserver
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

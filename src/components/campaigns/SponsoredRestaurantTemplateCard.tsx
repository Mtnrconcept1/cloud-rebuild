import { ArrowRight, BellRing, Heart, MapPin, Megaphone, Percent, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";

import PriceRangeIcons from "@/components/PriceRangeIcons";
import {
  normalizeCampaignCreative,
  type CampaignCreativeConfig,
  type CampaignCreativeTextElement,
  type CampaignCreativeTextStyle,
} from "@/lib/campaignCreative";
import { cn } from "@/lib/utils";

const DEFAULT_IMAGE = "/images/pasta-assortment.jpeg";

type SponsoredCreativeVariant = "card" | "banner" | "push";

type SponsoredRestaurantTemplateCardProps = {
  creative?: CampaignCreativeConfig | unknown;
  imageUrl?: string;
  restaurantName: string;
  cuisine?: string;
  city?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  priceRange?: number;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  discountLabel?: string;
  slots?: string[];
  className?: string;
  variant?: SponsoredCreativeVariant;
  selectedTextElement?: CampaignCreativeTextElement | null;
  draggingTextElement?: CampaignCreativeTextElement | null;
  onTextPointerDown?: never;
  isFavorite?: boolean;
  onFavoriteClick?: (event: MouseEvent<HTMLButtonElement>) => void;
};

function getSlotDiscountLabel(discountLabel?: string): string {
  const match = discountLabel?.match(/-\s?\d+(?:[.,]\d+)?%/);
  return match ? match[0].replace(/\s/g, "").replace(",", ".") : "";
}

function getTypographyClass(style: CampaignCreativeTextStyle) {
  return cn(
    style.font === "display" && "font-display",
    style.font === "serif" && "font-serif",
    style.font === "sans" && "font-sans",
    style.style === "bold" && "font-black",
    style.style === "italic" && "italic",
    style.style === "normal" && "font-medium",
  );
}

function OfferText({
  creative,
  headline,
  body,
  compact = false,
}: {
  creative: CampaignCreativeConfig;
  headline: string;
  body: string;
  compact?: boolean;
}) {
  const headlineStyle = creative.text.headline;
  const bodyStyle = creative.text.body;

  return (
    <div className="min-w-0">
      <p
        className={cn(
          "line-clamp-2 leading-tight",
          compact ? "text-sm" : "text-base",
          getTypographyClass(headlineStyle),
        )}
        style={{ color: headlineStyle.color }}
      >
        {headline}
      </p>
      {body ? (
        <p
          className={cn(
            "mt-1 line-clamp-2 leading-5",
            compact ? "text-xs" : "text-sm",
            getTypographyClass(bodyStyle),
          )}
          style={{ color: bodyStyle.color }}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function SponsoredRestaurantTemplateCard({
  creative,
  imageUrl,
  restaurantName,
  cuisine,
  city,
  address,
  rating,
  reviewCount,
  priceRange = 2,
  headline,
  body,
  ctaLabel = "Découvrir l'offre",
  discountLabel = "Jusqu'à -18%",
  slots = ["18:30", "19:00"],
  className,
  variant = "card",
  isFavorite = false,
  onFavoriteClick,
}: SponsoredRestaurantTemplateCardProps) {
  const normalized = normalizeCampaignCreative(creative);
  const displayRating = Number(rating || 0) > 0 ? Math.min(Number(rating || 0), 10).toFixed(1) : "5.7";
  const safeReviewCount = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 3;
  const displayCity = city || "Puplinge";
  const displayAddress = address || "Rue de Graman";
  const displayCuisine = cuisine || "Italien";
  const displayHeadline = headline?.trim() || "Vos ventes flash Quirinale";
  const displayBody = body?.trim() || "Mettez vos ventes flash en avant pour accélérer les commandes.";
  const slotDiscountLabel = getSlotDiscountLabel(discountLabel);

  if (variant === "banner") {
    return (
      <article
        className={cn(
          "group relative isolate min-h-[340px] w-full overflow-hidden rounded-[30px] border border-white/70 bg-slate-950 text-white shadow-[0_22px_60px_rgba(15,23,42,0.22)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.28)]",
          className,
        )}
      >
        <img
          src={imageUrl || DEFAULT_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,13,22,0.84)_0%,rgba(10,13,22,0.56)_46%,rgba(10,13,22,0.10)_100%)]" />
        <div className="absolute left-5 top-5 z-20 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_14px_28px_rgba(249,115,22,0.34)]">
          <Megaphone className="h-3.5 w-3.5" />
          Sponsorisé
        </div>
        <div className="relative z-10 flex min-h-[340px] max-w-[560px] flex-col justify-end p-5 sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/82">
            <span className="font-display text-2xl font-black text-white sm:text-3xl">{restaurantName}</span>
            <span>·</span>
            <span>{displayCuisine}</span>
            <span>·</span>
            <span>{displayCity}</span>
          </div>
          <div className="rounded-[26px] border border-white/18 bg-white/12 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-5">
            <div className="mb-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-primary">
              {discountLabel}
            </div>
            <OfferText creative={normalized} headline={displayHeadline} body={displayBody} />
            <span className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-[0_14px_28px_rgba(15,23,42,0.22)]">
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "push") {
    return (
      <article
        className={cn(
          "relative isolate h-[176px] w-full overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.12)]",
          className,
        )}
      >
        <div className="absolute left-4 top-4 z-30 grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-orange-50">
          <img src={imageUrl || DEFAULT_IMAGE} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        </div>
        <BellRing className="absolute right-5 top-5 h-5 w-5 text-primary" />
        <div className="ml-[72px] mr-12 mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Sponsorisé</p>
          <p className="mt-1 text-sm font-black text-slate-950">{restaurantName}</p>
          <OfferText creative={normalized} headline={displayHeadline} body={displayBody} compact />
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "ad-card-spotlight premium-card neon-card group flex h-full w-full flex-col overflow-hidden rounded-[26px] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,248,238,0.98),rgba(255,255,255,0.98))] shadow-[0_18px_46px_rgba(249,115,22,0.16)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_54px_rgba(249,115,22,0.22)]",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={imageUrl || DEFAULT_IMAGE}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/62 via-slate-950/10 to-transparent" />
        <div className="absolute left-3 right-14 top-3 flex flex-wrap items-start gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/35 bg-primary/95 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-sm backdrop-blur-md">
            <Megaphone className="h-3 w-3" />
            Sponsorisé
          </span>
        </div>
        <button
          type="button"
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition-colors hover:bg-white"
          onClick={onFavoriteClick}
        >
          <Heart className={cn("h-4 w-4 text-red-500", isFavorite && "fill-current")} />
        </button>
        <div className="absolute bottom-3 left-3 right-3 flex items-end">
          <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/30 bg-gradient-to-r from-primary via-orange-500 to-emerald-600 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur-md">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20">
              <Percent className="h-3.5 w-3.5" />
            </span>
            Promo {discountLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-display text-base font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
              {restaurantName}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90">
              <span className="max-w-full truncate">{displayCuisine}</span>
              <span className="text-border">/</span>
              <PriceRangeIcons range={priceRange} />
              <span>Premium</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="inline-flex min-w-[2.7rem] items-center justify-center rounded-xl bg-orange-500 px-2.5 py-1.5 text-sm font-bold text-white">
              {displayRating}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">({safeReviewCount})</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary/75" />
            <span className="font-medium text-foreground/90">{displayCity}</span>
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {displayAddress}
        </p>

        <div className="mt-3 rounded-[22px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,248,230,0.95),rgba(255,255,255,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffedd5] via-[#fff7ed] to-[#fef3c7] text-amber-600 shadow-[0_10px_22px_rgba(249,115,22,0.14)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <OfferText creative={normalized} headline={displayHeadline} body={displayBody} />
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-orange-500 to-orange-600 px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(249,115,22,0.26)]">
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </div>
            {slots.slice(0, 2).map((slot) => (
              <span
                key={slot}
                className="inline-flex h-12 min-w-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3.5 font-bold text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)]"
              >
                <span className="text-sm leading-none">{slot}</span>
                {slotDiscountLabel ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700 shadow-sm">
                    <Percent className="h-2.5 w-2.5" />
                    {slotDiscountLabel}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Créneaux promo visibles. Plus d'options sur la fiche.
          </p>
        </div>
      </div>
    </article>
  );
}

export default SponsoredRestaurantTemplateCard;

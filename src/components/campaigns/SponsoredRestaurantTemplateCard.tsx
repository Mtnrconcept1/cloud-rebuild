import { ArrowRight, BellRing, Heart, MapPin, Megaphone, Percent, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";

import PriceRangeIcons from "@/components/PriceRangeIcons";
import {
  normalizeCampaignCreative,
  type CampaignBannerSeparator,
  type CampaignBannerTextPlacement,
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

function getBannerLayoutClass(placement: CampaignBannerTextPlacement) {
  if (placement === "right") return "flex-col lg:flex-row-reverse";
  if (placement === "top") return "flex-col";
  if (placement === "bottom") return "flex-col-reverse";
  return "flex-col lg:flex-row";
}

function getBannerTextPanelClass(placement: CampaignBannerTextPlacement) {
  return cn(
    "relative z-20 flex min-w-0 flex-col justify-center bg-white p-5 text-slate-950 dark:bg-slate-950 dark:text-white sm:p-7",
    placement === "left" || placement === "right" ? "lg:min-h-[300px] lg:w-[42%] lg:max-w-[480px]" : "w-full",
    placement === "top" || placement === "bottom" ? "min-h-[178px]" : "min-h-[220px]",
  );
}

function getBannerPhotoPanelClass(placement: CampaignBannerTextPlacement) {
  return cn(
    "relative isolate min-h-[230px] min-w-0 flex-1 overflow-hidden bg-slate-900",
    placement === "left" || placement === "right" ? "lg:min-h-[300px]" : "min-h-[260px]",
  );
}

function getBannerSeparatorClass(placement: CampaignBannerTextPlacement, separator: CampaignBannerSeparator) {
  if (separator === "fade") {
    if (placement === "left") return "left-0 top-0 h-20 w-full bg-gradient-to-b from-white via-white/70 to-transparent dark:from-slate-950 dark:via-slate-950/70 lg:-left-1 lg:h-full lg:w-24 lg:bg-gradient-to-r";
    if (placement === "right") return "left-0 top-0 h-20 w-full bg-gradient-to-b from-white via-white/70 to-transparent dark:from-slate-950 dark:via-slate-950/70 lg:left-auto lg:right-0 lg:-right-1 lg:h-full lg:w-24 lg:bg-gradient-to-l";
    if (placement === "top") return "left-0 top-0 h-20 w-full bg-gradient-to-b from-white via-white/70 to-transparent dark:from-slate-950 dark:via-slate-950/70";
    return "bottom-0 left-0 h-20 w-full bg-gradient-to-t from-white via-white/70 to-transparent dark:from-slate-950 dark:via-slate-950/70";
  }

  if (separator === "straight") {
    if (placement === "left") return "left-0 top-0 h-px w-full bg-white/90 dark:bg-slate-950/90 lg:-left-px lg:h-full lg:w-px";
    if (placement === "right") return "left-0 top-0 h-px w-full bg-white/90 dark:bg-slate-950/90 lg:left-auto lg:right-0 lg:-right-px lg:h-full lg:w-px";
    if (placement === "top") return "left-0 top-0 h-px w-full bg-white/90 dark:bg-slate-950/90";
    return "bottom-0 left-0 h-px w-full bg-white/90 dark:bg-slate-950/90";
  }

  if (separator === "wave") {
    if (placement === "left") return "left-0 -top-9 h-20 w-full rounded-[0_0_60%_60%] bg-white dark:bg-slate-950 lg:-left-8 lg:top-0 lg:h-full lg:w-20 lg:rounded-[55%]";
    if (placement === "right") return "left-0 -top-9 h-20 w-full rounded-[0_0_60%_60%] bg-white dark:bg-slate-950 lg:left-auto lg:-right-8 lg:top-0 lg:h-full lg:w-20 lg:rounded-[55%]";
    if (placement === "top") return "left-0 -top-9 h-20 w-full rounded-[0_0_60%_60%] bg-white dark:bg-slate-950";
    return "bottom-[-2.25rem] left-0 h-20 w-full rounded-[60%_60%_0_0] bg-white dark:bg-slate-950";
  }

  if (placement === "left") return "left-0 -top-8 h-20 w-full skew-y-[-2deg] bg-white dark:bg-slate-950 lg:-left-10 lg:top-0 lg:h-full lg:w-24 lg:skew-x-[-10deg] lg:skew-y-0";
  if (placement === "right") return "left-0 -top-8 h-20 w-full skew-y-[-2deg] bg-white dark:bg-slate-950 lg:left-auto lg:-right-10 lg:top-0 lg:h-full lg:w-24 lg:skew-x-[10deg] lg:skew-y-0";
  if (placement === "top") return "left-0 -top-8 h-20 w-full skew-y-[-2deg] bg-white dark:bg-slate-950";
  return "bottom-[-2rem] left-0 h-20 w-full skew-y-[2deg] bg-white dark:bg-slate-950";
}

function getBannerFallbackFadeClass(placement: CampaignBannerTextPlacement) {
  if (placement === "left") return "left-0 top-0 h-16 w-full bg-gradient-to-b from-white/80 to-transparent dark:from-slate-950/80 lg:h-full lg:w-20 lg:bg-gradient-to-r";
  if (placement === "right") return "left-0 top-0 h-16 w-full bg-gradient-to-b from-white/80 to-transparent dark:from-slate-950/80 lg:left-auto lg:right-0 lg:h-full lg:w-20 lg:bg-gradient-to-l";
  if (placement === "top") return "left-0 top-0 h-16 w-full bg-gradient-to-b from-white/80 to-transparent dark:from-slate-950/80";
  return "bottom-0 left-0 h-16 w-full bg-gradient-to-t from-white/80 to-transparent dark:from-slate-950/80";
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
    const placement = normalized.bannerTextPlacement;
    const separator = normalized.bannerSeparator;
    const isFadeSeparator = separator === "fade";

    return (
      <article
        className={cn(
          "group relative isolate w-full overflow-hidden rounded-[30px] border border-orange-100 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.14)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-950",
          className,
        )}
      >
        <div className={cn("flex min-h-[300px]", getBannerLayoutClass(placement))}>
          <div className={getBannerTextPanelClass(placement)}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_12px_26px_rgba(249,115,22,0.26)]">
                <Megaphone className="h-3.5 w-3.5" />
                Sponsorisé
              </span>
              <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20">
                {discountLabel}
              </span>
            </div>

            <div className="mt-5 min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                {displayCuisine} · {displayCity}
              </p>
              <h3 className="mt-1 truncate font-display text-3xl font-black leading-none text-slate-950 dark:text-white sm:text-4xl">
                {restaurantName}
              </h3>
              <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{displayAddress}</span>
              </p>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 shadow-inner dark:border-slate-800 dark:bg-slate-900/80">
              <OfferText creative={normalized} headline={displayHeadline} body={displayBody} />
            </div>

            <span className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)] dark:bg-white dark:text-slate-950">
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          <div className={getBannerPhotoPanelClass(placement)}>
            <img
              src={imageUrl || DEFAULT_IMAGE}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl transition-transform duration-700 group-hover:scale-[1.16]"
              loading="lazy"
              decoding="async"
            />
            <img
              src={imageUrl || DEFAULT_IMAGE}
              alt=""
              className="absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-700 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950/10 via-transparent to-slate-950/26" />
            <div className="absolute right-4 top-4 z-20 rounded-full bg-white/92 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-900 shadow-sm backdrop-blur">
              Photo mise en avant
            </div>
            <div className={cn("pointer-events-none absolute z-10", getBannerSeparatorClass(placement, separator))} />
            {isFadeSeparator ? null : (
              <div className={cn("pointer-events-none absolute z-10 opacity-70", getBannerFallbackFadeClass(placement))} />
            )}
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

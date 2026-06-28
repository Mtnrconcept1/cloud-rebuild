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
  compactBanner?: boolean;
  selectedTextElement?: CampaignCreativeTextElement | null;
  draggingTextElement?: CampaignCreativeTextElement | null;
  onTextPointerDown?: never;
  isFavorite?: boolean;
  onFavoriteClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onSlotClick?: (event: MouseEvent<HTMLButtonElement>, slot: string) => void;
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
  slots = [],
  className,
  variant = "card",
  compactBanner = false,
  isFavorite = false,
  onFavoriteClick,
  onSlotClick,
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
    const secondaryBadge = discountLabel?.trim();
    const showSecondaryBadge = Boolean(secondaryBadge && !/^sponsor/i.test(secondaryBadge));

    return (
      <article
        className={cn(
          "ad-banner-spotlight group relative isolate w-full overflow-hidden rounded-[30px] border border-orange-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_82px_rgba(249,115,22,0.18)] dark:border-slate-800 dark:bg-slate-950",
          className,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_42%,rgba(180,83,9,0.23),transparent_34%),linear-gradient(90deg,#ffffff_0%,#fffaf3_48%,#b45309_100%)] dark:bg-[linear-gradient(90deg,#020617_0%,#111827_50%,#9a3412_100%)]" />
        <div className="absolute right-0 top-0 hidden h-full w-[57%] rounded-l-[120px] bg-gradient-to-br from-orange-200/85 via-orange-700/90 to-[#9a3412] lg:block" />
        <div className="absolute bottom-0 right-0 h-1/2 w-full bg-gradient-to-t from-orange-500/18 to-transparent lg:hidden" />

        <div
          className={cn(
            "relative z-10 grid lg:grid-rows-1",
            compactBanner
              ? "min-h-[268px] grid-rows-[auto_minmax(116px,1fr)] lg:h-[268px] lg:grid-cols-[minmax(280px,0.78fr)_minmax(360px,1.22fr)]"
              : "min-h-[570px] grid-rows-[auto_minmax(250px,1fr)] lg:min-h-[366px] lg:grid-cols-[minmax(340px,0.84fr)_minmax(460px,1.16fr)]",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col justify-center",
              compactBanner ? "p-4 pb-2 sm:p-5 sm:pb-3 lg:overflow-hidden lg:p-5 xl:p-6" : "p-5 pb-3 sm:p-8 sm:pb-4 lg:p-10 xl:p-12",
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary-foreground shadow-[0_14px_28px_rgba(255,90,0,0.24)]">
                <Megaphone className="h-3.5 w-3.5" />
                Sponsorisé
              </span>
              {showSecondaryBadge ? (
                <span className="inline-flex rounded-full bg-orange-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-primary ring-1 ring-orange-100 dark:bg-orange-400/10 dark:text-orange-100 dark:ring-orange-300/20">
                  {secondaryBadge}
                </span>
              ) : null}
            </div>

            <div className={cn("min-w-0", compactBanner ? "mt-3 lg:mt-4" : "mt-6 lg:mt-7")}>
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-slate-500 dark:text-slate-300">
                {displayCuisine} · {displayCity}
              </p>
              <h3
                className={cn(
                  "mt-1 line-clamp-2 font-display font-black leading-[0.92] text-slate-950 dark:text-white",
                  compactBanner ? "text-2xl sm:text-3xl lg:text-[2.25rem]" : "text-4xl sm:text-5xl lg:text-[3.9rem]",
                )}
              >
                {restaurantName}
              </h3>
              <p
                className={cn(
                  "flex min-w-0 items-center gap-2 font-medium text-slate-500 dark:text-slate-300",
                  compactBanner ? "mt-2 text-sm" : "mt-3 text-base",
                )}
              >
                <MapPin className={cn("shrink-0 text-primary", compactBanner ? "h-4 w-4" : "h-5 w-5")} />
                <span className="truncate">{displayAddress}</span>
              </p>
            </div>

            <div
              className={cn(
                "rounded-[26px] border border-orange-100 bg-white/86 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/8",
                compactBanner ? "mt-3 p-3 sm:p-3.5" : "mt-7 p-4 sm:p-5",
              )}
            >
              <div className={cn("flex items-start", compactBanner ? "gap-3" : "gap-4")}>
                <div
                  className={cn(
                    "hidden shrink-0 place-items-center rounded-full bg-orange-50 text-primary ring-1 ring-orange-100 sm:grid",
                    compactBanner ? "h-10 w-10" : "h-14 w-14",
                  )}
                >
                  <Sparkles className={compactBanner ? "h-4 w-4" : "h-6 w-6"} />
                </div>
                <OfferText creative={normalized} headline={displayHeadline} body={displayBody} compact={compactBanner} />
              </div>
            </div>

          </div>

          <div
            className={cn(
              "relative z-20 flex min-w-0 items-end pt-0 lg:items-center",
              compactBanner ? "p-4 pt-0 sm:p-5 sm:pt-0 lg:h-full lg:p-5 xl:p-6" : "p-5 pt-0 sm:p-8 sm:pt-0 lg:p-8 xl:p-10",
            )}
          >
            <div
              className={cn(
                "relative h-full w-full overflow-hidden rounded-[30px] shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-white/35 lg:rounded-[34px]",
                compactBanner ? "min-h-[116px] bg-white sm:min-h-[136px] lg:min-h-0" : "min-h-[250px] bg-slate-950 sm:min-h-[300px] lg:min-h-[292px]",
              )}
            >
              <img
                src={imageUrl || DEFAULT_IMAGE}
                alt=""
                className={cn(
                  "h-full w-full transition-transform duration-700 group-hover:scale-[1.035]",
                  compactBanner ? "object-contain" : "object-cover",
                )}
                loading="lazy"
                decoding="async"
                height={450}
                width={720}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/18 via-transparent to-slate-950/10" />
            </div>
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
          <img src={imageUrl || DEFAULT_IMAGE} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" height={176} width={176} />
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
          height={360}
          width={576}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/62 via-slate-950/10 to-transparent" />
        <div className="absolute left-3 right-14 top-3 flex flex-wrap items-start gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/35 bg-primary/95 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-primary-foreground shadow-sm backdrop-blur-md">
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
          <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/30 bg-gradient-to-r from-[#8f2f0a] via-[#b45309] to-[#047857] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur-md">
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
            <div className="inline-flex min-w-[2.7rem] items-center justify-center rounded-xl bg-orange-700 px-2.5 py-1.5 text-sm font-bold text-white">
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
            <div className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8f2f0a] via-[#b45309] to-[#9a3412] px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(154,52,18,0.24)]">
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </div>
            {slots.slice(0, 2).map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={onSlotClick ? (event) => onSlotClick(event, slot) : undefined}
                className="inline-flex h-12 min-w-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3.5 font-bold text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)]"
              >
                <span className="text-sm leading-none">{slot}</span>
                {slotDiscountLabel ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700 shadow-sm">
                    <Percent className="h-2.5 w-2.5" />
                    {slotDiscountLabel}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {slots.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
            Créneaux promo visibles. Plus d'options sur la fiche.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default SponsoredRestaurantTemplateCard;

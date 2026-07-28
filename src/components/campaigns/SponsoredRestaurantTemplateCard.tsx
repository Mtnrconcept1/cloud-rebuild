import { ArrowRight, BellRing, Heart, MapPin, Megaphone, Percent, Sparkles, Zap } from "lucide-react";
import type { CSSProperties, MouseEvent, SyntheticEvent } from "react";

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

function stopNestedCardAction(event: SyntheticEvent) {
  event.stopPropagation();
}

function getTypographyClass(style: CampaignCreativeTextStyle) {
  return cn(
    style.font === "display" && "font-display",
    style.font === "serif" && "font-serif",
    style.font === "sans" && "font-sans",
    style.font === "rounded" && "font-sans tracking-wide",
    style.font === "mono" && "font-mono",
    style.style === "bold" && "font-black",
    style.style === "italic" && "italic",
    style.style === "normal" && "font-medium",
  );
}

function getTextInlineStyle(style: CampaignCreativeTextStyle): CSSProperties {
  return { color: style.color };
}

function getCreativeCopy(
  creative: CampaignCreativeConfig,
  element: CampaignCreativeTextElement,
  fallback: string,
) {
  return creative.copy[element]?.trim() || fallback;
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
        style={getTextInlineStyle(headlineStyle)}
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
          style={getTextInlineStyle(bodyStyle)}
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
  discountLabel = "Jusqu’à -18%",
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
  const displayBadge = getCreativeCopy(normalized, "badge", "Sponsorisé");
  const displayDiscount = getCreativeCopy(normalized, "discount", discountLabel || "");
  const displayEyebrow = getCreativeCopy(normalized, "eyebrow", `${displayCuisine} · ${displayCity}`);
  const displayRestaurantName = getCreativeCopy(normalized, "restaurant", restaurantName);
  const displayTagline = getCreativeCopy(normalized, "tagline", "Savourez l'instant");
  const displayAddressCopy = getCreativeCopy(normalized, "address", displayAddress);
  const displayHeadline = headline?.trim() || "Vos ventes flash Quirinale";
  const displayBody = body?.trim() || "Mettez vos ventes flash en avant pour accélérer les commandes.";
  const displayOfferHeadline = getCreativeCopy(normalized, "headline", displayHeadline);
  const displayOfferBody = getCreativeCopy(normalized, "body", displayBody);
  const displayCta = getCreativeCopy(normalized, "cta", ctaLabel);
  const displaySealTop = getCreativeCopy(normalized, "sealTop", "Offres");
  const displaySealMain = getCreativeCopy(normalized, "sealMain", "Flash");
  const displaySealBottom = getCreativeCopy(normalized, "sealBottom", "Quantités limitées");
  const slotDiscountLabel = getSlotDiscountLabel(discountLabel);

  if (variant === "banner") {
    const secondaryBadge = displayDiscount.trim();
    const showSecondaryBadge = Boolean(secondaryBadge && !/^sponsor/i.test(secondaryBadge));

    return (
      <article
        className={cn(
          "ad-banner-spotlight group relative isolate w-full overflow-hidden rounded-[30px] border border-orange-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_82px_rgba(249,115,22,0.18)] dark:border-slate-800 dark:bg-slate-950",
          compactBanner
            ? "min-h-[268px] grid-rows-[auto_minmax(116px,1fr)] sm:min-h-[286px] md:min-h-[248px] lg:h-[268px] lg:aspect-[16/5] lg:min-h-0"
            : "min-h-[400px] sm:min-h-[440px] md:min-h-[300px] lg:aspect-[16/5] lg:min-h-0",
          className,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_48%,rgba(255,122,24,0.16),transparent_35%),linear-gradient(90deg,#ffffff_0%,#fffaf3_48%,#ff7a18_100%)] dark:bg-[linear-gradient(90deg,#020617_0%,#111827_48%,#ff6b00_100%)]" />
        <div className="absolute right-0 top-0 hidden h-full w-[58%] rounded-l-[150px] bg-gradient-to-br from-orange-200/80 via-orange-400/90 to-[#ff5a00] md:block" />
        <div className="absolute right-[21%] top-1/2 hidden aspect-square h-[138%] -translate-y-1/2 rounded-full border-[20px] border-orange-500/90 bg-transparent md:block" />
        <div className="absolute right-8 top-7 hidden h-[calc(100%-3.5rem)] w-[48%] rounded-[42px] border-[6px] border-white/95 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.22)] md:block dark:border-slate-900/95 dark:bg-slate-900/70" />
        <div className="absolute bottom-0 right-0 h-1/2 w-full bg-gradient-to-t from-orange-500/18 to-transparent md:hidden" />

        <div
          className={cn(
            "relative z-10 grid h-full md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] md:grid-rows-1",
            compactBanner ? "grid-rows-[auto_minmax(116px,1fr)]" : "grid-rows-[auto_minmax(220px,1fr)]",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col justify-center",
              compactBanner
                ? "p-4 pb-2 sm:p-5 sm:pb-3 md:p-4 md:pr-7 lg:p-5 lg:pr-10 xl:p-6 xl:pr-14"
                : "p-6 pb-4 sm:p-8 sm:pb-5 md:p-5 md:pb-5 md:pr-8 lg:p-8 lg:pr-14 xl:p-10 xl:pr-20 2xl:p-12 2xl:pr-24",
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={cn("inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[10px] uppercase tracking-[0.2em] text-white shadow-[0_14px_28px_rgba(249,115,22,0.28)]", getTypographyClass(normalized.text.badge))}
                style={getTextInlineStyle(normalized.text.badge)}
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                {displayBadge}
              </span>
              {showSecondaryBadge ? (
                <span
                  className={cn("inline-flex rounded-full bg-orange-50 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-primary ring-1 ring-orange-100 dark:bg-orange-400/10 dark:text-orange-100 dark:ring-orange-300/20", getTypographyClass(normalized.text.discount))}
                  style={getTextInlineStyle(normalized.text.discount)}
                >
                  {secondaryBadge}
                </span>
              ) : null}
            </div>

            <div className={cn("min-w-0 overflow-visible pb-3", compactBanner ? "mt-3 lg:mt-4" : "mt-6 lg:mt-6 xl:mt-8")}>
              <p
                className={cn("text-[11px] uppercase tracking-[0.32em] text-slate-500 dark:text-slate-300", getTypographyClass(normalized.text.eyebrow))}
                style={getTextInlineStyle(normalized.text.eyebrow)}
              >
                {displayEyebrow}
              </p>
              <h3
                className={cn(
                  "mt-2 max-w-full break-words pb-3 leading-[1.14] text-slate-950 dark:text-white",
                  compactBanner
                    ? "text-2xl sm:text-3xl md:text-2xl lg:text-[2.35rem] xl:text-[2.7rem]"
                    : "text-4xl sm:text-5xl md:text-[2rem] lg:text-[3rem] xl:text-[3.8rem] 2xl:text-[4.8rem]",
                  getTypographyClass(normalized.text.restaurant),
                )}
                style={getTextInlineStyle(normalized.text.restaurant)}
              >
                {displayRestaurantName}
              </h3>
              <p
                className={cn(
                  "mt-1 leading-none text-primary",
                  compactBanner ? "text-xl sm:text-2xl lg:text-xl xl:text-2xl" : "text-2xl sm:text-3xl lg:text-2xl xl:text-3xl 2xl:text-4xl",
                  getTypographyClass(normalized.text.tagline),
                )}
                style={getTextInlineStyle(normalized.text.tagline)}
              >
                {displayTagline}
              </p>
              <p
                className={cn(
                  "flex min-w-0 items-center gap-2 font-medium text-slate-500 dark:text-slate-300",
                  "mt-3 text-sm xl:text-base",
                  getTypographyClass(normalized.text.address),
                )}
                style={getTextInlineStyle(normalized.text.address)}
              >
                <MapPin className="h-4 w-4 shrink-0 text-primary xl:h-5 xl:w-5" />
                <span className="truncate">{displayAddressCopy}</span>
              </p>
            </div>

            <div
              className={cn(
                "rounded-[26px] border border-orange-100 bg-white/86 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/8",
                compactBanner ? "mt-3 p-3 sm:p-3.5 lg:mt-3 lg:p-3.5" : "mt-5 p-4 sm:p-5 lg:mt-4 lg:p-4 xl:mt-6 xl:p-5",
              )}
            >
              <div className={cn("flex items-start", compactBanner ? "gap-3" : "gap-4")}>
                <div
                  className={cn(
                    "hidden shrink-0 place-items-center rounded-full bg-orange-50 text-primary ring-1 ring-orange-100 sm:grid",
                    compactBanner ? "h-10 w-10" : "h-12 w-12 xl:h-14 xl:w-14",
                  )}
                >
                  <Sparkles className={compactBanner ? "h-4 w-4" : "h-5 w-5 xl:h-6 xl:w-6"} />
                </div>
                <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} compact />
              </div>
            </div>

          </div>

          <div className={cn(
            "absolute left-1/2 top-[51%] z-30 h-36 w-36 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[10px] border-white bg-white/95 text-center shadow-[0_24px_56px_rgba(15,23,42,0.16)] ring-1 ring-orange-100 xl:h-44 xl:w-44 2xl:h-52 2xl:w-52",
            compactBanner ? "hidden" : "hidden lg:grid",
          )}>
            <div className="space-y-0.5">
              <p
                className={cn("text-[12px] uppercase tracking-[0.16em] text-primary xl:text-sm", getTypographyClass(normalized.text.sealTop))}
                style={getTextInlineStyle(normalized.text.sealTop)}
              >
                {displaySealTop}
              </p>
              <p
                className={cn("text-4xl uppercase leading-none text-primary xl:text-5xl 2xl:text-6xl", getTypographyClass(normalized.text.sealMain))}
                style={getTextInlineStyle(normalized.text.sealMain)}
              >
                {displaySealMain}
              </p>
              <Zap className="mx-auto h-6 w-6 fill-primary text-primary xl:h-8 xl:w-8" />
              <p
                className={cn("text-[9px] uppercase tracking-[0.2em] text-primary xl:text-[10px]", getTypographyClass(normalized.text.sealBottom))}
                style={getTextInlineStyle(normalized.text.sealBottom)}
              >
                {displaySealBottom}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "relative z-20 flex min-w-0 items-end pt-0 md:items-center",
              compactBanner
                ? "p-4 pt-0 sm:p-5 sm:pt-0 md:h-full md:p-4 md:pl-7 lg:h-full lg:p-5 lg:pl-9 xl:p-6 xl:pl-12"
                : "p-6 pt-0 sm:p-8 sm:pt-0 md:h-full md:p-5 md:pl-8 lg:h-full lg:p-7 lg:pl-12 xl:p-8 xl:pl-16",
            )}
          >
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-[30px] border-[5px] border-white shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-white/35 md:h-full md:rounded-[36px] lg:h-full lg:rounded-[42px] dark:border-slate-900",
                compactBanner ? "min-h-[116px] bg-white sm:min-h-[136px] md:min-h-0 lg:min-h-0 dark:bg-slate-900" : "min-h-[240px] bg-white sm:min-h-[260px] md:min-h-0 lg:min-h-0 dark:bg-slate-900",
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
          <img src={imageUrl || DEFAULT_IMAGE} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        </div>
        <BellRing className="absolute right-5 top-5 h-5 w-5 text-primary" />
        <div className="ml-[72px] mr-12 mt-4">
          <p className={cn("text-[10px] uppercase tracking-[0.16em] text-primary", getTypographyClass(normalized.text.badge))} style={getTextInlineStyle(normalized.text.badge)}>{displayBadge}</p>
          <p className={cn("mt-1 text-sm text-slate-950", getTypographyClass(normalized.text.restaurant))} style={getTextInlineStyle(normalized.text.restaurant)}>{displayRestaurantName}</p>
          <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} compact />
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
            {displayBadge}
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
            Promo {displayDiscount || discountLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className={cn("text-base leading-tight text-foreground transition-colors group-hover:text-primary", getTypographyClass(normalized.text.restaurant))} style={getTextInlineStyle(normalized.text.restaurant)}>
              {displayRestaurantName}
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
          {displayAddressCopy}
        </p>

        <div className="mt-3 rounded-[22px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,248,230,0.95),rgba(255,255,255,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffedd5] via-[#fff7ed] to-[#fef3c7] text-amber-600 shadow-[0_10px_22px_rgba(249,115,22,0.14)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} />
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-orange-500 to-orange-600 px-4 text-sm font-bold text-white shadow-[0_14px_30px_rgba(249,115,22,0.26)]">
              {displayCta}
              <ArrowRight className="h-4 w-4" />
            </div>
            {slots.slice(0, 2).map((slot) => (
              <button
                key={slot}
                type="button"
                aria-label={`Réserver ${restaurantName} à ${slot}`}
                data-card-action="reservation-slot"
                data-reservation-slot={slot}
                data-testid="restaurant-card-reservation-slot"
                onPointerDown={stopNestedCardAction}
                onMouseDown={stopNestedCardAction}
                onTouchStart={stopNestedCardAction}
                onClick={(event) => {
                  stopNestedCardAction(event);
                  onSlotClick?.(event, slot);
                }}
                className="relative z-20 inline-flex h-12 min-w-[4.75rem] touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-xl border border-emerald-500 bg-emerald-600 px-3.5 font-bold text-white shadow-[0_12px_24px_rgba(16,185,129,0.22)]"
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

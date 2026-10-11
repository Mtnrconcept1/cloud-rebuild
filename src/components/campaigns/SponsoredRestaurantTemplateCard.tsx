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
  restaurantHref?: string;
  onRestaurantClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  isFavorite?: boolean;
  favoritePending?: boolean;
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

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.getAttribute("src") !== DEFAULT_IMAGE) {
    image.src = DEFAULT_IMAGE;
  }
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
  // The default palette follows banner surfaces; custom colors remain explicit.
  const themedDefaults: Record<string, string> = {
    "#111827": "var(--sponsored-heading, #111827)",
    "#334155": "var(--sponsored-body, #334155)",
    "#64748b": "var(--sponsored-muted, #64748b)",
  };
  return { color: themedDefaults[style.color] ?? style.color };
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
  fullyVisible = false,
}: {
  creative: CampaignCreativeConfig;
  headline: string;
  body: string;
  compact?: boolean;
  fullyVisible?: boolean;
}) {
  const headlineStyle = creative.text.headline;
  const bodyStyle = creative.text.body;

  return (
    <div className="min-w-0">
      <p
        className={cn(
          "leading-tight [overflow-wrap:anywhere]",
          fullyVisible ? "whitespace-normal" : "line-clamp-2",
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
            "mt-1 leading-5 [overflow-wrap:anywhere]",
            fullyVisible ? "whitespace-normal" : "line-clamp-2",
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
  discountLabel = "",
  slots = [],
  className,
  variant = "card",
  compactBanner = false,
  restaurantHref,
  onRestaurantClick,
  isFavorite = false,
  favoritePending = false,
  onFavoriteClick,
  onSlotClick,
}: SponsoredRestaurantTemplateCardProps) {
  const normalized = normalizeCampaignCreative(creative);
  const displayRating = Number(rating || 0) > 0 ? Math.min(Number(rating || 0), 10).toFixed(1) : "";
  const safeReviewCount = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 0;
  const displayCity = city || "";
  const displayAddress = address || "";
  const displayCuisine = cuisine || "Restaurant";
  const displayBadge = getCreativeCopy(normalized, "badge", "Sponsorisé");
  const displayDiscount = getCreativeCopy(normalized, "discount", discountLabel || "");
  const displayEyebrow = getCreativeCopy(normalized, "eyebrow", `${displayCuisine} · ${displayCity}`);
  const displayRestaurantName = getCreativeCopy(normalized, "restaurant", restaurantName);
  const displayTagline = getCreativeCopy(normalized, "tagline", "Savourez l'instant");
  const displayAddressCopy = getCreativeCopy(normalized, "address", displayAddress);
  const displayHeadline = headline?.trim() || "Adresse mise en avant";
  const displayBody = body?.trim() || "Découvrez ce restaurant et ses informations.";
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
    const isDefaultSeal =
      normalized.copy.sealTop === "Offres" &&
      normalized.copy.sealMain === "Flash" &&
      normalized.copy.sealBottom === "Quantités limitées";

    return (
      <article
        className={cn(
          "ad-banner-spotlight [container-type:inline-size] [container-name:sponsored-banner] group relative isolate w-full overflow-hidden rounded-[28px] border border-[#ffe0a2] bg-[#fffdf9] shadow-[0_18px_52px_rgba(138,77,22,0.14)] transition-shadow duration-300 hover:shadow-[0_24px_65px_rgba(249,115,22,0.21)] dark:border-amber-800/50 dark:bg-slate-900",
          "dark:[--sponsored-heading:#f8fafc] dark:[--sponsored-body:#e2e8f0] dark:[--sponsored-muted:#cbd5e1]",
          compactBanner ? "min-h-[268px]" : "min-h-[260px]",
          className,
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_13%_15%,rgba(255,255,255,1),transparent_63%),linear-gradient(110deg,#fffdfa_0%,#fff8ed_68%,#ffebce_100%)] dark:bg-[linear-gradient(110deg,#0f172a_0%,#1e293b_67%,#7c2d12_100%)]" />
        <div className="relative grid grid-cols-1 [@container_sponsored-banner_(min-width:48rem)]:grid-cols-[minmax(0,0.47fr)_minmax(0,0.53fr)] [@container_sponsored-banner_(min-width:48rem)]:grid-rows-1">
          <div
            className={cn(
              "relative z-20 order-2 flex min-w-0 flex-col px-5 pb-5 pt-5 [@container_sponsored-banner_(min-width:40rem)]:px-7 [@container_sponsored-banner_(min-width:48rem)]:order-1 [@container_sponsored-banner_(min-width:48rem)]:justify-center [@container_sponsored-banner_(min-width:48rem)]:py-7 [@container_sponsored-banner_(min-width:48rem)]:pl-7 [@container_sponsored-banner_(min-width:48rem)]:pr-5 [@container_sponsored-banner_(min-width:72rem)]:py-8 [@container_sponsored-banner_(min-width:72rem)]:pl-10 [@container_sponsored-banner_(min-width:72rem)]:pr-7",
              compactBanner && "[@container_sponsored-banner_(min-width:48rem)]:py-5",
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className={cn("inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-gradient-to-r from-[#ff710b] to-[#f95b08] px-3.5 py-2 text-[10px] uppercase leading-snug tracking-[0.14em] text-white shadow-[0_8px_18px_rgba(249,115,22,0.16)] [overflow-wrap:anywhere] [@container_sponsored-banner_(min-width:64rem)]:px-4 [@container_sponsored-banner_(min-width:64rem)]:text-xs", getTypographyClass(normalized.text.badge))}
                style={getTextInlineStyle(normalized.text.badge)}
              >
                <Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{displayBadge}</span>
              </span>
              {showSecondaryBadge ? (
                <span
                  className={cn("inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-gradient-to-r from-[#ff710b] via-[#ff8618] to-[#598851] px-3.5 py-2 text-[10px] uppercase leading-snug tracking-[0.06em] text-white shadow-[0_8px_18px_rgba(249,115,22,0.15)] [overflow-wrap:anywhere] [@container_sponsored-banner_(min-width:64rem)]:px-4 [@container_sponsored-banner_(min-width:64rem)]:text-xs", getTypographyClass(normalized.text.discount))}
                  style={normalized.text.discount.color === "#ffffff" ? undefined : getTextInlineStyle(normalized.text.discount)}
                >
                  <Percent className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">Promo {secondaryBadge}</span>
                </span>
              ) : null}
            </div>

            <div className="mt-4 min-w-0 [@container_sponsored-banner_(min-width:64rem)]:mt-5">
              <p
                className={cn("break-words text-[10px] uppercase leading-5 tracking-[0.23em] text-slate-500 [overflow-wrap:anywhere] [@container_sponsored-banner_(min-width:64rem)]:text-xs dark:text-slate-300", getTypographyClass(normalized.text.eyebrow))}
                style={getTextInlineStyle(normalized.text.eyebrow)}
              >
                {displayEyebrow}
              </p>
              <h3
                className={cn(
                  "mt-1.5 break-words text-[clamp(1.65rem,4.9cqw,3.2rem)] leading-[1.08] tracking-[-0.035em] [overflow-wrap:anywhere] [text-wrap:balance]",
                  getTypographyClass(normalized.text.restaurant),
                )}
                style={{
                  ...getTextInlineStyle(normalized.text.restaurant),
                  ...(normalized.text.restaurant.font === "display"
                    ? { fontFamily: "Georgia, 'Times New Roman', serif" }
                    : {}),
                }}
              >
                {displayRestaurantName}
              </h3>
              <p
                className={cn("mt-1.5 break-words text-[clamp(1.1rem,2.9cqw,1.9rem)] leading-tight [overflow-wrap:anywhere]", getTypographyClass(normalized.text.tagline))}
                style={getTextInlineStyle(normalized.text.tagline)}
              >
                {displayTagline}
              </p>
              {displayAddressCopy || displayCity ? (
                <p
                  className={cn("mt-3 flex min-w-0 items-start gap-2 text-[13px] leading-5 [@container_sponsored-banner_(min-width:64rem)]:text-sm", getTypographyClass(normalized.text.address))}
                  style={getTextInlineStyle(normalized.text.address)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ff710b]" aria-hidden="true" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{displayAddressCopy || displayCity}</span>
                </p>
              ) : null}
            </div>

            <div className="mt-4 rounded-[21px] border border-[#f9d994] bg-white/75 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] [@container_sponsored-banner_(min-width:64rem)]:p-3.5 dark:border-amber-800/45 dark:bg-slate-800/75">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#fff0e4] via-[#fff8ed] to-[#fff1bd] text-[#f76b13] shadow-[0_8px_18px_rgba(249,115,22,0.12)]" aria-hidden="true">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} compact={compactBanner} fullyVisible />
                </div>
              </div>
            </div>

            <div
              data-sponsored-banner-seal
              className={cn(
                "mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-snug text-[#d65a08] dark:text-orange-300",
                isDefaultSeal && "hidden",
              )}
            >
              <span className={cn("break-words uppercase tracking-wider [overflow-wrap:anywhere]", getTypographyClass(normalized.text.sealTop))} style={getTextInlineStyle(normalized.text.sealTop)}>{displaySealTop}</span>
              <span className={cn("break-words uppercase [overflow-wrap:anywhere]", getTypographyClass(normalized.text.sealMain))} style={getTextInlineStyle(normalized.text.sealMain)}>{displaySealMain}</span>
              <span className={cn("break-words [overflow-wrap:anywhere]", getTypographyClass(normalized.text.sealBottom))} style={getTextInlineStyle(normalized.text.sealBottom)}>{displaySealBottom}</span>
            </div>

            <div
              data-sponsored-banner-cta
              className="mt-4 flex min-h-12 min-w-0 items-center justify-center gap-3 rounded-[18px] bg-gradient-to-r from-[#ff710b] to-[#ef4e08] px-4 py-3 text-center text-base font-bold text-white shadow-[0_10px_24px_rgba(249,115,22,0.22)] transition-[filter,transform] duration-200 group-hover:brightness-105 group-active:scale-[0.99] [@container_sponsored-banner_(min-width:64rem)]:min-h-14 [@container_sponsored-banner_(min-width:64rem)]:text-lg"
            >
              <span className={cn("min-w-0 break-words leading-snug [overflow-wrap:anywhere]", getTypographyClass(normalized.text.cta))} style={normalized.text.cta.color === "#ffffff" ? undefined : getTextInlineStyle(normalized.text.cta)}>{displayCta}</span>
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
            </div>
          </div>

          <div className="relative z-10 order-1 min-h-[200px] [@container_sponsored-banner_(min-width:48rem)]:order-2 [@container_sponsored-banner_(min-width:48rem)]:min-h-0">
            <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-b from-[#ffac4b] via-[#ff7915] to-[#ff9b34] [clip-path:ellipse(97%_120%_at_100%_50%)] [@container_sponsored-banner_(min-width:48rem)]:block" />
            <div
              data-sponsored-banner-media
              className="absolute inset-0 overflow-hidden rounded-t-[27px] bg-[#fff4e5] [@container_sponsored-banner_(min-width:48rem)]:left-3 [@container_sponsored-banner_(min-width:48rem)]:rounded-none [@container_sponsored-banner_(min-width:48rem)]:[clip-path:ellipse(97%_120%_at_100%_50%)] dark:bg-slate-900"
            >
              <img
                src={imageUrl || DEFAULT_IMAGE}
                alt={""}
                className="absolute inset-0 z-10 h-full w-full object-contain"
                onError={handleImageError}
                loading="lazy"
                decoding="async"
              />
              <img
                src={imageUrl || DEFAULT_IMAGE}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg brightness-[0.88]"
                onError={handleImageError}
                loading="lazy"
                decoding="async"
              />
              <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-white/20 via-transparent to-transparent dark:from-slate-900/20" />
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
          <img src={imageUrl || DEFAULT_IMAGE} alt="" className="h-full w-full object-cover" onError={handleImageError} loading="lazy" decoding="async" />
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
          className="h-full w-full bg-white object-contain p-2 transition-transform duration-500 group-hover:scale-[1.025] sm:p-3"
          onError={handleImageError}
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/[.38] via-slate-950/5 to-transparent" />
        <button
          type="button"
          data-card-action="favorite"
          aria-label={`${isFavorite ? "Retirer" : "Ajouter"} ${restaurantName} ${isFavorite ? "des" : "aux"} favoris`}
          aria-pressed={isFavorite}
          disabled={favoritePending}
          className="absolute right-3 top-3 grid h-11 w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 place-items-center rounded-full bg-white/90 backdrop-blur-sm transition-colors hover:bg-white"
          onClick={onFavoriteClick}
        >
          <Heart className={cn("h-4 w-4 text-red-500", isFavorite && "fill-current")} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-3 flex min-w-0 flex-wrap items-start gap-2" data-sponsored-card-badges>
          <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-full border border-orange-200 bg-primary px-3 py-1.5 text-center text-[9px] font-black uppercase leading-4 tracking-[0.12em] text-primary-foreground shadow-sm [overflow-wrap:anywhere]">
            <Megaphone className="h-3 w-3 shrink-0" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{displayBadge}</span>
          </span>
          <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-primary via-orange-500 to-emerald-600 px-3 py-1.5 text-center text-[10px] font-black uppercase leading-4 tracking-[0.06em] text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] [overflow-wrap:anywhere]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20">
              <Percent className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">Promo {displayDiscount || discountLabel}</span>
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className={cn("break-words text-base leading-tight text-foreground transition-colors [overflow-wrap:anywhere] [text-wrap:balance] group-hover:text-primary", getTypographyClass(normalized.text.restaurant))} style={getTextInlineStyle(normalized.text.restaurant)}>
              {displayRestaurantName}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/90">
              <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{displayCuisine}</span>
              <span className="text-border">/</span>
              <PriceRangeIcons range={priceRange} />
              <span>Premium</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="inline-flex min-w-[2.7rem] items-center justify-center rounded-xl bg-primary px-2.5 py-1.5 text-sm font-bold text-primary-foreground">
              {displayRating || "—"}{displayRating ? <span className="sr-only"> sur 10</span> : null}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{safeReviewCount > 0 ? `${safeReviewCount} avis` : "Pas encore d’avis"}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/75" />
            <span className="min-w-0 break-words font-medium text-foreground/90 [overflow-wrap:anywhere]">{displayCity}</span>
          </span>
        </div>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {displayAddressCopy}
        </p>

        <div className="mt-3 rounded-[22px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,248,230,0.95),rgba(255,255,255,0.94))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffedd5] via-[#fff7ed] to-[#fef3c7] text-amber-600 shadow-[0_10px_22px_rgba(249,115,22,0.14)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} fullyVisible />
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <a href={restaurantHref} onClick={onRestaurantClick} data-card-action="restaurant-view" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 inline-flex min-h-11 min-w-0 flex-1 flex-wrap items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-orange-500 to-orange-600 px-4 py-2.5 text-center text-sm font-bold leading-5 text-white shadow-[0_14px_30px_rgba(249,115,22,0.26)] [overflow-wrap:anywhere]">
              {displayCta}
              <ArrowRight className="h-4 w-4" />
            </a>
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

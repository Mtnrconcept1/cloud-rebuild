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

    return (
      <article
        className={cn(
          "ad-banner-spotlight [container-type:inline-size] [container-name:sponsored-banner] group relative isolate w-full overflow-hidden rounded-[30px] border border-orange-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_32px_82px_rgba(249,115,22,0.18)] dark:border-slate-800 dark:bg-slate-950",
          "dark:[--sponsored-heading:#f8fafc] dark:[--sponsored-body:#e2e8f0] dark:[--sponsored-muted:#cbd5e1]",
          compactBanner
            ? "min-h-[268px]"
            : "min-h-[260px]",
          className,
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_48%,rgba(255,122,24,0.16),transparent_35%),linear-gradient(90deg,#ffffff_0%,#fffaf3_48%,#ff7a18_100%)] dark:bg-[linear-gradient(90deg,#020617_0%,#111827_48%,#ff6b00_100%)]" />
        <div className="absolute right-0 top-0 hidden h-full w-[58%] rounded-l-[150px] bg-gradient-to-br from-orange-200/80 via-orange-400/90 to-[#ff5a00] [@container_sponsored-banner_(min-width:48rem)]:block" />
        <div className="absolute right-[21%] top-1/2 hidden aspect-square h-[138%] -translate-y-1/2 rounded-full border-[20px] border-orange-500/90 bg-transparent [@container_sponsored-banner_(min-width:48rem)]:block" />
        <div className="absolute right-8 top-7 hidden h-[calc(100%-3.5rem)] w-[48%] rounded-[42px] border-[6px] border-white/95 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.22)] [@container_sponsored-banner_(min-width:48rem)]:block dark:border-slate-900/95 dark:bg-slate-900/70" />
        <div className="absolute bottom-0 right-0 h-1/2 w-full bg-gradient-to-t from-orange-500/[.18] to-transparent [@container_sponsored-banner_(min-width:48rem)]:hidden" />

        <div
          className={cn(
            "relative z-10 grid items-stretch [@container_sponsored-banner_(min-width:48rem)]:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] [@container_sponsored-banner_(min-width:48rem)]:grid-rows-1",
            compactBanner ? "grid-rows-[auto_minmax(116px,1fr)]" : "grid-rows-[auto_minmax(132px,1fr)]",
          )}
        >
          <div
            className={cn(
              "relative z-20 flex min-w-0 flex-col justify-center",
              compactBanner
                ? "p-4 pb-2 [@container_sponsored-banner_(min-width:40rem)]:p-5 [@container_sponsored-banner_(min-width:40rem)]:pb-3 [@container_sponsored-banner_(min-width:48rem)]:p-4 [@container_sponsored-banner_(min-width:48rem)]:pr-7 [@container_sponsored-banner_(min-width:64rem)]:p-5 [@container_sponsored-banner_(min-width:64rem)]:pr-10 [@container_sponsored-banner_(min-width:80rem)]:p-6 [@container_sponsored-banner_(min-width:80rem)]:pr-14"
                : "p-4 pb-3 [@container_sponsored-banner_(min-width:40rem)]:p-5 [@container_sponsored-banner_(min-width:40rem)]:pb-3 [@container_sponsored-banner_(min-width:48rem)]:p-4 [@container_sponsored-banner_(min-width:48rem)]:pb-4 [@container_sponsored-banner_(min-width:48rem)]:pr-6 [@container_sponsored-banner_(min-width:64rem)]:p-6 [@container_sponsored-banner_(min-width:64rem)]:pr-10 [@container_sponsored-banner_(min-width:80rem)]:p-7 [@container_sponsored-banner_(min-width:80rem)]:pr-14 [@container_sponsored-banner_(min-width:96rem)]:p-8 [@container_sponsored-banner_(min-width:96rem)]:pr-16",
            )}
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={cn("inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-center text-[10px] uppercase leading-4 tracking-[0.2em] text-primary-foreground shadow-[0_14px_28px_rgba(249,115,22,0.28)] [overflow-wrap:anywhere]", getTypographyClass(normalized.text.badge))}
                style={getTextInlineStyle(normalized.text.badge)}
              >
                <Zap className="h-3.5 w-3.5 fill-current" />
                {displayBadge}
              </span>
              {showSecondaryBadge ? (
                <span
                  className={cn("inline-flex max-w-full flex-wrap justify-center rounded-full bg-orange-50 px-4 py-2 text-center text-[10px] uppercase leading-4 tracking-[0.08em] text-primary ring-1 ring-orange-100 [overflow-wrap:anywhere] dark:bg-orange-400/10 dark:text-orange-100 dark:ring-orange-300/20", getTypographyClass(normalized.text.discount))}
                  style={normalized.text.discount.color === "#ffffff" ? undefined : getTextInlineStyle(normalized.text.discount)}
                >
                  {secondaryBadge}
                </span>
              ) : null}
            </div>

            <div className={cn("min-w-0 overflow-visible pb-3", compactBanner ? "mt-3 [@container_sponsored-banner_(min-width:64rem)]:mt-4" : "mt-4 [@container_sponsored-banner_(min-width:64rem)]:mt-4 [@container_sponsored-banner_(min-width:80rem)]:mt-5")}>
              <p
                className={cn("break-words text-[11px] uppercase leading-relaxed tracking-[0.32em] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-300", getTypographyClass(normalized.text.eyebrow))}
                style={getTextInlineStyle(normalized.text.eyebrow)}
              >
                {displayEyebrow}
              </p>
              <h3
                className={cn(
                  "mt-2 max-w-full break-words pb-3 leading-[1.14] text-slate-950 [overflow-wrap:anywhere] [text-wrap:balance] dark:text-white",
                  compactBanner
                    ? "text-2xl [@container_sponsored-banner_(min-width:40rem)]:text-3xl [@container_sponsored-banner_(min-width:48rem)]:text-2xl [@container_sponsored-banner_(min-width:64rem)]:text-[2.15rem] [@container_sponsored-banner_(min-width:80rem)]:text-[2.4rem]"
                    : "text-2xl [@container_sponsored-banner_(min-width:40rem)]:text-3xl [@container_sponsored-banner_(min-width:48rem)]:text-[1.75rem] [@container_sponsored-banner_(min-width:64rem)]:text-[2.1rem] [@container_sponsored-banner_(min-width:80rem)]:text-[2.4rem] [@container_sponsored-banner_(min-width:96rem)]:text-[2.7rem]",
                  getTypographyClass(normalized.text.restaurant),
                )}
                style={getTextInlineStyle(normalized.text.restaurant)}
              >
                {displayRestaurantName}
              </h3>
              <p
                className={cn(
                  "mt-1 break-words leading-tight text-primary [overflow-wrap:anywhere]",
                  compactBanner ? "text-xl [@container_sponsored-banner_(min-width:40rem)]:text-2xl [@container_sponsored-banner_(min-width:64rem)]:text-xl [@container_sponsored-banner_(min-width:80rem)]:text-2xl" : "text-lg [@container_sponsored-banner_(min-width:40rem)]:text-xl [@container_sponsored-banner_(min-width:64rem)]:text-lg [@container_sponsored-banner_(min-width:80rem)]:text-xl [@container_sponsored-banner_(min-width:96rem)]:text-2xl",
                  getTypographyClass(normalized.text.tagline),
                )}
                style={getTextInlineStyle(normalized.text.tagline)}
              >
                {displayTagline}
              </p>
              <p
                className={cn(
                  "flex min-w-0 items-start gap-2 font-medium leading-5 text-slate-500 dark:text-slate-300",
                  "mt-2 text-sm",
                  getTypographyClass(normalized.text.address),
                )}
                style={getTextInlineStyle(normalized.text.address)}
              >
                <MapPin className="h-4 w-4 shrink-0 text-primary [@container_sponsored-banner_(min-width:80rem)]:h-5 [@container_sponsored-banner_(min-width:80rem)]:w-5" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{displayAddressCopy}</span>
              </p>
            </div>

            <div
              className={cn(
                "flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-full border-[6px] border-white bg-white/[.92] text-primary shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-orange-100 dark:border-slate-900 dark:bg-slate-900/[.92] dark:ring-orange-300/20",
                compactBanner ? "mt-2 px-3 py-2" : "mt-2.5 px-3.5 py-2",
              )}
              data-sponsored-banner-seal
            >
              <span
                className={cn("max-w-full break-words text-[10px] uppercase leading-tight tracking-[0.14em] [overflow-wrap:anywhere]", getTypographyClass(normalized.text.sealTop))}
                style={getTextInlineStyle(normalized.text.sealTop)}
              >
                {displaySealTop}
              </span>
              <span
                className={cn(
                  "max-w-full break-words uppercase leading-none [overflow-wrap:anywhere] [text-wrap:balance]",
                  compactBanner ? "text-base [@container_sponsored-banner_(min-width:40rem)]:text-lg" : "text-base [@container_sponsored-banner_(min-width:40rem)]:text-lg [@container_sponsored-banner_(min-width:80rem)]:text-xl",
                  getTypographyClass(normalized.text.sealMain),
                )}
                style={getTextInlineStyle(normalized.text.sealMain)}
              >
                {displaySealMain}
              </span>
              <Zap className={cn("shrink-0 fill-primary text-primary", compactBanner ? "h-4 w-4" : "h-5 w-5")} />
              <span
                className={cn("max-w-full break-words text-[9px] uppercase leading-tight tracking-[0.1em] [overflow-wrap:anywhere]", getTypographyClass(normalized.text.sealBottom))}
                style={getTextInlineStyle(normalized.text.sealBottom)}
              >
                {displaySealBottom}
              </span>
            </div>

            <div
              className={cn(
                "rounded-[26px] border border-orange-100 bg-white/[.86] shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-white/[.08]",
                compactBanner ? "mt-3 p-3 [@container_sponsored-banner_(min-width:40rem)]:p-3.5 [@container_sponsored-banner_(min-width:64rem)]:mt-3 [@container_sponsored-banner_(min-width:64rem)]:p-3.5" : "mt-3 p-3 [@container_sponsored-banner_(min-width:40rem)]:p-3.5 [@container_sponsored-banner_(min-width:64rem)]:mt-3 [@container_sponsored-banner_(min-width:64rem)]:p-3.5 [@container_sponsored-banner_(min-width:80rem)]:mt-4 [@container_sponsored-banner_(min-width:80rem)]:p-4",
              )}
            >
              <div className={cn("flex items-start", compactBanner ? "gap-3" : "gap-4")}>
                <div
                  className={cn(
                    "hidden shrink-0 place-items-center rounded-full bg-orange-50 text-primary ring-1 ring-orange-100 [@container_sponsored-banner_(min-width:40rem)]:grid",
                    compactBanner ? "h-10 w-10" : "h-12 w-12 [@container_sponsored-banner_(min-width:80rem)]:h-14 [@container_sponsored-banner_(min-width:80rem)]:w-14",
                  )}
                >
                  <Sparkles className={compactBanner ? "h-4 w-4" : "h-5 w-5 [@container_sponsored-banner_(min-width:80rem)]:h-6 [@container_sponsored-banner_(min-width:80rem)]:w-6"} />
                </div>
                <OfferText creative={normalized} headline={displayOfferHeadline} body={displayOfferBody} compact fullyVisible />
              </div>
            </div>

          </div>

          <div
            className={cn(
              "relative z-20 flex min-w-0 items-end pt-0 [@container_sponsored-banner_(min-width:48rem)]:items-center",
              compactBanner
                ? "p-4 pt-0 [@container_sponsored-banner_(min-width:40rem)]:p-5 [@container_sponsored-banner_(min-width:40rem)]:pt-0 [@container_sponsored-banner_(min-width:48rem)]:h-full [@container_sponsored-banner_(min-width:48rem)]:p-4 [@container_sponsored-banner_(min-width:48rem)]:pl-7 [@container_sponsored-banner_(min-width:64rem)]:h-full [@container_sponsored-banner_(min-width:64rem)]:p-5 [@container_sponsored-banner_(min-width:64rem)]:pl-9 [@container_sponsored-banner_(min-width:80rem)]:p-6 [@container_sponsored-banner_(min-width:80rem)]:pl-12"
                : "p-4 pt-0 [@container_sponsored-banner_(min-width:40rem)]:p-5 [@container_sponsored-banner_(min-width:40rem)]:pt-0 [@container_sponsored-banner_(min-width:48rem)]:h-full [@container_sponsored-banner_(min-width:48rem)]:p-4 [@container_sponsored-banner_(min-width:48rem)]:pl-6 [@container_sponsored-banner_(min-width:64rem)]:h-full [@container_sponsored-banner_(min-width:64rem)]:p-5 [@container_sponsored-banner_(min-width:64rem)]:pl-9 [@container_sponsored-banner_(min-width:80rem)]:p-6 [@container_sponsored-banner_(min-width:80rem)]:pl-12",
            )}
          >
            <div
              data-sponsored-banner-media
              className={cn(
                "relative w-full overflow-hidden rounded-[30px] border-[5px] border-white shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-white/[.35] [@container_sponsored-banner_(min-width:48rem)]:h-full [@container_sponsored-banner_(min-width:48rem)]:rounded-[36px] [@container_sponsored-banner_(min-width:64rem)]:h-full [@container_sponsored-banner_(min-width:64rem)]:rounded-[42px] dark:border-slate-900",
                // Un visuel carre occupe toute la largeur de sa colonne et
                // imposait sa hauteur a la banniere entiere : plus la colonne
                // est large, plus la carte grandit. Le plafond casse ce lien.
                // Il ne peut pas rogner l'image, qui reste en object-contain.
                compactBanner
                  ? "max-h-[220px] min-h-[160px] bg-white [@container_sponsored-banner_(min-width:40rem)]:max-h-[240px] [@container_sponsored-banner_(min-width:40rem)]:min-h-[190px] [@container_sponsored-banner_(min-width:48rem)]:max-h-[260px] [@container_sponsored-banner_(min-width:48rem)]:min-h-[260px] dark:bg-slate-900"
                  : "max-h-[240px] min-h-[140px] bg-white [@container_sponsored-banner_(min-width:40rem)]:max-h-[260px] [@container_sponsored-banner_(min-width:40rem)]:min-h-[160px] [@container_sponsored-banner_(min-width:48rem)]:max-h-[300px] [@container_sponsored-banner_(min-width:48rem)]:min-h-[220px] [@container_sponsored-banner_(min-width:64rem)]:max-h-[340px] dark:bg-slate-900",
              )}
            >
              <img
                src={imageUrl || DEFAULT_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full object-contain p-2 [@container_sponsored-banner_(min-width:40rem)]:p-3"
                onError={handleImageError}
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/[.18] via-transparent to-slate-950/10" />
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

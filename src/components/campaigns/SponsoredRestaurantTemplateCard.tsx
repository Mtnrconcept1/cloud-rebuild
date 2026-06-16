import { ArrowRight, Heart, MapPin, Megaphone, Sparkles } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import PriceRangeIcons from "@/components/PriceRangeIcons";
import {
  DEFAULT_CAMPAIGN_CREATIVE,
  normalizeCampaignCreative,
  type CampaignCreativeConfig,
  type CampaignCreativeTextElement,
} from "@/lib/campaignCreative";
import { cn } from "@/lib/utils";

const DEFAULT_IMAGE = "/images/pasta-assortment.jpeg";

const TEMPLATE_NUMBERS: Record<string, number> = {
  classic_elegant: 1,
  modern_clean: 2,
  warm_gourmet: 3,
  bold_contrast: 4,
  minimal_premium: 5,
  dynamic_color: 6,
  immersive_photo: 7,
  urban_street: 8,
};

const DARK_TEMPLATES = new Set(["modern_clean", "bold_contrast", "immersive_photo", "urban_street"]);

const TEXT_LAYER_BASE: Record<CampaignCreativeTextElement, {
  className: string;
  style: CSSProperties;
}> = {
  badge: {
    className: "text-[10px] font-black uppercase tracking-[0.16em] text-white",
    style: { left: 16, top: 20, width: 102, textAlign: "center" },
  },
  discount: {
    className: "text-[12px] font-black uppercase text-white",
    style: { left: 23, top: 143, width: 88, textAlign: "center" },
  },
  restaurant: {
    className: "font-display text-[34px] font-black leading-none",
    style: { left: 18, top: 202, width: 210 },
  },
  headline: {
    className: "text-[15px] font-black leading-tight",
    style: { left: 78, top: 318, width: 230 },
  },
  body: {
    className: "text-[12px] font-medium leading-snug",
    style: { left: 78, top: 344, width: 230 },
  },
  cta: {
    className: "text-[14px] font-black text-white",
    style: { left: 28, top: 425, width: 166, textAlign: "center" },
  },
};

const TEXT_LAYER_OVERRIDES: Partial<Record<number, Partial<Record<CampaignCreativeTextElement, CSSProperties>>>> = {
  2: {
    restaurant: { top: 190, color: "#ffffff" },
    headline: { color: "#ffffff" },
    body: { color: "#f8fafc" },
  },
  4: {
    restaurant: { top: 190, color: "#ffffff" },
    headline: { color: "#ffffff" },
    body: { color: "#f8fafc" },
  },
  5: {
    restaurant: { top: 204 },
    headline: { left: 78, top: 310, width: 190 },
    body: { left: 78, top: 338, width: 190 },
  },
  6: {
    badge: { top: 20 },
    discount: { top: 123, width: 54 },
    restaurant: { top: 214 },
    headline: { left: 58, top: 326, width: 228, color: "#ffffff" },
    body: { left: 58, top: 354, width: 228, color: "#f8fafc" },
    cta: { left: 28, top: 425, width: 150 },
  },
  7: {
    restaurant: { top: 200, color: "#ffffff" },
    headline: { color: "#ffffff" },
    body: { color: "#f8fafc" },
  },
  8: {
    restaurant: { top: 190, color: "#ffffff" },
    headline: { left: 78, top: 332 },
    body: { left: 78, top: 360 },
  },
};

type TextPointerHandler = (
  key: CampaignCreativeTextElement,
  event: ReactPointerEvent<HTMLElement>,
) => void;

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
  selectedTextElement?: CampaignCreativeTextElement | null;
  draggingTextElement?: CampaignCreativeTextElement | null;
  onTextPointerDown?: TextPointerHandler;
  isFavorite?: boolean;
  onFavoriteClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

function textLayerStyle(
  key: CampaignCreativeTextElement,
  templateNumber: number,
  creative: CampaignCreativeConfig,
): CSSProperties {
  const base = TEXT_LAYER_BASE[key];
  const override = TEXT_LAYER_OVERRIDES[templateNumber]?.[key] || {};
  const style = creative.text[key];
  const defaultStyle = DEFAULT_CAMPAIGN_CREATIVE.text[key];
  const explicitColor = style.color !== defaultStyle.color ? style.color : undefined;

  return {
    ...base.style,
    ...override,
    color: explicitColor || override.color || base.style.color || style.color,
    transform: `translate(${style.x}px, ${style.y}px) rotate(${style.rotation}deg) scale(${style.scale / 100})`,
    transformOrigin: base.style.textAlign === "center" ? "center center" : "left center",
  };
}

function editableLayerClassName(
  key: CampaignCreativeTextElement,
  selectedTextElement?: CampaignCreativeTextElement | null,
  draggingTextElement?: CampaignCreativeTextElement | null,
  onTextPointerDown?: TextPointerHandler,
) {
  return cn(
    "absolute z-30 block min-w-0 whitespace-normal break-words rounded-md outline-none transition-shadow",
    TEXT_LAYER_BASE[key].className,
    onTextPointerDown && "touch-none cursor-grab px-1 py-0.5 text-left ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary",
    selectedTextElement === key && "ring-2 ring-primary ring-offset-2",
    draggingTextElement === key && "cursor-grabbing",
  );
}

function CampaignTextLayer({
  id,
  text,
  templateNumber,
  creative,
  selectedTextElement,
  draggingTextElement,
  onTextPointerDown,
}: {
  id: CampaignCreativeTextElement;
  text: string;
  templateNumber: number;
  creative: CampaignCreativeConfig;
  selectedTextElement?: CampaignCreativeTextElement | null;
  draggingTextElement?: CampaignCreativeTextElement | null;
  onTextPointerDown?: TextPointerHandler;
}) {
  const Element = onTextPointerDown ? "button" : "span";

  return (
    <Element
      type={onTextPointerDown ? "button" : undefined}
      className={editableLayerClassName(id, selectedTextElement, draggingTextElement, onTextPointerDown)}
      style={textLayerStyle(id, templateNumber, creative)}
      onPointerDown={onTextPointerDown ? (event) => onTextPointerDown(id, event) : undefined}
    >
      {text}
    </Element>
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
  selectedTextElement,
  draggingTextElement,
  onTextPointerDown,
  isFavorite = false,
  onFavoriteClick,
}: SponsoredRestaurantTemplateCardProps) {
  const normalized = normalizeCampaignCreative(creative);
  const templateNumber = TEMPLATE_NUMBERS[normalized.template] || 1;
  const dark = DARK_TEMPLATES.has(normalized.template);
  const displayRating = Number(rating || 0) > 0 ? Math.min(Number(rating || 0), 10).toFixed(1) : "5.7";
  const safeReviewCount = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 3;
  const displayCity = city || "Puplinge";
  const displayAddress = address || "Rue de Graman";
  const displayCuisine = cuisine || "Italien";

  return (
    <article
      className={cn(
        "ad-card-template group relative isolate h-[470px] w-full overflow-hidden rounded-[18px] border border-white/70 shadow-[0_18px_40px_rgba(0,0,0,0.12)]",
        `template-shell-${templateNumber}`,
        className,
      )}
    >
      <div className={cn("photo-zone-template relative overflow-hidden bg-[#e60000]", `template-photo-${templateNumber}`)}>
        <img
          src={imageUrl || DEFAULT_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.18),transparent_30%),linear-gradient(135deg,rgba(0,0,0,0.08),transparent_60%)]" />
        <div className="absolute left-[18px] top-[18px] z-20 h-[26px] w-[96px] rounded-lg bg-[linear-gradient(135deg,#ff6414,#ef4f00)]" />
        <button
          type="button"
          aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          className="absolute right-4 top-4 z-30 grid h-9 w-9 place-items-center rounded-full bg-white text-red-500 shadow-sm"
          onClick={onFavoriteClick}
        >
          <Heart className={cn("h-4 w-4 text-red-500", isFavorite && "fill-current")} />
        </button>
      </div>

      <div className={cn("absolute z-20 rounded-full bg-[linear-gradient(135deg,#00b978,#008f5a)]", `discount-shape-${templateNumber}`)} />

      <div className={cn("content-template relative min-h-[305px] px-[18px] pb-[18px] pt-8", `template-body-${templateNumber}`)}>
        <div className="mx-auto mb-5 flex justify-center gap-[7px]">
          <span className="h-[11px] w-[22px] rounded-[3px] border border-[#008f5a] bg-[#008f5a]/15" />
          <span className="h-[11px] w-[22px] rounded-[3px] border border-[#008f5a] bg-[#008f5a]/15" />
          <span className="h-[11px] w-[22px] rounded-[3px] border border-[#008f5a] bg-[#008f5a]/15" />
        </div>
        {templateNumber !== 7 ? (
          <span className="mb-6 block h-[11px] w-[11px] rotate-[-45deg] rounded-[50%_50%_50%_0] border-2 border-primary" />
        ) : null}
        {templateNumber !== 5 ? (
          <>
            <span className="absolute right-4 top-7 h-[30px] w-[30px] rounded-[9px] bg-[linear-gradient(135deg,#ff9638,#ff6414)]" />
            <span className="absolute right-[25px] top-[66px] h-[10px] w-[10px] rounded-full bg-[#b7b7b7]" />
          </>
        ) : null}

        <div className={cn("campaign-box-template relative mb-[18px] h-[88px] rounded-[14px] border border-[rgba(255,184,78,0.45)] bg-white/50", `campaign-box-${templateNumber}`)}>
          <span className="absolute left-5 top-[22px] grid h-[34px] w-[34px] place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
        </div>

        <div className="grid grid-cols-[1fr_62px_62px] gap-2.5">
          <div className="relative h-[46px] rounded-[9px] bg-[linear-gradient(135deg,#ff6414,#ef4f00)]">
            <ArrowRight className="absolute right-[22px] top-1/2 h-5 w-5 -translate-y-1/2 text-white" />
          </div>
          <div className={cn("h-[46px] rounded-[9px] border-[1.5px] border-[#17b985] bg-white/65", templateNumber === 6 && "bg-[linear-gradient(135deg,#078850,#0ba865)]")} />
          <div className={cn("h-[46px] rounded-[9px] border-[1.5px] border-[#17b985] bg-white/65", templateNumber === 6 && "bg-[linear-gradient(135deg,#078850,#0ba865)]")} />
        </div>
      </div>

      <CampaignTextLayer
        id="badge"
        text="Sponsorisé"
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />
      <CampaignTextLayer
        id="discount"
        text={discountLabel}
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />
      <CampaignTextLayer
        id="restaurant"
        text={restaurantName || "Quirinale"}
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />
      <CampaignTextLayer
        id="headline"
        text={headline || "La fondue du Quirinale"}
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />
      <CampaignTextLayer
        id="body"
        text={body || "Viens déguster la meilleure fondue de Genève!"}
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />
      <CampaignTextLayer
        id="cta"
        text={ctaLabel}
        templateNumber={templateNumber}
        creative={normalized}
        selectedTextElement={selectedTextElement}
        draggingTextElement={draggingTextElement}
        onTextPointerDown={onTextPointerDown}
      />

      <div className="absolute left-[96px] top-[233px] z-30 text-[10px]">
        <PriceRangeIcons range={priceRange} />
      </div>
      <p className={cn("absolute left-[18px] top-[252px] z-30 max-w-[58%] truncate text-[12px] font-medium", dark ? "text-white/88" : "text-slate-800")}>
        {displayCuisine}
        <span className="mx-2 text-current/55">·</span>
        Premium
      </p>
      <p className={cn("absolute left-[18px] top-[278px] z-30 flex max-w-[66%] items-center gap-1 truncate text-[12px] font-medium", dark ? "text-white/78" : "text-slate-700")}>
        <MapPin className="h-[1em] w-[1em] shrink-0 text-primary" />
        {displayCity} · {displayAddress}
      </p>
      <span className="absolute right-[18px] top-[223px] z-30 min-w-[30px] text-center text-[13px] font-black text-white">
        {displayRating}
      </span>
      <span className={cn("absolute right-[22px] top-[260px] z-30 text-[11px]", dark ? "text-white/70" : "text-slate-700")}>
        ({safeReviewCount})
      </span>
      {slots.slice(0, 2).map((slot, index) => (
        <span
          key={`${slot}-${index}`}
          className={cn("absolute top-[419px] z-30 flex h-[46px] w-[62px] items-center justify-center text-sm font-black", dark ? "text-emerald-300" : "text-emerald-700")}
          style={{ left: index === 0 ? 226 : 298 }}
        >
          {slot}
        </span>
      ))}
      <p className={cn("absolute bottom-[11px] left-[18px] z-30 max-w-[82%] truncate text-[11px]", dark ? "text-white/72" : "text-slate-600")}>
        Prochains créneaux visibles. Plus d'options sur la fiche.
      </p>

      <div className="pointer-events-none absolute left-[18px] top-[24px] z-30 text-white">
        <Megaphone className="h-3 w-3" />
      </div>
    </article>
  );
}

export default SponsoredRestaurantTemplateCard;

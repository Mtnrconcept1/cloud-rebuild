import RestaurantCard from "@/components/RestaurantCard";
import type { LucideIcon } from "lucide-react";
import SectionShowcaseHeader, { type SectionHeaderTheme } from "@/components/home/SectionShowcaseHeader";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

interface RestaurantSectionProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor: string;
  restaurants: any[];
  loading?: boolean;
  bgClass?: string;
  accentClassName?: string;
  headerTheme?: SectionHeaderTheme;
  headerImageSrc?: string;
  headerDescription?: string;
  linkText?: string;
  linkTo?: string;
}

// Keep one row per section at every breakpoint. On phones, one full card plus
// one third of the following card signals that the rail can be swiped.
const RAIL_ITEM_CLASS =
  "min-w-0 pl-0 basis-[calc(75%-9px)] sm:basis-[calc(43.5%-7px)] lg:basis-[calc(30.77%-5px)]";
const RAIL_OPTIONS = { align: "start", containScroll: "trimSnaps", slidesToScroll: 1 } as const;

export default function RestaurantSection({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  restaurants,
  loading = false,
  headerTheme = "orange",
  headerImageSrc = "/images/section-headers/gift-3d.png",
  headerDescription,
  linkText = "Voir tout",
  linkTo = "/recherche",
}: RestaurantSectionProps) {
  if (restaurants.length === 0 && !loading) return null;

  return (
    <section
      data-home-restaurant-rail
      className="relative py-7 md:py-12"
      aria-busy={loading && restaurants.length === 0}
    >
      <div className="container relative space-y-4 md:space-y-6">
        <SectionShowcaseHeader
          title={title}
          subtitle={subtitle}
          icon={Icon}
          iconColor={iconColor}
          imageSrc={headerImageSrc}
          description={headerDescription}
          theme={headerTheme}
          className="tok-section-header--home-rail"
          linkText={linkText}
          mobileLinkText="Voir plus"
          linkTo={linkTo}
        />

        <Carousel
          data-testid="home-restaurant-carousel"
          aria-label={`Restaurants : ${title}`}
          opts={RAIL_OPTIONS}
          className="min-w-0"
        >
          <CarouselContent className="ml-0 gap-3 sm:gap-4">
            {restaurants.length === 0 ? (
              [0, 1, 2].map((item) => (
                <CarouselItem
                  key={item}
                  className={RAIL_ITEM_CLASS}
                >
                  <div
                    data-testid="home-restaurant-skeleton"
                    aria-hidden="true"
                    className="h-[380px] animate-pulse overflow-hidden rounded-[24px] border border-border/60 bg-card p-2 shadow-soft sm:h-[410px]"
                  >
                    <div className="aspect-[16/10] rounded-[18px] bg-muted/70" />
                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="h-5 w-3/4 rounded-md bg-muted/70" />
                      <div className="h-4 w-1/2 rounded-md bg-muted/70" />
                      <div className="h-12 w-full rounded-lg bg-muted/50" />
                    </div>
                  </div>
                </CarouselItem>
              ))
            ) : (
              restaurants.map((r: any) => (
                <CarouselItem
                  key={`${r.id}-${r.campaign_id || "organic"}`}
                  className={RAIL_ITEM_CLASS}
                >
                  <RestaurantCard
                    homeRail
                    id={r.id}
                    name={r.name}
                    cuisine={r.cuisine_type || ""}
                    rating={Number(r.rating) || 0}
                    reviewCount={r.review_count || 0}
                    imageUrl={r.image_url || ""}
                    priceRange={r.price_range || 2}
                    deliveryAvailable={r.delivery_available || false}
                    city={r.city}
                    address={r.address || ""}
                    slug={r.slug || null}
                    openingHours={Object.prototype.hasOwnProperty.call(r, "opening_hours") ? r.opening_hours : undefined}
                    supportsReservation={Object.prototype.hasOwnProperty.call(r, "supports_reservation") ? r.supports_reservation : undefined}
                    sponsoredCampaignId={r.campaign_id || undefined}
                    sponsoredPromoImage={r.promo_image || undefined}
                    sponsoredCampaignTitle={r.campaign_title || undefined}
                    sponsoredCampaignBody={r.campaign_body || undefined}
                    sponsoredCampaignCreative={r.campaign_creative || undefined}
                  />
                </CarouselItem>
              ))
            )}
          </CarouselContent>
          {restaurants.length > 1 ? (
            <>
              <CarouselPrevious
                aria-label={`Restaurants précédents : ${title}`}
                className="left-2 z-10 hidden h-11 w-11 border-border/70 bg-card/95 shadow-lift backdrop-blur sm:inline-flex"
              />
              <CarouselNext
                aria-label={`Restaurants suivants : ${title}`}
                className="right-2 z-10 hidden h-11 w-11 border-border/70 bg-card/95 shadow-lift backdrop-blur sm:inline-flex"
              />
            </>
          ) : null}
        </Carousel>
      </div>
    </section>
  );
}

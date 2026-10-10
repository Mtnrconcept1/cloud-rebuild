import RestaurantCard from "@/components/RestaurantCard";
import type { LucideIcon } from "lucide-react";
import SectionShowcaseHeader, { type SectionHeaderTheme } from "@/components/home/SectionShowcaseHeader";

interface RestaurantSectionProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor: string;
  restaurants: any[];
  bgClass?: string;
  accentClassName?: string;
  headerTheme?: SectionHeaderTheme;
  headerImageSrc?: string;
  linkText?: string;
  linkTo?: string;
}

export default function RestaurantSection({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  restaurants,
  headerTheme = "orange",
  headerImageSrc = "/images/section-headers/gift-3d.png",
  linkText = "Voir tout",
  linkTo = "/recherche",
}: RestaurantSectionProps) {
  if (restaurants.length === 0) return null;

  return (
    <section
      className="relative py-7 md:py-10"
    >
      <div className="container relative space-y-5 md:space-y-6">
        <SectionShowcaseHeader
          title={title}
          subtitle={subtitle}
          icon={Icon}
          iconColor={iconColor}
          imageSrc={headerImageSrc}
          theme={headerTheme}
          linkText={linkText}
          linkTo={linkTo}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((r: any) => (
            <div key={`${r.id}-${r.campaign_id || "organic"}`} className="min-w-0">
              <RestaurantCard
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

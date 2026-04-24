import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import RestaurantCard from "@/components/RestaurantCard";
import type { LucideIcon } from "lucide-react";

interface RestaurantSectionProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor: string;
  restaurants: any[];
  bgClass?: string;
  linkText?: string;
  linkTo?: string;
}

export default function RestaurantSection({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  restaurants,
  bgClass = "bg-background",
  linkText = "Voir tout",
  linkTo = "/recherche",
}: RestaurantSectionProps) {
  if (restaurants.length === 0) return null;

  return (
    <section className={`py-12 md:py-16 ${bgClass}`}>
      <div className="container space-y-6 md:space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className={`flex items-center gap-2 ${iconColor} font-bold text-xs uppercase tracking-widest`}>
              <Icon className="h-3.5 w-3.5 fill-current" />
              {subtitle}
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold">{title}</h2>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1" asChild>
            <Link to={linkTo}>{linkText} <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurants.map((r: any, i: number) => (
            <div key={`${r.id}-${r.campaign_id || "organic"}`} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
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
                sponsoredCampaignId={r.campaign_id || undefined}
                sponsoredPromoImage={r.promo_image || undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

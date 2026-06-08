import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import RestaurantCard from "@/components/RestaurantCard";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RestaurantSectionProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconColor: string;
  restaurants: any[];
  bgClass?: string;
  accentClassName?: string;
  headerClassName?: string;
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
  accentClassName = "bg-primary/70",
  headerClassName = "border-primary/15 bg-primary/10 dark:border-orange-300/20 dark:bg-orange-500/15",
  linkText = "Voir tout",
  linkTo = "/recherche",
}: RestaurantSectionProps) {
  if (restaurants.length === 0) return null;

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-y border-border/70 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_88%_10%,rgba(34,211,238,0.08),transparent_22rem)] md:py-16",
        bgClass,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" aria-hidden="true" />
      <div className={cn("pointer-events-none absolute bottom-0 left-0 top-0 w-1.5", accentClassName)} aria-hidden="true" />
      <div className="container relative space-y-7 md:space-y-9">
        <div
          className={cn(
            "flex flex-col gap-4 rounded-xl border px-4 py-4 shadow-[0_12px_34px_rgba(15,23,42,0.045)] md:flex-row md:items-end md:justify-between",
            headerClassName,
          )}
        >
          <div className="space-y-1">
            <div className={`flex items-center gap-2 ${iconColor} font-bold text-xs uppercase tracking-widest`}>
              <Icon className="h-3.5 w-3.5 fill-current" />
              {subtitle}
            </div>
            <h2 className="font-display text-2xl font-bold dark:text-white md:text-3xl">{title}</h2>
          </div>
          <Button variant="ghost" size="sm" className="w-fit gap-1 text-muted-foreground hover:text-primary dark:text-slate-300 dark:hover:text-orange-300" asChild>
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
                sponsoredCampaignTitle={r.campaign_title || undefined}
                sponsoredCampaignBody={r.campaign_body || undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

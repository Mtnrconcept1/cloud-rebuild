import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, MapPin } from "lucide-react";

import {
  SponsoredBadge,
  SponsoredContextPill,
} from "@/components/campaigns/SponsoredVisual";
import { getSponsoredVisualConfig, type SponsoredVisualTone } from "@/components/campaigns/sponsoredVisualTheme";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getActiveSponsoredRestaurants, trackSponsoredClick } from "@/lib/analytics";
import { useSponsoredImpressionOnView } from "@/hooks/useSponsoredImpressionOnView";
import { cn } from "@/lib/utils";

interface CampaignBannerProps {
  page: "home" | "search" | "flash_sales" | "anti_waste";
  maxBanners?: number;
}

export default function CampaignBanner({ page, maxBanners = 2 }: CampaignBannerProps) {
  const activeFeatures = useActiveFeatures();
  const campaignsEnabled = activeFeatures.has("campagnes-pub");

  const { data: campaigns } = useQuery({
    queryKey: ["campaign-banners", page],
    queryFn: () => getActiveSponsoredRestaurants(page),
    enabled: campaignsEnabled,
  });

  const banners = (campaigns || [])
    .filter((campaign: any) => campaign.image_url || campaign.body || campaign.title)
    .slice(0, maxBanners);

  if (!campaignsEnabled || !banners.length) return null;

  return (
    <div className="space-y-4">
      {banners.map((campaign: any) => (
        <CampaignBannerItem key={campaign.id} campaign={campaign} page={page} />
      ))}
    </div>
  );
}

function CampaignBannerItem({
  campaign,
  page,
}: {
  campaign: any;
  page: SponsoredVisualTone;
}) {
  const navigate = useNavigate();
  const restaurant = campaign.restaurants;
  const visual = getSponsoredVisualConfig(page);
  const heading = campaign.title || restaurant?.name || "Découvrez cette adresse mise en avant";
  const description =
    campaign.body
    || `Retrouvez ${restaurant?.name || "ce partenaire"} dans la sélection sponsorisee du moment sur Tok.`;
  const bannerRef = useSponsoredImpressionOnView({
    campaignId: campaign.id,
    restaurantId: restaurant?.id,
    source: "campaign_banner",
    placementKey: `campaign_banner:${page}:${campaign.id}`,
    enabled: Boolean(campaign.id && restaurant?.id),
  });

  const handleClick = () => {
    void trackSponsoredClick(campaign.id, restaurant?.id || "", "campaign_banner");
    if (restaurant?.id) {
      navigate(`/restaurant/${restaurant.id}`);
    }
  };

  return (
    <div
      ref={bannerRef}
      onClick={handleClick}
      className={cn(
        "neon-card group relative isolate cursor-pointer overflow-hidden rounded-[30px] border shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(15,23,42,0.18)] dark:border-white/20 dark:shadow-[0_24px_74px_rgba(0,0,0,0.58),0_0_48px_rgba(249,115,22,0.18)]",
        visual.bannerShellClassName,
      )}
    >
      {campaign.image_url ? (
        <>
          <img
            src={campaign.image_url}
            alt={heading}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
          <div className={cn("absolute inset-0", visual.bannerOverlayClassName)} />
        </>
      ) : (
        <div className={cn("absolute inset-0", visual.bannerOverlayClassName)} />
      )}

      <div className={cn("absolute inset-0", visual.bannerSpotlightClassName)} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]" />

      <div className="relative flex min-h-[220px] flex-col justify-between p-5 text-white sm:min-h-[260px] sm:p-6">
        <div className="flex flex-wrap items-start gap-2">
          <SponsoredBadge tone={page} />
          <SponsoredContextPill tone={page} />
        </div>

        <div className="max-w-2xl space-y-4">
          <div className="space-y-2">
            {restaurant?.name ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
                {restaurant.name}
              </p>
            ) : null}
            <h3 className="max-w-xl font-display text-2xl font-bold leading-tight text-white sm:text-3xl">
              {heading}
            </h3>
            <p className="max-w-xl text-sm leading-6 text-white/85 sm:text-base">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur-md">
              Voir le restaurant
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
            {restaurant?.city ? (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <MapPin className="h-3.5 w-3.5" />
                {restaurant.city}
              </span>
            ) : null}
            {restaurant?.name ? (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                {restaurant.name}
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

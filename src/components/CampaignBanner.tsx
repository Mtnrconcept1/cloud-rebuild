import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import SponsoredRestaurantTemplateCard from "@/components/campaigns/SponsoredRestaurantTemplateCard";
import { useSponsoredImpressionOnView } from "@/hooks/useSponsoredImpressionOnView";
import { getActiveSponsoredRestaurants, trackSponsoredClick } from "@/lib/analytics";
import { useActiveFeatures } from "@/lib/featureFlags";
import { rotateSponsoredCardsWithinRestaurants } from "@/lib/sponsoredPlacement";

interface CampaignBannerProps {
  page: "home" | "search" | "flash_sales" | "anti_waste";
  maxBanners?: number;
}

export default function CampaignBanner({ page, maxBanners = 2 }: CampaignBannerProps) {
  const activeFeatures = useActiveFeatures();
  const campaignsEnabled = activeFeatures.has("campagnes-pub");
  const rotationSeed = useMemo(() => Math.floor(Math.random() * 1_000_000), []);

  const { data: campaigns } = useQuery({
    queryKey: ["campaign-banners", page],
    queryFn: () => getActiveSponsoredRestaurants(page, "banner"),
    enabled: campaignsEnabled,
  });

  const banners = rotateSponsoredCardsWithinRestaurants(
    (campaigns || [])
      .filter((campaign: any) => campaign.image_url || campaign.body || campaign.title),
    rotationSeed,
  )
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
  page: CampaignBannerProps["page"];
}) {
  const navigate = useNavigate();
  const restaurant = campaign.restaurants;
  const heading = campaign.title || restaurant?.name || "Découvrez cette adresse mise en avant";
  const description =
    campaign.body
    || `Retrouvez ${restaurant?.name || "ce partenaire"} dans la sélection sponsorisée du moment sur Tok.`;
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
      className="group cursor-pointer"
    >
      <SponsoredRestaurantTemplateCard
        variant="banner"
        creative={campaign.channels?.creative}
        imageUrl={campaign.image_url}
        restaurantName={restaurant?.name || "Adresse TOK"}
        cuisine={restaurant?.cuisine_type}
        city={restaurant?.city}
        address={restaurant?.address}
        headline={heading}
        body={description}
        ctaLabel="Voir le restaurant"
        discountLabel={campaign.discount_label || "Sponsorisé"}
      />
    </div>
  );
}

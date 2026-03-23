import { useQuery } from "@tanstack/react-query";
import { getActiveSponsoredRestaurants, trackSponsoredImpression, trackSponsoredClick } from "@/lib/analytics";
import { useActiveFeatures } from "@/lib/featureFlags";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { Megaphone, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    .filter((c: any) => c.image_url || c.body)
    .slice(0, maxBanners);

  if (!campaignsEnabled) return null;
  if (!banners.length) return null;

  return (
    <div className="space-y-3">
      {banners.map((campaign: any) => (
        <CampaignBannerItem key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

function CampaignBannerItem({ campaign }: { campaign: any }) {
  const navigate = useNavigate();
  const tracked = useRef(false);
  const restaurant = campaign.restaurants;

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackSponsoredImpression(campaign.id, restaurant?.id, "campaign_banner");
  }, [campaign.id, restaurant?.id]);

  const handleClick = () => {
    trackSponsoredClick(campaign.id, restaurant?.id || "", "campaign_banner");
    if (restaurant?.id) {
      navigate(`/restaurant/${restaurant.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative rounded-2xl overflow-hidden cursor-pointer border border-amber-300/40 shadow-sm hover:shadow-md transition-all"
    >
      {campaign.image_url ? (
        <div className="relative">
          <img
            src={campaign.image_url}
            alt={campaign.title}
            className="w-full h-32 sm:h-40 object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute top-3 left-3">
            <Badge className="bg-amber-500/90 backdrop-blur-md text-white text-[9px] gap-1 border-none uppercase font-bold">
              <Megaphone className="h-3 w-3" /> Sponsorisé
            </Badge>
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <p className="font-display font-bold text-sm sm:text-base">{campaign.title}</p>
            {campaign.body && <p className="text-[11px] text-white/80 mt-0.5 line-clamp-1">{campaign.body}</p>}
            {restaurant?.name && (
              <p className="text-[10px] text-white/60 mt-1 flex items-center gap-1">
                {restaurant.name} <ChevronRight className="h-3 w-3" />
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-amber-50/50 dark:bg-amber-900/10">
          <Badge className="bg-amber-500/90 text-white text-[9px] gap-1 border-none uppercase font-bold shrink-0">
            <Megaphone className="h-3 w-3" /> Sponsorisé
          </Badge>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{campaign.title}</p>
            {campaign.body && <p className="text-[11px] text-muted-foreground truncate">{campaign.body}</p>}
          </div>
          {restaurant?.name && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium shrink-0 flex items-center gap-1">
              {restaurant.name} <ChevronRight className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

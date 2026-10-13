import { useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Facebook, Instagram } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { listRestaurantMetaAccounts, publishRestaurantMetaContent } from "@/lib/restaurantMetaSocial";

export default function RestaurantMetaCampaignActions({
  restaurantId,
  campaignId,
  imageUrl,
  enabled,
}: {
  restaurantId: string;
  campaignId: string;
  imageUrl: string | null;
  enabled: boolean;
}) {
  const { toast } = useToast();
  const [publishing, setPublishing] = useState<"facebook" | "instagram" | null>(null);
  const query = useQuery({
    queryKey: ["restaurant-meta-social", restaurantId],
    queryFn: () => listRestaurantMetaAccounts(restaurantId),
    enabled,
    staleTime: 30_000,
  });
  const account = query.data?.find((item) => item.enabled && item.connected);
  if (!enabled || !account) return null;

  const publish = async (event: MouseEvent, channel: "facebook" | "instagram") => {
    event.stopPropagation();
    setPublishing(channel);
    try {
      const result = await publishRestaurantMetaContent(restaurantId, "campaign", campaignId, [channel]);
      const status = result[0]?.status;
      toast({
        title: status === "published" ? "Campagne publiée sur " + channel : "Publication non confirmée",
        description: status === "published"
          ? "Publication organique réussie : aucune dépense publicitaire Meta."
          : "Vérifiez la Page Meta avant de demander une nouvelle diffusion.",
        variant: status === "published" ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Publication refusée",
        description: error instanceof Error ? error.message : "Impossible de publier.",
        variant: "destructive",
      });
    } finally {
      setPublishing(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      <Button type="button" size="sm" variant="outline" disabled={publishing !== null}
        className="gap-1" onClick={(event) => void publish(event, "facebook")}>
        <Facebook className="h-3.5 w-3.5" /> Publier sur Facebook
      </Button>
      {account.instagramUserId ? (
        <Button type="button" size="sm" variant="outline" disabled={publishing !== null || !imageUrl}
          className="gap-1" title={!imageUrl ? "Ajoutez une image pour Instagram" : undefined}
          onClick={(event) => void publish(event, "instagram")}>
          <Instagram className="h-3.5 w-3.5" /> Publier sur Instagram
        </Button>
      ) : null}
    </div>
  );
}

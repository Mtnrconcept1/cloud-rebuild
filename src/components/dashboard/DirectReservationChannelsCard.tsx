import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type DirectChannel = {
  id: string;
  restaurant_id: string;
  source: "restaurant_website" | "qr_code" | "instagram";
  public_token: string;
  is_active: boolean;
};

const LABELS: Record<DirectChannel["source"], string> = {
  restaurant_website: "Site du restaurant",
  qr_code: "QR code",
  instagram: "Instagram",
};

function buildDirectReservationUrl(channel: DirectChannel) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.thetok.ch";
  const params = new URLSearchParams({
    open: "reservation",
    acquisition_source: channel.source,
    acquisition_channel_token: channel.public_token,
  });
  return `${origin}/restaurant/${channel.restaurant_id}?${params.toString()}`;
}

export default function DirectReservationChannelsCard({ restaurantId }: { restaurantId: string | null }) {
  const channelsQuery = useQuery({
    queryKey: ["restaurant-direct-reservation-channels", restaurantId],
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("ensure_restaurant_booking_channels", {
        p_restaurant_id: restaurantId,
      });
      if (error) throw error;
      return ((data || []) as DirectChannel[]).filter((channel) => channel.is_active);
    },
  });

  const copy = async (channel: DirectChannel) => {
    const url = buildDirectReservationUrl(channel);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié", { description: LABELS[channel.source] + " · réservations à CHF 0" });
    } catch {
      toast.error("Copie impossible", { description: url });
    }
  };

  return (
    <details className="group rounded-2xl border bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden sm:px-5">
        <span className="flex min-w-0 items-center gap-3 font-semibold">
          <Link2 className="h-5 w-5 text-primary" />
          Partager mon lien de réservation
        </span>
        <span className="shrink-0 text-sm text-muted-foreground group-open:hidden">Afficher</span>
        <span className="hidden shrink-0 text-sm text-muted-foreground group-open:inline">Masquer</span>
      </summary>
      <div className="border-t px-4 py-4 sm:px-5">
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          Choisissez le lien adapté à votre site, votre QR code ou Instagram. Les réservations reçues par ces liens restent à CHF 0.
        </p>
        {channelsQuery.isLoading ? (
          <p className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Préparation des liens…
          </p>
        ) : channelsQuery.isError ? (
          <p className="text-sm text-destructive">Les liens directs sont temporairement indisponibles.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(channelsQuery.data || []).map((channel) => {
              const url = buildDirectReservationUrl(channel);
              return (
                <div key={channel.id} className="space-y-3 rounded-xl border bg-muted/25 p-3">
                  <p className="font-semibold">{LABELS[channel.source]}</p>
                  <p className="truncate text-xs text-muted-foreground" title={url}>{url}</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => copy(channel)}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copier
                    </Button>
                    <Button asChild type="button" size="sm" variant="ghost">
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-3.5 w-3.5" /> Tester
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

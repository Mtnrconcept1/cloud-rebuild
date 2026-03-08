import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

export default function AdminAvis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: reviews } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const { data } = await supabase.from("reviews").select("*, restaurants(name)").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Avis supprimé" });
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Modération des avis</h1>
      <div className="space-y-3">
        {reviews?.map((r) => (
          <div key={r.id} className="flex items-start gap-4 p-4 border rounded-xl bg-card">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{(r.restaurants as any)?.name}</span>
                <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">
                  {Number(r.rating || 0).toFixed(0)}/10
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span>Service {Number((r as any).service_rating ?? r.rating ?? 0).toFixed(0)}/10</span>
                <span>•</span>
                <span>Qualité {Number((r as any).quality_rating ?? r.rating ?? 0).toFixed(0)}/10</span>
                <span>•</span>
                <span>Rapidité {Number((r as any).speed_rating ?? r.rating ?? 0).toFixed(0)}/10</span>
              </div>
              {r.comment && <p className="text-sm">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
            <Button size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => handleDelete(r.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

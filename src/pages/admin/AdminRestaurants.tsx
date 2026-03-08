import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

export default function AdminRestaurants() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: restaurants } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").order("name");
      return data || [];
    },
  });

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from("restaurants").update({ is_active: !current }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
  };

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Gestion des restaurants</h1>
      <div className="space-y-3">
        {restaurants?.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <img src={r.image_url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=100&h=100&fit=crop"} alt={r.name} className="w-12 h-12 rounded-lg object-cover" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">{r.name}</h3>
              <p className="text-xs text-muted-foreground">{r.city} · {r.cuisine_type}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{r.is_active ? "Actif" : "Inactif"}</span>
              <Switch checked={r.is_active ?? true} onCheckedChange={() => toggleActive(r.id, r.is_active ?? true)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

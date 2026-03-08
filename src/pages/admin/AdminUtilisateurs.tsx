import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function AdminUtilisateurs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: roles } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*, profiles(full_name)");
      return data || [];
    },
  });

  const updateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("user_roles").update({ role: role as any }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Rôle mis à jour" });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <h1 className="font-display text-3xl font-bold">Gestion des utilisateurs</h1>
      <div className="space-y-3">
        {roles?.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">{(r.profiles as any)?.full_name || "Utilisateur"}</h3>
              <p className="text-xs text-muted-foreground">{r.user_id}</p>
            </div>
            <Select value={r.role} onValueChange={(v) => updateRole(r.id, v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="restaurateur">Restaurateur</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

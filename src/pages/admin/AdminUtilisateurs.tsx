import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Search, Users } from "lucide-react";

type UserWithRole = {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
};

export default function AdminUtilisateurs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const { data: usersWithRoles, isLoading } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      // Fetch roles and profiles separately since there's no FK
      const [rolesRes, profilesRes] = await Promise.all([
        supabase.from("user_roles").select("id, user_id, role"),
        supabase.from("profiles").select("user_id, full_name, city"),
      ]);

      const profiles = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));

      return (rolesRes.data || []).map((r) => {
        const profile = profiles.get(r.user_id);
        return {
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          full_name: profile?.full_name || null,
          email: null,
          city: profile?.city || null,
        } as UserWithRole;
      });
    },
  });

  const updateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("user_roles").update({ role: role as any }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Rôle mis à jour" });
      queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
    }
  };

  const filtered = useMemo(() => {
    if (!usersWithRoles) return [];
    return usersWithRoles.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (u.full_name?.toLowerCase().includes(q) || u.user_id.toLowerCase().includes(q) || u.city?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [usersWithRoles, search, roleFilter]);

  const roleCounts = useMemo(() => {
    if (!usersWithRoles) return { client: 0, restaurateur: 0, admin: 0 };
    return usersWithRoles.reduce((acc, u) => {
      acc[u.role as keyof typeof acc] = (acc[u.role as keyof typeof acc] || 0) + 1;
      return acc;
    }, { client: 0, restaurateur: 0, admin: 0 });
  }, [usersWithRoles]);

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl font-bold">Gestion des utilisateurs</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{roleCounts.client}</p>
          <p className="text-xs text-muted-foreground">Clients</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{roleCounts.restaurateur}</p>
          <p className="text-xs text-muted-foreground">Restaurateurs</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{roleCounts.admin}</p>
          <p className="text-xs text-muted-foreground">Admins</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher par nom ou ville..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="restaurateur">Restaurateur</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {(u.full_name || "U")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">{u.full_name || "Utilisateur"}</h3>
                <p className="text-xs text-muted-foreground truncate">{u.city ? `${u.city} · ` : ""}{u.user_id.slice(0, 12)}...</p>
              </div>
              <Badge variant={u.role === "admin" ? "destructive" : u.role === "restaurateur" ? "default" : "secondary"}>
                {u.role}
              </Badge>
              <Select value={u.role} onValueChange={(v) => updateRole(u.id, v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="restaurateur">Restaurateur</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Aucun utilisateur trouvé.</p>}
        </div>
      )}
    </div>
  );
}

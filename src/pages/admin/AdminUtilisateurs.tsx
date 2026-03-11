import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, Users } from "lucide-react";

type AdminUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  roles: string[] | null;
};

const AVAILABLE_ROLES = ["client", "restaurateur", "admin", "courier"] as const;

export default function AdminUtilisateurs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data, error: rpcError } = await (supabase.rpc as any)("admin_list_users");
      if (rpcError) throw rpcError;
      return ((data || []) as AdminUserRow[]).map((user) => ({
        ...user,
        roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ["client"],
      }));
    },
  });

  const usersWithDraft = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        effectiveRoles: draftRoles[user.user_id] || user.roles || ["client"],
      })),
    [users, draftRoles]
  );

  const filtered = useMemo(() => {
    return usersWithDraft.filter((user) => {
      const roles = user.effectiveRoles;
      if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;

      if (!search.trim()) return true;
      const query = search.trim().toLowerCase();
      return (
        (user.full_name || "").toLowerCase().includes(query) ||
        (user.email || "").toLowerCase().includes(query) ||
        (user.city || "").toLowerCase().includes(query) ||
        user.user_id.toLowerCase().includes(query)
      );
    });
  }, [usersWithDraft, search, roleFilter]);

  const roleCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      const roles = user.roles || ["client"];
      for (const role of roles) {
        acc[role] = (acc[role] || 0) + 1;
      }
      return acc;
    }, { client: 0, restaurateur: 0, admin: 0, courier: 0 } as Record<string, number>);
  }, [users]);

  const toggleRole = (userId: string, role: string) => {
    setDraftRoles((prev) => {
      const current = prev[userId] || users.find((user) => user.user_id === userId)?.roles || ["client"];
      const hasRole = current.includes(role);
      const next = hasRole ? current.filter((item) => item !== role) : [...current, role];
      return { ...prev, [userId]: next.length > 0 ? next : ["client"] };
    });
  };

  const saveRoles = async (userId: string) => {
    const nextRoles = draftRoles[userId];
    if (!nextRoles) return;

    setSavingUserId(userId);
    const { error: rpcError } = await (supabase.rpc as any)("admin_set_user_roles", {
      p_user_id: userId,
      p_roles: nextRoles,
    });
    setSavingUserId(null);

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    setDraftRoles((prev) => {
      const clone = { ...prev };
      delete clone[userId];
      return clone;
    });
    toast({ title: "Roles mis a jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <div>
          <h1 className="font-display text-3xl font-bold">Gestion des utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Consultez les utilisateurs et gerez leurs roles applicatifs.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{roleCounts.courier}</p>
          <p className="text-xs text-muted-foreground">Livreurs</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher par nom, email, ville ou ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Tous les roles</option>
          <option value="client">Client</option>
          <option value="restaurateur">Restaurateur</option>
          <option value="admin">Admin</option>
          <option value="courier">Livreur</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((index) => <div key={index} className="h-28 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Impossible de charger les utilisateurs.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((user) => {
            const baseRoles = user.roles || ["client"];
            const effectiveRoles = user.effectiveRoles;
            const hasChanges = JSON.stringify([...effectiveRoles].sort()) !== JSON.stringify([...baseRoles].sort());

            return (
              <div key={user.user_id} className="rounded-xl border bg-card p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">{user.full_name || "Utilisateur"}</h3>
                    <p className="text-xs text-muted-foreground break-all">{user.email || user.user_id}</p>
                    <p className="text-xs text-muted-foreground">{user.city || "Ville non renseignee"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveRoles.map((role) => (
                      <Badge key={role} variant={role === "admin" ? "destructive" : role === "restaurateur" ? "default" : "secondary"}>
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {AVAILABLE_ROLES.map((role) => (
                    <label key={role} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={effectiveRoles.includes(role)}
                        onChange={() => toggleRole(user.user_id, role)}
                      />
                      <span>{role}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {hasChanges ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setDraftRoles((prev) => {
                            const clone = { ...prev };
                            delete clone[user.user_id];
                            return clone;
                          })
                        }
                      >
                        Annuler
                      </Button>
                      <Button onClick={() => saveRoles(user.user_id)} disabled={savingUserId === user.user_id}>
                        {savingUserId === user.user_id ? "Enregistrement..." : "Enregistrer"}
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Aucune modification</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucun utilisateur trouve.</p> : null}
        </div>
      )}
    </div>
  );
}

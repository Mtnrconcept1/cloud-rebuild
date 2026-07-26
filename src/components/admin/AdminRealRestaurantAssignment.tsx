import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, RefreshCw, ShieldCheck, Store, UserRound } from "lucide-react";
import { toast } from "sonner";

import AdminDestructiveActions from "@/components/admin/AdminDestructiveActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/integrations/supabase/client";

type RealOwnerCandidate = {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  restaurant_count: number | string;
};

type RealRestaurantCandidate = {
  restaurant_id: string;
  restaurant_name: string;
  city: string | null;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
};

type AdminRealRestaurantAssignmentProps = {
  targetUserId?: string | null;
  targetRestaurantId?: string | null;
  currentOwnerId?: string | null;
  onLinked?: () => void | Promise<void>;
};

const supabase = getSupabase();

export default function AdminRealRestaurantAssignment({
  targetUserId = null,
  targetRestaurantId = null,
  currentOwnerId = null,
  onLinked,
}: AdminRealRestaurantAssignmentProps) {
  const queryClient = useQueryClient();
  const linkingRef = useRef(false);
  const mode = targetUserId ? "user" : "restaurant";
  const [selectedUserId, setSelectedUserId] = useState(targetUserId || "");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(targetRestaurantId || "");
  const [reason, setReason] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    setSelectedUserId(targetUserId || "");
    setSelectedRestaurantId(targetRestaurantId || "");
    setReason("");
  }, [targetRestaurantId, targetUserId]);

  const ownersQuery = useQuery({
    queryKey: ["admin-real-restaurant-owners"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_real_restaurant_owners");
      if (error) throw error;
      return (data || []) as RealOwnerCandidate[];
    },
    staleTime: 20_000,
  });

  const restaurantsQuery = useQuery({
    queryKey: ["admin-real-restaurants-for-assignment"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_list_real_restaurants_for_assignment");
      if (error) throw error;
      return (data || []) as RealRestaurantCandidate[];
    },
    staleTime: 20_000,
  });

  const owners = useMemo(() => ownersQuery.data || [], [ownersQuery.data]);
  const restaurants = useMemo(() => restaurantsQuery.data || [], [restaurantsQuery.data]);
  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.restaurant_id === selectedRestaurantId) || null,
    [restaurants, selectedRestaurantId],
  );
  const selectedOwner = useMemo(
    () => owners.find((owner) => owner.user_id === selectedUserId) || null,
    [owners, selectedUserId],
  );
  const expectedOwnerId = selectedRestaurant?.owner_id || currentOwnerId || null;
  const alreadyLinked = Boolean(
    selectedUserId && expectedOwnerId && selectedUserId === expectedOwnerId,
  );
  const loading = ownersQuery.isLoading || restaurantsQuery.isLoading;
  const loadError = ownersQuery.error || restaurantsQuery.error;
  const invalidTargetUser = mode === "user" && !selectedOwner;
  const invalidTargetRestaurant = mode === "restaurant" && !selectedRestaurant;

  async function invalidateAssignmentQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-real-restaurant-owners"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-real-restaurants-for-assignment"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-users-full"] }),
      selectedRestaurantId
        ? queryClient.invalidateQueries({ queryKey: ["admin-restaurant-detail", selectedRestaurantId] })
        : Promise.resolve(),
      selectedUserId
        ? queryClient.invalidateQueries({ queryKey: ["admin-user-detail", selectedUserId] })
        : Promise.resolve(),
    ]);
  }

  async function handleLink() {
    if (linkingRef.current) return;
    if (!selectedUserId || !selectedRestaurantId || !expectedOwnerId) {
      toast.error("Sélectionnez un utilisateur réel et un restaurant réel.");
      return;
    }
    if (alreadyLinked) {
      toast.info("Cet utilisateur est déjà lié à ce restaurant.");
      return;
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      toast.error("Indiquez un motif de réaffectation entre 5 et 500 caractères.");
      return;
    }

    linkingRef.current = true;
    setLinking(true);
    try {
      const { error } = await (supabase.rpc as any)("admin_link_real_user_restaurant", {
        p_user_id: selectedUserId,
        p_restaurant_id: selectedRestaurantId,
        p_expected_owner_id: expectedOwnerId,
        p_reason: normalizedReason,
      });
      if (error) throw error;

      setReason("");
      await invalidateAssignmentQueries();
      await onLinked?.();
      toast.success("Utilisateur réel lié au restaurant réel.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier la liaison.");
    } finally {
      linkingRef.current = false;
      setLinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/60 dark:bg-sky-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-700 dark:text-sky-300" />
              <h3 className="text-sm font-semibold">Liaison réelle sécurisée</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cette opération agit uniquement sur la production. Les comptes et restaurants démo sont refusés côté base.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-sky-300 bg-white text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            Production
          </Badge>
        </div>

        {loading ? (
          <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>Impossible de charger les liaisons réelles.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void Promise.all([ownersQuery.refetch(), restaurantsQuery.refetch()])}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Réessayer
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`real-owner-${targetUserId || targetRestaurantId || "assignment"}`}>
                  <UserRound className="mr-1 inline h-4 w-4" />
                  Utilisateur réel
                </Label>
                {mode === "user" ? (
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    {selectedOwner?.full_name || targetUserId}
                    {selectedOwner?.email ? (
                      <span className="block text-xs text-muted-foreground">{selectedOwner.email}</span>
                    ) : null}
                  </div>
                ) : (
                  <select
                    id={`real-owner-${targetRestaurantId || "assignment"}`}
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Choisir un utilisateur réel…</option>
                    {owners.map((owner) => (
                      <option key={owner.user_id} value={owner.user_id}>
                        {owner.full_name} · {owner.email || owner.user_id} · {Number(owner.restaurant_count || 0)} restaurant(s)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`real-restaurant-${targetUserId || targetRestaurantId || "assignment"}`}>
                  <Store className="mr-1 inline h-4 w-4" />
                  Restaurant réel
                </Label>
                {mode === "restaurant" ? (
                  <div className="rounded-md border bg-background px-3 py-2 text-sm">
                    {selectedRestaurant?.restaurant_name || targetRestaurantId}
                    <span className="block text-xs text-muted-foreground">
                      Propriétaire actuel : {selectedRestaurant?.owner_name || selectedRestaurant?.owner_email || currentOwnerId || "inconnu"}
                    </span>
                  </div>
                ) : (
                  <select
                    id={`real-restaurant-${targetUserId || "assignment"}`}
                    value={selectedRestaurantId}
                    onChange={(event) => {
                      setSelectedRestaurantId(event.target.value);
                      setReason("");
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Choisir un restaurant réel…</option>
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.restaurant_id} value={restaurant.restaurant_id}>
                        {restaurant.restaurant_name} · {restaurant.city || "ville inconnue"} · propriétaire : {restaurant.owner_name || restaurant.owner_email || "inconnu"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {invalidTargetUser || invalidTargetRestaurant ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                Cet élément n’est pas éligible à une liaison réelle. Il peut appartenir à l’environnement démo ou avoir été supprimé.
              </p>
            ) : null}

            {!alreadyLinked && selectedUserId && selectedRestaurantId ? (
              <div className="space-y-2">
                <Label htmlFor={`real-assignment-reason-${targetUserId || targetRestaurantId || "assignment"}`}>
                  Motif obligatoire de la réaffectation
                </Label>
                <Input
                  id={`real-assignment-reason-${targetUserId || targetRestaurantId || "assignment"}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="Ex. rattachement validé par le restaurateur et l’administrateur"
                />
                <p className="text-xs text-muted-foreground">
                  Le propriétaire actuel sera remplacé. L’ancien et le nouveau propriétaire seront enregistrés dans l’audit.
                </p>
              </div>
            ) : null}

            <Button
              type="button"
              onClick={() => void handleLink()}
              disabled={linking || alreadyLinked || invalidTargetUser || invalidTargetRestaurant || !selectedUserId || !selectedRestaurantId}
              className="w-full sm:w-auto"
            >
              {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              {alreadyLinked ? "Liaison déjà active" : linking ? "Liaison en cours…" : "Confirmer la liaison réelle"}
            </Button>
          </div>
        )}
      </section>

      <AdminDestructiveActions
        targetUserId={targetUserId}
        targetRestaurantId={targetRestaurantId}
        onDeleted={onLinked}
      />
    </div>
  );
}

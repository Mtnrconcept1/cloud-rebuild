import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChefHat, Clock3, RefreshCw, ShieldCheck, UtensilsCrossed } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import KitchenOrderEntry from "@/components/dashboard/KitchenOrderEntry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { listKitchenTickets, sortKitchenTickets } from "@/lib/kitchenTickets";
import { workforceDb } from "@/hooks/useTokWorkforce";
import { workforceZurichClock } from "@/lib/tokWorkforce";

type Member = { restaurant_id: string; employee_id: string; restaurant_name: string; linked: boolean };
type Employee = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  role: string;
  is_active: boolean;
  started_on: string | null;
  ended_on: string | null;
};

const restaurantIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isActiveWorkforceEmployee(profile: Employee | null | undefined, userId: string | undefined): boolean {
  if (!profile || !userId || profile.user_id !== userId
    || profile.is_active !== true || !["employee", "manager"].includes(profile.role)) {
    return false;
  }
  const today = workforceZurichClock().date;
  return (!profile.started_on || profile.started_on <= today)
    && (!profile.ended_on || profile.ended_on >= today);
}

export default function MyRoomManagement() {
  const { user } = useAuth();
  const actorId = user?.id;
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedIds = params.getAll("restaurant");
  const requestedId = requestedIds.length === 1
    && Array.from(params.keys()).every((key) => key === "restaurant")
    && restaurantIdPattern.test(requestedIds[0])
    ? requestedIds[0].toLowerCase()
    : null;

  const memberships = useQuery({
    queryKey: ["workforce-memberships", user?.id],
    enabled: Boolean(user?.id),
    staleTime: 0,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await workforceDb().rpc("tok_workforce_my_restaurants");
      if (error) throw error;
      return (data || []) as Member[];
    },
  });
  // No implicit fallback to another employer if a URL references the wrong one.
  const member = requestedId && !memberships.isError
    ? memberships.data?.find((entry) => entry.linked && entry.restaurant_id === requestedId)
    : undefined;

  const profile = useQuery({
    queryKey: ["workforce-room-profile", user?.id, member?.employee_id, member?.restaurant_id],
    enabled: Boolean(user?.id && member?.linked),
    staleTime: 0,
    queryFn: async (): Promise<Employee> => {
      const { data, error } = await workforceDb().from("tok_workforce_employees")
        .select("id,restaurant_id,user_id,role,is_active,started_on,ended_on")
        .eq("id", member!.employee_id)
        .eq("restaurant_id", member!.restaurant_id)
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as Employee;
    },
  });
  const allowed = Boolean(member && !profile.isError
    && profile.data?.restaurant_id === member.restaurant_id
    && isActiveWorkforceEmployee(profile.data, user?.id));

  const ticketsQuery = useQuery({
    queryKey: ["kitchen-tickets", member?.restaurant_id, user?.id],
    enabled: allowed,
    queryFn: () => listKitchenTickets(member!.restaurant_id),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    retry: 0,
  });
  const tickets = sortKitchenTickets(ticketsQuery.data || []);

  useEffect(() => {
    if (!allowed || !member) return;
    const supabase = workforceDb();
    const channel = supabase.channel("kitchen-room:" + member.restaurant_id + ":" + actorId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "kitchen_tickets",
        filter: "restaurant_id=eq." + member.restaurant_id,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", member.restaurant_id] });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [allowed, member, queryClient, actorId]);

  const loading = memberships.isPending || Boolean(member && profile.isPending);
  const statusLabels = {
    queued: "À préparer",
    preparing: "En préparation",
    ready: "Prêt à servir",
    served: "Servi",
    cancelled: "Annulé",
  } as const;

  return (
    <main className="container mx-auto min-h-screen space-y-5 px-3 py-6 sm:px-6">
      <DashboardPageHero
        compact badge="Mon équipe TOK" icon={UtensilsCrossed} tone="orange"
        title="Gestion de salle"
        description="Prenez les commandes à table et transmettez-les directement à la cuisine."
        actions={(
          <Button variant="outline" asChild>
            <Link to={"/equipe/mon-espace" + (requestedId ? "?restaurant=" + requestedId : "")}>
              Retour à mon équipe
            </Link>
          </Button>
        )}
      />
      {loading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground" role="status">
          Vérification de votre accès TOK Équipe…
        </CardContent></Card>
      ) : memberships.isError || profile.isError ? (
        <Card><CardContent className="space-y-3 py-8">
          <p role="alert" className="text-sm text-destructive">
            Impossible de vérifier votre accès à la salle. Réessayez.
          </p>
          <Button variant="outline" onClick={() => void Promise.all([
            memberships.refetch(), profile.refetch(),
          ])}>Actualiser mes accès</Button>
        </CardContent></Card>
      ) : !allowed ? (
        <Card>
          <CardHeader><CardTitle>Gestion de salle non autorisée</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Seuls les collaborateurs actifs dont le compte est associé à une invitation TOK Équipe
              peuvent prendre des commandes pour cet établissement.</p>
            <p>Vérifiez votre établissement, votre invitation et votre statut auprès du restaurateur.</p>
            <Button variant="outline" asChild><Link to="/equipe/mon-espace">Mes accès TOK Équipe</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-primary/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-semibold">{member!.restaurant_name}</p>
                <p className="text-xs text-muted-foreground">
                  Les commandes sont visibles sur l'écran cuisine du restaurateur.
                </p>
              </div>
              <Badge className="gap-1"><ShieldCheck className="h-4 w-4" /> Accès TOK Équipe</Badge>
            </CardContent>
          </Card>
          <KitchenOrderEntry restaurantId={member!.restaurant_id} employeeMode />

          <Card className="rounded-2xl">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 font-serif text-xl">
                <ChefHat className="h-5 w-5 text-primary" /> Mes tickets en cuisine
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => void ticketsQuery.refetch()}>
                <RefreshCw className="mr-1 h-4 w-4" /> Actualiser
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticketsQuery.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  Le suivi des tickets est momentanément indisponible.
                </p>
              ) : ticketsQuery.isPending ? (
                <p className="text-sm text-muted-foreground">Chargement de vos commandes…</p>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune commande en préparation pour le moment.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {tickets.map((ticket) => (
                    <article key={ticket.id} className="rounded-xl border bg-card p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="font-semibold">Table {ticket.table_number}</h3>
                        <Badge variant={ticket.status === "ready" ? "default" : "secondary"}>
                          {statusLabels[ticket.status]}
                        </Badge>
                      </div>
                      <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {new Date(ticket.created_at).toLocaleTimeString("fr-CH", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                      <ul className="space-y-1 text-sm">
                        {ticket.items.map((item) => (
                          <li key={item.id}>{item.quantity}× {item.name}</li>
                        ))}
                      </ul>
                      {ticket.status === "ready" && (
                        <p className="mt-3 text-sm font-semibold text-primary">
                          À récupérer et servir à la table {ticket.table_number}.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

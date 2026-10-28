import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Clock3, Home, MailCheck, RefreshCw, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { workforceDb } from "@/hooks/useTokWorkforce";
import type { WorkforceEmployee } from "@/lib/tokWorkforce";
import { getWorkforceContinuationTarget, WORKFORCE_SELF_PATH } from "@/lib/workforceContinuation";
import WorkforcePersonal from "@/components/workforce/WorkforcePersonal";

type Member = { restaurant_id: string; employee_id: string; restaurant_name: string; linked: boolean };
type EmployeeProfile = Pick<WorkforceEmployee,
  "id" | "restaurant_id" | "first_name" | "last_name" | "role" | "contracted_hours_per_week" | "vacation_days_per_year" | "started_on" | "ended_on"
>;

export default function MyWorkforce() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [changingAccount, setChangingAccount] = useState(false);
  const search = searchParams.toString();
  const continuation = getWorkforceContinuationTarget(`${WORKFORCE_SELF_PATH}${search ? `?${search}` : ""}`);
  const requestedRestaurantId = continuation ? searchParams.get("restaurant")?.toLowerCase() : null;
  const invalidInvitationLink = continuation === null;
  const emailVerified = Boolean(user?.email_confirmed_at);

  const memberships = useQuery({
    queryKey: ["workforce-memberships", user?.id],
    enabled: !!user?.id && !changingAccount,
    queryFn: async () => {
      const { data, error } = await workforceDb().rpc("tok_workforce_my_restaurants");
      if (error) throw error;
      return (data || []) as Member[];
    },
  });

  // An invitation for one restaurant must never silently select another membership.
  const selected = !memberships.isError && !invalidInvitationLink
    ? (requestedRestaurantId
      ? memberships.data?.find((member) => member.restaurant_id === requestedRestaurantId)
      : memberships.data?.[0]) || null
    : null;

  const profile = useQuery({
    queryKey: ["workforce-self-profile", user?.id, selected?.employee_id, selected?.restaurant_id],
    enabled: !!user?.id && !!selected?.linked && !changingAccount,
    queryFn: async () => {
      const { data, error } = await workforceDb().from("tok_workforce_employees")
        .select("id,restaurant_id,first_name,last_name,role,contracted_hours_per_week,vacation_days_per_year,started_on,ended_on")
        .eq("id", selected!.employee_id).eq("restaurant_id", selected!.restaurant_id)
        .eq("user_id", user!.id).single();
      if (error) throw error;
      return data as EmployeeProfile;
    },
  });

  const refreshAccess = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["workforce-memberships", user?.id] }),
      client.invalidateQueries({ queryKey: ["workforce-self-profile", user?.id] }),
      client.invalidateQueries({ queryKey: ["workforce-management-memberships", user?.id] }),
      client.invalidateQueries({ queryKey: ["workforce-manager-profile"] }),
      client.invalidateQueries({ queryKey: ["tok-workforce"] }),
    ]);
  };

  const claim = useMutation({
    mutationFn: async (restaurantId: string) => {
      if (!selected || selected.restaurant_id !== restaurantId) {
        throw new Error("Vérifiez votre adresse e-mail et votre invitation avant de continuer.");
      }
      const { data, error } = await workforceDb().rpc("tok_workforce_claim_employee", { p_restaurant_id: restaurantId });
      if (error) throw error;
      if (data !== selected.employee_id) throw new Error("L’association n’a pas pu être vérifiée. Actualisez vos accès.");
    },
    onSuccess: async () => {
      await refreshAccess();
      toast({ title: "Compte associé à votre établissement" });
    },
    onError: () => toast({
      title: "Invitation impossible à accepter",
      description: "Actualisez vos accès. Si le problème persiste, demandez à votre employeur de vérifier ou renouveler votre invitation.",
      variant: "destructive",
    }),
  });

  const changeAccount = async () => {
    if (changingAccount || claim.isPending) return;
    const authTarget = `/auth?${new URLSearchParams({ redirect: continuation || WORKFORCE_SELF_PATH })}`;
    setChangingAccount(true);
    try {
      await signOut();
      navigate(authTarget, { replace: true });
    } catch {
      setChangingAccount(false);
      toast({
        title: "Changement de compte impossible",
        description: "Réessayez de vous déconnecter avant d’utiliser l’adresse invitée.",
        variant: "destructive",
      });
    }
  };

  const chooseRestaurant = (restaurantId: string) => {
    if (memberships.data?.some((member) => member.restaurant_id === restaurantId)) {
      claim.reset();
      setSearchParams({ restaurant: restaurantId }, { replace: true });
    }
  };

  return <main className="container mx-auto min-h-screen space-y-5 px-3 py-6 sm:px-6">
    <DashboardPageHero compact badge="Espace collaborateur" title="Mon équipe TOK"
      description="Badgez votre arrivée et votre départ, consultez vos horaires, vos compteurs et vos demandes, directement avec votre compte TOK."
      icon={Clock3} tone="orange" actions={<Button variant="outline" asChild><Link to="/espaces"><Home className="mr-2 h-4 w-4" />Mes espaces</Link></Button>} />
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Compte TOK connecté</p>
        <p className="break-all font-medium">{user?.email || "Adresse e-mail non disponible"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={memberships.isFetching || claim.isPending || changingAccount} onClick={() => void refreshAccess()}>
          <RefreshCw className="mr-2 h-4 w-4" />Actualiser mes accès
        </Button>
        <Button variant="ghost" disabled={claim.isPending || changingAccount} onClick={() => void changeAccount()}>
          {changingAccount ? "Déconnexion…" : "Changer de compte"}
        </Button>
      </div>
    </CardContent></Card>
    {changingAccount ? <p role="status" className="text-muted-foreground">Déconnexion en cours…</p> : <>
      {memberships.isPending ? <Card><CardContent className="py-10 text-center text-muted-foreground">Recherche de vos établissements…</CardContent></Card> : null}
      {memberships.isError ? <Card><CardContent className="py-8 text-destructive" role="alert">
        Impossible de vérifier vos droits d’accès. Aucun pointage possible. Réessayez avec « Actualiser mes accès ».
      </CardContent></Card> : null}
      {!memberships.isPending && !memberships.isError && !selected ? <Card>
        <CardHeader><CardTitle>{invalidInvitationLink ? "Lien d’invitation invalide" : requestedRestaurantId ? "Invitation indisponible pour ce compte" : "Aucune invitation disponible"}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {invalidInvitationLink ? <p>Ce lien ne permet pas d’identifier un établissement. Demandez à votre employeur un nouveau lien d’invitation.</p>
            : <><p>Aucune invitation active ne correspond à cet établissement et à votre compte TOK.</p>
              <p>L’invitation peut être inexistante, expirée, annulée ou envoyée à une autre adresse e-mail. Vérifiez l’adresse du compte affichée ci-dessus avec votre employeur.</p>
              <p>Votre employeur peut vous renvoyer une invitation. Le module TOK Équipe doit être activé pour cet établissement.</p></>}
          {!emailVerified ? <p>Confirmez votre adresse e-mail grâce au lien reçu lors de votre inscription, puis actualisez vos accès.</p> : null}
        </CardContent>
      </Card> : null}
      {!memberships.isError && (memberships.data?.length || 0) > 0 && (!selected || memberships.data!.length > 1) ? <Card>
        <CardContent className="space-y-2 p-4">
          <label className="block text-sm font-medium" htmlFor="workforce-restaurant">Choisir l’établissement</label>
          {!selected ? <p className="text-sm text-muted-foreground">Vous pouvez choisir explicitement un autre établissement déjà accessible avec ce compte.</p> : null}
          <select id="workforce-restaurant" className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
            value={selected?.restaurant_id || ""} disabled={claim.isPending} onChange={(event) => chooseRestaurant(event.target.value)}>
            <option value="" disabled>Choisir l’un de mes établissements</option>
            {memberships.data?.map((member) => <option key={member.employee_id} value={member.restaurant_id}>{member.restaurant_name}</option>)}
          </select>
        </CardContent>
      </Card> : null}
      {selected ? <div className="space-y-4">
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold">{selected.restaurant_name}</p><p className="text-xs text-muted-foreground">{selected.linked ? "Compte collaborateur vérifié" : "Invitation à accepter"}</p></div>
          {selected.linked ? <Badge><UserRoundCheck className="mr-2 h-4 w-4" />Accès vérifié</Badge> : null}
        </CardContent></Card>
        {!selected.linked ? <Card className="border-primary/30">
          <CardHeader><CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary" />Accepter mon invitation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Votre employeur vous invite à rejoindre cet établissement avec votre adresse e-mail vérifiée. Vous pourrez consulter vos horaires, vos compteurs et vos demandes, puis badger en votre nom.</p>
            <p className="text-sm text-muted-foreground">La confirmation de votre adresse e-mail sera vérifiée lors de l’association.</p>
            {claim.isError ? <p role="alert" className="text-sm text-destructive">L’invitation n’a pas été acceptée. Elle peut avoir expiré ou été annulée. Actualisez vos accès et vérifiez votre adresse avec votre employeur.</p> : null}
            <Button disabled={claim.isPending} onClick={() => claim.mutate(selected.restaurant_id)}>
              {claim.isPending ? "Association en cours…" : "Associer mon compte TOK"}
            </Button>
          </CardContent>
        </Card> : null}
        {selected.linked && profile.isPending ? <p className="text-muted-foreground">Chargement de votre profil…</p> : null}
        {profile.isError ? <p role="alert" className="text-destructive">Impossible de charger votre profil employé. Actualisez vos accès pour réessayer.</p> : null}
        {selected.linked && !profile.isError && profile.data?.role === "manager" ? <Button asChild className="w-fit"><Link to={"/equipe/gestion?restaurant="+selected.restaurant_id}>Gérer mon équipe</Link></Button> : null}
        {selected.linked && !profile.isError && profile.data ? <WorkforcePersonal key={selected.employee_id}
          restaurantId={selected.restaurant_id} employeeId={selected.employee_id}
          contractHours={Number(profile.data.contracted_hours_per_week)} vacationDays={Number(profile.data.vacation_days_per_year)} startedOn={profile.data.started_on} endedOn={profile.data.ended_on} firstName={profile.data.first_name} lastName={profile.data.last_name} /> : null}
      </div> : null}
    </>}
  </main>;
}

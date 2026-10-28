import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, Pencil, RefreshCw, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  dateIsValid, employeeName, workforceInvitationEmail, workforceInvitationNotice, workforceInvitationState, workforceZurichClock,
  type WorkforceEmployee, type WorkforceInvitationResult, type WorkforceInvitationState,
} from "@/lib/tokWorkforce";
import {
  useInviteWorkforceEmployee, useWorkforceEmployees, useWorkforceInvitations, useWorkforceRefresh, workforceDb,
} from "@/hooks/useTokWorkforce";
import WorkforceInvitationDialog from "@/components/workforce/WorkforceInvitationDialog";

const invitationLabels: Record<WorkforceInvitationState, string> = {
  inactive: "Accès suspendu", linked: "Accès activé", not_invited: "Accès non activé",
  queued: "Invitation programmée", processing: "Envoi en cours", sent: "Invitation envoyée",
  failed: "Échec de l’envoi", revoked: "Invitation annulée", expired: "Invitation expirée", unknown: "Suivi indisponible",
};
const errorMessage = (error: unknown): string =>
  error && typeof error === "object" && "message" in error ? String(error.message) : "Veuillez réessayer.";

export default function WorkforceEmployees({ restaurantId }: { restaurantId: string }) {
  const employeeQuery = useWorkforceEmployees(restaurantId, true);
  const { data: employees = [], isPending, isError } = employeeQuery;
  const invitations = useWorkforceInvitations(restaurantId);
  const invite = useInviteWorkforceEmployee(restaurantId);
  const refresh = useWorkforceRefresh(restaurantId);
  const { toast } = useToast();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("42");
  const [cost, setCost] = useState("0");
  const [vacation, setVacation] = useState("20");
  const [startDate, setStartDate] = useState(() => workforceZurichClock().date);
  const [endDate, setEndDate] = useState("");
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [inviteOnCreate, setInviteOnCreate] = useState(false);
  const [invitationTarget, setInvitationTarget] = useState<{
    employee: WorkforceEmployee; mode: "invite" | "revoke"; returnFocus: HTMLButtonElement;
  } | null>(null);
  const [editing, setEditing] = useState<WorkforceEmployee | null>(null);
  const [draft, setDraft] = useState({ first_name: "", last_name: "", email: "", hours: "42", vacation: "20", cost: "0", role: "employee", start_date: "", end_date: "" });

  const validateContract = (days: string, start: string, end: string) => {
    if (!Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 60) throw new Error("Le droit annuel doit être compris entre 0 et 60 jours entiers.");
    if (!dateIsValid(start) || (end && !dateIsValid(end)) || (end && end < start)) throw new Error("Vérifiez les dates du contrat. La date de début est requise.");
  };
  const edit = useMutation({
    mutationFn: async () => {
      if (!editing || editing.restaurant_id !== restaurantId) throw new Error("Fiche indisponible. Actualisez l’équipe.");
      if (!draft.first_name.trim() || !draft.last_name.trim() || draft.first_name.length > 100 || draft.last_name.length > 100) throw new Error("Renseignez un prénom et un nom valides.");
      if (!Number.isFinite(+draft.hours) || +draft.hours < 0 || +draft.hours > 60 || !Number.isFinite(+draft.cost) || +draft.cost < 0 || +draft.cost > 10000) throw new Error("Vérifiez les heures contractuelles et le coût horaire.");
      validateContract(draft.vacation, draft.start_date, draft.end_date);
      if (!["employee", "manager"].includes(draft.role)) throw new Error("Fonction invalide.");
      const emailValue = draft.email.trim() ? workforceInvitationEmail(draft.email) : null;
      const patch = {
        first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), email: emailValue,
        contracted_hours_per_week: +draft.hours, vacation_days_per_year: +draft.vacation,
        hourly_cost_chf: +draft.cost, role: draft.role, started_on: draft.start_date, ended_on: draft.end_date || null,
      };
      let query = workforceDb().from("tok_workforce_employees").update(patch).eq("restaurant_id", restaurantId).eq("id", editing.id);
      if (editing.updated_at) query = query.eq("updated_at", editing.updated_at);
      const { data, error } = await query.select("id").single();
      if (error) throw new Error("La fiche n’a pas été enregistrée. Elle a peut-être changé : actualisez l’équipe puis réessayez. " + error.message);
      if (data?.id !== editing.id) throw new Error("La modification n’a pas pu être confirmée.");
    },
    onSuccess: () => { setEditing(null); void refresh(); toast({ title: "Fiche collaborateur modifiée" }); },
  });
  const openEditor = (employee: WorkforceEmployee) => {
    edit.reset();
    setDraft({ first_name: employee.first_name, last_name: employee.last_name, email: employee.email || "", hours: String(employee.contracted_hours_per_week), vacation: String(employee.vacation_days_per_year), cost: String(employee.hourly_cost_chf || 0), role: employee.role, start_date: employee.started_on || workforceZurichClock().date, end_date: employee.ended_on || "" });
    setEditing(employee);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!first.trim() || !last.trim() || first.length > 100 || last.length > 100) throw new Error("Renseignez un prénom et un nom valides.");
      const contracted = Number(hours);
      if (!Number.isFinite(contracted) || contracted < 0 || contracted > 60) throw new Error("Heures contractuelles invalides.");
      const normalizedEmail = (email.trim() || inviteOnCreate) ? workforceInvitationEmail(email) : null;
      if (!Number.isFinite(Number(cost)) || Number(cost) < 0 || Number(cost) > 10000) throw new Error("Coût horaire invalide.");
      validateContract(vacation, startDate, endDate);
      const { data, error } = await workforceDb().from("tok_workforce_employees").insert({
        restaurant_id: restaurantId, first_name: first.trim(), last_name: last.trim(),
        email: normalizedEmail, contracted_hours_per_week: contracted, hourly_cost_chf: Number(cost), role,
        vacation_days_per_year: Number(vacation), started_on: startDate, ended_on: endDate || null,
      }).select("*").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La création de la fiche n’a pas été confirmée.");
      const employee = data as WorkforceEmployee;
      let invitation: WorkforceInvitationResult | null = null;
      let invitationError: string | null = null;
      if (inviteOnCreate) {
        try {
          invitation = await invite.mutateAsync({ employeeId: employee.id, email: normalizedEmail });
        } catch (error) {
          // The employee is already saved. A delivery failure must never repeat the INSERT.
          invitationError = errorMessage(error);
        }
      }
      return { employee, invitation, invitationError };
    },
    onSuccess: result => {
      setFirst(""); setLast(""); setEmail(""); setInviteOnCreate(false);
      void refresh();
      if (result.invitationError) {
        toast({
          variant: "destructive", title: "Collaborateur ajouté, invitation à renvoyer",
          description: "Sa fiche est enregistrée. " + result.invitationError + " Utilisez « Inviter » sur sa fiche pour réessayer.",
        });
      } else if (result.invitation) {
        const notice = workforceInvitationNotice(result.invitation);
        toast({ title: "Collaborateur ajouté · " + notice.title.toLowerCase(), description: notice.description });
      } else {
        toast({ title: "Collaborateur ajouté" });
      }
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Enregistrement impossible", description: error.message }),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await workforceDb().from("tok_workforce_employees")
        .update({ is_active: active }).eq("restaurant_id", restaurantId).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { void refresh(); toast({ title: "Fiche mise à jour" }); },
    onError: (error: Error) => toast({ variant: "destructive", title: "Mise à jour impossible", description: error.message }),
  });
  const changeCost = async (id: string, value: number) => {
    try {
      const { error } = await workforceDb().from("tok_workforce_employees").update({ hourly_cost_chf: value }).eq("restaurant_id", restaurantId).eq("id", id);
      if (error) throw error;
      void refresh(); toast({ title: "Coût horaire actualisé" });
    } catch (error) {
      toast({ variant: "destructive", title: "Mise à jour impossible", description: errorMessage(error) });
    }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!create.isPending) create.mutate(); };
  const selectedEmployee = invitationTarget ? employees.find(employee => employee.id === invitationTarget.employee.id) || invitationTarget.employee : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <Card className="min-w-0 rounded-2xl border-border/70">
        <CardHeader className="gap-3">
          <CardTitle className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 shrink-0 text-primary" />Équipe ({employees.filter(employee => employee.is_active).length} actifs)</CardTitle>
          <p className="text-sm text-muted-foreground">Invitez vos collaborateurs à consulter leur planning, leurs heures et leurs demandes dans leur espace TOK Équipe.</p>
          <Button className="w-fit" size="sm" variant="outline" disabled={employeeQuery.isFetching || invitations.isFetching}
            onClick={() => { void employeeQuery.refetch(); void invitations.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Actualiser les accès
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPending ? <p className="text-muted-foreground">Chargement de l’équipe…</p> : null}
          {isError ? <p role="alert" className="text-destructive">Impossible de charger les employés.</p> : null}
          {invitations.isError ? <p role="alert" className="text-sm text-destructive">Le suivi des invitations est indisponible. Actualisez les accès pour réessayer.</p> : null}
          {!isPending && !isError && employees.length === 0 ? <p className="text-muted-foreground">Ajoutez votre premier collaborateur pour préparer les plannings.</p> : null}
          {employees.map(employee => {
            const invitation = invitations.data?.find(item => item.employee_id === employee.id);
            const state = workforceInvitationState(employee, invitation);
            const deliveryPending = state === "queued" || state === "processing";
            const accessUnavailable = !employee.is_active || !!employee.user_id;
            const canRevoke = !!invitation && !accessUnavailable && !invitation.accepted_at && !invitation.revoked_at &&
              invitation.delivery_status !== "cancelled" && state !== "expired";
            const label = !employee.user_id && employee.is_active && invitations.isPending ? "Chargement de l’accès…" :
              !employee.user_id && employee.is_active && invitations.isError ? "Suivi indisponible" : invitationLabels[state];
            return (
              <section key={employee.id} aria-label={"Fiche de " + employeeName(employee)} className="space-y-3 rounded-xl border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{employeeName(employee)}</p>
                  <p className="break-all text-xs text-muted-foreground">{employee.email || "Sans adresse e-mail"} · {employee.contracted_hours_per_week} h/semaine · {employee.hourly_cost_chf || 0} CHF/h</p>
                  <p className="mt-1 text-xs text-muted-foreground">{employee.vacation_days_per_year} jours de vacances/an{employee.started_on ? " · Depuis le " + employee.started_on : ""}{employee.ended_on ? " · Jusqu’au " + employee.ended_on : ""}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={employee.is_active ? "secondary" : "outline"}>{employee.is_active ? (employee.role === "manager" ? "Responsable" : "Employé") : "Inactif"}</Badge>
                    <Badge variant={state === "failed" ? "destructive" : state === "linked" ? "secondary" : "outline"}>{label}</Badge>
                  </div>
                  {invitation && state === "sent" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      En attente de son acceptation · valable jusqu’au {new Intl.DateTimeFormat("fr-CH", { dateStyle: "short", timeZone: "Europe/Zurich" }).format(new Date(invitation.expires_at))}.
                    </p>
                  ) : null}
                  {deliveryPending ? <p className="mt-2 text-xs text-muted-foreground">L’e-mail n’est pas encore confirmé comme envoyé. Le suivi s’actualise automatiquement.</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" aria-label={"Modifier la fiche de " + employeeName(employee)} onClick={() => openEditor(employee)}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Modifier</Button>
                  <Button size="sm" disabled={accessUnavailable || deliveryPending || create.isPending || invitations.isPending || invitations.isError}
                    aria-label={(invitation ? "Renvoyer l’invitation à " : "Inviter ") + employeeName(employee)}
                    onClick={event => setInvitationTarget({ employee, mode: "invite", returnFocus: event.currentTarget })}>
                    <Mail className="mr-2 h-4 w-4" aria-hidden="true" />{employee.user_id ? "Accès activé" : deliveryPending ? "Envoi en attente" : invitation ? "Renvoyer" : "Inviter"}
                  </Button>
                  {canRevoke ? <Button size="sm" variant="outline" disabled={create.isPending || invitations.isError}
                    aria-label={"Annuler l’invitation de " + employeeName(employee)}
                    onClick={event => setInvitationTarget({ employee, mode: "revoke", returnFocus: event.currentTarget })}>Annuler l’invitation</Button> : null}
                  <Button size="sm" variant="outline" onClick={() => {
                    const answer = window.prompt("Coût horaire estimé en CHF", String(employee.hourly_cost_chf || 0));
                    if (answer === null) return;
                    const value = Number(answer);
                    if (!Number.isFinite(value) || value < 0 || value > 10000) { toast({ title: "Coût invalide", variant: "destructive" }); return; }
                    void changeCost(employee.id, value);
                  }}>Coût CHF/h</Button>
                  <Button size="sm" variant="outline" disabled={toggle.isPending}
                    aria-label={(employee.is_active ? "Désactiver " : "Réactiver ") + employeeName(employee)}
                    onClick={() => toggle.mutate({ id: employee.id, active: !employee.is_active })}>
                    {employee.is_active ? <UserRoundX className="mr-1 h-4 w-4" /> : <UserRoundCheck className="mr-1 h-4 w-4" />}
                    {employee.is_active ? "Désactiver" : "Réactiver"}
                  </Button>
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>
      <Card className="h-fit rounded-2xl border-primary/25">
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Ajouter un collaborateur</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} aria-label="Ajouter un collaborateur">
            <fieldset disabled={create.isPending} className="space-y-3">
              <div><Label htmlFor="wf-first">Prénom</Label><Input id="wf-first" maxLength={100} required value={first} onChange={event => setFirst(event.target.value)} /></div>
              <div><Label htmlFor="wf-last">Nom</Label><Input id="wf-last" maxLength={100} required value={last} onChange={event => setLast(event.target.value)} /></div>
              <div><Label htmlFor="wf-email">E-mail {inviteOnCreate ? "(requis pour l’invitation)" : "(facultatif)"}</Label><Input id="wf-email" type="email" maxLength={254} required={inviteOnCreate} value={email} onChange={event => setEmail(event.target.value)} /></div>
              <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <Checkbox id="wf-invite-on-create" className="mt-1" checked={inviteOnCreate} onCheckedChange={checked => setInviteOnCreate(checked === true)} />
                <div className="space-y-1">
                  <Label htmlFor="wf-invite-on-create" className="cursor-pointer leading-5">Envoyer une invitation après l’ajout</Label>
                  <p className="text-xs text-muted-foreground">Le collaborateur pourra activer son espace personnel avec son adresse e-mail.</p>
                </div>
              </div>
              <div><Label htmlFor="wf-hours">Heures contractuelles par semaine</Label><Input id="wf-hours" type="number" step="0.5" min="0" max="60" required value={hours} onChange={event => setHours(event.target.value)} /></div>
              <div><Label htmlFor="wf-vacation">Vacances annuelles (jours)</Label><Input id="wf-vacation" type="number" min="0" max="60" step="1" required value={vacation} onChange={event => setVacation(event.target.value)} /></div>
              <div><Label htmlFor="wf-start-date">Début du contrat</Label><Input id="wf-start-date" type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></div>
              <div><Label htmlFor="wf-end-date">Fin du contrat (facultatif)</Label><Input id="wf-end-date" type="date" min={startDate || undefined} value={endDate} onChange={event => setEndDate(event.target.value)} /></div>
              <div><Label htmlFor="wf-cost">Coût horaire indicatif (CHF/h)</Label><Input id="wf-cost" type="number" step="0.05" min="0" max="10000" required value={cost} onChange={event => setCost(event.target.value)} /></div>
              <div><Label htmlFor="wf-role">Fonction</Label><select id="wf-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={event => setRole(event.target.value as "employee" | "manager")}>
                <option value="employee">Employé</option><option value="manager">Responsable d’équipe</option>
              </select></div>
              <Button type="submit" disabled={create.isPending} className="w-full">{create.isPending ? "Enregistrement…" : "Ajouter à l’équipe"}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      {invitationTarget && selectedEmployee ? (
        <WorkforceInvitationDialog
          key={selectedEmployee.id + invitationTarget.mode} restaurantId={restaurantId}
          employee={selectedEmployee} invitation={invitations.data?.find(item => item.employee_id === selectedEmployee.id)}
          mode={invitationTarget.mode} returnFocus={invitationTarget.returnFocus} onClose={() => setInvitationTarget(null)}
        />
      ) : null}
      {editing ? <Dialog open onOpenChange={open => { if (!open && !edit.isPending) setEditing(null); }}>
        <DialogContent hideCloseButton={edit.isPending} className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Modifier {employeeName(editing)}</DialogTitle><DialogDescription>Identité, contrat et rôle dans cet établissement. L’enregistrement n’envoie aucune invitation.</DialogDescription></DialogHeader>
          <form aria-label="Modifier le collaborateur" onSubmit={event => { event.preventDefault(); if (!edit.isPending) edit.mutate(); }}>
            <fieldset disabled={edit.isPending} className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="wf-edit-first">Prénom</Label><Input id="wf-edit-first" required maxLength={100} value={draft.first_name} onChange={e => setDraft({ ...draft, first_name: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-last">Nom</Label><Input id="wf-edit-last" required maxLength={100} value={draft.last_name} onChange={e => setDraft({ ...draft, last_name: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="wf-edit-email">E-mail de contact</Label><Input id="wf-edit-email" type="email" maxLength={254} disabled={!!editing.user_id} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />{editing.user_id ? <p className="mt-1 text-xs text-muted-foreground">Cette adresse est liée au compte TOK du collaborateur.</p> : <p className="mt-1 text-xs text-muted-foreground">Après un changement d’adresse, utilisez « Inviter » pour envoyer une nouvelle invitation.</p>}</div>
              <div><Label htmlFor="wf-edit-hours">Heures contractuelles par semaine</Label><Input id="wf-edit-hours" type="number" required min={0} max={60} step="0.5" value={draft.hours} onChange={e => setDraft({ ...draft, hours: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-vacation">Vacances annuelles (jours)</Label><Input id="wf-edit-vacation" type="number" required min={0} max={60} step={1} value={draft.vacation} onChange={e => setDraft({ ...draft, vacation: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-start">Début du contrat</Label><Input id="wf-edit-start" type="date" required value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-end">Fin du contrat</Label><Input id="wf-edit-end" type="date" min={draft.start_date || undefined} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-cost">Coût horaire indicatif (CHF/h)</Label><Input id="wf-edit-cost" type="number" required min={0} max={10000} step="0.05" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
              <div><Label htmlFor="wf-edit-role">Fonction</Label><select id="wf-edit-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}><option value="employee">Employé</option><option value="manager">Responsable d’équipe</option></select></div>
            </fieldset>
            {edit.error ? <p role="alert" className="my-3 text-sm text-destructive">{edit.error.message}</p> : null}
            <DialogFooter className="mt-5"><Button type="button" variant="outline" disabled={edit.isPending} onClick={() => setEditing(null)}>Annuler</Button><Button type="submit" disabled={edit.isPending}>{edit.isPending ? "Enregistrement…" : "Enregistrer les modifications"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog> : null}
    </div>
  );
}

import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clipboard, ExternalLink, LifeBuoy, Loader2, RefreshCw, Search, Store, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminGoogleBookingSetups, useAdminUpdateGoogleBookingSetup } from "@/hooks/useGoogleBusinessBooking";
import {
  formatGoogleBookingDate,
  getGoogleBookingStatusLabel,
  getGoogleBookingStatusTone,
  GOOGLE_BOOKING_STATUS_LABELS,
  type AdminGoogleBusinessBookingSetup,
  type GoogleBookingStatus,
} from "@/lib/googleBusinessBooking";
import { cn } from "@/lib/utils";

type StatusFilter = GoogleBookingStatus | "all";
type AdminGoogleBookingAction = "copy" | "reminder" | "note" | "in_progress" | "configured" | "problem";
type AdminRestaurantUpdatePatch = {
  status?: GoogleBookingStatus;
  adminNotes?: string | null;
  lastAdminContactAt?: string | null;
  needsGoogleHelp?: boolean | null;
  confirmationScreenshotUrl?: string | null;
};

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous les statuts" },
  ...Object.entries(GOOGLE_BOOKING_STATUS_LABELS).map(([value, label]) => ({
    value: value as GoogleBookingStatus,
    label,
  })),
];

const HELP_ONLY_LABEL = "Aide demandee";
const ADMIN_ACTION_FEEDBACK: Record<AdminGoogleBookingAction, { title: string; description: string }> = {
  copy: {
    title: "Lien TOK copié",
    description: "Le lien de réservation TOK est dans le presse-papiers.",
  },
  reminder: {
    title: "Relance enregistrée",
    description: "La date de dernière relance est mise à jour.",
  },
  note: {
    title: "Note enregistrée",
    description: "La note admin est sauvegardée.",
  },
  in_progress: {
    title: "Marquage en cours",
    description: "Le suivi Google Business passe en configuration en cours.",
  },
  configured: {
    title: "Restaurant marqué comme configuré",
    description: "Le statut est configuré et l'aide demandée est levée.",
  },
  problem: {
    title: "Problème Google Business signalé",
    description: "Le statut passe en problème pour reprise admin.",
  },
};

function getPendingAction(row: AdminGoogleBusinessBookingSetup, action: AdminGoogleBookingAction) {
  return `${row.restaurant_id}:${action}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Réessayez dans quelques instants.";
}

function providerLabel(value: string | null) {
  switch (value) {
    case "thefork":
      return "TheFork";
    case "other":
      return "Autre";
    case "none":
      return "Aucun";
    default:
      return "Inconnu";
  }
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 dark:border-[#5f7aad]/25 dark:bg-[#07142b]/75">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border", getGoogleBookingStatusTone(status))}>
      {getGoogleBookingStatusLabel(status)}
    </Badge>
  );
}

export default function AdminGoogleBusiness() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [helpOnly, setHelpOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const updateSetup = useAdminUpdateGoogleBookingSetup();
  const { data: setups = [], isLoading, refetch } = useAdminGoogleBookingSetups({
    status,
    helpOnly,
    search,
    limit: 120,
  });

  const totals = useMemo(() => {
    return setups.reduce(
      (acc, row) => {
        acc.linkClicks += Number(row.link_clicks || 0);
        acc.reservationStarts += Number(row.reservation_starts || 0);
        acc.reservationCompletions += Number(row.reservation_completions || 0);
        if (row.needs_google_help) acc.helpRequests += 1;
        if (row.google_booking_status === "configured") acc.configured += 1;
        return acc;
      },
      { linkClicks: 0, reservationStarts: 0, reservationCompletions: 0, helpRequests: 0, configured: 0 },
    );
  }, [setups]);

  async function copyLink(row: AdminGoogleBusinessBookingSetup) {
    const actionKey = getPendingAction(row, "copy");
    setPendingAction(actionKey);
    try {
      await navigator.clipboard.writeText(row.tok_booking_url);
      toast({ ...ADMIN_ACTION_FEEDBACK.copy, description: `${row.restaurant_name} - ${ADMIN_ACTION_FEEDBACK.copy.description}` });
    } catch (error) {
      toast({ title: "Copie impossible", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setPendingAction((current) => (current === actionKey ? null : current));
    }
  }

  async function updateRestaurant(
    row: AdminGoogleBusinessBookingSetup,
    action: AdminGoogleBookingAction,
    patch: AdminRestaurantUpdatePatch,
    feedback = ADMIN_ACTION_FEEDBACK[action],
  ) {
    const actionKey = getPendingAction(row, action);
    setPendingAction(actionKey);
    try {
      await updateSetup.mutateAsync({
        restaurantId: row.restaurant_id,
        ...patch,
      });
      toast({ title: feedback.title, description: `${row.restaurant_name} - ${feedback.description}` });
    } catch (error) {
      toast({ title: "Mise à jour impossible", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setPendingAction((current) => (current === actionKey ? null : current));
    }
  }

  async function handleLastReminder(row: AdminGoogleBusinessBookingSetup) {
    const timestamp = new Date().toISOString();
    await updateRestaurant(
      row,
      "reminder",
      {
        lastAdminContactAt: timestamp,
        status: row.google_booking_status === "configured" ? undefined : "in_progress",
      },
      {
        title: "Relance enregistrée",
        description: `Dernier contact noté le ${formatGoogleBookingDate(timestamp)}. Le suivi reste ouvert côté admin.`,
      },
    );
  }

  async function handleStatusChange(row: AdminGoogleBusinessBookingSetup, nextStatus: Extract<GoogleBookingStatus, "in_progress" | "configured" | "problem">) {
    await updateRestaurant(row, nextStatus, {
      status: nextStatus,
      needsGoogleHelp: nextStatus === "configured" ? false : undefined,
    });
  }

  function isActionPending(row: AdminGoogleBusinessBookingSetup, action: AdminGoogleBookingAction) {
    return pendingAction === getPendingAction(row, action);
  }

  function isRowBusy(row: AdminGoogleBusinessBookingSetup) {
    return pendingAction?.startsWith(`${row.restaurant_id}:`) || false;
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container space-y-6 py-8">
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/admin/restaurants">
            <ArrowLeft className="h-4 w-4" />
            Retour restaurants
          </Link>
        </Button>

        <DashboardPageHero
          badge="Admin restaurants"
          title="Boutons Google Business"
          description="Suivez les restaurants qui ont copié leur lien TOK, demandé de l'aide ou confirmé leur bouton de réservation Google."
          icon={Store}
          tone="orange"
          visualLabel="Google"
          stats={[
            { label: "Restaurants", value: setups.length, icon: Store },
            { label: "Configurés", value: totals.configured, icon: CheckCircle2 },
            { label: "Aides", value: totals.helpRequests, icon: LifeBuoy },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Clics Google" value={totals.linkClicks} />
          <Metric label="Formulaires ouverts" value={totals.reservationStarts} />
          <Metric label="Réservations" value={totals.reservationCompletions} />
          <Metric label="Aides demandées" value={totals.helpRequests} />
        </div>

        <Card className="rounded-3xl border border-border/70">
          <CardHeader>
            <CardTitle>Filtres de relance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_180px_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Recherche</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Restaurant ou ville"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Statut Google</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border px-4 py-3" aria-label={HELP_ONLY_LABEL}>
              <Switch checked={helpOnly} onCheckedChange={setHelpOnly} />
              <span className="text-sm font-semibold">Aide demandée</span>
            </div>
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border/70">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead>Statut Google</TableHead>
                  <TableHead>Ancien fournisseur</TableHead>
                  <TableHead>Lien TOK</TableHead>
                  <TableHead>Google</TableHead>
                  <TableHead>Relance</TableHead>
                  <TableHead>Notes admin</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Chargement du suivi Google Business...
                    </TableCell>
                  </TableRow>
                ) : setups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Aucun restaurant ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                ) : (
                  setups.map((row) => {
                    const noteValue = noteDrafts[row.restaurant_id] ?? row.admin_notes ?? "";
                    const rowBusy = isRowBusy(row);
                    const copyPending = isActionPending(row, "copy");
                    const reminderPending = isActionPending(row, "reminder");
                    const notePending = isActionPending(row, "note");
                    const inProgressPending = isActionPending(row, "in_progress");
                    const configuredPending = isActionPending(row, "configured");
                    const problemPending = isActionPending(row, "problem");
                    return (
                      <TableRow key={row.restaurant_id}>
                        <TableCell data-label="Restaurant">
                          <div className="space-y-1">
                            <p className="font-bold">{row.restaurant_name}</p>
                            <p className="text-xs text-muted-foreground">{row.city || "Ville inconnue"}</p>
                            {row.needs_google_help ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                Aide demandée
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell data-label="Statut Google">
                          <StatusBadge status={row.google_booking_status} />
                        </TableCell>
                        <TableCell data-label="Ancien fournisseur">{providerLabel(row.previous_booking_provider)}</TableCell>
                        <TableCell data-label="Lien TOK">
                          <Button variant="outline" size="sm" onClick={() => copyLink(row)} disabled={rowBusy} className="gap-2">
                            {copyPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
                            {copyPending ? "Copie..." : "Copier lien TOK"}
                          </Button>
                        </TableCell>
                        <TableCell data-label="URL fiche Google">
                          {row.google_business_url ? (
                            <Button asChild variant="ghost" size="sm" className="gap-2">
                              <a href={row.google_business_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Ouvrir fiche
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Non renseignée</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Dernière relance">
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">{formatGoogleBookingDate(row.last_admin_contact_at)}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLastReminder(row)}
                              disabled={rowBusy}
                              aria-label="Derniere relance"
                              className="gap-2"
                            >
                              {reminderPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {reminderPending ? "Relance..." : "Dernière relance"}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell data-label="Notes admin">
                          <div className="min-w-[220px] space-y-2">
                            <Textarea
                              value={noteValue}
                              onChange={(event) => setNoteDrafts((current) => ({ ...current, [row.restaurant_id]: event.target.value }))}
                              placeholder="Notes admin"
                              rows={3}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updateRestaurant(row, "note", { adminNotes: noteValue })}
                              disabled={rowBusy}
                              className="gap-2"
                            >
                              {notePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {notePending ? "Enregistrement..." : "Enregistrer note"}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell data-label="Actions">
                          <div className="flex min-w-[210px] flex-col gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "gap-2",
                                row.google_booking_status === "in_progress" && "border-amber-200 bg-amber-50 text-amber-800",
                              )}
                              onClick={() => handleStatusChange(row, "in_progress")}
                              disabled={rowBusy}
                              aria-label="Marquer comme en cours"
                            >
                              {inProgressPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {inProgressPending ? "Marquage en cours..." : "Marquer comme en cours"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
                                row.google_booking_status === "configured" && "bg-emerald-50",
                              )}
                              onClick={() => handleStatusChange(row, "configured")}
                              disabled={rowBusy}
                              aria-label="Marquer comme configure"
                            >
                              {configuredPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              {configuredPending ? "Configuration..." : "Marquer comme configuré"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "border-red-200 text-red-700 hover:bg-red-50",
                                row.google_booking_status === "problem" && "bg-red-50",
                              )}
                              onClick={() => handleStatusChange(row, "problem")}
                              disabled={rowBusy}
                              aria-label="Marquer comme probleme"
                            >
                              {problemPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                              {problemPending ? "Signalement..." : "Marquer comme problème"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

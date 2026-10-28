import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ClipboardList, LayoutDashboard, Umbrella } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useWorkforceAbsences, useWorkforceClockSessionsInRange, useWorkforceEntriesInRange,
  useWorkforceHolidays, useWorkforceNextShift, useWorkforceRequests, useWorkforceShifts, useWorkforceValidations,
} from "@/hooks/useTokWorkforce";
import { dateIsValid, weekRange, workforceZurichClock, type WorkforceEmployee, type WorkforceRequest } from "@/lib/tokWorkforce";
import {
  buildWorkforceReport, WORKFORCE_CALCULATION_NOTE, workforceAddDays, workforceDates,
  workforceHours, workforceMonthPeriod,
} from "@/lib/tokWorkforceReporting";
import WorkforceClock from "@/components/workforce/WorkforceClock";
import WorkforcePersonalExchanges from "@/components/workforce/WorkforcePersonalExchanges";
import WorkforceRequestForm from "@/components/workforce/WorkforceRequestForm";

type Props = {
  restaurantId: string; employeeId: string; contractHours: number; vacationDays: number;
  startedOn?: string | null; endedOn?: string | null; firstName?: string; lastName?: string;
};
const dateLabel = (date: string) => new Intl.DateTimeFormat("fr-CH", { dateStyle: "full", timeZone: "Europe/Zurich" }).format(new Date(date + "T12:00:00Z"));
const absenceNames = { vacation: "Vacances", sick: "Maladie", holiday: "Férié", other: "Absence" };
const shiftNames = { planned: "Planifié", confirmed: "Confirmé", completed: "Terminé", cancelled: "Annulé" };
const requestNames = { vacation: "Congés", correction: "Correction des heures", schedule: "Planning", other: "Autre demande" };

function RequestHistory({ request }: { request: WorkforceRequest }) {
  return <article className="space-y-2 rounded-xl border p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{requestNames[request.request_type]}</p><p>{request.status === "pending" ? "En attente" : request.status === "approved" ? "Acceptée" : "Refusée"}</p></div>
    <p className="whitespace-pre-wrap break-words">{request.description}</p>
    {request.requested_start_date ? <p className="text-muted-foreground">Du {request.requested_start_date} au {request.requested_end_date} · {request.requested_days} jour(s) demandé(s)</p> : null}
    {request.requested_entry_id ? <p className="text-muted-foreground">Horaires proposés : {request.requested_start_time?.slice(0, 5)}–{request.requested_end_time?.slice(0, 5)} · pause {request.requested_break_minutes} min</p> : null}
    {request.review_note ? <p className="whitespace-pre-wrap rounded-lg bg-muted p-3"><span className="font-medium">Réponse du responsable : </span>{request.review_note}</p> : null}
  </article>;
}

export default function WorkforcePersonal({ restaurantId, employeeId, contractHours, vacationDays, startedOn, endedOn, firstName, lastName }: Props) {
  const today = workforceZurichClock().date;
  const [activeTab, setActiveTab] = useState("overview");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [weekDay, setWeekDay] = useState(today);
  const [hoursPage, setHoursPage] = useState(0), [requestPage, setRequestPage] = useState(0);
  const [validatedOnly, setValidatedOnly] = useState(false);
  const year = Number(month.slice(0, 4));
  const yearPeriod = useMemo(() => ({ start: `${year}-01-01`, end: `${year}-12-31` }), [year]);
  const monthPeriod = useMemo(() => workforceMonthPeriod(month), [month]);
  const week = useMemo(() => weekRange(new Date(weekDay + "T12:00:00")), [weekDay]);
  const fetchStart = workforceAddDays(yearPeriod.start, -1);
  const shifts = useWorkforceShifts(restaurantId, true, week.start, week.end, employeeId);
  const nextShift = useWorkforceNextShift(restaurantId, employeeId);
  const entries = useWorkforceEntriesInRange(restaurantId, true, fetchStart, yearPeriod.end, employeeId);
  const sessions = useWorkforceClockSessionsInRange(restaurantId, true, fetchStart, yearPeriod.end, employeeId);
  const validations = useWorkforceValidations(restaurantId, true, fetchStart, yearPeriod.end, employeeId);
  const absences = useWorkforceAbsences(restaurantId, true, employeeId);
  const holidays = useWorkforceHolidays(restaurantId, true);
  const requests = useWorkforceRequests(restaurantId, true, employeeId);
  const employee = useMemo<WorkforceEmployee>(() => ({
    id: employeeId, restaurant_id: restaurantId, first_name: firstName || "Mon", last_name: lastName || "compte",
    email: null, user_id: null, role: "employee", contracted_hours_per_week: contractHours,
    vacation_days_per_year: vacationDays, hourly_cost_chf: 0, is_active: true, started_on: startedOn, ended_on: endedOn,
  }), [employeeId, restaurantId, firstName, lastName, contractHours, vacationDays, startedOn, endedOn]);
  const reportInput = useMemo(() => ({
    restaurantId, employees: [employee], entries: entries.data || [], absences: absences.data || [],
    validations: validations.data || [], holidays: holidays.data || [], clockSessions: sessions.data || [], asOf: today,
  }), [restaurantId, employee, entries.data, absences.data, validations.data, holidays.data, sessions.data, today]);
  const annualReport = useMemo(() => buildWorkforceReport({ ...reportInput, period: yearPeriod }), [reportInput, yearPeriod]);
  const monthlyReport = useMemo(() => buildWorkforceReport({ ...reportInput, period: monthPeriod, validatedOnly }), [reportInput, monthPeriod, validatedOnly]);
  const annual = annualReport.employees[0], monthly = monthlyReport.employees[0];
  const myShifts = (shifts.data || []).filter(item => item.restaurant_id === restaurantId && item.employee_id === employeeId);
  const myAbsences = (absences.data || []).filter(item => item.restaurant_id === restaurantId && item.employee_id === employeeId);
  const myRequests = (requests.data || []).filter(item => item.restaurant_id === restaurantId && item.employee_id === employeeId);
  const next = nextShift.data?.restaurant_id === restaurantId && nextShift.data?.employee_id === employeeId ? nextShift.data : null;
  const hourQueries = [entries, sessions, validations];
  const counterQueries = [...hourQueries, absences, holidays];
  const hoursPending = hourQueries.some(query => query.isPending), hoursError = hourQueries.some(query => query.isError);
  const countersPending = counterQueries.some(query => query.isPending), countersError = counterQueries.some(query => query.isError);
  const vacationPending = absences.isPending || holidays.isPending, vacationError = absences.isError || holidays.isError;
  const hoursValue = (value: number, issues = monthlyReport.issues) => hoursPending ? "Chargement…" : hoursError ? "Indisponibles" : issues.length ? "À régulariser" : `${workforceHours(value)} h`;
  const vacationValue = vacationPending ? "Chargement…" : vacationError ? "Indisponibles" : annual.unallocatedAbsences.some(absence => absence.absence_type === "vacation") ? "À régulariser" : `${annual.vacation.remainingDays.toFixed(1)} jours`;
  const setSelectedMonth = (value: string) => {
    if (/^\d{4}-\d{2}$/.test(value) && dateIsValid(value + "-01")) { setMonth(value); setHoursPage(0); }
  };
  const moveMonth = (step: number) => {
    const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + step);
    setSelectedMonth(date.toISOString().slice(0, 7));
  };
  const selectTab = (value: string) => {
    if (value === "overview") { setMonth(today.slice(0, 7)); setValidatedOnly(false); setHoursPage(0); }
    setActiveTab(value);
  };
  const retryCounters = () => { counterQueries.forEach(query => { void query.refetch(); }); };
  const records = monthly.records;
  const lastHoursPage = Math.max(0, Math.ceil(records.length / 50) - 1);
  const visibleHoursPage = Math.min(hoursPage, lastHoursPage);
  const lastRequestPage = Math.max(0, Math.ceil(myRequests.length / 20) - 1);
  const visibleRequestPage = Math.min(requestPage, lastRequestPage);

  return <Tabs value={activeTab} onValueChange={selectTab} className="space-y-5">
    <TabsList className="grid h-auto grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
      <TabsTrigger value="overview"><LayoutDashboard className="mr-1 h-4 w-4" />Vue d’ensemble</TabsTrigger>
      <TabsTrigger value="clock"><Clock3 className="mr-1 h-4 w-4" />Badgeuse</TabsTrigger>
      <TabsTrigger value="planning"><CalendarDays className="mr-1 h-4 w-4" />Planning</TabsTrigger>
      <TabsTrigger value="hours">Mes heures</TabsTrigger>
      <TabsTrigger value="counters"><Umbrella className="mr-1 h-4 w-4" />Compteurs</TabsTrigger>
      <TabsTrigger value="requests"><ClipboardList className="mr-1 h-4 w-4" />Demandes</TabsTrigger>
      <TabsTrigger value="exchanges">Échanges</TabsTrigger>
    </TabsList>
    <TabsContent value="overview" className="space-y-5">
      <div className="space-y-1"><h2 className="text-xl font-semibold">Votre activité en un coup d’œil</h2><p className="text-sm text-muted-foreground">Retrouvez vos prochains services, vos heures et le suivi de vos demandes.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Mon planning</p><p className="text-xl font-semibold">{contractHours} h / semaine</p><Button size="sm" variant="outline" onClick={() => selectTab("planning")}>Voir mes horaires</Button></CardContent></Card>
        <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Heures ce mois</p><p className="text-xl font-semibold">{hoursValue(monthly.workedMinutes)}</p><Button size="sm" variant="outline" onClick={() => { setValidatedOnly(false); selectTab("hours"); }}>Consulter mes heures</Button></CardContent></Card>
        <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Vacances restantes</p><p className="text-xl font-semibold">{vacationValue}</p><Button size="sm" variant="outline" onClick={() => selectTab("counters")}>Voir mes compteurs</Button></CardContent></Card>
        <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Demandes en attente</p><p className="text-xl font-semibold">{requests.isPending ? "Chargement…" : requests.isError ? "Indisponibles" : myRequests.filter(request => request.status === "pending").length}</p><Button size="sm" variant="outline" onClick={() => selectTab("requests")}>Suivre mes demandes</Button></CardContent></Card>
      </div>
      {monthlyReport.issues.length && !hoursPending && !hoursError ? <p role="alert" className="text-sm text-destructive">Certains horaires doivent être régularisés. Consultez « Mes heures » pour le détail.</p> : null}
      <Card className="rounded-2xl border-primary/25"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Prochain service</CardTitle></CardHeader><CardContent className="space-y-3">
        {nextShift.isPending ? <p className="text-muted-foreground">Recherche du prochain service…</p> : nextShift.isError ? <p role="alert" className="text-destructive">Le prochain service est indisponible. Consultez votre planning ou <button className="underline" onClick={() => { void nextShift.refetch(); }}>réessayez</button>.</p> : next ? <><p className="font-semibold">{dateLabel(next.shift_date)}</p><p>{next.start_time.slice(0, 5)} – {next.end_time.slice(0, 5)} · Pause : {next.break_minutes} min</p><Button size="sm" variant="outline" onClick={() => { setWeekDay(next.shift_date); selectTab("planning"); }}>Ouvrir mon planning</Button></> : <p className="text-muted-foreground">Aucun service à venir n’est encore planifié.</p>}
      </CardContent></Card>
      <div className="grid gap-5 lg:grid-cols-2"><WorkforceClock restaurantId={restaurantId} employeeId={employeeId} /><Card className="h-fit"><CardHeader><CardTitle>Dernières demandes</CardTitle></CardHeader><CardContent className="space-y-3">
        {requests.isPending ? <p className="text-muted-foreground">Chargement des demandes…</p> : requests.isError ? <p role="alert" className="text-destructive">Demandes indisponibles.</p> : !myRequests.length ? <p className="text-muted-foreground">Vous n’avez pas encore envoyé de demande.</p> : myRequests.slice(0, 3).map(request => <RequestHistory key={request.id} request={request} />)}
        <Button size="sm" onClick={() => selectTab("requests")}>Faire une demande</Button>
      </CardContent></Card></div>
    </TabsContent>
    <TabsContent value="clock"><WorkforceClock restaurantId={restaurantId} employeeId={employeeId} /></TabsContent>
    <TabsContent value="planning"><Card><CardHeader><CardTitle>Mon planning</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><Button size="icon" variant="outline" aria-label="Semaine précédente" onClick={() => setWeekDay(workforceAddDays(weekDay, -7))}><ChevronLeft className="h-4 w-4" /></Button><label className="text-sm">Semaine contenant le<Input type="date" value={weekDay} onChange={event => { if (dateIsValid(event.target.value)) setWeekDay(event.target.value); }} /></label><Button size="icon" variant="outline" aria-label="Semaine suivante" onClick={() => setWeekDay(workforceAddDays(weekDay, 7))}><ChevronRight className="h-4 w-4" /></Button></div>
      <p className="text-sm text-muted-foreground">Du {week.start} au {week.end} · Horaires du restaurant (Europe/Zurich).</p>
      {shifts.isPending || absences.isPending ? <p>Chargement du planning…</p> : shifts.isError || absences.isError ? <p role="alert" className="text-destructive">Planning indisponible. <button className="underline" onClick={() => { void shifts.refetch(); void absences.refetch(); }}>Réessayer</button></p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workforceDates(week).map(date => {
        const dayShifts = myShifts.filter(shift => shift.shift_date === date), dayAbsences = myAbsences.filter(absence => absence.start_date <= date && absence.end_date >= date);
        return <section key={date} className="space-y-3 rounded-xl border p-4"><h3 className="text-sm font-semibold capitalize">{dateLabel(date)}</h3>{dayAbsences.map(absence => <p key={absence.id} className="rounded-lg bg-muted px-3 py-2 text-sm">{absenceNames[absence.absence_type]}</p>)}{dayShifts.map(shift => <div key={shift.id} className={`rounded-lg border p-3 text-sm ${shift.status === "cancelled" ? "text-muted-foreground" : "border-primary/30 bg-primary/5"}`}><p className={shift.status === "cancelled" ? "line-through" : "font-medium"}>{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}{shift.end_time < shift.start_time ? " (+1 jour)" : ""}</p><p>Pause : {shift.break_minutes} min · {shiftNames[shift.status]}</p>{shift.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{shift.notes}</p> : null}</div>)}{!dayShifts.length && !dayAbsences.length ? <p className="text-sm text-muted-foreground">Aucun service planifié.</p> : null}</section>;
      })}</div>}
    </CardContent></Card></TabsContent>
    <TabsContent value="hours"><Card><CardHeader><CardTitle>Mes heures</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><Button size="icon" variant="outline" aria-label="Mois précédent" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button><label className="text-sm">Mois des relevés<Input type="month" value={month} onChange={event => setSelectedMonth(event.target.value)} /></label><Button size="icon" variant="outline" aria-label="Mois suivant" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4" /></Button><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={validatedOnly} onChange={event => { setValidatedOnly(event.target.checked); setHoursPage(0); }} />Relevés validés uniquement</label></div>
      {hoursError ? <p role="alert" className="text-destructive">Impossible de consulter les heures. <button className="underline" onClick={retryCounters}>Réessayer</button></p> : null}
      <p className="text-lg font-bold text-primary">{hoursValue(monthly.workedMinutes)}{!hoursPending && !hoursError && !monthlyReport.issues.length ? " comptabilisées" : ""}</p>
      {!hoursPending && !hoursError ? <>
        {monthlyReport.issues.length ? <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 p-3 text-sm text-destructive"><p className="font-semibold">Totaux incomplets : horaires à régulariser avec votre responsable.</p>{monthlyReport.issues.map(issue => <p key={issue}>{issue}</p>)}</div> : null}
        <p className="text-sm text-muted-foreground">{workforceHours(monthly.validatedMinutes)} h validées · {workforceHours(monthly.nightMinutes)} h de nuit · {workforceHours(monthly.sundayMinutes)} h le dimanche</p>
        {!records.length && !monthlyReport.issues.length ? <p className="text-muted-foreground">Aucune heure {validatedOnly ? "validée " : "enregistrée "}pour ce mois.</p> : null}
        <div className="space-y-3">{records.slice(visibleHoursPage * 50, (visibleHoursPage + 1) * 50).map(record => <article key={record.entry.id + record.date} className="space-y-2 rounded-xl border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{record.date} · {record.startTime}–{record.endTime}</p><p>{workforceHours(record.workedMinutes, 2)} h · pause {record.breakMinutes.toFixed(1)} min</p></div><p className="text-muted-foreground">Nuit : {workforceHours(record.nightMinutes, 2)} h · Dimanche : {workforceHours(record.sundayMinutes, 2)} h · {record.source === "clock" ? "Badgeuse" : "Saisie manuelle"}</p><p>{record.validation ? `${record.validation.entry_version == null ? "Signature historique de" : "Validé par"} ${record.validation.signed_name} le ${new Date(record.validation.signed_at).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}` : "En attente de validation"}</p>{record.entry.notes ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{record.entry.notes}</p> : null}</article>)}</div>
        {lastHoursPage > 0 ? <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={!visibleHoursPage} onClick={() => setHoursPage(visibleHoursPage - 1)}>Relevés précédents</Button><p className="text-sm">Page {visibleHoursPage + 1} / {lastHoursPage + 1} · {records.length} lignes</p><Button variant="outline" size="sm" disabled={visibleHoursPage >= lastHoursPage} onClick={() => setHoursPage(visibleHoursPage + 1)}>Relevés suivants</Button></div> : null}
      </> : null}
      <p className="text-xs leading-relaxed text-muted-foreground">Les services passant minuit sont répartis sur les jours réellement travaillés. Les pauses sont réparties au prorata ; nuit : 23 h–6 h. Les nouvelles signatures portent sur la version actuelle du relevé ; les signatures historiques sont identifiées séparément et vérifiées par leur date.</p>
    </CardContent></Card></TabsContent>
    <TabsContent value="counters" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3"><h2 className="mr-auto text-xl font-semibold">Mes compteurs · {year}</h2><label className="text-sm">Année des compteurs<Input className="w-32" type="number" min={1000} max={9998} value={year} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1000 && value <= 9998) setSelectedMonth(String(value) + month.slice(4)); }} /></label></div>
      {countersPending ? <p>Chargement des compteurs…</p> : countersError ? <p role="alert" className="text-destructive">Compteurs indisponibles. <button className="underline" onClick={retryCounters}>Réessayer</button></p> : <>
        {annualReport.issues.length ? <div role="alert" className="space-y-1 rounded-xl border border-destructive/30 p-3 text-sm text-destructive"><p className="font-semibold">Compteurs provisoires : des horaires nécessitent une régularisation.</p>{annualReport.issues.map(issue => <p key={issue}>{issue}</p>)}</div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Heures travaillées", `${workforceHours(annual.workedMinutes)} h`], ["Heures validées", `${workforceHours(annual.validatedMinutes)} h`],
          ["Heures de nuit", `${workforceHours(annual.nightMinutes)} h`], ["Dimanches", `${workforceHours(annual.sundayMinutes)} h`],
          ["Attendu à ce jour", `${workforceHours(annual.expectedToDateMinutes)} h`], ["Solde à ce jour", `${annual.balanceMinutes > 0 ? "+" : ""}${workforceHours(annual.balanceMinutes)} h`],
          ["Vacances prises", `${annual.vacation.usedDays.toFixed(1)} jours`], ["Vacances réservées", `${annual.vacation.reservedDays.toFixed(1)} jours`],
          ["Droit annuel proratisé", `${annual.vacation.entitledDays.toFixed(1)} jours`], ["Vacances disponibles", `${annual.vacation.remainingDays.toFixed(1)} jours`],
          ["Crédit fériés", `${workforceHours(annual.holidayCreditMinutes)} h`], ["Crédit absences", `${workforceHours(annual.absenceCreditMinutes)} h`],
        ].map(([label, value]) => <Card key={label}><CardContent className="space-y-2 p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold text-primary">{value}</p></CardContent></Card>)}</div>
      </>}
      <Card><CardContent className="space-y-3 p-5 text-sm leading-relaxed text-muted-foreground"><p>Contrat : {contractHours} h/semaine · Vacances annuelles : {vacationDays} jours.{startedOn ? ` Début : ${startedOn}.` : ""}{endedOn ? ` Fin : ${endedOn}.` : ""}</p><p>{WORKFORCE_CALCULATION_NOTE}</p><p>Le droit annuel aux vacances est proratisé selon les jours calendaires du contrat dans l’année. Les jours décomptés sont répartis sur les jours ouvrés de chaque absence, hors fériés configurés. Une absence à cheval sur deux années est ventilée. Les congés futurs approuvés sont réservés ; une demande en attente ne modifie pas le solde.</p><p>Le solde est arrêté au {today < yearPeriod.start ? "début de la période (période future)" : today > yearPeriod.end ? yearPeriod.end : today}. Les jours futurs de l’année ne créent pas de déficit. La répartition sur cinq jours sert de base indicative pour les contrats dont les jours de travail varient.</p></CardContent></Card>
    </TabsContent>
    <TabsContent value="requests"><Card><CardHeader><CardTitle>Mes demandes</CardTitle></CardHeader><CardContent className="space-y-5">
      <WorkforceRequestForm restaurantId={restaurantId} employees={[employee]} employeeId={employeeId} onSuccess={() => { void requests.refetch(); setRequestPage(0); }} />
      <section className="space-y-3" aria-label="Historique de mes demandes"><h3 className="font-semibold">Suivi des demandes</h3>{requests.isPending ? <p className="text-muted-foreground">Chargement des demandes…</p> : requests.isError ? <p role="alert" className="text-destructive">Demandes indisponibles. <button className="underline" onClick={() => { void requests.refetch(); }}>Réessayer</button></p> : !myRequests.length ? <p className="text-muted-foreground">Vous n’avez pas encore envoyé de demande.</p> : myRequests.slice(visibleRequestPage * 20, (visibleRequestPage + 1) * 20).map(request => <RequestHistory key={request.id} request={request} />)}
        {lastRequestPage > 0 && !requests.isError && !requests.isPending ? <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={!visibleRequestPage} onClick={() => setRequestPage(visibleRequestPage - 1)}>Demandes précédentes</Button><p className="text-sm">Page {visibleRequestPage + 1} / {lastRequestPage + 1}</p><Button variant="outline" size="sm" disabled={visibleRequestPage >= lastRequestPage} onClick={() => setRequestPage(visibleRequestPage + 1)}>Demandes suivantes</Button></div> : null}
      </section>
    </CardContent></Card></TabsContent>
    <TabsContent value="exchanges"><WorkforcePersonalExchanges restaurantId={restaurantId} employeeId={employeeId} /></TabsContent>
  </Tabs>;
}

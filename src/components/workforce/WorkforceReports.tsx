import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { employeeName, weekRange, workforceZurichClock, type WorkforceSettings } from "@/lib/tokWorkforce";
import {
  buildWorkforceReport, workforceAddDays, workforceHours, workforceMonthPeriod,
  workforceReportCsv, workforceReportTotals, WORKFORCE_CALCULATION_NOTE, type WorkforceReport,
} from "@/lib/tokWorkforceReporting";
import {
  useWorkforceAbsences, useWorkforceClockSessionsInRange, useWorkforceEmployees,
  useWorkforceEntriesInRange, useWorkforceHolidays, useWorkforceShifts, useWorkforceValidations,
} from "@/hooks/useTokWorkforce";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
export default function WorkforceReports({ restaurantId, settings, restaurantName }: { restaurantId: string; settings: WorkforceSettings; restaurantName?: string }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(workforceZurichClock().date);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [validatedOnly, setValidatedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const period = useMemo(() => mode === "month" ? workforceMonthPeriod(cursor.slice(0, 7)) : weekRange(new Date(cursor + "T12:00:00")), [mode, cursor]);
  const queryStart = workforceAddDays(period.start, -1);
  const employeeId = selectedEmployee === "all" ? undefined : selectedEmployee;
  const employees = useWorkforceEmployees(restaurantId, true);
  const shifts = useWorkforceShifts(restaurantId, true, queryStart, period.end, employeeId);
  const entries = useWorkforceEntriesInRange(restaurantId, true, queryStart, period.end, employeeId);
  const validations = useWorkforceValidations(restaurantId, true, queryStart, period.end, employeeId);
  const absences = useWorkforceAbsences(restaurantId, true, employeeId);
  const holidays = useWorkforceHolidays(restaurantId, true);
  const sessions = useWorkforceClockSessionsInRange(restaurantId, true, queryStart, period.end, employeeId);
  const queries = [employees, shifts, entries, validations, absences, holidays, sessions];
  const pending = queries.some(query => query.isPending);
  const error = queries.some(query => query.isError);
  const refreshing = queries.some(query => query.isFetching);
  const report = useMemo(() => buildWorkforceReport({
    restaurantId, period, employees: employees.data || [], entries: entries.data || [], shifts: shifts.data || [],
    validations: validations.data || [], absences: absences.data || [], holidays: holidays.data || [],
    clockSessions: sessions.data || [], employeeId, validatedOnly,
  }), [restaurantId, period, employees.data, entries.data, shifts.data, validations.data, absences.data, holidays.data, sessions.data, employeeId, validatedOnly]);
  const totals = workforceReportTotals(report);
  const details = report.employees.flatMap(employee => employee.records.map(record => ({ ...record, employee: employee.employee })))
    .sort((a, b) => a.startInstant - b.startInstant || employeeName(a.employee).localeCompare(employeeName(b.employee)));
  const pageSize = 50;
  const pages = Math.max(1, Math.ceil(details.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const blocked = pending || error || refreshing || report.issues.length > 0 || !report.employees.length;
  const move = (direction: number) => {
    if (mode === "week") setCursor(workforceAddDays(cursor, direction * 7));
    else {
      const date = new Date(period.start + "T12:00:00Z");
      date.setUTCMonth(date.getUTCMonth() + direction);
      setCursor(date.toISOString().slice(0, 10));
    }
    setPage(0);
  };
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([workforceReportCsv(report)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `tok-equipe-${period.start}-${period.end}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadPdf = async (selection: WorkforceReport) => {
    setExporting(true);
    try {
      const { downloadWorkforcePdf } = await import("@/lib/tokWorkforcePdf");
      await downloadWorkforcePdf(selection, restaurantName);
    } catch (cause) {
      toast({ title: "Export PDF impossible", description: cause instanceof Error ? cause.message : "Réessayez le téléchargement.", variant: "destructive" });
    } finally { setExporting(false); }
  };
  return <div className="space-y-5">
    <Card className="rounded-2xl">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Rapports de l’équipe</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">Synthèse et détail quotidien, avec les validations liées aux relevés.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={blocked || exporting} onClick={downloadCsv}><Download className="mr-2 h-4 w-4" />CSV complet</Button>
          <Button disabled={blocked || exporting} onClick={() => void downloadPdf(report)}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {employeeId ? "PDF individuel" : "PDF global"}
          </Button>
        </div>
      </div></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">Période
            <select className={selectClass} value={mode} onChange={event => { setMode(event.target.value as "month" | "week"); setPage(0); }}>
              <option value="month">Mois</option><option value="week">Semaine</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">{mode === "month" ? "Mois et année" : "Date de la semaine"}
            <Input type={mode === "month" ? "month" : "date"} value={mode === "month" ? cursor.slice(0, 7) : cursor}
              onChange={event => { if (event.target.value) { setCursor(mode === "month" ? event.target.value + "-01" : event.target.value); setPage(0); } }} />
          </label>
          <label className="space-y-1 text-sm">Collaborateur
            <select className={selectClass} value={selectedEmployee} onChange={event => { setSelectedEmployee(event.target.value); setPage(0); }}>
              <option value="all">Tous les collaborateurs</option>
              {(employees.data || []).filter(employee => employee.restaurant_id === restaurantId).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}{!employee.is_active ? " · Archivé" : ""}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2.5 text-sm">
            <input type="checkbox" checked={validatedOnly} onChange={event => { setValidatedOnly(event.target.checked); setPage(0); }} />
            Relevés validés uniquement
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="icon" variant="outline" aria-label="Période précédente" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="text-sm font-semibold">{period.start} au {period.end}</p>
          <Button size="icon" variant="outline" aria-label="Période suivante" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {pending ? <p role="status" className="py-6 text-center text-muted-foreground">Chargement de tous les relevés du rapport…</p> : error ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-4">
          <p className="text-destructive">Le rapport est indisponible. Aucune donnée partielle ne sera exportée.</p>
          <Button variant="outline" onClick={() => void Promise.all(queries.map(query => query.refetch()))}>Réessayer</Button>
        </div> : <>
          {report.issues.length > 0 ? <div role="alert" className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium">Relevés à régulariser avant l’export</p>
            <p className="text-sm">Les totaux ci-dessous excluent les horaires et les décomptes d’absences qui ne peuvent pas être calculés de façon fiable.</p>
            {report.issues.map(issue => <p key={issue} className="text-sm">{issue}</p>)}
          </div> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Heures réalisées", workforceHours(totals.workedMinutes) + " h"],
              ["Heures validées", workforceHours(totals.validatedMinutes) + " h"],
              ["Heures de nuit", workforceHours(totals.nightMinutes) + " h"],
              ["Heures du dimanche", workforceHours(totals.sundayMinutes) + " h"],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <caption className="sr-only">Synthèse du rapport par collaborateur</caption>
              <thead className="bg-muted/50"><tr>{["Collaborateur", "Prévu", "Réalisé", "Attendu", "Solde à date", "Nuit", "Dimanche", "Vacances prises", "Réservées", "Disponibles", "PDF"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>)}</tr></thead>
              <tbody>{report.employees.map(row => <tr key={row.employee.id} className="border-t">
                <td className="px-3 py-3 font-medium">{employeeName(row.employee)}{!row.employee.is_active ? <span className="block text-xs text-muted-foreground">Archivé</span> : null}</td>
                <td className="px-3 py-3">{workforceHours(row.plannedMinutes)} h</td><td className="px-3 py-3">{workforceHours(row.workedMinutes)} h</td>
                <td className="px-3 py-3">{workforceHours(row.expectedMinutes)} h</td><td className="px-3 py-3">{row.balanceMinutes > 0 ? "+" : ""}{workforceHours(row.balanceMinutes)} h</td>
                <td className="px-3 py-3">{workforceHours(row.nightMinutes)} h</td><td className="px-3 py-3">{workforceHours(row.sundayMinutes)} h</td>
                <td className="px-3 py-3">{row.vacation.usedDays.toFixed(1)} j</td><td className="px-3 py-3">{row.vacation.reservedDays.toFixed(1)} j</td><td className="px-3 py-3">{row.vacation.remainingDays.toFixed(1)} j</td>
                <td className="px-3 py-3"><Button size="icon" variant="outline" aria-label={`PDF de ${employeeName(row.employee)}`} disabled={blocked || exporting} onClick={() => void downloadPdf({ ...report, employees: [row] })}><FileText className="h-4 w-4" /></Button></td>
              </tr>)}</tbody>
            </table>
            {!report.employees.length ? <p className="p-5 text-sm text-muted-foreground">Aucun collaborateur correspondant à ce filtre.</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">Vacances : année {period.end.slice(0, 4)}, droits proratisés aux dates du contrat. « Attendu » couvre toute la période ; le solde est arrêté au {report.asOf < period.end ? report.asOf : period.end}. Les collaborateurs archivés restent dans l’historique.</p>
        </>}
      </CardContent>
    </Card>
    {!pending && !error ? <Card className="rounded-2xl">
      <CardHeader><CardTitle>Détail quotidien des heures</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">Détail quotidien des heures</caption>
          <thead className="bg-muted/50"><tr>{["Date", "Collaborateur", "Horaire", "Pause", "Net", "Nuit", "Dimanche", "Validation"].map(label => <th className="px-3 py-3 font-medium" key={label}>{label}</th>)}</tr></thead>
          <tbody>{details.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => <tr key={row.entry.id + ":" + row.date} className="border-t">
            <td className="px-3 py-3">{row.date}</td><td className="px-3 py-3">{employeeName(row.employee)}</td>
            <td className="px-3 py-3">{row.startTime}–{row.endTime}<span className="block text-xs text-muted-foreground">{row.source === "clock" ? "Badgeuse serveur" : "Saisie locale"}</span></td>
            <td className="px-3 py-3">{row.breakMinutes.toFixed(1)} min</td><td className="px-3 py-3 font-semibold">{workforceHours(row.workedMinutes, 2)} h</td>
            <td className="px-3 py-3">{workforceHours(row.nightMinutes, 2)} h</td><td className="px-3 py-3">{workforceHours(row.sundayMinutes, 2)} h</td>
            <td className="px-3 py-3">{row.validation ? <><Badge>{row.validation.entry_version == null ? "Signature historique" : "Validé"}</Badge><span className="mt-1 block text-xs">{row.validation.signed_name}</span></> : <Badge variant="secondary">En attente</Badge>}</td>
          </tr>)}</tbody>
        </table>{!details.length ? <p className="p-5 text-sm text-muted-foreground">Aucune heure correspondant à la période et aux filtres.</p> : null}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{details.length} ligne(s) · Page {currentPage + 1} sur {pages}</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Précédent</Button><Button variant="outline" size="sm" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Suivant</Button></div>
        </div>
        <p className="text-xs text-muted-foreground">Les services passant minuit sont ventilés sur les dates concernées. Plusieurs relevés d’une journée restent distincts. Les exports comprennent toutes les lignes, indépendamment de cette pagination.</p>
      </CardContent>
    </Card> : null}
    <Card className="rounded-2xl"><CardHeader><CardTitle className="text-base">Règles de calcul du rapport</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      <p>{WORKFORCE_CALCULATION_NOTE}</p>
      <p>Canton : {settings.canton}. Les fériés configurés pour le restaurant sont utilisés. Le tarif horaire propre à chaque collaborateur sert aux estimations, hors charges et majorations.</p>
    </CardContent></Card>
  </div>;
}

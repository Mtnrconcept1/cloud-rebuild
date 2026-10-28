import { useMemo, useState } from "react";
import { Activity, BarChart3, CalendarCheck2, Clock3, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { employeeName, weekRange, workforceZurichClock, type WorkforceSettings } from "@/lib/tokWorkforce";
import {
  buildWorkforceReport, workforceAddDays, workforceHours, workforceLoadIndicator,
  workforceMonthPeriod, workforceReportTotals, WORKFORCE_CALCULATION_NOTE,
} from "@/lib/tokWorkforceReporting";
import {
  useWorkforceAbsences, useWorkforceClockSessionsInRange, useWorkforceEmployees,
  useWorkforceEntriesInRange, useWorkforceHolidays, useWorkforceShifts,
} from "@/hooks/useTokWorkforce";

const money = (value: number) => value.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) + " CHF";
export default function WorkforceAnalytics({ restaurantId, settings }: { restaurantId: string; settings: WorkforceSettings }) {
  const [month, setMonth] = useState(workforceZurichClock().date.slice(0, 7));
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const employeeId = selectedEmployee === "all" ? undefined : selectedEmployee;
  const months = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return workforceMonthPeriod(date.toISOString().slice(0, 7));
  }), [month]);
  const currentPeriod = months[5];
  const start = workforceAddDays(months[0].start, -1), end = currentPeriod.end;
  const employees = useWorkforceEmployees(restaurantId, true);
  const shifts = useWorkforceShifts(restaurantId, true, start, end, employeeId);
  const entries = useWorkforceEntriesInRange(restaurantId, true, start, end, employeeId);
  const absences = useWorkforceAbsences(restaurantId, true, employeeId);
  const holidays = useWorkforceHolidays(restaurantId, true);
  const sessions = useWorkforceClockSessionsInRange(restaurantId, true, start, end, employeeId);
  const queries = [employees, shifts, entries, absences, holidays, sessions];
  const pending = queries.some(query => query.isPending), error = queries.some(query => query.isError);
  const reports = useMemo(() => months.map(period => buildWorkforceReport({
    restaurantId, period, employeeId, employees: employees.data || [], entries: entries.data || [], shifts: shifts.data || [],
    absences: absences.data || [], holidays: holidays.data || [], clockSessions: sessions.data || [],
  })), [restaurantId, months, employeeId, employees.data, entries.data, shifts.data, absences.data, holidays.data, sessions.data]);
  const monthly = reports.map(report => {
    const total = workforceReportTotals(report);
    return {
      month: report.period.start.slice(0, 7), name: new Intl.DateTimeFormat("fr-CH", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(report.period.start + "T12:00:00Z")),
      planned: total.plannedMinutes / 60, worked: total.workedMinutes / 60,
      plannedCost: total.plannedCostChf, workedCost: total.workedCostChf,
    };
  });
  const current = reports[5], previous = reports[4];
  const totals = workforceReportTotals(current), previousTotals = workforceReportTotals(previous);
  const costChange = previousTotals.workedCostChf > 0 ? (totals.plannedCostChf - previousTotals.workedCostChf) / previousTotals.workedCostChf * 100 : null;
  const relevant = current.employees.filter(row => row.employee.is_active || row.plannedMinutes > 0 || row.workedMinutes > 0);
  const missingRates = relevant.filter(row => (row.plannedMinutes > 0 || row.workedMinutes > 0) && !Number(row.employee.hourly_cost_chf)).length;
  const indicators = relevant.map(row => ({ ...row, indicator: workforceLoadIndicator(row, shifts.data || [], currentPeriod) }))
    .sort((a, b) => (a.indicator.score ?? 101) - (b.indicator.score ?? 101));
  const scored = indicators.filter(row => row.indicator.score != null);
  const averageScore = scored.length ? Math.round(scored.reduce((sum, row) => sum + (row.indicator.score || 0), 0) / scored.length) : null;
  const activeShifts = (shifts.data || []).filter(shift => shift.restaurant_id === restaurantId && (!employeeId || shift.employee_id === employeeId) && shift.shift_date >= currentPeriod.start && shift.shift_date <= currentPeriod.end && shift.status !== "cancelled");
  const filled = activeShifts.filter(shift => shift.status === "confirmed" || shift.status === "completed").length;
  const fillRate = activeShifts.length ? Math.round(filled / activeShifts.length * 100) : null;
  const issues = [...new Set(reports.flatMap(report => report.issues))];
  const weekly = useMemo(() => {
    const rows: { name: string; planned: number; worked: number }[] = [];
    let date = currentPeriod.start;
    while (date <= currentPeriod.end) {
      const week = weekRange(new Date(date + "T12:00:00"));
      const period = { start: week.start < currentPeriod.start ? currentPeriod.start : week.start, end: week.end > currentPeriod.end ? currentPeriod.end : week.end };
      const report = buildWorkforceReport({ restaurantId, period, employeeId, employees: employees.data || [], entries: entries.data || [], shifts: shifts.data || [], clockSessions: sessions.data || [] });
      const total = workforceReportTotals(report);
      rows.push({ name: period.start.slice(8) + "–" + period.end.slice(8), planned: total.plannedMinutes / 60, worked: total.workedMinutes / 60 });
      date = workforceAddDays(week.end, 1);
    }
    return rows;
  }, [restaurantId, currentPeriod, employeeId, employees.data, entries.data, shifts.data, sessions.data]);
  return <div className="space-y-5">
    <Card className="rounded-2xl"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
      <div><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Analyse de l’équipe</CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">Six mois d’activité, les coûts estimés et les points de vigilance du planning.</p></div>
      <div className="flex flex-wrap gap-3"><label className="space-y-1 text-sm">Mois de référence<Input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
        <label className="space-y-1 text-sm">Collaborateur analysé<select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedEmployee} onChange={event => setSelectedEmployee(event.target.value)}><option value="all">Toute l’équipe</option>{(employees.data || []).filter(employee => employee.restaurant_id === restaurantId).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}{employee.is_active ? "" : " · Archivé"}</option>)}</select></label></div>
    </div></CardHeader><CardContent>
      {pending ? <p role="status" className="py-6 text-center text-muted-foreground">Chargement de l’historique de l’équipe…</p> : error ? <div role="alert" className="space-y-3"><p className="text-destructive">Analyse indisponible. Les données incomplètes ne sont pas présentées comme des totaux.</p><p className="text-sm text-muted-foreground">Si l’historique de l’équipe est trop volumineux, sélectionnez un collaborateur pour affiner l’analyse.</p><Button variant="outline" onClick={() => void Promise.all(queries.map(query => query.refetch()))}>Réessayer</Button></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Heures planifiées", workforceHours(totals.plannedMinutes) + " h", "Pauses déduites"],
          ["Heures réalisées", workforceHours(totals.workedMinutes) + " h", "Tous les relevés du mois"],
          ["Coût projeté", money(totals.plannedCostChf), missingRates ? missingRates + " tarif(s) manquant(s)" : "Tarifs individuels renseignés"],
          ["Shifts confirmés ou terminés", fillRate == null ? "Aucun service" : fillRate + " %", filled + " sur " + activeShifts.length + " services"],
        ].map(([label, value, note]) => <div key={label} className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>)}
      </div>}
    </CardContent></Card>
    {!pending && !error ? <>
      {issues.length > 0 ? <div role="alert" className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="font-semibold">Analyse partielle : des horaires ou absences doivent être régularisés.</p>{issues.map(issue => <p key={issue} className="text-sm">{issue}</p>)}</div> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-2xl"><CardHeader><CardTitle>Planifié et réalisé · six mois</CardTitle></CardHeader><CardContent>
          <div className="h-72 min-w-0" role="img" aria-label="Comparaison mensuelle des heures planifiées et réalisées"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis width={42} tick={{ fontSize: 11 }} /><Tooltip formatter={value => Number(value).toFixed(2) + " h"} /><Legend />
              <Area type="monotone" dataKey="planned" name="Planifié" stroke="#ff6a1a" fill="#ff6a1a" fillOpacity={0.16} /><Area type="monotone" dataKey="worked" name="Réalisé" stroke="#0d9488" fill="#0d9488" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer></div>
        </CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><CardTitle>Coûts estimés · six mois</CardTitle></CardHeader><CardContent>
          <div className="h-72 min-w-0" role="img" aria-label="Comparaison des coûts planifiés et réalisés aux tarifs actuels"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis width={55} tick={{ fontSize: 11 }} /><Tooltip formatter={value => money(Number(value))} /><Legend /><Bar dataKey="plannedCost" name="Prévu CHF" fill="#ff6a1a" radius={[4, 4, 0, 0]} /><Bar dataKey="workedCost" name="Réalisé CHF" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div>
        </CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><CardTitle>Répartition des semaines du mois</CardTitle></CardHeader><CardContent>
          <div className="h-64 min-w-0" role="img" aria-label="Heures planifiées et réalisées par semaine, limitées au mois sélectionné"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis width={42} /><Tooltip formatter={value => Number(value).toFixed(2) + " h"} /><Legend /><Bar dataKey="planned" name="Planifié" fill="#ff6a1a" radius={[4, 4, 0, 0]} /><Bar dataKey="worked" name="Réalisé" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div>
        </CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><CardTitle>Prévision de coût du mois</CardTitle></CardHeader><CardContent className="space-y-5">
          <p className="text-4xl font-bold text-primary">{money(totals.plannedCostChf)}</p>
          <div className="flex items-center gap-2">{costChange != null ? costChange >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" /> : null}
            <p className="font-medium">{costChange == null ? "Variation non comparable" : (costChange > 0 ? "+" : "") + costChange.toFixed(1) + " %"} <span className="font-normal text-muted-foreground">par rapport au réalisé du mois précédent</span></p>
          </div>
          <p className="text-sm">Mois précédent : {money(previousTotals.workedCostChf)} · Réalisé du mois sélectionné : {money(totals.workedCostChf)}.</p>
          <p className="text-sm text-muted-foreground">Estimation avec le tarif horaire actuel de chaque collaborateur et les heures nettes. Charges sociales, majorations et retenues exclues. Ces montants ne sont pas des fiches de paie.</p>
          {missingRates ? <p className="text-sm text-amber-700 dark:text-amber-300">{missingRates} collaborateur(s) ont des heures sans tarif renseigné : coût total partiel.</p> : null}
        </CardContent></Card>
      </div>
      <Card className="rounded-2xl"><CardHeader><CardTitle>Heures et coûts par collaborateur</CardTitle></CardHeader><CardContent>
        <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">Heures et coûts par collaborateur</caption><thead><tr className="border-b">{["Collaborateur", "Prévu", "Réalisé", "Taux CHF/h", "Coût prévu", "Coût réalisé"].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{relevant.map(row => <tr key={row.employee.id} className="border-b last:border-0"><td className="p-3">{employeeName(row.employee)}</td><td className="p-3">{workforceHours(row.plannedMinutes)} h</td><td className="p-3">{workforceHours(row.workedMinutes)} h</td><td className="p-3">{row.employee.hourly_cost_chf || "Non renseigné"}</td><td className="p-3">{money(row.plannedCostChf)}</td><td className="p-3">{money(row.workedCostChf)}</td></tr>)}</tbody></table></div>
        {!relevant.length ? <p className="p-3 text-sm text-muted-foreground">Aucun collaborateur pour cette période.</p> : null}
        <details className="mt-5 rounded-xl bg-muted/40 p-4"><summary className="cursor-pointer text-sm font-medium">Voir les chiffres des six mois</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><caption className="sr-only">Chiffres des six mois</caption><thead><tr>{["Mois", "Prévu h", "Réalisé h", "Coût prévu CHF", "Coût réalisé CHF"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{monthly.map(row => <tr key={row.month}><td className="p-2">{row.month}</td><td className="p-2">{row.planned.toFixed(2)}</td><td className="p-2">{row.worked.toFixed(2)}</td><td className="p-2">{row.plannedCost.toFixed(2)}</td><td className="p-2">{row.workedCost.toFixed(2)}</td></tr>)}</tbody></table></div></details>
      </CardContent></Card>
      <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Charge et repos</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">{[
          ["Équilibre du planning", averageScore == null ? "Données insuffisantes" : averageScore + " / 100", CalendarCheck2],
          ["Repos courts repérés", indicators.reduce((sum, row) => sum + row.indicator.restViolations, 0).toString(), Clock3],
          ["Chevauchements", indicators.reduce((sum, row) => sum + row.indicator.overlaps, 0).toString(), Activity],
        ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-xl bg-muted/50 p-4"><p className="flex items-center gap-2 text-xs text-muted-foreground">{typeof Icon !== "string" ? <Icon className="h-4 w-4" /> : null}{String(label)}</p><p className="mt-2 text-xl font-bold">{String(value)}</p></div>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Charge et repos par collaborateur</caption><thead><tr>{["Collaborateur", "Prévu / contrat net", "Solde réalisé à date", "Repos entre journées", "Indicateur"].map(label => <th key={label} className="border-b p-3 font-medium">{label}</th>)}</tr></thead><tbody>{indicators.map(row => <tr key={row.employee.id} className="border-b last:border-0"><td className="p-3 font-medium">{employeeName(row.employee)}</td><td className="p-3">{row.indicator.coverageRatio == null ? "Sans base contractuelle" : (row.indicator.coverageRatio * 100).toFixed(0) + " %"}</td><td className="p-3">{row.balanceMinutes > 0 ? "+" : ""}{workforceHours(row.balanceMinutes)} h</td><td className="p-3">{row.indicator.restIntervals ? row.indicator.restViolations + " court(s) / " + row.indicator.restIntervals + " intervalles" : "Pas d’intervalle à comparer"}{row.indicator.overlaps ? <Badge className="ml-2" variant="destructive">{row.indicator.overlaps} chevauchement(s)</Badge> : null}</td><td className="p-3">{row.indicator.score == null ? "Sans activité" : <div className="min-w-28"><span>{row.indicator.score} / 100</span><progress className="mt-1 h-2 w-full accent-primary" max={100} value={row.indicator.score} aria-label={"Équilibre du planning de " + employeeName(row.employee)} /></div>}</td></tr>)}</tbody></table></div>
        <p className="text-sm text-muted-foreground">Indicateur opérationnel : 40 % adéquation heures prévues / contrat net, 40 % repos entre journées de service, 20 % écart réalisé / attendu à date. Chaque écart relatif réduit son facteur depuis 100 ; un chevauchement met le facteur repos à zéro. Les intervalles de moins de 11 h sont signalés ; les services coupés du même jour sont regroupés. Aucun score n’est attribué sans activité.</p>
        <p className="text-sm text-muted-foreground">Il sert à examiner le planning, sans diagnostic de santé ni certification de conformité. Seuil hebdomadaire configuré : {settings.max_weekly_hours} h · Canton {settings.canton}.</p>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">{WORKFORCE_CALCULATION_NOTE}</p>
    </> : null}
  </div>;
}

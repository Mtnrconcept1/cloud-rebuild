import type { SearchReport } from "./searchConsole";

export function editorialPlan(report: SearchReport, start: string) {
  const first = Date.parse(start + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(first) || new Date(first).toISOString().slice(0,10) !== start) return [];
  const days: string[] = [];
  for (let i=0; i<30; i++) {
    const date = new Date(first+i*86400000);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) days.push(date.toISOString().slice(0,10));
  }
  const seen = new Set<string>();
  const terms = report.opportunities.filter(row => {
    const key=row.query.normalize("NFD").replace(/\p{M}/gu,"").toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu," ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0,days.length);
  return terms.map((row,i) => ({ ...row, date:days[Math.floor(i*days.length/terms.length)] }));
}

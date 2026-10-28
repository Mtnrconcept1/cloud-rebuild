// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWorkforceReport } from "@/lib/tokWorkforceReporting";
import { buildWorkforcePdf } from "@/lib/tokWorkforcePdf";
import type { WorkforceEmployee, WorkforceEntry, WorkforceValidation } from "@/lib/tokWorkforce";

const fontData = readFileSync(new URL("../../public/fonts/barlow/Barlow-Regular.ttf", import.meta.url)).toString("base64");
const boldFontData = readFileSync(new URL("../../public/fonts/barlow/Barlow-Bold.ttf", import.meta.url)).toString("base64");
const signature = "data:image/png;base64," + readFileSync(new URL("./fixtures/workforce-synthetic-signature.png", import.meta.url)).toString("base64");
const employees: WorkforceEmployee[] = [
  { id: "employee-1", restaurant_id: "restaurant", first_name: "Émilie", last_name: "Test", email: null, user_id: null, role: "employee", contracted_hours_per_week: 42, vacation_days_per_year: 20, hourly_cost_chf: 35, is_active: true },
  { id: "employee-2", restaurant_id: "restaurant", first_name: "François", last_name: "Exemple", email: null, user_id: null, role: "employee", contracted_hours_per_week: 21, vacation_days_per_year: 20, hourly_cost_chf: 28, is_active: true },
];
const entries: WorkforceEntry[] = Array.from({ length: 18 }, (_, index) => ({
  id: `entry-${index}`, restaurant_id: "restaurant", employee_id: employees[index % 2].id,
  entry_date: `2026-10-${String(5 + Math.floor(index / 2)).padStart(2, "0")}`,
  start_time: "10:00", end_time: "18:00", break_minutes: 30, version: 1,
  notes: index % 4 === 0 ? "Service de démonstration · plusieurs réservations, équipe répartie entre la terrasse et la salle. À contrôler avec le responsable." : "Données de test",
  is_night_work: false, is_sunday_work: false,
}));
const validations: WorkforceValidation[] = entries.filter((_, index) => index % 3 === 0).map(entry => ({
  id: "validation-" + entry.id, restaurant_id: "restaurant", time_entry_id: entry.id, entry_version: 1,
  signed_name: "Responsable Démonstration", signed_at: "2026-10-20T13:15:00Z", signature_data: signature,
  entry_hash: "a".repeat(64),
}));
const report = buildWorkforceReport({
  restaurantId: "restaurant", period: { start: "2026-10-01", end: "2026-10-31" }, employees, entries, validations,
  absences: [{ id: "absence", restaurant_id: "restaurant", employee_id: "employee-1", absence_type: "vacation", start_date: "2026-10-21", end_date: "2026-10-22", days_count: 2, notes: "Congés approuvés · démonstration" }],
  asOf: "2026-10-28",
});

describe("TOK Équipe — vrai export PDF", () => {
  it("génère toutes les pages de synthèse et de détail avec police embarquée et images de signature", async () => {
    const doc = await buildWorkforcePdf(report, { restaurantName: "Le Bistrot · Démonstration", fontData, boldFontData });
    const bytes = Buffer.from(doc.output("arraybuffer"));
    const source = bytes.toString("latin1");
    expect(source.startsWith("%PDF-")).toBe(true);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    expect(source).toContain("/Subtype /Image");
    expect(source).toContain("/FontFile2");
    expect(bytes.length).toBeGreaterThan(20_000);
    if (process.env.TOK_PDF_SAMPLE_PATH) writeFileSync(process.env.TOK_PDF_SAMPLE_PATH, bytes);
  });

  it("génère aussi le détail d’un collaborateur seul", async () => {
    const doc = await buildWorkforcePdf({ ...report, employees: [report.employees[0]] }, { fontData, boldFontData });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output()).toContain("/Subtype /Image");
  });

  it("refuse un rapport incomplet et une signature corrompue", async () => {
    await expect(buildWorkforcePdf({ ...report, issues: ["Horaire ambigu"] }, { fontData, boldFontData })).rejects.toThrow(/anomalies/);
    const broken = structuredClone(report);
    broken.employees[0].records[0].validation!.signature_data = "data:image/png;base64,not-valid";
    await expect(buildWorkforcePdf(broken, { fontData, boldFontData })).rejects.toThrow(/signature enregistrée est illisible/);
  });
});

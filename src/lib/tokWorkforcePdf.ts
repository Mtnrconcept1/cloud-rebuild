import { employeeName } from "./tokWorkforce";
import { WORKFORCE_CALCULATION_NOTE, workforceHours, workforceReportTotals, type WorkforceReport } from "./tokWorkforceReporting";

let fontPromise: Promise<{ normal: string; bold: string }> | undefined;
function fontFile(filename: string) {
  return fetch(`${import.meta.env.BASE_URL}fonts/barlow/${filename}`)
    .then(async response => {
      if (!response.ok) throw new Error("La police du rapport est indisponible. Réessayez le téléchargement.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      return btoa(binary);
    });
}
function reportFonts() {
  if (!fontPromise) fontPromise = Promise.all([fontFile("Barlow-Regular.ttf"), fontFile("Barlow-Bold.ttf")])
    .then(([normal, bold]) => ({ normal, bold })).catch(error => { fontPromise = undefined; throw error; });
  return fontPromise;
}

/** Local, downloadable PDF. The optional fontData also permits a network-free export test. */
export async function buildWorkforcePdf(report: WorkforceReport, options: { restaurantName?: string; fontData?: string; boldFontData?: string } = {}) {
  if (report.issues.length) throw new Error("Corrigez les anomalies du rapport avant de l’exporter.");
  if (!report.employees.length) throw new Error("Aucun collaborateur à exporter.");
  const [{ jsPDF }, { autoTable }, fonts] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"), options.fontData ? Promise.resolve({ normal: options.fontData, bold: options.boldFontData || options.fontData }) : reportFonts(),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("TokBarlow.ttf", fonts.normal);
  doc.addFileToVFS("TokBarlowBold.ttf", fonts.bold);
  doc.addFont("TokBarlow.ttf", "TokBarlow", "normal");
  doc.addFont("TokBarlowBold.ttf", "TokBarlow", "bold");
  doc.setFont("TokBarlow", "normal");
  doc.setProperties({ title: `TOK Équipe · ${report.period.start} au ${report.period.end}`, subject: "Relevés d’heures et validation", creator: "TOK Équipe" });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const margin = 14, usable = width - margin * 2;
  const periodLabel = `${report.period.start} au ${report.period.end}`;
  const restaurant = options.restaurantName || "Restaurant";
  let cursor = 0;
  const pageHeading = (title: string) => {
    doc.setFont("TokBarlow", "bold"); doc.setTextColor(28, 28, 28); doc.setFontSize(20);
    doc.text("TOK ÉQUIPE", margin, 19);
    doc.setFont("TokBarlow", "normal"); doc.setFontSize(10); doc.text(restaurant, width - margin, 18, { align: "right", maxWidth: usable * 0.65 });
    doc.setDrawColor(255, 106, 26); doc.setLineWidth(0.7); doc.line(margin, 24, width - margin, 24);
    doc.setFont("TokBarlow", "bold"); doc.setFontSize(16);
    const titleLines = doc.splitTextToSize(title, usable) as string[];
    doc.text(titleLines, margin, 33);
    cursor = 34 + titleLines.length * 6;
    doc.setFont("TokBarlow", "normal"); doc.setFontSize(10); doc.text(`${periodLabel} · ${report.validatedOnly ? "Relevés validés uniquement" : "Tous les relevés"}`, margin, cursor);
    cursor += 8;
  };
  const paragraph = (text: string, size = 10) => {
    doc.setFont("TokBarlow", "normal"); doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, usable) as string[];
    for (const line of lines) {
      if (cursor > height - 20) { doc.addPage(); cursor = 18; }
      doc.text(line, margin, cursor); cursor += size * 0.42;
    }
    cursor += 3;
  };
  const tableStyles = {
    styles: { font: "TokBarlow", fontSize: 10, cellPadding: 2.5, textColor: 25 },
    headStyles: { fillColor: [255, 106, 26] as [number, number, number], textColor: 255, fontStyle: "bold" as const },
    footStyles: { fillColor: [255, 240, 231] as [number, number, number], textColor: 25, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [247, 247, 245] as [number, number, number] },
    margin: { left: margin, right: margin, top: 18, bottom: 19 },
    rowPageBreak: "avoid" as const,
  };
  const afterTable = () => { cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8; };

  if (report.employees.length > 1) {
    pageHeading("Synthèse des collaborateurs");
    const totals = workforceReportTotals(report);
    paragraph(`Prévu : ${workforceHours(totals.plannedMinutes, 2)} h · Réalisé : ${workforceHours(totals.workedMinutes, 2)} h · Validé : ${workforceHours(totals.validatedMinutes, 2)} h · Nuit : ${workforceHours(totals.nightMinutes, 2)} h · Dimanche : ${workforceHours(totals.sundayMinutes, 2)} h`);
    paragraph(`Coût prévu : ${totals.plannedCostChf.toFixed(2)} CHF · Coût réalisé : ${totals.workedCostChf.toFixed(2)} CHF (tarifs individuels actuels, hors charges et majorations)`);
    autoTable(doc, {
      ...tableStyles, startY: cursor,
      head: [["Collaborateur", "Prévu h", "Réalisé h", "Attendu h", "Solde à date h", "Nuit h", "Dimanche h", "Vacances disponibles j"]],
      body: report.employees.map(row => [employeeName(row.employee), workforceHours(row.plannedMinutes, 2), workforceHours(row.workedMinutes, 2), workforceHours(row.expectedMinutes, 2), workforceHours(row.balanceMinutes, 2), workforceHours(row.nightMinutes, 2), workforceHours(row.sundayMinutes, 2), row.vacation.remainingDays.toFixed(2)]),
    });
    afterTable();
    paragraph(WORKFORCE_CALCULATION_NOTE, 9);
    paragraph("Les taux horaires renseignés servent à une estimation de coûts. Charges, majorations et retenues ne sont pas calculées. Le détail et les signatures de chaque collaborateur suivent.", 9);
  }

  for (const [index, employee] of report.employees.entries()) {
    if (index > 0 || report.employees.length > 1) doc.addPage();
    pageHeading(employeeName(employee.employee));
    paragraph(`Contrat : ${employee.employee.contracted_hours_per_week} h/semaine · Prévu : ${workforceHours(employee.plannedMinutes, 2)} h · Réalisé : ${workforceHours(employee.workedMinutes, 2)} h · Validé : ${workforceHours(employee.validatedMinutes, 2)} h`);
    paragraph(`Contrat brut : ${workforceHours(employee.contractMinutes, 2)} h · Fériés crédités : ${workforceHours(employee.holidayCreditMinutes, 2)} h · Absences créditées : ${workforceHours(employee.absenceCreditMinutes, 2)} h · Attendu sur la période : ${workforceHours(employee.expectedMinutes, 2)} h`);
    paragraph(`Attendu à date : ${workforceHours(employee.expectedToDateMinutes, 2)} h · Solde arrêté au ${report.asOf < report.period.end ? report.asOf : report.period.end} : ${workforceHours(employee.balanceMinutes, 2)} h · Tarif horaire : ${employee.employee.hourly_cost_chf.toFixed(2)} CHF · Coût prévu/réalisé : ${employee.plannedCostChf.toFixed(2)} / ${employee.workedCostChf.toFixed(2)} CHF`);
    paragraph(`Vacances ${employee.vacation.year} : droit proratisé ${employee.vacation.entitledDays.toFixed(2)} j · Pris ${employee.vacation.usedDays.toFixed(2)} j · Réservés ${employee.vacation.reservedDays.toFixed(2)} j · Disponibles ${employee.vacation.remainingDays.toFixed(2)} j`);
    autoTable(doc, {
      ...tableStyles, startY: cursor, styles: { ...tableStyles.styles, fontSize: 9 },
      head: [["Date", "Horaire", "Pause min", "Net h", "Nuit h", "Dim. h", "Origine", "Validation et signature", "Notes"]],
      body: employee.records.map(row => [
        row.date, `${row.startTime}–${row.endTime}`, row.breakMinutes.toFixed(1), workforceHours(row.workedMinutes, 2), workforceHours(row.nightMinutes, 2), workforceHours(row.sundayMinutes, 2),
        (row.source === "clock" ? "Badgeuse" : "Saisie locale") + (row.entry.version ? `\nv${row.entry.version}` : ""),
        row.validation ? `${row.validation.signed_name}\n${new Intl.DateTimeFormat("fr-CH", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Zurich" }).format(new Date(row.validation.signed_at))}${row.validation.entry_version == null ? " · Historique" : ` · v${row.validation.entry_version}`}` : "En attente",
        row.entry.notes || "",
      ]),
      foot: [["Total", "", "", workforceHours(employee.workedMinutes, 2), workforceHours(employee.nightMinutes, 2), workforceHours(employee.sundayMinutes, 2), "", "", ""]],
      showFoot: "lastPage", columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 25 }, 2: { cellWidth: 17 }, 3: { cellWidth: 16 }, 4: { cellWidth: 16 }, 5: { cellWidth: 16 }, 6: { cellWidth: 22 }, 7: { cellWidth: 63 }, 8: { cellWidth: usable - 197 } },
      didParseCell: data => {
        if (data.section === "body" && data.column.index === 7 && employee.records[data.row.index]?.validation?.signature_data) data.cell.styles.minCellHeight = 30;
      },
      didDrawCell: data => {
        if (data.section !== "body" || data.column.index !== 7) return;
        const signature = employee.records[data.row.index]?.validation?.signature_data;
        if (!signature) return;
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 120_000) throw new Error("Une signature enregistrée est illisible. Faites vérifier le relevé avant l’export.");
        doc.addImage(signature, "PNG", data.cell.x + 2.5, data.cell.y + data.cell.height - 15, 45, 12);
      },
    });
    afterTable();
    if (!employee.records.length) paragraph("Aucun relevé correspondant aux filtres pour cette période.");
    if (employee.absences.length) {
      paragraph("Absences ventilées sur la période");
      autoTable(doc, { ...tableStyles, startY: cursor,
        head: [["Date", "Type", "Jours imputés", "Période d’origine", "Notes"]],
        body: employee.absences.map(item => [item.date, ({ vacation: "Vacances", sick: "Maladie", holiday: "Férié", other: "Autre" })[item.absence.absence_type], item.days.toFixed(2), `${item.absence.start_date}–${item.absence.end_date}`, item.absence.notes || ""]),
      });
      afterTable();
    }
    paragraph(WORKFORCE_CALCULATION_NOTE, 8.5);
    paragraph("Les nouvelles signatures visuelles sont liées à la version du relevé. Les signatures historiques, sans empreinte de version, sont conservées seulement si le relevé n’a pas été modifié après signature. Ces tracés ne constituent pas des signatures électroniques qualifiées.", 8.5);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont("TokBarlow", "normal"); doc.setFontSize(8); doc.setTextColor(100);
    doc.text(`TOK Équipe · ${periodLabel} · Données RH confidentielles`, margin, height - 9);
    doc.text(`${page} / ${pages}`, width - margin, height - 9, { align: "right" });
  }
  return doc;
}

export async function downloadWorkforcePdf(report: WorkforceReport, restaurantName?: string) {
  const doc = await buildWorkforcePdf(report, { restaurantName });
  const scope = report.employees.length === 1 ? employeeName(report.employees[0].employee).normalize("NFKD").replace(/[^\w-]+/g, "-") : "equipe";
  doc.save(`tok-${scope}-${report.period.start}-${report.period.end}.pdf`);
}

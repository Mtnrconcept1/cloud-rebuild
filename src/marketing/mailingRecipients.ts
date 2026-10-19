import { MAILING_MAX_RECIPIENTS, normalizeMailingRecipientEmail } from "../../supabase/functions/_shared/marketing-mailing";
import type { CellObject, WorkSheet } from "xlsx";

export const MAILING_RECIPIENT_LIMITS = {
  maxRecipients: MAILING_MAX_RECIPIENTS,
  maxFileBytes: 2 * 1024 * 1024,
  // Every accepted file list must remain editable, including 500 addresses of 254 characters.
  maxTextLength: MAILING_MAX_RECIPIENTS * 255 + 1000,
  maxInvalidPreview: 20,
  maxRows: 5000,
  maxColumns: 50,
  maxSheets: 5,
  maxCandidates: 5000,
  maxArchiveEntries: 200,
  maxExpandedBytes: 20 * 1024 * 1024,
} as const;

export const MAILING_RECIPIENT_FILE_ACCEPT = ".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type MailingRecipientsReport = {
  emails: string[];
  duplicateCount: number;
  invalidEntries: string[];
  invalidCount: number;
  totalCount: number;
  warnings?: string[];
};

type RecipientCell = { value: string; formula?: boolean };
type RecipientTable = { name: string; rows: RecipientCell[][] };
const limits = MAILING_RECIPIENT_LIMITS;
const emailHeaders = new Set([
  "email", "emails", "mail", "mails", "courriel", "courriels", "emailaddress", "emailaddresses",
  "adresseemail", "adressesemail", "adressemail", "adressesmail", "adresseelectronique", "adresseselectroniques",
  "emailcontact", "contactemail", "emailprofessionnel", "emailrestaurant", "emailrestaurateur",
]);
const headerKey = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/** Parse lists and display-name addresses, never search arbitrary prose for an @ sign. */
function addressEntries(value: string): string[] {
  const parts: string[] = [];
  let entry = ""; let quoted = false; let inAddress = false;
  const flush = () => { if (entry.trim()) parts.push(entry.trim()); entry = ""; };
  for (const character of value) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "<") inAddress = true;
    if (!quoted && character === ">") inAddress = false;
    if (character === "\r" || character === "\n" || (!quoted && !inAddress && (character === "," || character === ";"))) flush();
    else entry += character;
  }
  flush();
  return parts.flatMap((part) => {
    const displayAddress = /^[^<>]*<([^<>]+)>$/.exec(part);
    return displayAddress ? [displayAddress[1].trim()] : part.split(/\s+/).filter(Boolean);
  });
}

function collector() {
  const report: MailingRecipientsReport = { emails: [], duplicateCount: 0, invalidEntries: [], invalidCount: 0, totalCount: 0 };
  const seen = new Set<string>();
  const add = (entry: string, location = "", formula = false) => {
    if (!entry.trim() && !formula) return;
    if (++report.totalCount > limits.maxCandidates) throw new Error(`La liste dépasse ${limits.maxCandidates} entrées à vérifier. Réduisez le fichier.`);
    const email = formula ? null : normalizeMailingRecipientEmail(entry);
    if (!email) {
      report.invalidCount += 1;
      if (report.invalidEntries.length < limits.maxInvalidPreview) report.invalidEntries.push(`${location ? `${location} : ` : ""}${formula ? "formule non importée" : entry.slice(0, 180)}`);
    } else if (seen.has(email)) report.duplicateCount += 1;
    else {
      if (seen.size >= limits.maxRecipients) throw new Error(`Importez au maximum ${limits.maxRecipients} adresses e-mail distinctes à la fois.`);
      seen.add(email); report.emails.push(email);
    }
  };
  return { report, add };
}

export function parseMailingRecipientsText(text: string): MailingRecipientsReport {
  if (text.length > limits.maxTextLength) throw new Error(`La saisie dépasse ${limits.maxTextLength.toLocaleString("fr-CH")} caractères.`);
  const result = collector();
  for (const entry of addressEntries(text)) result.add(entry);
  return result.report;
}

function csvDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\r" || character === "\n")) {
      if (Object.values(counts).some(Boolean)) break;
    } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, character)) counts[character] += 1;
  }
  return Object.keys(counts).sort((left, right) => counts[right] - counts[left])[0];
}

/** Bounded CSV reader with quoted separators, escaped quotes and multiline cells. */
function csvRows(raw: string): RecipientCell[][] {
  let text = raw.replace(/^\uFEFF/, "");
  const hint = /^sep=([,;\t])(?:\r\n|\r|\n)/i.exec(text);
  if (hint) text = text.slice(hint[0].length);
  const delimiter = hint?.[1] || csvDelimiter(text);
  const rows: RecipientCell[][] = [];
  let row: RecipientCell[] = []; let value = ""; let quoted = false; let closed = false;
  const cell = () => {
    if (row.length >= limits.maxColumns) throw new Error(`Le fichier dépasse ${limits.maxColumns} colonnes.`);
    row.push({ value, formula: /^\s*=/.test(value) }); value = ""; closed = false;
  };
  const line = () => {
    cell();
    if (rows.length >= limits.maxRows) throw new Error(`Le fichier dépasse ${limits.maxRows} lignes.`);
    rows.push(row); row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') { quoted = false; closed = true; }
      else value += character;
    } else if (character === delimiter) cell();
    else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      line();
    } else if (closed) {
      if (!/\s/.test(character)) throw new Error("CSV invalide : champ mal fermé.");
    } else if (character === '"') {
      if (value.trim()) throw new Error("CSV invalide : guillemets inattendus.");
      value = ""; quoted = true;
    } else value += character;
  }
  if (quoted) throw new Error("CSV invalide : guillemets non fermés.");
  if (value || closed || row.length) line();
  return rows;
}

function readTables(tables: RecipientTable[], initialWarnings: string[] = []): MailingRecipientsReport {
  const result = collector();
  const warnings = [...initialWarnings];
  let hasEmailColumn = false;
  for (const table of tables) {
    const first = table.rows.findIndex((row) => row.some((cell) => cell.value.trim() || cell.formula));
    if (first < 0) continue;
    const header = table.rows[first];
    const columns = header.flatMap((cell, index) => !cell.formula && emailHeaders.has(headerKey(cell.value)) ? [index] : []);
    const hasHeader = columns.length > 0;
    if (!hasHeader && table.rows.every((row) => row.length <= 1)) columns.push(0);
    if (!columns.length) { warnings.push(`${table.name} : aucune colonne Email reconnue, feuille ignorée.`); continue; }
    hasEmailColumn = true;
    for (let index = first + (hasHeader ? 1 : 0); index < table.rows.length; index += 1) {
      const row = table.rows[index];
      if (hasHeader && row.length > header.length && row.slice(header.length).some((cell) => cell.value.trim() || cell.formula)) {
        throw new Error(`${table.name}, ligne ${index + 1} : plus de colonnes que l’en-tête.`);
      }
      for (const column of columns) {
        const cell = row[column];
        if (!cell) continue;
        const location = `${table.name}, ligne ${index + 1}`;
        if (cell.formula) result.add(cell.value, location, true);
        else for (const entry of addressEntries(cell.value)) result.add(entry, location);
      }
    }
  }
  if (!hasEmailColumn) throw new Error("Aucune colonne e-mail reconnue. Ajoutez une colonne Email, E-mail ou Courriel.");
  if (warnings.length) result.report.warnings = warnings;
  return result.report;
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Le fichier ne peut pas être lu."));
    reader.onerror = () => reject(new Error("Le fichier ne peut pas être lu."));
    reader.readAsArrayBuffer(file);
  });
}

function csvText(bytes: Uint8Array) {
  let text: string;
  if (bytes[0] === 255 && bytes[1] === 254) text = new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  else if (bytes[0] === 254 && bytes[1] === 255) text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
  else {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("windows-1252").decode(bytes); }
  }
  if (text.includes("\0") || /^\s*(?:%PDF-|<(?:!doctype|html|\?xml)\b|\{\\rtf)/i.test(text)) throw new Error("Le fichier ne contient pas un CSV valide.");
  return text;
}

const archiveError = () => new Error("Le fichier XLSX est invalide, chiffré ou dépasse les limites de décompression.");

// SheetJS also reads size overrides in local and central extra fields. ZIP64
// is unnecessary for these small files and must not bypass the 32-bit preflight.
function checkZipExtra(view: DataView, start: number, length: number) {
  const end = start + length;
  for (let offset = start; offset < end;) {
    if (offset + 4 > end) throw archiveError();
    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    if (id === 0x0001 || offset + 4 + size > end) throw archiveError();
    offset += 4 + size;
  }
}

/** Check actual expansion, including archives whose central directory understates their size. */
async function checkDeflate(bytes: Uint8Array, expected: number) {
  if (typeof DecompressionStream === "undefined") throw new Error("Mettez le navigateur à jour ou importez un fichier CSV.");
  let offset = 0;
  const source = new ReadableStream<BufferSource>({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    const end = Math.min(offset + 1024, bytes.length);
    controller.enqueue(bytes.slice(offset, end)); offset = end;
  } });
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = source.pipeThrough(new DecompressionStream("deflate-raw")).getReader(); }
  catch { throw new Error("Mettez le navigateur à jour ou importez un fichier CSV."); }
  let actual = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      actual += chunk.value.byteLength;
      if (actual > expected || actual > limits.maxExpandedBytes) throw archiveError();
    }
    if (actual !== expected) throw archiveError();
  } catch {
    await reader.cancel().catch(() => undefined);
    throw archiveError();
  } finally { reader.releaseLock(); }
}

/** Bound the ZIP container before SheetJS allocates workbook XML and cell objects. */
async function preflightXlsx(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { eocd = offset; break; }
  }
  if (eocd < 0 || view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true)) throw archiveError();
  // The workbook reader selects the last signature, including in ZIP comments.
  // It must consume the same directory that was checked above.
  for (let position = eocd + 4; position + 4 <= bytes.length; position += 1) {
    if (view.getUint32(position, true) === 0x06054b50) throw archiveError();
  }
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directory = view.getUint32(eocd + 16, true);
  if (!count || count > limits.maxArchiveEntries || count !== view.getUint16(eocd + 8, true) || directory + directorySize !== eocd) throw archiveError();
  const entries: Array<{ start: number; end: number; data: Uint8Array; expected: number; method: number }> = [];
  const names = new Set<string>();
  let offset = directory; let expanded = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== 0x02014b50) throw archiveError();
    const flags = view.getUint16(offset + 8, true); const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true); const expected = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true); const extraLength = view.getUint16(offset + 30, true); const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    const start = view.getUint32(offset + 42, true);
    if (end > eocd || flags & 0x2041 || ![0, 8].includes(method) || view.getUint16(offset + 34, true)) throw archiveError();
    checkZipExtra(view, offset + 46 + nameLength, extraLength);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder().decode(nameBytes);
    if (!name || name.startsWith("/") || /[\\\0]/.test(name) || name.split("/").includes("..") || names.has(name) || /(?:vbaProject\.bin|\.xlsm$)/i.test(name)) throw archiveError();
    names.add(name);
    expanded += expected;
    if (expanded > limits.maxExpandedBytes || start + 30 > directory || view.getUint32(start, true) !== 0x04034b50) throw archiveError();
    const localNameLength = view.getUint16(start + 26, true); const localExtraLength = view.getUint16(start + 28, true);
    const dataStart = start + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressed;
    if (view.getUint16(start + 6, true) !== flags || view.getUint16(start + 8, true) !== method || localNameLength !== nameLength || dataEnd > directory
      || !nameBytes.every((byte, position) => byte === bytes[start + 30 + position])) throw archiveError();
    checkZipExtra(view, start + 30 + localNameLength, localExtraLength);
    const localCompressed = view.getUint32(start + 18, true); const localExpected = view.getUint32(start + 22, true);
    if (flags & 8 ? (localCompressed !== 0 && localCompressed !== compressed) || (localExpected !== 0 && localExpected !== expected)
      : localCompressed !== compressed || localExpected !== expected) throw archiveError();
    entries.push({ start, end: dataEnd, data: bytes.subarray(dataStart, dataEnd), expected, method });
    offset = end;
  }
  if (offset !== eocd || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw archiveError();
  entries.sort((left, right) => left.start - right.start);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (index && entry.start < entries[index - 1].end) throw archiveError();
    if (entry.method === 0) { if (entry.data.length !== entry.expected) throw archiveError(); }
    else await checkDeflate(entry.data, entry.expected);
  }
}

export async function parseMailingRecipientsFile(file: File): Promise<MailingRecipientsReport> {
  if (!file.size) throw new Error("Le fichier est vide.");
  if (file.size > limits.maxFileBytes) throw new Error("Le fichier dépasse 2 Mo.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["csv", "xls", "xlsx"].includes(extension || "")) throw new Error("Choisissez un fichier CSV, XLS ou XLSX.");
  const bytes = new Uint8Array(await readFileBytes(file));
  if (bytes.length !== file.size || bytes.length > limits.maxFileBytes) throw new Error("La taille du fichier ne peut pas être confirmée.");
  if (extension === "csv") return readTables([{ name: file.name, rows: csvRows(csvText(bytes)) }]);
  if (extension === "xlsx") {
    if (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) throw archiveError();
    await preflightXlsx(bytes);
  } else {
    const compound = [208, 207, 17, 224, 161, 177, 26, 225].every((byte, index) => bytes[index] === byte);
    const biff = bytes[0] === 9 && [0, 2, 4, 8].includes(bytes[1]);
    if (!compound && !biff) throw new Error("Le fichier ne contient pas un véritable classeur XLS.");
  }
  const XLSX = await import("xlsx");
  const readOptions = { type: "array" as const, raw: true, dense: true, cellFormula: true, cellHTML: false, cellText: false, cellStyles: false, bookVBA: false, sheetRows: limits.maxRows + 1, WTF: true };
  const metadata = XLSX.read(bytes, { ...readOptions, bookSheets: true, bookProps: true });
  if (!metadata.SheetNames.length || metadata.SheetNames.length > limits.maxSheets) throw new Error(`Le classeur dépasse ${limits.maxSheets} feuilles ou ne contient aucune feuille.`);
  const workbook = XLSX.read(bytes, { ...readOptions, sheets: metadata.SheetNames });
  const tables: RecipientTable[] = []; const warnings: string[] = [];
  let totalRows = 0;
  for (const [index, name] of workbook.SheetNames.entries()) {
    if (workbook.Workbook?.Sheets?.[index]?.Hidden) { warnings.push(`${name} : feuille masquée ignorée.`); continue; }
    const sheet: WorkSheet = workbook.Sheets[name];
    const reference = sheet["!fullref"] || sheet["!ref"];
    if (!reference) continue;
    const range = XLSX.utils.decode_range(reference);
    if (range.e.r >= limits.maxRows || (totalRows += range.e.r + 1) > limits.maxRows) throw new Error(`Le classeur dépasse ${limits.maxRows} lignes.`);
    if (range.e.c >= limits.maxColumns) throw new Error(`Le classeur dépasse ${limits.maxColumns} colonnes.`);
    const dense = sheet["!data"] as CellObject[][] | undefined;
    const rows: RecipientCell[][] = [];
    for (let row = 0; row <= range.e.r; row += 1) {
      const cells: RecipientCell[] = [];
      for (let column = 0; column <= range.e.c; column += 1) {
        const cell: CellObject | undefined = dense?.[row]?.[column] || sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        cells.push({ value: cell?.v === undefined || cell.v === null ? "" : String(cell.v), formula: Boolean(cell?.f || cell?.F) });
      }
      while (cells.length && !cells[cells.length - 1].value && !cells[cells.length - 1].formula) cells.pop();
      rows.push(cells);
    }
    tables.push({ name, rows });
  }
  return readTables(tables, warnings);
}

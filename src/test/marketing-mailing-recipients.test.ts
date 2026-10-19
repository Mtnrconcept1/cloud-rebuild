import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  MAILING_RECIPIENT_LIMITS,
  parseMailingRecipientsFile,
  parseMailingRecipientsText,
} from "@/marketing/mailingRecipients";

const csv = (content: string | Uint8Array, name = "restaurants.csv") =>
  new File([typeof content === "string" ? content : new Uint8Array(content).buffer], name, { type: "text/csv" });
type SheetFixture = { name: string; rows: Array<Array<string | number>>; hidden?: boolean };
function workbook(sheets: SheetFixture[] = [{ name: "Restaurants", rows: [
  ["Restaurant", "E-mail", "Notes"],
  ["Chez Alice", "Alice@example.ch", "ignore@example.ch"],
  ["Chez Bob", "bob@example.ch", ""],
] }]) {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  book.Workbook = { Sheets: sheets.map((sheet) => ({ name: sheet.name, Hidden: sheet.hidden ? 1 : 0 })) };
  return book;
}
const bookFile = (book: XLSX.WorkBook, bookType: "xls" | "xlsx" = "xlsx") =>
  new File([XLSX.write(book, { type: "array", bookType, compression: true })], `restaurants.${bookType}`);
const fileBytes = (file: File) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.onerror = reject;
  reader.readAsArrayBuffer(file);
});

describe("mailing recipient text", () => {
  it("accepts an empty initial field without an error", () => {
    expect(parseMailingRecipientsText("")).toEqual({ emails: [], duplicateCount: 0, invalidEntries: [], invalidCount: 0, totalCount: 0 });
  });

  it("normalizes and deduplicates lists and complete display-name addresses", () => {
    expect(parseMailingRecipientsText(' Alice@Example.ch; Bob <bob@example.ch>\n"Dupont, Alice" <ALICE@example.ch>,carol+restaurant@example.ch\tdave@example.ch')).toEqual({
      emails: ["alice@example.ch", "bob@example.ch", "carol+restaurant@example.ch", "dave@example.ch"],
      duplicateCount: 1, invalidEntries: [], invalidCount: 0, totalCount: 5,
    });
  });

  it("reports invalid entries without harvesting addresses from unrelated text or URLs", () => {
    const report = parseMailingRecipientsText("valide@example.ch;pas-une-adresse;bad..local@example.ch;https://example.ch/?email=hidden@example.ch;bad@-example.ch");
    expect(report.emails).toEqual(["valide@example.ch"]);
    expect(report.invalidCount).toBe(4);
    expect(report.totalCount).toBe(5);
    expect(report.invalidEntries).toContain("https://example.ch/?email=hidden@example.ch");
  });

  it("counts all invalid entries while bounding the preview", () => {
    const report = parseMailingRecipientsText(Array.from({ length: 30 }, (_, index) => `invalide-${index}`).join("\n"));
    expect(report.invalidCount).toBe(30);
    expect(report.invalidEntries).toHaveLength(MAILING_RECIPIENT_LIMITS.maxInvalidPreview);
  });

  it("bounds unique recipients and text size without rejecting duplicates at the recipient limit", () => {
    const emails = Array.from({ length: 500 }, (_, index) => `restaurant${index}@example.ch`);
    expect(parseMailingRecipientsText([...emails, emails[0]].join("\n"))).toMatchObject({ emails, duplicateCount: 1, totalCount: 501 });
    expect(() => parseMailingRecipientsText([...emails, "extra@example.ch"].join("\n"))).toThrow("500 adresses");
    expect(() => parseMailingRecipientsText("x".repeat(MAILING_RECIPIENT_LIMITS.maxTextLength + 1))).toThrow("caractères");
  });

  it("keeps 500 maximum-length imported addresses editable in the manual field", async () => {
    const domain = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(61)}`;
    const emails = Array.from({ length: 500 }, (_, index) => `${String(index).padStart(64, "a")}@${domain}`);
    expect(emails.every((email) => email.length === 254)).toBe(true);
    const imported = await parseMailingRecipientsFile(csv(["Email", ...emails].join("\n")));
    const canonical = imported.emails.join("\n");
    expect(canonical.length).toBe(127499);
    expect(canonical.length).toBeLessThanOrEqual(MAILING_RECIPIENT_LIMITS.maxTextLength);
    expect(parseMailingRecipientsText(canonical)).toMatchObject({ emails, invalidCount: 0, duplicateCount: 0 });
  });
});

describe("mailing recipient CSV import", () => {
  it("reads quoted separators and multiline notes only from the dedicated email column", async () => {
    const report = await parseMailingRecipientsFile(csv('Restaurant;E-mail;Notes\r\n"Chez; Alice";Alice@example.ch;"Une note\nignore@example.ch"\r\n"Chez ""Bob""";bob@example.ch;notes\r\nDoublon;ALICE@example.ch;\r\nInvalide;incorrect;'));
    expect(report).toMatchObject({ emails: ["alice@example.ch", "bob@example.ch"], duplicateCount: 1, invalidCount: 1, totalCount: 4 });
    expect(report.invalidEntries[0]).toContain("ligne 5");
  });

  it.each([
    "sep=;\r\nNom;Courriel\r\nAlice;alice@example.ch",
    "Nom\tE-mail\nAlice\talice@example.ch",
    "Nom,Email\nAlice,alice@example.ch",
    "\uFEFFEmail\r\nalice@example.ch",
    "alice@example.ch\nALICE@example.ch",
  ])("recognizes common CSV exports and headerless single-column lists: %s", async (content) => {
    expect((await parseMailingRecipientsFile(csv(content))).emails).toEqual(["alice@example.ch"]);
  });

  it("decodes Excel UTF-16 and Windows-1252 email headers", async () => {
    const content = "Adresse électronique\r\nalice@example.ch";
    const utf16 = new Uint8Array(2 + content.length * 2);
    utf16.set([255, 254]);
    const view = new DataView(utf16.buffer);
    for (let index = 0; index < content.length; index += 1) view.setUint16(2 + index * 2, content.charCodeAt(index), true);
    const western = Uint8Array.from(content, (character) => character.charCodeAt(0));
    for (const bytes of [utf16, western]) expect((await parseMailingRecipientsFile(csv(bytes))).emails).toEqual(["alice@example.ch"]);
  });

  it("only interprets the first nonempty record as a possible header", async () => {
    const report = await parseMailingRecipientsFile(csv("alice@example.ch\nEmail\nbob@example.ch"));
    expect(report).toMatchObject({ emails: ["alice@example.ch", "bob@example.ch"], invalidCount: 1, totalCount: 3 });
  });

  it("accepts multiple addresses in an email cell but never evaluates CSV formulas", async () => {
    const report = await parseMailingRecipientsFile(csv('Email\r\n"alice@example.ch;bob@example.ch"\r\n"=HYPERLINK(""mailto:cache@example.ch"",""cache@example.ch"")"'));
    expect(report).toMatchObject({ emails: ["alice@example.ch", "bob@example.ch"], invalidCount: 1, totalCount: 3 });
    expect(report.invalidEntries[0]).toContain("formule non importée");
  });

  it("rejects ambiguous columns and malformed quoted records without losing entries", async () => {
    await expect(parseMailingRecipientsFile(csv("Nom,Notes\nAlice,alice@example.ch"))).rejects.toThrow("colonne e-mail");
    await expect(parseMailingRecipientsFile(csv("Email\nalice@example.ch,bob@example.ch"))).rejects.toThrow("plus de colonnes");
    await expect(parseMailingRecipientsFile(csv('Email\n"alice@example.ch'))).rejects.toThrow("guillemets non fermés");
    await expect(parseMailingRecipientsFile(csv('Email\n"alice@example.ch"extra'))).rejects.toThrow("champ mal fermé");
  });

  it("enforces row and column limits before parsing recipients", async () => {
    await expect(parseMailingRecipientsFile(csv(["Email", ...Array(5000).fill("alice@example.ch")].join("\n")))).rejects.toThrow("5000 lignes");
    await expect(parseMailingRecipientsFile(csv(["Email", ...Array(50).fill("Notes")].join(",")))).rejects.toThrow("50 colonnes");
  });
});

describe("mailing recipient spreadsheet import", () => {
  it.each(["xls", "xlsx"] as const)("reads actual %s workbooks using only email columns", async (format) => {
    const file = bookFile(workbook(), format);
    expect(Array.from((await fileBytes(file)).subarray(0, 4))).toEqual(format === "xls" ? [208, 207, 17, 224] : [80, 75, 3, 4]);
    expect(await parseMailingRecipientsFile(file)).toMatchObject({ emails: ["alice@example.ch", "bob@example.ch"], invalidCount: 0, duplicateCount: 0 });
  });

  it("deduplicates across visible sheets and reports ignored hidden or unrelated sheets", async () => {
    const file = bookFile(workbook([
      { name: "Genève", rows: [["Email"], ["alice@example.ch"]] },
      { name: "Vaud", rows: [["Courriel"], ["ALICE@example.ch"], ["bob@example.ch"]] },
      { name: "Masquée", hidden: true, rows: [["Email"], ["secret@example.ch"]] },
      { name: "Notes", rows: [["Nom", "Notes"], ["Texte", "ignore@example.ch"]] },
    ]));
    const report = await parseMailingRecipientsFile(file);
    expect(report).toMatchObject({ emails: ["alice@example.ch", "bob@example.ch"], duplicateCount: 1 });
    expect(report.warnings?.join(" ")).toContain("feuille masquée");
    expect(report.warnings?.join(" ")).toContain("aucune colonne Email");
  });

  it("does not use formula results even when the cached value is a valid email", async () => {
    const book = workbook([{ name: "Restaurants", rows: [["Email"], ["cached@example.ch"], ["alice@example.ch"]] }]);
    book.Sheets.Restaurants.A2.f = 'CONCAT("cached","@example.ch")';
    const report = await parseMailingRecipientsFile(bookFile(book));
    expect(report).toMatchObject({ emails: ["alice@example.ch"], invalidCount: 1 });
    expect(report.invalidEntries[0]).toContain("formule non importée");
  });

  it("enforces sheet, row and column limits on workbook metadata", async () => {
    const many = workbook(Array.from({ length: 6 }, (_, index) => ({ name: `Feuille${index}`, rows: [["Email"], ["alice@example.ch"]] })));
    await expect(parseMailingRecipientsFile(bookFile(many))).rejects.toThrow("5 feuilles");
    for (const [reference, limit] of [["A5001", "5000 lignes"], ["AY2", "50 colonnes"]]) {
      const book = workbook([{ name: "Restaurants", rows: [["Email"]] }]);
      book.Sheets.Restaurants[reference] = { t: "s", v: "alice@example.ch" };
      book.Sheets.Restaurants["!ref"] = `A1:${reference}`;
      await expect(parseMailingRecipientsFile(bookFile(book))).rejects.toThrow(limit);
    }
  });

  it("rejects empty, oversized, unsupported and falsely named files", async () => {
    await expect(parseMailingRecipientsFile(csv(""))).rejects.toThrow("vide");
    await expect(parseMailingRecipientsFile(csv(new Uint8Array(MAILING_RECIPIENT_LIMITS.maxFileBytes + 1)))).rejects.toThrow("2 Mo");
    await expect(parseMailingRecipientsFile(csv("Email\na@example.ch", "emails.txt"))).rejects.toThrow("CSV, XLS ou XLSX");
    await expect(parseMailingRecipientsFile(csv("Email\na@example.ch", "emails.xls"))).rejects.toThrow("véritable classeur XLS");
    await expect(parseMailingRecipientsFile(csv("<html><body>a@example.ch</body></html>"))).rejects.toThrow("CSV valide");
    await expect(parseMailingRecipientsFile(new File([new Uint8Array([80, 75, 3, 4]).buffer], "emails.xlsx"))).rejects.toThrow("XLSX");
  });

  it("checks both declared and actual expansion before handing XLSX to the workbook reader", async () => {
    const original = await fileBytes(bookFile(workbook()));
    const directoryEntry = (bytes: Uint8Array) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let offset = 0; offset + 46 < bytes.length; offset += 1) {
        if (view.getUint32(offset, true) === 0x02014b50 && view.getUint16(offset + 10, true) === 8 && view.getUint32(offset + 24, true) > 1) return offset;
      }
      throw new Error("Fixture must contain a deflated workbook entry");
    };
    for (const forgedSize of [MAILING_RECIPIENT_LIMITS.maxExpandedBytes + 1, 1]) {
      const bytes = new Uint8Array(original);
      const view = new DataView(bytes.buffer);
      const central = directoryEntry(bytes);
      const local = view.getUint32(central + 42, true);
      view.setUint32(central + 24, forgedSize, true);
      view.setUint32(local + 22, forgedSize, true);
      await expect(parseMailingRecipientsFile(new File([bytes.buffer], "forged.xlsx"))).rejects.toThrow("décompression");
    }
  });

  it("rejects alternate ZIP size metadata and ambiguous directory signatures before workbook parsing", async () => {
    const original = await fileBytes(bookFile(workbook()));
    const source = new DataView(original.buffer, original.byteOffset, original.byteLength);
    const eocd = original.length - 22;
    const central = source.getUint32(eocd + 16, true);
    const local = source.getUint32(central + 42, true);
    const expected = source.getUint32(central + 24, true);
    const variants: Uint8Array[] = [];
    // Legal-sized ZIP64 overrides are rejected too: the reader must use only
    // the size fields that the bounded preflight explicitly validated.
    for (const location of ["central", "local"]) {
      const isCentral = location === "central";
      const start = isCentral ? central : local;
      const nameOffset = isCentral ? 28 : 26;
      const extraOffset = isCentral ? 30 : 28;
      const insert = start + (isCentral ? 46 : 30) + source.getUint16(start + nameOffset, true) + source.getUint16(start + extraOffset, true);
      const extra = new Uint8Array(12);
      const field = new DataView(extra.buffer);
      field.setUint16(0, 0x0001, true); field.setUint16(2, 8, true); field.setBigUint64(4, BigInt(expected), true);
      const bytes = new Uint8Array(original.length + extra.length);
      bytes.set(original.subarray(0, insert)); bytes.set(extra, insert); bytes.set(original.subarray(insert), insert + extra.length);
      const view = new DataView(bytes.buffer);
      view.setUint16(start + extraOffset, source.getUint16(start + extraOffset, true) + extra.length, true);
      if (isCentral) view.setUint32(eocd + extra.length + 12, source.getUint32(eocd + 12, true) + extra.length, true);
      else {
        view.setUint32(eocd + extra.length + 16, central + extra.length, true);
        let offset = central;
        for (let index = 0; index < source.getUint16(eocd + 10, true); index += 1) {
          const oldStart = source.getUint32(offset + 42, true);
          view.setUint32(offset + extra.length + 42, oldStart >= insert ? oldStart + extra.length : oldStart, true);
          offset += 46 + source.getUint16(offset + 28, true) + source.getUint16(offset + 30, true) + source.getUint16(offset + 32, true);
        }
      }
      variants.push(bytes);
    }
    const descriptor = new Uint8Array(original);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint16(central + 8, source.getUint16(central + 8, true) | 8, true);
    descriptorView.setUint16(local + 6, source.getUint16(local + 6, true) | 8, true);
    descriptorView.setUint32(local + 22, expected + 1, true);
    variants.push(descriptor);
    const commented = new Uint8Array(original.length + 22);
    commented.set(original);
    const commentView = new DataView(commented.buffer);
    commentView.setUint16(eocd + 20, 22, true);
    commentView.setUint32(original.length, 0x06054b50, true);
    commentView.setUint16(original.length + 20, 1, true);
    variants.push(commented);
    for (const bytes of variants) {
      await expect(parseMailingRecipientsFile(new File([new Uint8Array(bytes).buffer], "alternate-metadata.xlsx"))).rejects.toThrow("décompression");
    }
  });
});

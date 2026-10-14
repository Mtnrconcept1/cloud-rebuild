import { describe, expect, it } from "vitest";
import { buildGuidePdf } from "@/lib/guidePdf";

describe("export des guides PDF TOK", () => {
  it("intègre les captures JPEG dans les chapitres en conservant les liens du sommaire", () => {
    const bytes = buildGuidePdf({
      title: "Guide restaurateur TOK",
      subtitle: "Document illustré",
      sections: [{
        title: "Marketing",
        lines: ["Publier une actualité."],
        images: [{ data: new Uint8Array([255, 216, 255, 217]), width: 400, height: 300, caption: "Capture réelle TOK" }],
      }],
    });
    const pdf = new TextDecoder("windows-1252").decode(bytes);
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/Filter /DCTDecode");
    expect(pdf).toContain("/Subtype /Link");
    expect(pdf).toContain("/Outlines");
    expect(pdf).toContain("Capture r");
  });
  it("produit un PDF valide avec un sommaire cliquable et des signets", () => {
    const bytes = buildGuidePdf({
      title: "Guide restaurateur TOK",
      subtitle: "Document réservé",
      sections: [
        { title: "Premiers pas", lines: ["Configurer le restaurant", "Valider les horaires"] },
        { title: "Réservations", lines: ["Vérifier les réservations"] },
      ],
    });
    const pdf = new TextDecoder("windows-1252").decode(bytes);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Subtype /Link");
    expect(pdf).toContain("/Outlines");
    expect(pdf).toContain("/Dest [");
    expect(pdf).toContain("/Count 4");
    expect(pdf).toContain("Premiers pas");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("pagine sans rendre le sommaire non cliquable", () => {
    const lines = Array.from({ length: 180 }, (_, i) => `Étape ${i + 1} - Contrôle`);
    const bytes = buildGuidePdf({
      title: "Guide administrateur TOK",
      subtitle: "Document réservé",
      sections: [{ title: "Opérations", lines }],
    });
    const pdf = new TextDecoder("windows-1252").decode(bytes);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
    expect(pdf).toContain("/Subtype /Link");
    expect(pdf).toContain("Op?rations".replace("?", String.fromCharCode(233)));
  });
});

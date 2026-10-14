/** PDF A4 natif des guides TOK, avec signets et sommaire cliquable. */
export type GuidePdfImage = { data: Uint8Array; width: number; height: number; caption: string };
export type GuidePdfSection = { title: string; lines: readonly string[]; images?: readonly GuidePdfImage[] };
export type GuidePdfInput = { title: string; subtitle: string; sections: readonly GuidePdfSection[] };
type Page = {
  content: string[];
  links: { section: number; y: number }[];
  images: { resource: string; data: Uint8Array; width: number; height: number }[];
};
const W = 595, H = 842, LEFT = 48;
const cp1252: Record<string, number> = {
  "€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,
  "Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,
  "•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159,
};
function encode(input: string): string {
  return Array.from(input).map(ch => {
    const n = ch.codePointAt(0) ?? 63;
    if (n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255)) return ch;
    return cp1252[ch] === undefined ? "?" : String.fromCharCode(cp1252[ch]);
  }).join("");
}
const literal = (value: string) =>
  encode(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const text = (value: string, x: number, y: number, size: number, bold = false) =>
  `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${literal(value)}) Tj ET\n`;
function wrap(value: string, size: number): string[] {
  const max = Math.max(20, Math.floor((W - 2 * LEFT) / (size * .62)));
  const words = value.trim().replace(/\s+/g, " ").split(" ");
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const parts = word.match(new RegExp(`.{1,${max}}`, "g")) ?? [word];
    for (const part of parts) {
      if (!row) row = part;
      else if (row.length + 1 + part.length <= max) row += " " + part;
      else { rows.push(row); row = part; }
    }
  }
  if (row) rows.push(row);
  return rows;
}
export function buildGuidePdf(input: GuidePdfInput): Uint8Array {
  const pages: Page[] = [{content:[],links:[],images:[]}, {content:[],links:[],images:[]}];
  const destinations: number[] = [];
  let current = 1, y = H - 80;
  const newPage = () => {
    pages.push({content:[],links:[],images:[]});
    current = pages.length - 1;
    y = H - 84;
  };
  const paragraph = (entry: string, size = 10, bold = false, gap = 7) => {
    if (!entry.trim()) { y -= 10; return; }
    for (const row of wrap(entry, size)) {
      if (y < 77) newPage();
      pages[current].content.push(text(row, LEFT, Math.floor(y), size, bold));
      y -= size * 1.5;
    }
    y -= gap;
  };
  pages[0].content.push("1 .42 .12 rg\n48 699 103 59 re f\n0 0 0 rg\n");
  pages[0].content.push(text("TOK", 69, 718, 28, true));
  pages[0].content.push(text(input.title, LEFT, 625, 22, true));
  wrap(input.subtitle, 12).forEach((row, i) => {
    pages[0].content.push(text(row, LEFT, 580 - 20*i, 12));
  });
  pages[0].content.push(text("Document de reference reserve aux utilisateurs autorises", LEFT, 505, 10));
  pages[0].content.push(text("Catalogue des fonctions et parcours TOK", LEFT, 482, 10));

  input.sections.forEach((section, index) => {
    newPage();
    destinations[index] = current;
    paragraph(`${String(index + 1).padStart(2, "0")} - ${section.title}`, 17, true, 18);
    section.lines.forEach(line => paragraph(line));
    for (const image of section.images || []) {
      if (image.width <= 0 || image.height <= 0 || image.data.length < 4) continue;
      const scale = Math.min((W - 2 * LEFT) / image.width, 238 / image.height);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      if (y - height < 78) newPage();
      const x = Math.round((W - width) / 2);
      const resource = `Im${pages[current].images.length}`;
      pages[current].images.push({ resource, data: image.data, width: image.width, height: image.height });
      pages[current].content.push(`q ${width} 0 0 ${height} ${x} ${Math.round(y - height)} cm /${resource} Do Q\n`);
      y -= height + 12;
      paragraph(image.caption, 9, false, 14);
    }
  });
  const toc = pages[1];
  toc.content.push(text("Sommaire cliquable", LEFT, 765, 22, true));
  toc.content.push(text("Cliquez sur un titre pour ouvrir directement son chapitre.", LEFT, 735, 10));
  input.sections.forEach((section, index) => {
    const ypos = 706 - index * 24;
    if (ypos < 78) return;
    toc.content.push(text(`${String(index + 1).padStart(2, "0")}  ${wrap(section.title, 10)[0] ?? section.title}`, LEFT, ypos, 10, true));
    toc.content.push(text(String(destinations[index] + 1), W - 68, ypos, 10));
    toc.links.push({section:index,y:ypos});
  });
  pages.forEach((page, index) => {
    if (index > 0) page.content.push(text(input.title, LEFT, H - 39, 9, true));
    page.content.push(text(`TOK - ${index + 1} / ${pages.length}`, W - 128, 34, 9));
  });
  const objects: string[] = [];
  const id = () => { objects.push(""); return objects.length; };
  const set = (n: number, s: string) => { objects[n - 1] = s; };
  const catalog = id(), rootPages = id(), outlineRoot = id(), normalFont = id(), boldFont = id();
  const pageIds = pages.map(() => id()), streamIds = pages.map(() => id());
  const links = pages.map(page => page.links.map(() => id()));
  const imageIds = pages.map(page => page.images.map(() => id()));
  const bookmarks = input.sections.map(() => id());
  set(normalFont, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  set(boldFont, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  set(rootPages, `<< /Type /Pages /Kids [${pageIds.map(n => n + " 0 R").join(" ")}] /Count ${pages.length} >>`);
  set(catalog, `<< /Type /Catalog /Pages ${rootPages} 0 R${bookmarks.length ? ` /Outlines ${outlineRoot} 0 R /PageMode /UseOutlines` : ""} >>`);
  set(outlineRoot, bookmarks.length
    ? `<< /Type /Outlines /First ${bookmarks[0]} 0 R /Last ${bookmarks[bookmarks.length-1]} 0 R /Count ${bookmarks.length} >>`
    : "<< /Type /Outlines /Count 0 >>");
  pages.forEach((page, i) => {
    const content = encode(page.content.join(""));
    set(streamIds[i], `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const resources = page.images.map((image, j) => `/${image.resource} ${imageIds[i][j]} 0 R`).join(" ");
    set(pageIds[i], `<< /Type /Page /Parent ${rootPages} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${normalFont} 0 R /F2 ${boldFont} 0 R >> /XObject << ${resources} >> >> /Contents ${streamIds[i]} 0 R /Annots [${links[i].map(n => n + " 0 R").join(" ")}] >>`);
    page.images.forEach((image, j) => {
      let binary = "";
      const chunkSize = 8192;
      for (let k = 0; k < image.data.length; k += chunkSize) {
        binary += String.fromCharCode(...image.data.subarray(k, k + chunkSize));
      }
      set(imageIds[i][j], `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${binary.length} >>\nstream\n${binary}\nendstream`);
    });
    page.links.forEach((link, j) => {
      set(links[i][j], `<< /Type /Annot /Subtype /Link /Rect [${LEFT} ${link.y-4} ${W-LEFT} ${link.y+14}] /Border [0 0 0] /Dest [${pageIds[destinations[link.section]]} 0 R /Fit] >>`);
    });
  });
  input.sections.forEach((section, i) => {
    const prev = i ? ` /Prev ${bookmarks[i-1]} 0 R` : "";
    const next = i + 1 < bookmarks.length ? ` /Next ${bookmarks[i+1]} 0 R` : "";
    set(bookmarks[i], `<< /Title (${literal(section.title)}) /Parent ${outlineRoot} 0 R /Dest [${pageIds[destinations[i]]} 0 R /Fit]${prev}${next} >>`);
  });
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((content, i) => {
    offsets.push(pdf.length);
    pdf += `${i+1} 0 obj\n${content}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(n => { pdf += `${String(n).padStart(10,"0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${start}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i=0; i<pdf.length; i++) bytes[i] = pdf.charCodeAt(i);
  return bytes;
}
export function downloadGuidePdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([new Uint8Array(bytes)], {type: "application/pdf"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

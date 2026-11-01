import type { BlogArticle, BlogBlock } from "@/lib/seo/blog.mjs";
import { parseGrowthDocument } from "../../../supabase/functions/_shared/marketing-growth/content.ts";
import type { GrowthArticle, GrowthRevision } from "./client";

export function approvedBlogEntry(article: GrowthArticle, revision: GrowthRevision | undefined, profile: number, publicationDay: string): BlogArticle {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(article.slug) || article.slug.length < 3 || article.slug.length > 120 ||
      !Number.isInteger(profile) || profile < 1 || !Number.isInteger(article.approved_revision) || (article.approved_revision ?? 0) < 1 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(publicationDay) || !Number.isFinite(Date.parse(publicationDay)) || new Date(publicationDay).toISOString().slice(0,10) !== publicationDay)
    throw new Error("Métadonnées de publication invalides.");
  if (!revision?.document || revision.article_id !== article.id || revision.revision !== article.current_revision ||
      revision.revision !== article.approved_revision || revision.profile_version !== profile)
    throw new Error("L’approbation a changé. Relisez la révision actuelle.");
  const doc = parseGrowthDocument(revision.document);
  if (!["fr","fr-CH"].includes(doc.language)) throw new Error("Le blog natif publie actuellement en français.");
  if (doc.description.length > 160) throw new Error("Réduisez la méta-description à 160 caractères, puis faites approuver la nouvelle révision.");
  // The public blog interprets Markdown links. Only structured, validated links may enter this export.
  const plain = (value: string) => {
    if (/\[[^\]\n]+\]\([^)]*\)/.test(value)) throw new Error("Déplacez les liens Markdown dans les champs de liens approuvés, puis validez la révision.");
    return value;
  };
  const paragraph = (text: string): BlogBlock => ({ type: "paragraph", text: plain(text) });
  const heading = (text: string, id: string): BlogBlock => ({ type: "heading", level: 2, text, id });
  const blocks: BlogBlock[] = [paragraph(doc.summary)];
  doc.sections.forEach((section, i) => {
    blocks.push(heading(section.heading, `section-${i+1}`), ...section.paragraphs.map(paragraph));
  });
  if (doc.faq.length) {
    blocks.push(heading("Questions fréquentes", "faq"));
    doc.faq.forEach((item, i) => blocks.push({ type:"heading", level:3, text:item.question, id:`question-${i+1}` }, paragraph(item.answer)));
  }
  const linkBlock = (rows: { label: string; url: string }[]): BlogBlock => ({ type:"list", ordered:false,
    items: rows.map(({label,url}) => {
      if (/[\]\r\n]/.test(label) || label.includes("[") || /[()\s]/.test(url)) throw new Error("Un libellé ou une URL ne peut pas être exporté vers le format du blog.");
      return `[${label}](${url})`;
    }) });
  if (doc.links.length) blocks.push(heading("Pour continuer", "liens"), linkBlock(doc.links));
  blocks.push(heading("Sources", "sources"), linkBlock(doc.sources.map(s => ({ label:s.title, url:s.url }))));
  const words = [doc.summary, ...doc.sections.flatMap(s => [s.heading,...s.paragraphs]), ...doc.faq.flatMap(f => [f.question,f.answer])].join(" ").trim().split(/\s+/u).length;
  if (words < 650) throw new Error("Le blog TOK requiert un guide d’au moins 650 mots. Complétez le texte avant de le faire approuver.");
  return { slug:article.slug, title:doc.title, description:doc.description, category:"Guides TOK", author:"Rédaction TOK",
    publishedAt:publicationDay, modifiedAt:publicationDay, wordCount:words, related:[], blocks };
}

export type BlogBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };
export interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  category: string;
  author: string;
  publishedAt: string;
  modifiedAt: string;
  wordCount: number;
  related: string[];
  blocks: BlogBlock[];
}
export interface BlogSeoPage {
  path: string;
  title: string;
  description: string;
  image: string;
  ogType?: string;
  publishedAt?: string;
  modifiedAt: string;
  staticHtml: string;
  lastmod?: string;
  jsonLd: Record<string, unknown>;
}
export const blogArticles: BlogArticle[];
export const BLOG_STYLESHEET_PATH: string;
export function renderBlogBody(blocks: BlogBlock[]): string;
export function getBlogSeoPages(): BlogSeoPage[];
export function getBlogPage(slug?: string): BlogSeoPage | null;

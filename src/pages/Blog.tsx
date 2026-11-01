import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { BLOG_STYLESHEET_PATH, getBlogPage, type BlogSeoPage } from "@/lib/seo/blog.mjs";
import NotFound from "./NotFound";

function BlogContent({ page }: { page: BlogSeoPage }) {
  useSeoMeta({
    title: page.title,
    description: page.description,
    path: page.path,
    image: page.image,
    ogType: page.ogType,
    articlePublishedTime: page.publishedAt,
    articleModifiedTime: page.modifiedAt,
    jsonLd: page.jsonLd,
  });

  // The shared renderer only accepts escaped editorial blocks and safe URLs.
  // Rendering this same HTML at build time keeps the full article available
  // without JavaScript, while SPA navigation uses the exact same content.
  return <><link rel="stylesheet" href={BLOG_STYLESHEET_PATH} /><div dangerouslySetInnerHTML={{ __html: page.staticHtml }} /></>;
}

export default function Blog() {
  const { slug } = useParams<{ slug: string }>();
  const page = useMemo(() => getBlogPage(slug), [slug]);
  return page ? <BlogContent page={page} /> : <NotFound />;
}

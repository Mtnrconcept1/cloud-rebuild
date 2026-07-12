import { useMemo } from "react";
import { ArrowLeft, CalendarDays, MapPin, Newspaper, RefreshCw, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import SocialPostCard from "@/components/social/SocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildCanonicalUrl, useSeoMeta } from "@/hooks/useSeoMeta";
import { useSocialPostById } from "@/hooks/useSocialFeed";
import type { SocialFeedMedia } from "@/lib/socialFeed";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function compactText(value: unknown, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function getImageAnalysis(media?: SocialFeedMedia | null) {
  const metadata = media?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {} as Record<string, unknown>;
  const analysis = metadata.image_analysis;
  return analysis && typeof analysis === "object" && !Array.isArray(analysis)
    ? analysis as Record<string, unknown>
    : {} as Record<string, unknown>;
}

function positiveNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
  }
  return null;
}

function formatPublicationDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-CH", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ActualitePost() {
  const { postId = "" } = useParams<{ postId: string }>();
  const validPostId = UUID_PATTERN.test(postId) ? postId : null;
  const postQuery = useSocialPostById(validPostId);
  const post = postQuery.data || null;
  const primaryImage = post?.media.find((media) => media.mediaType === "image") || null;
  const imageAnalysis = getImageAnalysis(primaryImage);
  const publishedAt = post?.publishedAt || post?.createdAt || null;
  const modifiedAt = post?.updatedAt || publishedAt;
  const path = validPostId ? `/actualites/${validPostId}` : "/actualites";
  const fallbackHeadline = post
    ? `${post.restaurant.name} — ${compactText(post.body, 62)}`
    : "Actualité restaurant TOK";
  const headline = compactText(imageAnalysis.seo_title || fallbackHeadline, 72);
  const description = compactText(
    imageAnalysis.seo_description || post?.body || "Découvrez cette actualité publiée par un restaurant sur TOK.",
    170,
  );
  const imageAlt = compactText(
    primaryImage?.altText || imageAnalysis.alt_text || (post ? `Actualité publiée par ${post.restaurant.name}` : "Actualité restaurant TOK"),
    220,
  );
  const imageWidth = positiveNumber(primaryImage?.metadata?.width, imageAnalysis.width);
  const imageHeight = positiveNumber(primaryImage?.metadata?.height, imageAnalysis.height);
  const canonicalUrl = buildCanonicalUrl(path);

  const jsonLd = useMemo(() => {
    if (!post || !publishedAt) return null;

    const imageObject = primaryImage
      ? {
          "@type": "ImageObject",
          url: primaryImage.mediaUrl,
          caption: imageAlt,
          ...(imageWidth ? { width: imageWidth } : {}),
          ...(imageHeight ? { height: imageHeight } : {}),
        }
      : undefined;

    return [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": `${canonicalUrl}#article`,
        mainEntityOfPage: canonicalUrl,
        headline,
        description,
        articleBody: compactText(post.body, 5_000),
        datePublished: publishedAt,
        ...(modifiedAt ? { dateModified: modifiedAt } : {}),
        author: {
          "@type": "Organization",
          name: post.restaurant.name,
          url: buildCanonicalUrl(`/restaurant/${post.restaurantId}`),
        },
        publisher: {
          "@type": "Organization",
          name: "TOK",
          url: "https://www.thetok.ch",
          logo: {
            "@type": "ImageObject",
            url: "https://www.thetok.ch/logotok.png",
          },
        },
        ...(imageObject ? { image: imageObject } : {}),
      },
      ...(imageObject
        ? [{
            "@context": "https://schema.org",
            ...imageObject,
            "@id": `${canonicalUrl}#image`,
            contentUrl: primaryImage?.mediaUrl,
            representativeOfPage: true,
          }]
        : []),
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Accueil", item: "https://www.thetok.ch/" },
          { "@type": "ListItem", position: 2, name: "Actualités", item: "https://www.thetok.ch/actualites" },
          { "@type": "ListItem", position: 3, name: headline, item: canonicalUrl },
        ],
      },
    ];
  }, [canonicalUrl, description, headline, imageAlt, imageHeight, imageWidth, modifiedAt, post, primaryImage, publishedAt]);

  useSeoMeta({
    title: post ? `${headline} | TOK` : "Actualité restaurant | TOK",
    description,
    path,
    image: primaryImage?.mediaUrl || post?.restaurant.imageUrl || "/fond3.png",
    imageAlt,
    imageWidth,
    imageHeight,
    ogType: post ? "article" : "website",
    articlePublishedTime: publishedAt,
    articleModifiedTime: modifiedAt,
    robots: post ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" : "noindex,follow",
    jsonLd,
  });

  if (!validPostId || (!postQuery.isLoading && !postQuery.isError && !post)) {
    return (
      <main className="min-h-[70vh] bg-gradient-to-b from-orange-50/70 to-background px-4 py-12">
        <Card className="mx-auto max-w-xl rounded-[2rem] border-orange-100 shadow-xl shadow-orange-100/40">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <Search className="h-8 w-8" aria-hidden="true" />
            </span>
            <h1 className="font-display text-2xl font-black text-slate-950">Publication introuvable</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Cette actualité n’existe plus, n’est pas publique ou le lien est incorrect.
            </p>
            <Button asChild className="mt-6 rounded-full px-6">
              <Link to="/actualites">Voir toutes les actualités</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (postQuery.isLoading) {
    return (
      <main className="min-h-[70vh] bg-gradient-to-b from-orange-50/70 to-background px-4 py-8" aria-busy="true">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="h-8 w-56 animate-pulse rounded-full bg-muted" />
          <div className="h-28 animate-pulse rounded-[2rem] bg-muted" />
          <div className="h-[34rem] animate-pulse rounded-[2rem] bg-muted" />
          <span className="sr-only">Chargement de l’actualité…</span>
        </div>
      </main>
    );
  }

  if (postQuery.isError) {
    return (
      <main className="min-h-[70vh] bg-gradient-to-b from-orange-50/70 to-background px-4 py-12">
        <Card className="mx-auto max-w-xl rounded-[2rem] border-destructive/20 shadow-xl">
          <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
            <h1 className="font-display text-2xl font-black text-slate-950">Impossible de charger cette actualité</h1>
            <p className="mt-3 text-sm text-muted-foreground">Vérifiez votre connexion puis réessayez.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button type="button" className="rounded-full" onClick={() => postQuery.refetch()} disabled={postQuery.isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${postQuery.isFetching ? "animate-spin" : ""}`} />
                Réessayer
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/actualites">Retour aux actualités</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!post) return null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.13),transparent_30rem),linear-gradient(180deg,#fff7ed,white_18rem,#f8fafc)] px-2 py-5 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <nav aria-label="Fil d’Ariane" className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/actualites" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold transition hover:bg-white hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Toutes les actualités
          </Link>
        </nav>

        <header className="mb-5 rounded-[1.75rem] border border-orange-100 bg-white/90 p-5 shadow-lg shadow-orange-100/35 backdrop-blur sm:p-7">
          <Badge className="mb-3 gap-1.5 rounded-full bg-orange-100 text-orange-800 hover:bg-orange-100">
            <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
            Actualité restaurant
          </Badge>
          <h1 className="max-w-4xl font-display text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
            {headline}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {publishedAt ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <time dateTime={publishedAt}>{formatPublicationDate(publishedAt)}</time>
              </span>
            ) : null}
            {post.restaurant.city ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {post.restaurant.city}
              </span>
            ) : null}
          </div>
        </header>

        <SocialPostCard post={post} />
      </div>
    </main>
  );
}

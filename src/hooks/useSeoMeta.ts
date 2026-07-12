import { useEffect } from "react";

const DEFAULT_BASE_URL = "https://www.thetok.ch";

type SeoMetaInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  ogType?: "website" | "article" | string;
  articlePublishedTime?: string | null;
  articleModifiedTime?: string | null;
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element?.setAttribute(name, value);
  });
}

function upsertCanonical(url: string) {
  let element = document.head.querySelector<HTMLLinkElement>("link[rel='canonical']");
  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }
  element.href = url;
}

function syncOptionalMeta(
  selector: string,
  attributes: Record<string, string>,
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    document.head.querySelector(selector)?.remove();
    return;
  }
  upsertMeta(selector, { ...attributes, content: String(value) });
}

export function buildCanonicalUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${DEFAULT_BASE_URL}${normalizedPath}`;
}

export function useSeoMeta({
  title,
  description,
  path,
  image = "/fond3.png",
  imageAlt,
  imageWidth,
  imageHeight,
  ogType = "website",
  articlePublishedTime,
  articleModifiedTime,
  robots = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
  jsonLd = null,
}: SeoMetaInput) {
  useEffect(() => {
    const canonicalUrl = buildCanonicalUrl(path);
    const imageUrl = image.startsWith("http") ? image : `${DEFAULT_BASE_URL}${image.startsWith("/") ? image : `/${image}`}`;

    document.title = title;
    upsertMeta("meta[name='description']", { name: "description", content: description });
    upsertMeta("meta[name='robots']", { name: "robots", content: robots });
    upsertCanonical(canonicalUrl);
    upsertMeta("meta[property='og:type']", { property: "og:type", content: ogType });
    upsertMeta("meta[property='og:site_name']", { property: "og:site_name", content: "TOK" });
    upsertMeta("meta[property='og:locale']", { property: "og:locale", content: "fr_CH" });
    upsertMeta("meta[property='og:title']", { property: "og:title", content: title });
    upsertMeta("meta[property='og:description']", { property: "og:description", content: description });
    upsertMeta("meta[property='og:url']", { property: "og:url", content: canonicalUrl });
    upsertMeta("meta[property='og:image']", { property: "og:image", content: imageUrl });
    upsertMeta("meta[property='og:image:alt']", { property: "og:image:alt", content: imageAlt || title });
    syncOptionalMeta("meta[property='og:image:width']", { property: "og:image:width" }, imageWidth);
    syncOptionalMeta("meta[property='og:image:height']", { property: "og:image:height" }, imageHeight);
    syncOptionalMeta("meta[property='article:published_time']", { property: "article:published_time" }, articlePublishedTime);
    syncOptionalMeta("meta[property='article:modified_time']", { property: "article:modified_time" }, articleModifiedTime);
    upsertMeta("meta[name='twitter:card']", { name: "twitter:card", content: "summary_large_image" });
    upsertMeta("meta[name='twitter:title']", { name: "twitter:title", content: title });
    upsertMeta("meta[name='twitter:description']", { name: "twitter:description", content: description });
    upsertMeta("meta[name='twitter:image']", { name: "twitter:image", content: imageUrl });
    upsertMeta("meta[name='twitter:image:alt']", { name: "twitter:image:alt", content: imageAlt || title });

    const scriptId = "tok-page-json-ld";
    document.getElementById(scriptId)?.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [
    articleModifiedTime,
    articlePublishedTime,
    description,
    image,
    imageAlt,
    imageHeight,
    imageWidth,
    jsonLd,
    ogType,
    path,
    robots,
    title,
  ]);
}

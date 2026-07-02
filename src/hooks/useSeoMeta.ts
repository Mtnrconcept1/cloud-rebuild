import { useEffect } from "react";
import { toTokPublicAssetUrl } from "@/lib/securityUrls";

const DEFAULT_BASE_URL = "https://www.thetok.ch";

type SeoMetaInput = {
  title: string;
  description: string;
  path: string;
  image?: string;
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

export function buildCanonicalUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${DEFAULT_BASE_URL}${normalizedPath}`;
}

export function buildCanonicalAssetUrl(path: string) {
  const normalizedAssetPath = toTokPublicAssetUrl(path, path || "/fond3.png");
  if (normalizedAssetPath.startsWith("http")) return normalizedAssetPath;
  const prefixedPath = normalizedAssetPath.startsWith("/") ? normalizedAssetPath : `/${normalizedAssetPath}`;
  return `${DEFAULT_BASE_URL}${prefixedPath}`;
}

export function useSeoMeta({ title, description, path, image = "/fond3.png", jsonLd = null }: SeoMetaInput) {
  useEffect(() => {
    const canonicalUrl = buildCanonicalUrl(path);
    const imageUrl = buildCanonicalAssetUrl(image);

    document.title = title;
    upsertMeta("meta[name='description']", { name: "description", content: description });
    upsertMeta("meta[name='robots']", { name: "robots", content: "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" });
    upsertCanonical(canonicalUrl);
    upsertMeta("meta[property='og:type']", { property: "og:type", content: "website" });
    upsertMeta("meta[property='og:title']", { property: "og:title", content: title });
    upsertMeta("meta[property='og:description']", { property: "og:description", content: description });
    upsertMeta("meta[property='og:url']", { property: "og:url", content: canonicalUrl });
    upsertMeta("meta[property='og:image']", { property: "og:image", content: imageUrl });
    upsertMeta("meta[name='twitter:card']", { name: "twitter:card", content: "summary_large_image" });
    upsertMeta("meta[name='twitter:title']", { name: "twitter:title", content: title });
    upsertMeta("meta[name='twitter:description']", { name: "twitter:description", content: description });
    upsertMeta("meta[name='twitter:image']", { name: "twitter:image", content: imageUrl });

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
  }, [description, image, jsonLd, path, title]);
}

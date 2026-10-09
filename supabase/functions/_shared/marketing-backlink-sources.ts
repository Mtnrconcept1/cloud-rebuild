export const SOURCE_KINDS = ["forum", "directory", "partner", "press", "community"] as const;
export type BacklinkSource = {
  title: string;
  url: string;
  domain: string;
  rationale: string;
  kind: typeof SOURCE_KINDS[number];
  submissionUrl: string | null;
  evidenceUrl: string | null;
  accountEvidence: string;
  accountRequirement: "none" | "required" | "unknown";
  publicationMode: "editorial_review" | "directory_review" | "direct" | "unknown";
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** No remote fetch is performed here. Only public HTTPS hostnames may be offered. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    if (!host.includes(".") || host.includes(":") || host.includes("[") || /^[\d.]+$/.test(host)) return null;
    if (/(^|\.)(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(host)) return null;
    if (!host.split(".").every((part) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) return null;
    url.hostname = host;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function verifiedBacklinkSources(response: unknown, proposed: unknown, limit: number, withoutAccountOnly = false): BacklinkSource[] {
  const evidence = new Set<string>();
  const output = record(response).output;
  const items = Array.isArray(output) ? output.slice(0, 100) : [];
  // A citation in a plain model answer is insufficient without a completed search.
  if (!items.some((item) => record(item).type === "web_search_call" && record(item).status === "completed")) return [];
  const add = (value: unknown) => { const url = publicSourceUrl(value); if (url) evidence.add(url); };
  for (const item of items) {
    const entry = record(item);
    if (entry.type === "web_search_call" && entry.status === "completed") {
      const sources = record(entry.action).sources;
      if (Array.isArray(sources)) sources.slice(0, 200).forEach((source) => add(record(source).url));
    }
    if (entry.type === "message" && Array.isArray(entry.content)) {
      for (const part of entry.content.slice(0, 30)) {
        const annotations = record(part).annotations;
        if (Array.isArray(annotations)) annotations.slice(0, 200).forEach((annotation) => {
          const citation = record(annotation);
          if (citation.type === "url_citation") add(citation.url);
        });
      }
    }
  }
  const sources = record(proposed).sources;
  const result: BacklinkSource[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(sources)) return result;
  for (const value of sources.slice(0, 50)) {
    const source = record(value);
    const url = publicSourceUrl(source.url);
    const title = typeof source.title === "string" ? source.title.trim().slice(0, 160) : "";
    const rationale = typeof source.rationale === "string" ? source.rationale.trim().slice(0, 1000) : "";
    if (!url || !evidence.has(url) || seen.has(url) || !title || !rationale || !SOURCE_KINDS.includes(source.kind as BacklinkSource["kind"])) continue;
    const supportedUrl = (value: unknown) => { const candidate = publicSourceUrl(value); return candidate && evidence.has(candidate) ? candidate : null; };
    const submissionUrl = supportedUrl(source.submissionUrl);
    const evidenceUrl = supportedUrl(source.evidenceUrl);
    const accountEvidence = typeof source.accountEvidence === "string" ? source.accountEvidence.trim().slice(0, 600) : "";
    // A public contact page alone does not demonstrate the absence of account requirements.
    // The quoted claim remains visible for human review; it is not a successful submission.
    const explicitNoAccount = /sans (?:création de )?(?:compte|inscription)|no (?:account|registration|sign[- ]?up) (?:is )?(?:required|needed)|without (?:an? )?(?:account|registration|sign[- ]?up)/i.test(accountEvidence);
    const accountRequirement: BacklinkSource["accountRequirement"] = evidenceUrl && submissionUrl && accountEvidence
      ? source.accountRequirement === "none" && explicitNoAccount ? "none" : source.accountRequirement === "required" ? "required" : "unknown"
      : "unknown";
    if (withoutAccountOnly && accountRequirement !== "none") continue;
    const publicationMode = evidenceUrl && ["editorial_review", "directory_review", "direct"].includes(String(source.publicationMode))
      ? source.publicationMode as BacklinkSource["publicationMode"] : "unknown";
    seen.add(url);
    result.push({ title, url, domain: new URL(url).hostname, rationale, kind: source.kind as BacklinkSource["kind"], submissionUrl, evidenceUrl, accountEvidence: evidenceUrl ? accountEvidence : "", accountRequirement, publicationMode });
    if (result.length >= Math.max(1, Math.min(10, limit))) break;
  }
  return result;
}

export type CommunityChannel = "web" | "reddit" | "quora";
export function communityQuery(channel: CommunityChannel, query: string) {
  if (channel === "web") return query.trim();
  const prefix = channel === "reddit" ? "site:reddit.com inurl:comments" : "site:quora.com";
  return (prefix + " Questions ou discussions publiques pertinentes pour TOK. Sujet : " + query.trim()).slice(0,1000);
}

/** Reduce tracking variants to the same public discussion. Never use a displayed domain as proof. */
export function discussionId(channel: CommunityChannel, value: string) {
  if (channel === "web") return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (channel === "reddit") {
      if (!["reddit.com","www.reddit.com","old.reddit.com"].includes(url.hostname)) return null;
      const match = /^\/r\/[a-z0-9_]+\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(url.pathname);
      return match ? "reddit:" + match[1].toLowerCase() : null;
    }
    if (!/^(?:(?:www|fr|de|it|es)\.)?quora\.com$/.test(url.hostname)) return null;
    const question = /^\/([\p{L}\p{N}_%-]+-[\p{L}\p{N}_%-]+)(?:\/answer\/[^/]+)?\/?$/u.exec(url.pathname);
    return question ? url.hostname + "/" + question[1] : null;
  } catch { return null; }
}

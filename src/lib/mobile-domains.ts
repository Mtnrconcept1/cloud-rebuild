import { TOK_ADMIN_APP_HOST, TOK_PUBLIC_APP_HOST } from "@/lib/adminDomains";
import { TOK_COMMERCIAL_APP_HOST } from "@/lib/commercialDomains";

export const TOK_CANONICAL_APP_HOST = TOK_PUBLIC_APP_HOST;

export const TOK_APP_LINK_HOSTS = [
  TOK_CANONICAL_APP_HOST,
  "thetok.ch",
  "app.thetok.ch",
  TOK_ADMIN_APP_HOST,
  TOK_COMMERCIAL_APP_HOST,
] as const;

const allowedAppLinkHosts = new Set<string>(TOK_APP_LINK_HOSTS);

export function isAllowedAppLinkHost(hostname: string) {
  return allowedAppLinkHosts.has(hostname.toLowerCase());
}

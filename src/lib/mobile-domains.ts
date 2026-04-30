export const TOK_CANONICAL_APP_HOST = "tok.ch";

export const TOK_APP_LINK_HOSTS = [
  TOK_CANONICAL_APP_HOST,
  "www.tok.ch",
  "app.tok.ch",
  "thetok.ch",
  "www.thetok.ch",
  "app.thetok.ch",
] as const;

const allowedAppLinkHosts = new Set<string>(TOK_APP_LINK_HOSTS);

export function isAllowedAppLinkHost(hostname: string) {
  return allowedAppLinkHosts.has(hostname.toLowerCase());
}

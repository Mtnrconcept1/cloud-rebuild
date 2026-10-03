/** Deployment capability, not a credential/consent check. Never authorizes a send.
 * TOK news uses the native publication RPC, not an external provider adapter.
 * Keep external channels fail-closed until their actual adapter ships with tests.
 */
const IMPLEMENTED_OR_MANUAL = new Set([
  "in_app", "email", "tok_news", "manual_call", "manual_email", "manual_visit",
]);
export function getMarketingAdapterBlocker(channel: string): string | null {
  if (IMPLEMENTED_OR_MANUAL.has(channel)) return null;
  return /^[a-z_]{1,40}$/.test(channel) ? `${channel}_adapter_not_deployed` : "adapter_not_deployed";
}

import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget";

export const TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH = "/tok-connect-preview-widget.js";
export const TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH = "/tok-connect-preview-bridge.js";

/** Use the exact MCP widget runtime in the browser preview, without duplicating its logic. */
export function getTokConnectPreviewWidgetScript(): string {
  const matches = Array.from(TOK_DISCOVERY_WIDGET_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g));
  if (matches.length !== 1) {
    throw new Error("unexpected_tok_connect_widget_script_count");
  }
  return matches[0][1];
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Preview-only host. The production MCP resource contains none of this bridge. */
export function buildTokConnectPreviewDocument(parentOrigin: string, channel: string): string {
  const origin = new URL(parentOrigin);
  if (!["https:", "http:"].includes(origin.protocol) || origin.origin !== parentOrigin
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channel)) {
    throw new Error("invalid_preview_channel");
  }

  // about:srcdoc inherits the site's strict CSP. Both scripts must therefore be
  // first-party external files; inline JavaScript is intentionally disallowed.
  const nativeScript = TOK_DISCOVERY_WIDGET_HTML.match(/<script>[\s\S]*?<\/script>/);
  if (!nativeScript) throw new Error("missing_tok_connect_widget_script");
  const html = TOK_DISCOVERY_WIDGET_HTML.replace(
    nativeScript[0],
    '<script src="' + TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH + '"></script>',
  );
  const bridge = [
    '<meta name="tok-preview-parent-origin" content="' + escapeAttribute(parentOrigin) + '">',
    '<meta name="tok-preview-channel" content="' + escapeAttribute(channel) + '">',
    '<script src="' + TOK_CONNECT_PREVIEW_BRIDGE_SCRIPT_PATH + '"></script>',
  ].join("\n");

  return html.replace("</head>", bridge + "\n</head>");
}

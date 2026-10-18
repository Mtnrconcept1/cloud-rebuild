import { TOK_DISCOVERY_WIDGET_HTML } from "../../supabase/functions/_shared/tok-connect-discovery-widget";

/** Preview-only host. The production MCP resource contains none of this bridge. */
export function buildTokConnectPreviewDocument(parentOrigin: string, channel: string): string {
  const origin = new URL(parentOrigin);
  if (!["https:", "http:"].includes(origin.protocol) || origin.origin !== parentOrigin
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channel)) {
    throw new Error("invalid_preview_channel");
  }
  const literal = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  const shim = `<script>
(function () {
  var parentOrigin = ${literal(parentOrigin)};
  var channel = ${literal(channel)};
  var pending = {};
  var sequence = 0;
  function post(message) {
    try { window.parent.postMessage(Object.assign({}, message, { channel: channel }), parentOrigin); } catch (error) {}
  }
  window.openai = {
    locale: 'fr-CH', displayMode: 'inline', theme: 'light', maxHeight: 720,
    toolOutput: null, widgetState: null,
    setWidgetState: function (state) { window.openai.widgetState = state; return Promise.resolve(); },
    requestDisplayMode: function (options) { post({ type: 'tok_preview_display', mode: options && options.mode }); return Promise.resolve(options); },
    openExternal: function (options) { post({ type: 'tok_preview_open', href: options && options.href }); },
    sendFollowUpMessage: function (options) { post({ type: 'tok_preview_prompt', prompt: options && options.prompt }); return Promise.resolve(); },
    callTool: function (name, args) {
      sequence += 1;
      var id = 'call-' + sequence;
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        post({ type: 'tok_preview_call', id: id, name: name, args: args });
      });
    }
  };
  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (event.source !== window.parent || event.origin !== parentOrigin || !data || data.channel !== channel) return;
    if (data.type === 'tok_connect_preview') {
      window.openai.toolOutput = data.payload;
      if (data.theme) window.openai.theme = data.theme;
      window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: {
        toolOutput: data.payload, theme: window.openai.theme
      } } }));
      return;
    }
    if (data.type !== 'tok_preview_result' || !pending[data.id]) return;
    var entry = pending[data.id];
    delete pending[data.id];
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  });
  post({ type: 'tok_connect_widget_ready' });
})();
</script>
</head>`;
  return TOK_DISCOVERY_WIDGET_HTML.replace("</head>", shim);
}

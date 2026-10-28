/* Isolated, preview-only MCP host adapter. Never loaded by the production MCP widget. */
(function () {
  "use strict";

  var parentOrigin = document.querySelector('meta[name="tok-preview-parent-origin"]')?.getAttribute("content") || "";
  var channel = document.querySelector('meta[name="tok-preview-channel"]')?.getAttribute("content") || "";
  try {
    var parsed = new URL(parentOrigin);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.origin !== parentOrigin
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channel)) return;
  } catch (error) {
    return;
  }

  var pending = Object.create(null);
  var sequence = 0;

  function post(message) {
    try {
      window.parent.postMessage(Object.assign({}, message, { channel: channel }), parentOrigin);
    } catch (error) {
      // The preview is never allowed to bypass the sandbox when its host is unavailable.
    }
  }

  window.openai = {
    locale: "fr-CH",
    displayMode: "inline",
    theme: "light",
    maxHeight: 720,
    toolOutput: null,
    widgetState: null,
    setWidgetState: function (state) {
      window.openai.widgetState = state;
      return Promise.resolve();
    },
    requestDisplayMode: function (options) {
      post({ type: "tok_preview_display", mode: options && options.mode });
      return Promise.resolve(options);
    },
    openExternal: function (options) {
      post({ type: "tok_preview_open", href: options && options.href });
    },
    sendFollowUpMessage: function (options) {
      post({ type: "tok_preview_prompt", prompt: options && options.prompt });
      return Promise.resolve();
    },
    callTool: function (name, args) {
      sequence += 1;
      var id = "call-" + sequence;
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        post({ type: "tok_preview_call", id: id, name: name, args: args });
      });
    }
  };

  window.addEventListener("message", function (event) {
    var data = event && event.data;
    if (event.source !== window.parent || event.origin !== parentOrigin || !data || data.channel !== channel) return;
    if (data.type === "tok_connect_preview") {
      window.openai.toolOutput = data.payload;
      if (data.theme) window.openai.theme = data.theme;
      window.dispatchEvent(new CustomEvent("openai:set_globals", {
        detail: { globals: { toolOutput: data.payload, theme: window.openai.theme } }
      }));
      return;
    }
    if (data.type !== "tok_preview_result" || !pending[data.id]) return;
    var entry = pending[data.id];
    delete pending[data.id];
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  });

  post({ type: "tok_connect_widget_ready" });
})();

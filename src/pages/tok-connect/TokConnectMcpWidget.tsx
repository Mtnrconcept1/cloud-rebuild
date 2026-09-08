import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/integrations/supabase/client";
import {
  buildSandboxDiscoveryPayload,
  buildSandboxRestaurantDetail,
  parseTokDiscoveryRequest,
  runTokDiscovery,
  runTokRestaurantDetail,
  type TokDiscoveryClient,
  type TokDiscoveryPayload,
} from "../../../supabase/functions/_shared/tok-connect-discovery";
import { TOK_DISCOVERY_WIDGET_HTML } from "../../../supabase/functions/_shared/tok-connect-discovery-widget";

const EXAMPLES = [
  "3 pizzerias et 2 restaurants de sushi à Genève",
  "2 burgers et 1 japonais à Lausanne pour 4 personnes demain",
  "5 tables gastronomiques à Genève",
  "3 restaurants libanais et 2 italiens à Carouge",
];

/**
 * Émulation de l'hôte ChatGPT (Apps SDK) : le widget publié dans ChatGPT lit
 * `window.openai`. On l'injecte ici pour que l'aperçu se comporte exactement
 * comme le module réel, clic sur une carte compris.
 */
const HOST_SHIM = `<script>
(function () {
  var pending = {};
  var sequence = 0;
  function post(message) { try { window.parent.postMessage(message, '*'); } catch (error) {} }
  window.openai = {
    locale: 'fr-CH',
    displayMode: 'inline',
    theme: 'light',
    maxHeight: 720,
    toolOutput: null,
    widgetState: null,
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
    if (!data || data.type !== 'tok_preview_result' || !pending[data.id]) return;
    var entry = pending[data.id];
    delete pending[data.id];
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  });
})();
</script>
</head>`;

const PREVIEW_DOCUMENT = TOK_DISCOVERY_WIDGET_HTML.replace("</head>", HOST_SHIM);

type PreviewLog = { id: string; label: string; detail: string };

export default function TokConnectMcpWidget() {
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [payload, setPayload] = useState<TokDiscoveryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"live" | "sandbox" | null>(null);
  const [logs, setLogs] = useState<PreviewLog[]>([]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const intents = useMemo(() => parseTokDiscoveryRequest(request), [request]);

  const pushLog = useCallback((label: string, detail: string) => {
    setLogs((previous) => [{ id: `${Date.now()}-${previous.length}`, label, detail }, ...previous].slice(0, 8));
  }, []);

  const discoveryClient = useCallback(() => {
    try {
      return getSupabase() as unknown as TokDiscoveryClient;
    } catch {
      return null;
    }
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    const client = discoveryClient();
    const args = { request };
    try {
      if (!client) throw new Error("supabase_unavailable");
      const result = await runTokDiscovery({ client, args, origin: window.location.origin });
      if (!result.restaurants.length) throw new Error("empty_catalog");
      setPayload(result);
      setSource("live");
      pushLog("discover_restaurants", `${result.restaurants.length} restaurant(s) TOK en direct`);
    } catch {
      const fallback = buildSandboxDiscoveryPayload(args, window.location.origin);
      setPayload(fallback);
      setSource("sandbox");
      pushLog("discover_restaurants", "catalogue de démonstration (aucune donnée en direct)");
    } finally {
      setLoading(false);
    }
  }, [discoveryClient, pushLog, request]);

  useEffect(() => {
    void run();
    // Un seul lancement au montage : les relances passent par le bouton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alimente le widget comme le ferait ChatGPT après un appel d'outil.
  useEffect(() => {
    if (!payload) return;
    const frame = frameRef.current;
    frame?.contentWindow?.postMessage({ type: "tok_connect_preview", payload }, "*");
  }, [payload]);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;

      if (data.type === "tok_connect_widget_ready" && payload) {
        frame.contentWindow?.postMessage({ type: "tok_connect_preview", payload }, "*");
        return;
      }

      if (data.type === "tok_preview_open" && typeof data.href === "string") {
        pushLog("openExternal", data.href);
        window.open(data.href, "_blank", "noopener,noreferrer");
        return;
      }

      if (data.type === "tok_preview_prompt" && typeof data.prompt === "string") {
        pushLog("sendFollowUpMessage", data.prompt);
        return;
      }

      if (data.type === "tok_preview_call" && data.name === "get_restaurant_details") {
        const id = String(data.id || "");
        const args = (data.args && typeof data.args === "object" ? data.args : {}) as Record<string, unknown>;
        pushLog("callTool", `get_restaurant_details · ${String(args.restaurant_id || "")}`);
        try {
          const client = discoveryClient();
          const detail = client && source === "live"
            ? await runTokRestaurantDetail({ client, args, origin: window.location.origin })
            : buildSandboxRestaurantDetail(args, window.location.origin);
          frame.contentWindow?.postMessage({ type: "tok_preview_result", id, result: { structuredContent: { detail } } }, "*");
        } catch (error) {
          frame.contentWindow?.postMessage({
            type: "tok_preview_result",
            id,
            error: error instanceof Error ? error.message : "detail_unavailable",
          }, "*");
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [discoveryClient, payload, pushLog, source]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 font-black text-white shadow-lg shadow-orange-500/25">
              TOK
            </div>
            <div>
              <h1 className="text-lg font-black leading-tight">Module TOK Connect</h1>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Aperçu du widget ChatGPT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {source === "live" ? "Catalogue TOK en direct" : source === "sandbox" ? "Données de démonstration" : "Initialisation"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <label htmlFor="tok-request" className="text-sm font-bold text-slate-800">
            Demande envoyée à ChatGPT
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id="tok-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void run(); }}
              placeholder="3 pizzerias et 2 restaurants de sushi à Genève"
            />
            <Button onClick={() => void run()} disabled={loading} className="sm:w-44">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Ouvrir le module
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => { setRequest(example); }}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-600"
              >
                {example}
              </button>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
            Compris&nbsp;:
            {intents.intents.length === 0
              ? <span className="font-semibold text-slate-700">aucune cuisine détectée</span>
              : intents.intents.map((intent) => (
                <span key={intent.key} className="rounded bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-700">
                  {intent.count} × {intent.label}
                </span>
              ))}
            {intents.city ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{intents.city}</span> : null}
          </p>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-slate-900 px-4 py-2.5 text-white">
              <span className="text-sm font-bold">ui://tok-connect/restaurant-discovery-v1.html</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                text/html;profile=mcp-app
              </span>
            </div>
            <iframe
              ref={frameRef}
              title="Module TOK Connect"
              srcDoc={PREVIEW_DOCUMENT}
              sandbox="allow-scripts"
              className="h-[720px] w-full border-0 bg-white"
            />
          </section>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <MessageSquare className="h-4 w-4 text-orange-500" />
                Échanges avec l'hôte
              </h2>
              {logs.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  Cliquez sur une carte : le module appelle <code>get_restaurant_details</code> comme dans ChatGPT.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {logs.map((log) => (
                    <li key={log.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-orange-600">{log.label}</p>
                      <p className="mt-0.5 break-words text-xs text-slate-600">{log.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-black text-slate-900">Réponse de l'outil</h2>
              <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-300">
                {payload ? JSON.stringify(payload, null, 2) : "—"}
              </pre>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

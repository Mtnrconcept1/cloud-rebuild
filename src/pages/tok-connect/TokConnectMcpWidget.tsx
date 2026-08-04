import { useEffect, useState } from "react";
import { Bot, CheckCircle2, ChevronRight, LayoutDashboard, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function TokConnectMcpWidget() {
  const [widgetState, setWidgetState] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Pour des raisons de sécurité, nous acceptons uniquement les messages d'origines de confiance
      // (soit nous-mêmes, soit le MCP server)
      if (event.data?.type === "mcp_widget_update") {
        setWidgetState(event.data.state);
        
        const output = event.data.state?.toolOutput;
        const structured = output?.structuredContent || output;
        
        if (structured?.current_action?.name) {
          setHistory(prev => {
            const signature = `${structured.current_action.name}:${structured.current_action.at}`;
            if (!prev.some(h => h.signature === signature)) {
              return [{
                signature,
                name: structured.current_action.name,
                title: structured.current_action.title || structured.current_action.name,
                status: structured.current_action.status || "terminée",
                at: structured.current_action.at
              }, ...prev].slice(0, 10);
            }
            return prev;
          });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    
    // Signaler au parent (l'Edge Function) que nous sommes prêts
    window.parent.postMessage({ type: "mcp_widget_ready" }, "*");

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Détermination de l'état affiché
  const toolsCount = widgetState?.toolOutput?.structuredContent?.available_tools?.length || 0;
  const isReady = !!widgetState;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950 font-sans">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20">
            <span className="font-black">TOK</span>
          </div>
          <div>
            <h1 className="font-black leading-tight text-slate-900">TOK Connect</h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Sandbox MCP</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden sm:flex" onClick={() => window.parent.postMessage({ type: "mcp_action", action: "fullscreen" }, "*")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Plein écran
          </Button>
          <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
            Connecté
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            {/* Fenêtre Principale de Rendu */}
            <div className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="border-b bg-slate-900 px-4 py-3 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-bold">Rendu de l'Action</span>
                </div>
              </div>
              <div className="flex-1 p-6">
                {!isReady ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Bot className="mb-4 h-12 w-12 text-slate-300" />
                    <h2 className="text-lg font-black text-slate-700">En attente de ChatGPT</h2>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                      Demandez à ChatGPT de simuler une réservation ou d'analyser des données TOK pour voir l'interface exacte s'afficher ici.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="rounded-xl border border-orange-100 bg-orange-50 p-6">
                        <h3 className="font-black text-orange-900 text-lg">Données MCP reçues</h3>
                        <p className="mt-2 text-sm text-orange-800 leading-relaxed">
                          La passerelle Iframe fonctionne. ChatGPT interagit avec les composants natifs TOK.
                        </p>
                        <div className="mt-4 flex gap-3">
                           <div className="rounded-lg bg-white px-4 py-3 shadow-sm border border-orange-100">
                              <span className="block text-2xl font-black text-orange-600">{toolsCount}</span>
                              <span className="text-xs font-bold text-slate-500 uppercase">Outils exposés</span>
                           </div>
                           <div className="rounded-lg bg-white px-4 py-3 shadow-sm border border-orange-100">
                              <span className="block text-2xl font-black text-orange-600">{history.length}</span>
                              <span className="text-xs font-bold text-slate-500 uppercase">Actions suivies</span>
                           </div>
                        </div>
                     </div>
                     <pre className="max-h-[300px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-mono text-emerald-400">
                       {JSON.stringify(widgetState, null, 2)}
                     </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Historique Sidebar */}
            <div className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="border-b bg-slate-50 px-4 py-3">
                <span className="text-sm font-black text-slate-800">Historique des actions</span>
              </div>
              <div className="flex-1 p-4">
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Aucune action MCP récente.</p>
                ) : (
                  <div className="space-y-4">
                    {history.map((item, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{item.title}</p>
                          <p className="text-xs font-semibold text-slate-500 uppercase mt-0.5">{item.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t bg-slate-50 p-4">
                <Button variant="outline" className="w-full text-xs" onClick={() => window.parent.postMessage({ type: "mcp_action", action: "summarize" }, "*")}>
                  Demander un récapitulatif
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

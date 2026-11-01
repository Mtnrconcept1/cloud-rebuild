import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marketingBffRequest, MARKETING_BFF_ENDPOINTS } from "@/marketing/marketingBffClient";
import { auditBlogPage, type BlogProbe } from "@/marketing/growth/blogAudit";

export default function MarketingBlogAudit() {
  const [path,setPath] = useState("/blog");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [audit,setAudit] = useState<{url:string; checkedAt:string; findings:ReturnType<typeof auditBlogPage>}>();
  async function run(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setAudit(undefined);
    try {
      const probe = await marketingBffRequest<BlogProbe>(MARKETING_BFF_ENDPOINTS.rpc, {
        body: { operation:"admin_audit_tok_blog", args:{path} },
      });
      setAudit({url:probe.url,checkedAt:probe.checkedAt, findings:auditBlogPage(probe)});
    } catch (err) { setError(err instanceof Error ? err.message : "Audit indisponible."); }
    finally { setBusy(false); }
  }
  return <details className="space-y-3 rounded-2xl border bg-card p-5"><summary className="cursor-pointer font-semibold">Audit SEO du blog publié</summary>
    <form className="space-y-2" onSubmit={e => void run(e)}><label>Chemin de la page publique<Input value={path} onChange={e => setPath(e.target.value)} maxLength={126} required placeholder="/blog/mon-article"/></label>
      <Button disabled={busy}>{busy ? "Lecture en cours…" : "Vérifier la page"}</Button></form>
    {error && <p role="alert">{error}</p>}
    {audit && <div className="space-y-2"><p className="break-all">{audit.url} · {new Date(audit.checkedAt).toLocaleString("fr-CH")}</p>
      <ul>{audit.findings.map(f => <li key={f.label} className="break-words">{f.ok ? "Conforme" : "À vérifier"} · <strong>{f.label}</strong> · {f.detail}</li>)}</ul></div>}
  </details>;
}

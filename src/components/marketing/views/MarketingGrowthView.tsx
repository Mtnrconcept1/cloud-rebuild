import { approvedBlogEntry } from "@/marketing/growth/blogExport";
import MarketingBlogAudit from "./MarketingBlogAudit";
import MarketingSearchConsole from "./MarketingSearchConsole";
import { parseGrowthDocument } from "../../../../supabase/functions/_shared/marketing-growth/content";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { growthOperation, loadGrowthDashboard, type GrowthArticle, type GrowthDashboard, type GrowthDocument, type GrowthProfile, type GrowthRevision } from "@/marketing/growth/client";
import type { GrowthOperation } from "../../../../supabase/functions/_shared/marketing-growth/operations";
function sameDocument(a: GrowthDocument, b: GrowthDocument | undefined) { try {
    return Boolean(b) && JSON.stringify(parseGrowthDocument(a)) === JSON.stringify(parseGrowthDocument(b));
}
catch {
    return false;
} }
const panel = "rounded-2xl border bg-card p-5 space-y-4";
const labels: Record<string, string> = { queued: "En attente", running: "En cours", succeeded: "Brouillon créé", failed: "Échec", blocked: "Bloqué", cancelled: "Annulé", reconcile: "À réconcilier" };
type Mutate = (op: GrowthOperation, args: Record<string, unknown>) => Promise<boolean>;
function Field({ label, children }: {
    label: string;
    children: React.ReactNode;
}) { return <label className="grid gap-2 text-sm font-medium">{label}{children}</label>; }
function ProfileForm({ site, disabled, mutate }: {
    site: GrowthDashboard["site"];
    disabled: boolean;
    mutate: Mutate;
}) {
    const [profile, setProfile] = useState<GrowthProfile>(site.profile || {
        name: "TOK", positioning: "Aider les convives à trouver une table et les restaurateurs à présenter leur établissement à Genève.",
        audience: "Convives et restaurateurs de Genève et de Suisse romande.",
        voice: "Français de Suisse, ton concret et accueillant. Expliquer les étapes avec des exemples locaux vérifiés.",
        facts: "TOK propose une recherche de restaurants et un blog de guides. Vérifier pour chaque établissement les services activés et les conditions affichées avant publication.",
        approvedUrls: ["https://www.thetok.ch/blog", "https://www.thetok.ch/recherche", "https://www.thetok.ch/restaurateurs/geneve"],
    });
    const [approved, setApproved] = useState(false);
    function update(k: keyof GrowthProfile, v: string) { setProfile(p => ({ ...p, [k]: k === "approvedUrls" ? v.split("\n").filter(Boolean) : v })); }
    return <form className={panel} onSubmit={e => { e.preventDefault(); void mutate("admin_save_marketing_growth_profile", { expectedVersion: site.version, profile, approve: approved }); }}>
  <h3 className="font-semibold">Profil et voix éditoriale · version {site.profile_version}</h3>
  <p className="text-sm text-muted-foreground">Ces informations servent de référence aux prochains brouillons. Vérifiez les services, tarifs et conditions avant de les approuver.</p>
  {([["name", "Nom"], ["positioning", "Positionnement"], ["audience", "Publics et régions"], ["voice", "Voix éditoriale"], ["facts", "Faits et offres vérifiés"]] as const).map(([key, label]) => <Field key={key} label={label}><Textarea required maxLength={key === "facts" ? 12000 : key === "name" ? 120 : 2000} value={profile[key]} onChange={e => update(key, e.target.value)}/></Field>)}
  <Field label="URLs TOK approuvées, une par ligne"><Textarea required value={profile.approvedUrls.join("\n")} onChange={e => update("approvedUrls", e.target.value)}/></Field>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)}/>J’ai vérifié ces faits et j’approuve cette version du profil.</label>
  <Button disabled={disabled || !approved} type="submit">Approuver le profil</Button>
 </form>;
}
function Configuration({ site, reserved, disabled, mutate }: {
    site: GrowthDashboard["site"];
    reserved: number;
    disabled: boolean;
    mutate: Mutate;
}) {
    const [budget, setBudget] = useState(site.monthly_budget_micros === null ? "" : String(site.monthly_budget_micros / 1000000));
    const [paused, setPaused] = useState(site.paused);
    return <form className={panel} onSubmit={e => { e.preventDefault(); void mutate("admin_configure_marketing_growth", { expectedVersion: site.version, paused, budgetMicros: budget.trim() ? Math.round(Number(budget) * 1000000) : null }); }}>
  <h3 className="font-semibold">Exécution et budget</h3>
  <Field label="Plafond mensuel en CHF"><Input type="number" min="0" max="1000" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Non configuré"/></Field>
  <p className="text-sm text-muted-foreground">Réservé ce mois : {(reserved / 1000000).toFixed(2)} CHF. Il s’agit du plafond réservé, pas d’une facture fournisseur. Sans plafond, aucun appel IA ne part.</p>
  <label className="flex gap-2 text-sm"><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)}/>Suspendre les générations</label>
  <p className="text-sm text-muted-foreground">Le moteur commence avec revue humaine. La pause globale marketing reste prioritaire.</p>
  <Button type="submit" disabled={disabled}>Enregistrer les limites</Button>
 </form>;
}
function ArticleEditor({ article, revisions, profileVersion, disabled, mutate, offset }: {
    offset: number;
    article: GrowthArticle;
    revisions: GrowthRevision[];
    profileVersion: number;
    disabled: boolean;
    mutate: Mutate;
}) {
    const current = revisions.find(r => r.revision === article.current_revision);
    const [revisionLoading, setRevisionLoading] = useState(false);
    const [revisionError, setRevisionError] = useState("");
    const exportApproved = async () => {
        setRevisionLoading(true); setRevisionError("");
        try {
            const fresh = await loadGrowthDashboard(offset, article.id);
            const saved = fresh.articles.find(a => a.id === article.id);
            if (!saved || saved.version !== article.version) throw new Error("L’article a changé. Actualisez-le avant l’export.");
            const rev = fresh.revisions.find(r => r.article_id === saved.id && r.revision === saved.current_revision);
            const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
            const entry = approvedBlogEntry(saved, rev, fresh.site.profile_version, day);
            const url = URL.createObjectURL(new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" }));
            const link = window.document.createElement("a");
            link.href = url; link.download = saved.slug + ".json"; link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { setRevisionError(error instanceof Error ? error.message : "Export impossible."); }
        finally { setRevisionLoading(false); }
    };
    const [document, setDocument] = useState<GrowthDocument | null>(current?.document || null);
    const [brief, setBrief] = useState(article.brief);
    const [reason, setReason] = useState("");
    const [preview, setPreview] = useState(false);
    const update = (key: "title" | "description" | "summary", value: string) => setDocument(d => d ? { ...d, [key]: value } : d);
    return <section className={panel}>
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{article.slug}</h3><span className="text-sm text-muted-foreground">Version {article.version} · révision {article.current_revision || "—"}</span></div>
  <Field label="Brief de l’article"><Textarea maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)}/></Field>
  <div className="flex flex-wrap gap-2"><Button disabled={disabled || !profileVersion || brief !== article.brief} variant="outline" onClick={() => void mutate("admin_enqueue_marketing_growth_article", { articleId: article.id, expectedVersion: article.version })}>Demander un brouillon IA</Button>
   {!document ? <Button disabled={disabled} variant="outline" onClick={() => void mutate("admin_save_marketing_growth_article", { articleId: article.id, expectedVersion: article.version, slug: article.slug, brief })}>Enregistrer le brief</Button> : null}</div>
  <p className="text-sm text-muted-foreground">La génération utilise le brief enregistré. Modifiez puis enregistrez le brief avant de lancer un nouveau brouillon.</p>
  {revisions.length > 0 ? <Field label="Reprendre une révision"><select className="rounded-md border bg-background p-2" value="" disabled={revisionLoading} onChange={async (e) => { const revision = Number(e.target.value); if (!revision)
        return; setRevisionLoading(true); setRevisionError(""); try {
        const snapshot = await loadGrowthDashboard(0, article.id, revision);
        const r = snapshot.revisions.find(r => r.revision === revision);
        if (!r?.document)
            throw new Error("Version indisponible.");
        setDocument(r.document);
    }
    catch {
        setRevisionError("Cette révision n’a pas pu être chargée. Le texte en cours est conservé.");
    }
    finally {
        setRevisionLoading(false);
    } }}><option value="">Choisir parmi les 10 dernières versions</option>{revisions.map(r => <option key={r.revision} value={r.revision}>Révision {r.revision} · {r.origin} · {new Date(r.created_at).toLocaleDateString("fr-CH")}</option>)}</select></Field> : null}
  {revisionError ? <p role="alert">{revisionError}</p> : null}
  {document ? <>
   <div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(!preview)}>{preview ? "Modifier le texte" : "Prévisualiser"}</Button></div>
   {preview ? <article className="space-y-4 break-words"><h2 className="font-serif text-2xl">{document.title}</h2><p>{document.summary}</p>{document.sections.map((s, i) => <section key={i} className="space-y-2"><h3 className="font-semibold">{s.heading}</h3>{s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}</section>)}{document.faq.map((f, i) => <section key={i}><h3 className="font-semibold">{f.question}</h3><p>{f.answer}</p></section>)}</article> : <>
    <Field label="Titre"><Input maxLength={160} value={document.title} onChange={e => update("title", e.target.value)}/></Field>
    <Field label="Meta description"><Textarea maxLength={320} value={document.description} onChange={e => update("description", e.target.value)}/></Field>
    <Field label="Résumé"><Textarea maxLength={2000} value={document.summary} onChange={e => update("summary", e.target.value)}/></Field>
    {document.sections.map((section, index) => <fieldset key={index} className="space-y-3 rounded-xl border p-3"><legend className="text-sm">Section {index + 1}</legend>
     <Field label={`Titre de section ${index + 1}`}><Input maxLength={200} value={section.heading} onChange={e => setDocument(d => d ? { ...d, sections: d.sections.map((s, i) => i === index ? { ...s, heading: e.target.value } : s) } : d)}/></Field>
     <Field label={`Texte de section ${index + 1}`}><Textarea rows={6} value={section.paragraphs.join("\n\n")} onChange={e => setDocument(d => d ? { ...d, sections: d.sections.map((s, i) => i === index ? { ...s, paragraphs: e.target.value.split(/\n\s*\n/) } : s) } : d)}/></Field>
     <p className="text-xs text-muted-foreground">Sources citées : {section.sourceIds.join(", ")}</p>
    </fieldset>)}
    {document.faq.map((faq, index) => <fieldset key={index} className="space-y-3 rounded-xl border p-3"><legend className="text-sm">Question fréquente {index + 1}</legend>
     <Field label={`Question ${index + 1}`}><Input value={faq.question} maxLength={240} onChange={e => setDocument(d => d ? { ...d, faq: d.faq.map((f, i) => i === index ? { ...f, question: e.target.value } : f) } : d)}/></Field>
     <Field label={`Réponse ${index + 1}`}><Textarea value={faq.answer} maxLength={3000} onChange={e => setDocument(d => d ? { ...d, faq: d.faq.map((f, i) => i === index ? { ...f, answer: e.target.value } : f) } : d)}/></Field>
    </fieldset>)}
   </>}
   <p className="text-sm text-muted-foreground">Sources fournies par le profil approuvé ; leur contenu n’a pas été vérifié par une recherche web automatique. Relisez les affirmations et les liens.</p>
   <ul className="space-y-1 text-sm">{document.sources.map(s => <li key={s.id}><a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
   <Button disabled={disabled} onClick={() => void mutate("admin_save_marketing_growth_article", { articleId: article.id, expectedVersion: article.version, slug: article.slug, brief, document })}>Enregistrer une nouvelle révision</Button>
   <Field label="Motif de validation"><Textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Faits, sources, offres et liens relus…"/></Field>
   <Button variant="outline" disabled={disabled || reason.trim().length < 10 || current?.profile_version !== profileVersion || !sameDocument(document, current?.document) || brief !== article.brief} onClick={() => void mutate("admin_approve_marketing_growth_article", { articleId: article.id, expectedVersion: article.version, revision: article.current_revision, reason })}>Approuver la révision enregistrée</Button>
   {article.approved_revision ? <div className="space-y-2"><p role="status" className="text-sm">Révision {article.approved_revision} approuvée. Le fichier exporté peut être intégré au catalogue dans une PR de publication.</p>
    <Button variant="outline" disabled={disabled || revisionLoading || brief !== article.brief || !sameDocument(document, current?.document) || current?.profile_version !== profileVersion} onClick={() => void exportApproved()}>Exporter pour le blog TOK</Button></div> : null}
  </> : <p className="text-sm text-muted-foreground">Aucun texte généré pour ce sujet. Le brouillon apparaîtra après son traitement par le planificateur.</p>}
 </section>;
}
export default function MarketingGrowthView({ canMutateBackend }: {
    canMutateBackend: boolean;
}) {
    const [offset, setOffset] = useState(0);
    const [articleId, setArticleId] = useState<string>();
    const [tab, setTab] = useState("articles");
    const [slug, setSlug] = useState("");
    const [brief, setBrief] = useState("");
    const [pending, setPending] = useState(false);
    const [notice, setNotice] = useState<{
        error: boolean;
        text: string;
    } | null>(null);
    const query = useQuery({ queryKey: ["marketing-growth", offset, articleId || ""], queryFn: () => loadGrowthDashboard(offset, articleId), retry: false, refetchOnWindowFocus: false });
    const disabled = !canMutateBackend || pending || query.isFetching || query.isError;
    const mutate: Mutate = async (operation, args) => {
        if (disabled)
            return false;
        setPending(true);
        setNotice(null);
        try {
            await growthOperation(operation, args);
            await query.refetch({ throwOnError: true });
            setNotice({ error: false, text: "Modification enregistrée." });
            return true;
        }
        catch (error) {
            setNotice({ error: true, text: error instanceof Error ? error.message : "Action indisponible." });
            return false;
        }
        finally {
            setPending(false);
        }
    };
    const create = async (e: FormEvent) => { e.preventDefault(); if (await mutate("admin_save_marketing_growth_article", { slug, brief })) {
        setSlug("");
        setBrief("");
    } };
    const searchPanel = <><MarketingBlogAudit/><MarketingSearchConsole onBrief={!disabled && query.data && !brief && !slug ? text => { setBrief(text); setTab("articles"); } : undefined}/></>;
    if (query.isPending)
        return <p role="status">Chargement du moteur éditorial…</p>;
    if (query.isError || !query.data)
        return <div className="space-y-5">{searchPanel}<div role="alert" className={panel}>{query.error instanceof Error ? query.error.message : "Le moteur ne peut pas être chargé."}<Button variant="outline" onClick={() => void query.refetch()}>Réessayer</Button></div></div>;
    const d = query.data;
    const selected = d.articles.find(a => a.id === articleId);
    return <div className="space-y-5">
  <header className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-serif text-2xl"><BookOpen className="h-6 w-6"/>Moteur éditorial</h2><p className="mt-1 text-sm text-muted-foreground">Sujets, articles et versions TOK · validation avant diffusion</p></div><Button variant="outline" disabled={pending || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Actualiser</Button></div>
   <div className="flex flex-wrap gap-3 text-sm"><span>{d.site.paused ? "En pause" : "Générations autorisées"}</span><span>{d.total} sujet{d.total > 1 ? "s" : ""}</span><span>Profil {d.site.profile_version ? `v${d.site.profile_version}` : "à approuver"}</span><span>Budget {d.site.monthly_budget_micros === null ? "à configurer" : `${d.site.monthly_budget_micros / 1000000} CHF/mois`}</span></div>
  </header>
  {searchPanel}
  {notice ? <p role={notice.error ? "alert" : "status"} className={panel}>{notice.text}</p> : null}
  <nav aria-label="Moteur éditorial" className="flex flex-wrap gap-2">{[["articles", "Articles"], ["profile", "Profil et limites"], ["jobs", "Traitements"], ["readiness", "Activation"]].map(([id, label]) => <Button key={id} variant={tab === id ? "default" : "outline"} aria-pressed={tab === id} disabled={pending} onClick={() => setTab(id)}>{label}</Button>)}</nav>
  {tab === "profile" ? <div className="grid gap-5 xl:grid-cols-2"><ProfileForm key="profile" site={d.site} disabled={disabled} mutate={mutate}/><Configuration key="configuration" site={d.site} reserved={d.reservedMicros} disabled={disabled} mutate={mutate}/></div> : null}
  {tab === "articles" ? <div className="grid gap-5 xl:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]"><div className="space-y-5"><form className={panel} onSubmit={e => void create(e)}><h3 className="font-semibold">Nouveau sujet</h3><Field label="Slug"><Input required minLength={3} maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => setSlug(e.target.value)} placeholder="reserver-une-table-geneve"/></Field><Field label="Sujet et consignes"><Textarea required minLength={10} maxLength={4000} value={brief} onChange={e => setBrief(e.target.value)}/></Field><Button disabled={disabled} type="submit">Créer le sujet</Button></form>
   <section className={panel}><h3 className="font-semibold">Articles</h3>{d.articles.length ? d.articles.map(a => <button key={a.id} disabled={pending} onClick={() => setArticleId(a.id)} aria-pressed={a.id === articleId} className="block w-full break-words rounded-xl border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"><strong>{a.slug}</strong><span className="mt-1 block text-muted-foreground">{a.approved_revision ? `Révision ${a.approved_revision} approuvée` : a.current_revision ? "À relire" : "Sujet enregistré"}</span></button>) : <p className="text-sm text-muted-foreground">Aucun article enregistré.</p>}
   <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={offset === 0 || pending} onClick={() => { setOffset(o => Math.max(0, o - 20)); setArticleId(undefined); }}>Précédent</Button><span className="text-xs">{d.total ? offset + 1 : 0}–{Math.min(offset + 20, d.total)} / {d.total}</span><Button variant="outline" disabled={offset + 20 >= d.total || pending} onClick={() => { setOffset(o => o + 20); setArticleId(undefined); }}>Suivant</Button></div></section></div>
   {selected ? <ArticleEditor key={selected.id} offset={offset} article={selected} revisions={d.revisions} profileVersion={d.site.profile_version} disabled={disabled} mutate={mutate}/> : <section className={panel}><h3 className="font-semibold">Votre prochain article</h3><p className="text-sm text-muted-foreground">Créez un sujet, approuvez le profil et configurez les limites. Sélectionnez ensuite un article pour demander sa rédaction et relire ses versions.</p></section>}
  </div> : null}
  {tab === "jobs" ? <section className={panel}><h3 className="font-semibold">30 derniers traitements</h3><p className="text-sm text-muted-foreground">Une issue inconnue nécessite un rapprochement fournisseur. La réservation de coût est conservée ; aucune relance payante automatique.</p>{d.jobs.length ? d.jobs.map(j => <div key={j.id} className="flex flex-wrap justify-between gap-2 rounded-xl border p-3 text-sm"><span>{d.articles.find(a => a.id === j.article_id)?.slug || j.article_id}</span><span>{j.status === "queued" && j.error_code ? "Bloqué" : labels[j.status] || "État inconnu"}</span><span>{new Date(j.created_at).toLocaleString("fr-CH")}</span>{j.error_code ? <span className="w-full text-muted-foreground">{j.error_code === "budget_missing_or_exhausted" ? "Le plafond mensuel est absent ou épuisé. Configurez les limites." : j.error_code === "provider_cost_ceiling_missing" ? "Accès IA, modèle tarifé ou plafond par appel indisponible." : j.error_code === "stale_authorization_or_revision" ? "Le profil, les droits ou le brief ont changé." : j.error_code === "lease_expired_outcome_unknown" ? "Traitement interrompu : vérifier le résultat fournisseur." : "Résultat à vérifier avant toute nouvelle tentative."}</span> : null}</div>) : <p>Aucun traitement enregistré.</p>}</section> : null}
  {tab === "readiness" ? <section className={panel}><h3 className="font-semibold">Prérequis d’activation</h3><ul className="list-disc space-y-2 pl-5 text-sm"><li>Profil approuvé : {d.site.profile_version ? "oui" : "à renseigner"}.</li><li>Plafond mensuel : {d.site.monthly_budget_micros === null ? "absent" : "configuré"}.</li><li>Accès IA, modèle et plafond par appel : à vérifier sur le backend avant activation.</li><li>Le relevé Google est accessible sous « Recherche Google ». Une révision approuvée peut être exportée pour une PR de publication du blog.</li><li>Les campagnes et réseaux existants restent accessibles dans leurs onglets.</li></ul><p className="text-sm text-muted-foreground">Ce module prépare et valide les articles. Il ne revendique pas encore la parité complète ni la publication autonome.</p></section> : null}
 </div>;
}

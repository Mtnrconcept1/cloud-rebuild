import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mergeTokVideoJobs, requestTokVideo, type TokVideoJob, type TokVideoQuote } from "@/lib/ai/tokVideoClient";
import { validatePreparedRestaurantReel } from "@/lib/media/validateRestaurantReel";
import { assertSafeFileUpload, MAX_SOCIAL_MEDIA_UPLOAD_BYTES, SOCIAL_MEDIA_MIME_EXTENSIONS } from "@/lib/uploadSecurity";

const ACTIVE = new Set(["reserved", "submitting", "queued", "in_progress", "archiving"]);
const BLOCKING = new Set([...ACTIVE, "needs_review"]);
const STATUS: Record<string, string> = {
  reserved: "Demande enregistrée", submitting: "Envoi au moteur vidéo", queued: "Dans la file",
  in_progress: "Animation en cours", archiving: "Enregistrement dans TOK", completed: "Vidéo prête à vérifier",
  failed: "Génération échouée · crédits restitués", needs_review: "Vérification nécessaire",
};
const FAILURE_MESSAGES: Record<string, string> = {
  video_provider_auth_failed: "Le service vidéo refuse les identifiants API de TOK. Contactez le support avant de réessayer. Les crédits TOK ont été restitués.",
  video_provider_access_denied: "Higgsfield refuse l'accès au modèle. Le support TOK doit vérifier les droits et le solde du compte API Higgsfield avant un nouvel essai. Les crédits TOK ont été restitués.",
  video_provider_invalid_input: "Higgsfield refuse une photo ou les paramètres de cette vidéo. Vérifiez vos références ou importez-les à nouveau avant de réessayer. Les crédits TOK ont été restitués.",
  video_provider_endpoint_missing: "Ce modèle n'est pas accessible sur le compte API vidéo de TOK. Contactez le support. Les crédits TOK ont été restitués.",
  video_provider_rate_limited: "Higgsfield limite temporairement les demandes. Réessayez plus tard. Les crédits TOK ont été restitués.",
  video_provider_rejected: "Higgsfield a refusé cette demande. Le motif précis n'a pas été conservé par l'ancienne version. Les crédits TOK ont été restitués.",
};

export default function TokVideoAiPanel({ restaurantId, photoIds, logoId, prompt, disabled, onUseVideo }: {
  restaurantId: string; photoIds: string[]; logoId: string | null; prompt: string; disabled?: boolean;
  onUseVideo?: (file: File) => void | Promise<void>;
}) {
  const [interpretation, setInterpretation] = useState(false);
  const [audio, setAudio] = useState(false);
  const [quote, setQuote] = useState<{ signature: string; value: TokVideoQuote } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<TokVideoJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const pollLock = useRef(false);
  const attachAbort = useRef<AbortController | null>(null);
  const input = useMemo(() => ({ prompt, duration: 10, resolution: "720p", aspectRatio: "9:16",
    generateAudio: audio, referenceMediaId: photoIds[0] || null, referenceMediaIds: photoIds,
    logoMediaId: logoId, allowInterpretation: interpretation }), [prompt, photoIds, logoId, interpretation, audio]);
  const signature = JSON.stringify(input);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const currentQuote = quote?.signature === signature ? quote.value : null;
  const selected = jobs.find((job) => job.id === selectedId) || jobs[0] || null;
  const activeId = jobs.find((job) => ACTIVE.has(job.status)
    || (job.status === "needs_review" && job.canRefreshStatus === true))?.id;
  const blocked = jobs.some((job) => BLOCKING.has(job.status));
  const pendingKey = "tok:video-studio:pending:" + restaurantId;

  const refresh = useCallback(async () => {
    const result = await requestTokVideo<{ jobs: TokVideoJob[] }>(restaurantId, { action: "list" });
    if (alive.current) setJobs((current) => mergeTokVideoJobs(current, result.jobs || []));
  }, [restaurantId]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch((reason) => { if (alive.current) setError(reason instanceof Error ? reason.message : "Historique indisponible."); });
    return () => { alive.current = false; attachAbort.current?.abort(); };
  }, [refresh]);
  useEffect(() => { setConfirmed(false); }, [signature]);
  useEffect(() => { setReviewed(false); }, [selected?.id]);
  useEffect(() => {
    if (!activeId) return;
    const poll = async () => {
      if (document.visibilityState === "hidden" || pollLock.current) return;
      pollLock.current = true;
      try {
        const { job } = await requestTokVideo<{ job: TokVideoJob }>(restaurantId, { action: "status", jobId: activeId });
        if (alive.current) setJobs((current) => mergeTokVideoJobs(current, [job]));
      } catch { /* An interrupted status lookup never resubmits a paid job. */ }
      finally { pollLock.current = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 8000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [activeId, restaurantId]);

  const getQuote = async () => {
    if (lock.current || blocked || disabled || !photoIds.length || !interpretation || prompt.trim().length < 12) return;
    lock.current = true; setBusy(true); setError(null);
    const targetSignature = signature;
    try {
      const result = await requestTokVideo<{ quote: TokVideoQuote }>(restaurantId, { action: "quote", ...input });
      if (alive.current && signatureRef.current === targetSignature) {
        setQuote({ signature: targetSignature, value: result.quote }); setConfirmed(false);
      }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Devis indisponible."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const start = async () => {
    if (lock.current || blocked || disabled || !currentQuote || !confirmed || !interpretation) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      let previous: { key?: string; signature?: string } | null = null;
      try { previous = JSON.parse(localStorage.getItem(pendingKey) || "null"); } catch { /* Fresh request. */ }
      const idempotencyKey = previous?.signature === signature && previous.key ? previous.key : crypto.randomUUID();
      localStorage.setItem(pendingKey, JSON.stringify({ key: idempotencyKey, signature }));
      const result = await requestTokVideo<{ job: TokVideoJob }>(restaurantId, { action: "start", ...input, idempotencyKey,
        confirmedCredits: currentQuote.credits, confirmedModel: currentQuote.model });
      localStorage.removeItem(pendingKey);
      if (alive.current) {
        setJobs((current) => mergeTokVideoJobs(current, [result.job]));
        setSelectedId(result.job.id); setQuote(null); setConfirmed(false);
      }
    } catch (reason) {
      if (alive.current) {
        setQuote(null); setConfirmed(false);
        setError((reason instanceof Error ? reason.message : "Envoi interrompu.") + " Consultez l'historique avant de réessayer.");
        void refresh().catch(() => {});
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const attach = async () => {
    if (!selected || !reviewed || !onUseVideo || lock.current || selected.duration !== 10 || selected.aspectRatio !== "9:16") return;
    lock.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); attachAbort.current = controller;
    try {
      const { job } = await requestTokVideo<{ job: TokVideoJob }>(restaurantId, { action: "status", jobId: selected.id });
      if (job.status !== "completed" || !job.videoUrl) throw new Error("Cette vidéo n'est pas encore disponible.");
      const response = await fetch(job.videoUrl, { credentials: "omit", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) });
      if (!response.ok) throw new Error("Téléchargement interrompu. Réessayez depuis l'historique.");
      if (Number(response.headers.get("content-length")) > MAX_SOCIAL_MEDIA_UPLOAD_BYTES) throw new Error("Cette vidéo dépasse les 25 Mo autorisés dans Actualité.");
      const blob = await response.blob();
      const file = new File([blob], "reel-restaurant-ia-10s.mp4", { type: blob.type.split(";")[0] });
      assertSafeFileUpload(file, { allowedMimeTypes: SOCIAL_MEDIA_MIME_EXTENSIONS, maxBytes: MAX_SOCIAL_MEDIA_UPLOAD_BYTES, label: "Reel" });
      const prepared = await validatePreparedRestaurantReel(file, controller.signal);
      if (alive.current) await onUseVideo(prepared);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Impossible d'ajouter cette vidéo."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      L'IA anime les références et peut modifier des détails. Vérifiez chaque résultat. Pour garder vos photos et votre logo d'origine, utilisez le mode Reel fidèle.
    </div>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-orange-600"
      checked={interpretation} onChange={(event) => setInterpretation(event.target.checked)} disabled={busy} />
      J'autorise une interprétation animée des photos sélectionnées. Aucun autre sujet ne doit être ajouté.</label>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-orange-600"
      checked={audio} onChange={(event) => setAudio(event.target.checked)} disabled={busy} />Ajouter une ambiance sonore sans voix</label>
    {!photoIds.length ? <p className="text-sm text-muted-foreground">Sélectionnez au moins une photo à animer.</p> : null}
    {currentQuote ? <div className="space-y-3 rounded-2xl border p-4">
      <p className="text-2xl font-semibold">{currentQuote.credits} crédits TOK <span className="text-sm font-normal text-muted-foreground">· 10 s · vertical HD</span></p>
      <p className="text-xs text-muted-foreground">Débit maximal confirmé : {currentQuote.maxChargedChf.toFixed(2)} CHF de crédits. Le résultat est conservé dans votre historique.</p>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="h-4 w-4 accent-orange-600" />Je confirme le débit de {currentQuote.credits} crédits.</label>
      <Button onClick={start} disabled={busy || disabled || !confirmed || !interpretation || blocked} className="min-h-11 bg-orange-600 hover:bg-orange-700">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}Confirmer et générer
      </Button>
    </div> : <Button onClick={getQuote} disabled={busy || disabled || !interpretation || !photoIds.length || prompt.trim().length < 12 || blocked} className="min-h-11 bg-orange-600 hover:bg-orange-700">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Obtenir le devis de l'animation
    </Button>}
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Vos animations</h3>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh().catch((reason) => setError(reason.message))}><RefreshCcw className="mr-2 h-4 w-4" />Actualiser</Button></div>
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">{jobs.length ? jobs.map((job) => <button type="button" key={job.id} aria-pressed={selected?.id === job.id}
        onClick={() => setSelectedId(job.id)} disabled={busy} className={"w-full rounded-xl border p-3 text-left " + (selected?.id === job.id ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "hover:border-orange-200")}>
        <span className="line-clamp-2 text-sm font-medium">{job.prompt}</span><span className="mt-2 block text-xs text-muted-foreground">{STATUS[job.status] || job.status} · {job.duration} s</span>
      </button>) : <p className="text-sm text-muted-foreground">Vos 20 dernières générations apparaîtront ici.</p>}</div>
      {selected ? <div className="space-y-3 rounded-2xl border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">{ACTIVE.has(selected.status) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{STATUS[selected.status]}</p>
        {selected.status === "completed" && selected.videoUrl ? <>
          <video key={selected.videoUrl} src={selected.videoUrl} controls playsInline preload="metadata" className="max-h-[440px] w-full rounded-xl bg-black object-contain" aria-label="Animation à vérifier" />
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-orange-600" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />J'ai vérifié la vidéo : elle respecte mon restaurant et ne contient aucun élément non souhaité.</label>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={selected.videoUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-2 h-4 w-4" />Ouvrir la vidéo</a></Button>
            {onUseVideo && selected.duration === 10 && selected.aspectRatio === "9:16" ? <Button disabled={!reviewed || busy} onClick={attach}>Ajouter au brouillon</Button> : null}</div>
        </> : <p className="text-sm text-muted-foreground">{selected.status === "needs_review"
          ? selected.canRefreshStatus
            ? "La demande est enregistrée chez le fournisseur. TOK reprend la vérification et l'enregistrement de votre vidéo, sans nouvelle génération ni nouveau débit."
            : "La réponse du fournisseur est incertaine. La demande est conservée pour éviter une double facturation ; contactez le support."
          : selected.status === "failed" ? FAILURE_MESSAGES[selected.errorCode || ""] || "Le fournisseur a refusé ou interrompu cette génération. Les crédits TOK ont été restitués."
            : "Le traitement continue côté serveur. Vous pouvez quitter cette page et revenir plus tard."}</p>}
      </div> : null}
    </div>
  </div>;
}

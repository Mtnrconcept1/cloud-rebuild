import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mergeTokVideoJobs, readTokVideoStudioDraft, requestTokVideo, type TokVideoJob, type TokVideoQuote, type TokVideoStudioDraft } from "@/lib/ai/tokVideoClient";
import { validatePreparedRestaurantReel } from "@/lib/media/validateRestaurantReel";
import { assertSafeFileUpload, MAX_SOCIAL_MEDIA_UPLOAD_BYTES, SOCIAL_MEDIA_MIME_EXTENSIONS } from "@/lib/uploadSecurity";
import TokVideoMarketingSettingsForm, { type TokVideoSelectedPhoto } from "./TokVideoMarketingSettings";
import { TOK_VIDEO_CREATIVE_FORMATS } from "../../../supabase/functions/_shared/higgsfield-marketing-settings";

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
  video_provider_temporarily_blocked: "Le modèle vidéo est temporairement indisponible chez Higgsfield. Réessayez plus tard. Les crédits TOK ont été restitués.",
  video_provider_rate_limited: "Higgsfield limite temporairement les demandes. Réessayez plus tard. Les crédits TOK ont été restitués.",
  video_provider_rejected: "Higgsfield a refusé cette demande. Le motif précis n'a pas été conservé par l'ancienne version. Les crédits TOK ont été restitués.",
};

type Props = {
  restaurantId: string; photoIds: string[]; logoId: string | null; prompt: string; disabled?: boolean;
  disabledReason?: string;
  mode?: "marketing" | "reel";
  selectedPhotos?: TokVideoSelectedPhoto[];
  onUseVideo?: (file: File) => void | Promise<void>;
};

export default function TokVideoAiPanel(props: Props) {
  return <TokVideoAiPanelContent key={props.restaurantId} {...props} />;
}

function canAttachToActualites(job: TokVideoJob) {
  return job.duration === 10 && job.aspectRatio === "9:16" && job.resolution === "720p"
    && (job.outputFormat || "mp4") === "mp4";
}

function TokVideoAiPanelContent({ restaurantId, photoIds, logoId, prompt, disabled, disabledReason, selectedPhotos, mode = "marketing", onUseVideo }: Props) {
  const settingsKey = "tok:video-studio:settings:v2:" + restaurantId;
  const [draft, setDraft] = useState<TokVideoStudioDraft>(() => {
    try { return readTokVideoStudioDraft(localStorage.getItem(settingsKey)); }
    catch { return readTokVideoStudioDraft(null); }
  });
  const [saveWarning, setSaveWarning] = useState(false);
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
  const pendingSubmission = useRef<{ key: string; signature: string } | null | undefined>(undefined);
  const input = useMemo(() => ({ prompt, duration: mode === "reel" ? 10 : draft.duration,
    resolution: mode === "reel" ? "720p" : draft.resolution, aspectRatio: mode === "reel" ? "9:16" : draft.aspectRatio,
    outputFormat: mode === "reel" ? "mp4" : draft.outputFormat, bitrateMode: draft.bitrateMode,
    generateAudio: draft.marketing.audioMode !== "silent", referenceMediaId: photoIds[0] || null, referenceMediaIds: photoIds,
    logoMediaId: logoId, allowInterpretation: draft.interpretation, marketing: draft.marketing }), [prompt, photoIds, logoId, draft, mode]);
  const photoChoices = useMemo(() => photoIds.map((id, index) => selectedPhotos?.find((photo) => photo.id === id)
    || { id, label: "Photo " + (index + 1) }), [photoIds, selectedPhotos]);
  const missingRole = [draft.marketing.productMediaId, draft.marketing.avatarMediaId,
    draft.marketing.startImageMediaId, draft.marketing.endImageMediaId].some((id) => id && !photoIds.includes(id));
  const voiceoverReady = draft.marketing.audioMode !== "voiceover" || Boolean(draft.marketing.voiceoverText.trim());
  const inputsReady = photoIds.length > 0 && prompt.trim().length >= 12 && prompt.trim().length <= 1000 && !missingRole && voiceoverReady;
  const signature = JSON.stringify(input);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const currentQuote = quote?.signature === signature ? quote.value : null;
  const selected = jobs.find((job) => job.id === selectedId) || jobs[0] || null;
  const activeId = jobs.find((job) => ACTIVE.has(job.status)
    || (job.status === "needs_review" && job.canRefreshStatus === true))?.id;
  const blocked = jobs.some((job) => BLOCKING.has(job.status));
  const pendingKey = "tok:video-studio:pending:" + restaurantId;

  useEffect(() => {
    try { localStorage.setItem(settingsKey, JSON.stringify(draft)); setSaveWarning(false); }
    catch { setSaveWarning(true); }
  }, [draft, settingsKey]);

  const readPending = useCallback(() => {
    if (pendingSubmission.current !== undefined) return pendingSubmission.current;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(pendingKey) || "null");
      if (value && typeof value === "object" && "key" in value && typeof value.key === "string"
        && "signature" in value && typeof value.signature === "string") {
        pendingSubmission.current = { key: value.key, signature: value.signature };
      } else pendingSubmission.current = null;
    } catch { pendingSubmission.current = null; }
    return pendingSubmission.current;
  }, [pendingKey]);
  const clearPending = useCallback((expectedKey: string) => {
    if (pendingSubmission.current?.key === expectedKey) pendingSubmission.current = null;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(pendingKey) || "null");
      if (stored && typeof stored === "object" && "key" in stored && stored.key === expectedKey) localStorage.removeItem(pendingKey);
    } catch { /* The server receipt remains authoritative. */ }
  }, [pendingKey]);
  const acceptJobs = useCallback((incoming: TokVideoJob[]) => {
    if (!alive.current) return;
    const pending = readPending();
    // A recovered receipt resolves a lost start response, even after a reload.
    if (pending && incoming.some((job) => job.idempotencyKey === pending.key)) clearPending(pending.key);
    setJobs((current) => mergeTokVideoJobs(current, incoming));
  }, [readPending, clearPending]);
  const refresh = useCallback(async () => {
    const result = await requestTokVideo<{ jobs: TokVideoJob[] }>(restaurantId, { action: "list" });
    acceptJobs(result.jobs || []);
  }, [restaurantId, acceptJobs]);
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
        acceptJobs([job]);
      } catch { /* An interrupted status lookup never resubmits a paid job. */ }
      finally { pollLock.current = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 8000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [activeId, restaurantId, acceptJobs]);

  const getQuote = async () => {
    if (lock.current || blocked || disabled || !inputsReady || !draft.interpretation) return;
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
    if (lock.current || blocked || disabled || !currentQuote || !confirmed || !draft.interpretation || !inputsReady) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const previous = readPending();
      const idempotencyKey = previous?.signature === signature && previous.key ? previous.key : crypto.randomUUID();
      pendingSubmission.current = { key: idempotencyKey, signature };
      try { localStorage.setItem(pendingKey, JSON.stringify(pendingSubmission.current)); } catch { /* Retain the key in memory. */ }
      const result = await requestTokVideo<{ job: TokVideoJob }>(restaurantId, { action: "start", ...input, idempotencyKey,
        confirmedCredits: currentQuote.credits, confirmedModel: currentQuote.model });
      clearPending(idempotencyKey);
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
    if (!selected || !reviewed || !onUseVideo || lock.current || !canAttachToActualites(selected)) return;
    lock.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); attachAbort.current = controller;
    try {
      const { job } = await requestTokVideo<{ job: TokVideoJob }>(restaurantId, { action: "status", jobId: selected.id });
      if (job.status !== "completed" || !job.videoUrl) throw new Error("Cette vidéo n'est pas encore disponible.");
      if (!canAttachToActualites(job)) throw new Error("L'ajout à Actualité exige un MP4 vertical de 10 secondes en 720p.");
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
    <TokVideoMarketingSettingsForm value={draft} selectedPhotos={photoChoices} mode={mode} disabled={busy}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} />
    {saveWarning ? <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Les réglages restent disponibles tant que cette page est ouverte ; leur sauvegarde sur cet appareil est indisponible.</p> : null}
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
      L'IA anime les références et peut modifier des détails. Vérifiez chaque résultat. Pour garder vos photos et votre logo d'origine, utilisez le mode Reel fidèle.
    </div>
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600"
      checked={draft.interpretation} onChange={(event) => setDraft((current) => ({ ...current, interpretation: event.target.checked }))} disabled={busy} />
      <span className="min-w-0 break-words">J'autorise une interprétation animée des photos sélectionnées. Aucun autre sujet ne doit être ajouté.</span></label>
    {!photoIds.length ? <p className="text-sm text-muted-foreground">Sélectionnez au moins une photo à animer.</p> : null}
    {disabled && disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
    {prompt.trim().length < 12 ? <p className="text-sm text-muted-foreground">Complétez vos consignes artistiques avec au moins 12 caractères avant de demander le devis.</p> : null}
    {missingRole ? <p className="text-sm text-destructive">Une photo attribuée à un rôle a été retirée. Mettez à jour les références ci-dessus.</p> : null}
    {!voiceoverReady ? <p className="text-sm text-muted-foreground">Écrivez le texte exact de la voix off pour obtenir le devis.</p> : null}
    {currentQuote ? <div className="space-y-3 rounded-2xl border p-4">
      <p className="text-2xl font-semibold">{currentQuote.credits} crédits TOK</p>
      <p className="text-sm text-muted-foreground">{input.duration} s · {input.aspectRatio} · {input.resolution} · {input.outputFormat.toUpperCase()} · {input.generateAudio ? "avec son" : "sans son"}</p>
      <p className="text-xs text-muted-foreground">Débit maximal confirmé : {currentQuote.maxChargedChf.toFixed(2)} CHF de crédits. Le résultat est conservé dans votre historique.</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm"><input type="checkbox" checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} className="h-5 w-5 shrink-0 accent-orange-600" /><span className="min-w-0 break-words">Je confirme le débit de {currentQuote.credits} crédits.</span></label>
      <Button onClick={start} disabled={busy || disabled || !confirmed || !draft.interpretation || blocked || !inputsReady} className="h-auto min-h-11 w-full whitespace-normal bg-orange-600 text-center hover:bg-orange-700 sm:w-auto">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}Confirmer et générer
      </Button>
    </div> : <Button onClick={getQuote} disabled={busy || disabled || !draft.interpretation || !inputsReady || blocked} className="h-auto min-h-11 w-full whitespace-normal bg-orange-600 text-center hover:bg-orange-700 sm:w-auto">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Obtenir le devis de l'animation
    </Button>}
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Vos animations</h3>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh().catch((reason) => setError(reason.message))}><RefreshCcw className="mr-2 h-4 w-4" />Actualiser</Button></div>
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">{jobs.length ? jobs.map((job) => <button type="button" key={job.id} aria-pressed={selected?.id === job.id}
        onClick={() => setSelectedId(job.id)} disabled={busy} className={"w-full rounded-xl border p-3 text-left " + (selected?.id === job.id ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "hover:border-orange-200")}>
        <span className="line-clamp-2 text-sm font-medium">{job.prompt}</span><span className="mt-2 block text-xs text-muted-foreground">{STATUS[job.status] || job.status}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{job.duration} s · {job.aspectRatio} · {job.resolution} · {(job.outputFormat || "mp4").toUpperCase()}</span>
      </button>) : <p className="text-sm text-muted-foreground">Vos 20 dernières générations apparaîtront ici.</p>}</div>
      {selected ? <div className="space-y-3 rounded-2xl border p-3">
        <p className="flex items-center gap-2 text-sm font-medium">{ACTIVE.has(selected.status) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{STATUS[selected.status]}</p>
        <p className="text-xs text-muted-foreground">{selected.duration} s · {selected.aspectRatio} · {selected.resolution} · {(selected.outputFormat || "mp4").toUpperCase()} · {selected.generateAudio ? "avec son" : "sans son"}</p>
        {selected.marketing ? <p className="text-sm text-muted-foreground">{TOK_VIDEO_CREATIVE_FORMATS.find((format) => format.id === selected.marketing?.creativeFormat)?.label || "Direction personnalisée"}{selected.marketing.audioMode === "voiceover" ? " · voix off" : ""}</p> : null}
        {selected.status === "completed" && selected.videoUrl ? <>
          <video key={selected.videoUrl} src={selected.videoUrl} controls playsInline preload="metadata" className="max-h-[440px] w-full rounded-xl bg-black object-contain" aria-label="Animation à vérifier" />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /><span className="min-w-0 break-words">J'ai vérifié la vidéo : elle respecte mon restaurant et ne contient aucun élément non souhaité.</span></label>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={selected.videoUrl} target="_blank" rel="noopener noreferrer"><Download className="mr-2 h-4 w-4" />Ouvrir la vidéo</a></Button>
            {onUseVideo && canAttachToActualites(selected) ? <Button disabled={!reviewed || busy} onClick={attach}>Ajouter au brouillon</Button> : null}</div>
          {selected.outputFormat === "mov" ? <p className="text-xs text-muted-foreground">Fichier MOV : utilisez « Ouvrir la vidéo » pour le télécharger si votre navigateur ne le lit pas.</p> : null}
          {onUseVideo && !canAttachToActualites(selected) ? <p className="text-xs text-muted-foreground">Cette vidéo reste téléchargeable. L’ajout à Actualité nécessite un MP4 de 10 secondes, 9:16 et 720p.</p> : null}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, RefreshCcw, Sparkles, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  requestTokVideo, type TokVideoJob, type TokVideoOptionsInput, type TokVideoQuote,
} from "@/lib/ai/tokVideoClient";

type MediaReference = { id: string; media_url: string; alt_text: string | null };
type PendingRequest = { signature: string; key: string };
const DEFAULT_OPTIONS: TokVideoOptionsInput = {
  prompt: "", duration: 5, resolution: "720p",
  aspectRatio: "9:16", generateAudio: true, referenceMediaId: null,
};
const ACTIVE_STATUSES = new Set(["reserved", "submitting", "queued", "in_progress", "archiving"]);
const VIDEO_FAILURE_MESSAGES: Record<string, string> = {
  video_provider_auth_failed: "Higgsfield refuse les identifiants API. Vérifiez la configuration serveur de la clé Higgsfield. Vos crédits TOK ont été restitués.",
  video_provider_access_denied: "Higgsfield refuse l'accès au modèle (droits ou solde de crédits fournisseur). Vérifiez le compte API Higgsfield avant de réessayer. Vos crédits TOK ont été restitués.",
  video_provider_invalid_input: "Higgsfield refuse la photo ou les paramètres de cette vidéo. Vérifiez la photo et essayez éventuellement sans référence. Vos crédits TOK ont été restitués.",
  video_provider_endpoint_missing: "Le modèle vidéo demandé n'est pas accessible par cette clé Higgsfield. Vérifiez les droits du compte. Vos crédits TOK ont été restitués.",
  video_provider_rate_limited: "Higgsfield limite temporairement les demandes. Réessayez ultérieurement. Vos crédits TOK ont été restitués.",
  video_provider_rejected: "Higgsfield a refusé cette demande avant la génération. Le motif précis n'a pas été conservé par la version précédente. Les crédits TOK ont été restitués.",
};
const statusLabels: Record<string, string> = {
  reserved: "Enregistrement", submitting: "Envoi à Higgsfield",
  queued: "Dans la file", in_progress: "Génération en cours",
  archiving: "Enregistrement dans TOK", completed: "Vidéo prête",
  failed: "Génération refusée ou échouée", needs_review: "Vérification nécessaire",
};

export default function TokAiVideoStudio({ restaurantId }: { restaurantId: string }) {
  const { toast } = useToast();
  const [options, setOptions] = useState<TokVideoOptionsInput>(DEFAULT_OPTIONS);
  const [quote, setQuote] = useState<TokVideoQuote | null>(null);
  const [quotedSignature, setQuotedSignature] = useState<string | null>(null);
  const [confirmCost, setConfirmCost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<TokVideoJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [references, setReferences] = useState<MediaReference[]>([]);
  const stillMounted = useRef(true);
  const activeRestaurantRef = useRef(restaurantId);
  const requestInProgress = useRef(false);
  const signature = useMemo(() => JSON.stringify(options), [options]);
  const selectedJob = history.find((item) => item.id === selectedJobId) || history[0] || null;
  const activeJobId = selectedJob && ACTIVE_STATUSES.has(selectedJob.status) ? selectedJob.id : null;
  const currentQuote = signature === quotedSignature ? quote : null;
  const localKey = "tok:video-studio:pending:" + restaurantId;

  const refreshJobs = useCallback(async () => {
    if (!restaurantId) return;
    const data = await requestTokVideo<{ jobs: TokVideoJob[] }>(restaurantId, { action: "list" });
    if (!stillMounted.current || activeRestaurantRef.current !== restaurantId) return;
    setHistory(data.jobs || []);
    setSelectedJobId((id) => id && (data.jobs || []).some((item) => item.id === id)
      ? id : data.jobs?.[0]?.id || null);
  }, [restaurantId]);

  useEffect(() => {
    stillMounted.current = true;
    activeRestaurantRef.current = restaurantId;
    setHistory([]);
    setSelectedJobId(null);
    setOptions(DEFAULT_OPTIONS);
    setQuote(null);
    setQuotedSignature(null);
    setConfirmCost(false);
    let cancelled = false;
    void refreshJobs().catch(() => {});
    const supabase = getSupabase();
    void supabase.from("restaurant_media")
      .select("id, media_url, alt_text, media_type")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(24)
      .then(({ data }) => {
        if (!stillMounted.current || cancelled || activeRestaurantRef.current !== restaurantId) return;
        const images = (data || []).filter((row) =>
          typeof row.media_url === "string" && row.media_url.startsWith("https://") &&
          !String(row.media_type || "").toLowerCase().includes("video"));
        setReferences(images.slice(0, 12).map((row) => ({
          id: row.id, media_url: row.media_url, alt_text: row.alt_text,
        })));
      });
    return () => { cancelled = true; stillMounted.current = false; };
  }, [restaurantId, refreshJobs]);

  const pollJob = useCallback(async (id: string) => {
    if (!restaurantId || requestInProgress.current) return;
    requestInProgress.current = true;
    try {
      const { job } = await requestTokVideo<{ job: TokVideoJob }>(
        restaurantId, { action: "status", jobId: id },
      );
      if (!stillMounted.current || activeRestaurantRef.current !== restaurantId) return;
      setHistory((items) => [job, ...items.filter((item) => item.id !== job.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } finally {
      requestInProgress.current = false;
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!activeJobId) return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        void pollJob(activeJobId).catch(() => {});
      }
    };
    const timer = window.setInterval(tick, 8_000);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [activeJobId, pollJob]);

  const update = (patch: Partial<TokVideoOptionsInput>) => {
    setOptions((current) => ({ ...current, ...patch }));
    setQuote(null);
    setQuotedSignature(null);
    setConfirmCost(false);
    setErrorMessage(null);
  };

  const requestQuote = async () => {
    if (!restaurantId) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await requestTokVideo<{ quote: TokVideoQuote }>(
        restaurantId, { action: "quote", ...options },
      );
      setQuote(response.quote);
      setQuotedSignature(signature);
      setConfirmCost(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Devis indisponible.");
    } finally { setBusy(false); }
  };

  const startVideo = async () => {
    if (!currentQuote || !confirmCost || busy || !restaurantId) return;
    setBusy(true);
    setErrorMessage(null);
    let existing: PendingRequest | null = null;
    try { existing = JSON.parse(window.localStorage.getItem(localKey) || "null") as PendingRequest | null; }
    catch { existing = null; }
    const idempotencyKey = existing?.signature === signature && existing.key
      ? existing.key : crypto.randomUUID();
    try {
      window.localStorage.setItem(localKey, JSON.stringify({ signature, key: idempotencyKey }));
      const result = await requestTokVideo<{ job: TokVideoJob; reused: boolean }>(
        restaurantId, { action: "start", ...options, idempotencyKey },
      );
      setHistory((items) => [result.job, ...items.filter((item) => item.id !== result.job.id)]);
      setSelectedJobId(result.job.id);
      toast({
        title: result.reused ? "Génération retrouvée" : "Génération lancée",
        description: "Le traitement continue côté serveur, même si vous quittez cette page.",
      });
      setQuote(null);
      setQuotedSignature(null);
      setConfirmCost(false);
      window.localStorage.removeItem(localKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Génération indisponible.";
      setErrorMessage(message + " Consultez l’historique avant de réessayer.");
      void refreshJobs().catch(() => {});
    } finally { setBusy(false); }
  };

  const refreshSelected = async () => {
    setRefreshing(true);
    try {
      if (selectedJob) await pollJob(selectedJob.id);
      else await refreshJobs();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Statut indisponible.");
    } finally { setRefreshing(false); }
  };

  return (
    <section className="space-y-5" aria-label="Studio vidéo Higgsfield">
      <Card className="border-orange-200 bg-orange-50/50 shadow-sm dark:border-orange-900/50 dark:bg-orange-950/10">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Film className="h-6 w-6 text-orange-600" aria-hidden="true" />
            <CardTitle className="text-xl">Studio vidéo publicitaire</CardTitle>
            <span className="rounded-full bg-orange-600 px-2 py-1 text-xs font-semibold text-white">Higgsfield · Seedance 2.5</span>
          </div>
          <CardDescription>
            Donnez vie à votre restaurant en vidéo. Votre nom, votre cuisine et une photo de référence
            peuvent être utilisés dans le brief. Aucun contenu n’est publié automatiquement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tok-video-prompt">Décrivez votre publicité</Label>
            <Textarea id="tok-video-prompt" value={options.prompt} maxLength={1000}
              onChange={(event) => update({ prompt: event.target.value })}
              placeholder="Ex. : Travelling cinématographique sur une table élégante, assiettes appétissantes, ambiance chaleureuse et accueillante, éclairage premium..."
              className="min-h-32 border-orange-200" />
            <p className="text-xs text-muted-foreground">{options.prompt.trim().length}/1 000 caractères · une seule scène par vidéo</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tok-video-duration">Durée</Label>
              <select id="tok-video-duration" value={options.duration}
                onChange={(event) => update({ duration: Number(event.target.value) as 5 | 10 })}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="5">5 secondes</option><option value="10">10 secondes</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tok-video-resolution">Résolution</Label>
              <select id="tok-video-resolution" value={options.resolution}
                onChange={(event) => update({ resolution: event.target.value as "480p" | "720p" })}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="720p">720p · HD</option><option value="480p">480p · Éco</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tok-video-ratio">Format</Label>
              <select id="tok-video-ratio" value={options.aspectRatio}
                onChange={(event) => update({ aspectRatio: event.target.value as TokVideoOptionsInput["aspectRatio"] })}
                disabled={Boolean(options.referenceMediaId)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="9:16">9:16 · Story</option>
                <option value="16:9">16:9 · Paysage</option>
                <option value="1:1">1:1 · Carré</option>
              </select>
            </div>
          </div>
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <input type="checkbox" checked={options.generateAudio}
              onChange={(event) => update({ generateAudio: event.target.checked })}
              className="h-4 w-4 accent-orange-600" />
            Générer le son avec la vidéo
          </label>
          <div className="space-y-2">
            <Label htmlFor="tok-video-image">Photo de référence (facultative)</Label>
            <select id="tok-video-image" value={options.referenceMediaId || ""}
              onChange={(event) => update({ referenceMediaId: event.target.value || null })}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Sans photo · texte vers vidéo</option>
              {references.map((item, index) => (
                <option key={item.id} value={item.id}>{item.alt_text || "Photo restaurant " + (index + 1)}</option>
              ))}
            </select>
            {options.referenceMediaId ? (
              <p className="text-xs text-muted-foreground">L’image fixe le cadrage initial ; le format sera déduit de cette photo.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Sélectionner une photo aide à garder des détails visuels réels.</p>
            )}
          </div>
          <div className="rounded-2xl border border-orange-200 bg-white p-4 dark:bg-background">
            {!currentQuote ? (
              <Button type="button" className="min-h-11 gap-2 bg-orange-600 hover:bg-orange-700"
                disabled={busy || options.prompt.trim().length < 12}
                onClick={requestQuote}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Obtenir un devis avant génération
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-2xl font-bold text-orange-700">{currentQuote.credits} crédits TOK</span>
                  <span className="text-sm text-muted-foreground">soit {currentQuote.maxChargedChf.toFixed(2)} CHF de crédits</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Plafond de crédits confirmé pour ce rendu, calculé sur le tarif fournisseur maximal annoncé.
                  Coût fournisseur estimé : {currentQuote.estimatedProviderChf.toFixed(2)} CHF.
                  Une seule réservation de crédits est effectuée par demande.
                </p>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" checked={confirmCost}
                    onChange={(event) => setConfirmCost(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-orange-600" />
                  Je confirme le débit de {currentQuote.credits} crédits pour cette génération.
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="min-h-11 bg-orange-600 hover:bg-orange-700"
                    disabled={!confirmCost || busy} onClick={startVideo}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                    Confirmer et générer
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setQuote(null); setQuotedSignature(null); setConfirmCost(false); }}>
                    Modifier le devis
                  </Button>
                </div>
              </div>
            )}
          </div>
          {errorMessage ? (
            <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card className="border-orange-200">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle className="text-lg">Vos vidéos</CardTitle>
              <CardDescription>Historique persistant · 20 dernières demandes</CardDescription></div>
            <Button type="button" variant="outline" size="sm" onClick={refreshSelected} disabled={refreshing}>
              <RefreshCcw className={refreshing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="min-w-0 space-y-2">
            {history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune vidéo créée pour ce restaurant.</p> : null}
            {history.map((job) => (
              <button key={job.id} type="button" aria-pressed={selectedJob?.id === job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={"block w-full rounded-xl border p-3 text-left transition " +
                  (selectedJob?.id === job.id ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "hover:border-orange-200")}>
                <span className="block truncate text-sm font-semibold">{job.prompt}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{statusLabels[job.status] || job.status} · {job.duration}s · {job.credits} crédits</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 space-y-3 rounded-2xl border bg-background p-3">
            {!selectedJob ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">Votre prochaine vidéo s’affichera ici.</div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {selectedJob.status === "completed"
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : ACTIVE_STATUSES.has(selectedJob.status)
                      ? <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                      : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {statusLabels[selectedJob.status] || selectedJob.status}
                </div>
                {selectedJob.videoUrl && selectedJob.status === "completed" ? (
                  <>
                    <video controls playsInline preload="metadata" src={selectedJob.videoUrl}
                      className="max-h-[480px] w-full rounded-xl bg-black object-contain"
                      aria-label="Vidéo publicitaire générée" />
                    <a href={selectedJob.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                      <Download className="h-4 w-4" /> Ouvrir ou télécharger la vidéo
                    </a>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {selectedJob.status === "needs_review"
                      ? "La réponse du fournisseur est incertaine. TOK conserve la réservation pour éviter une double facturation. Contactez le support avant une nouvelle tentative."
                      : selectedJob.status === "failed"
                        ? VIDEO_FAILURE_MESSAGES[selectedJob.errorCode || ""] || "La génération a échoué. Les crédits TOK ont été restitués après confirmation du refus fournisseur."
                        : "La génération se poursuit côté serveur. Vous pouvez quitter cet onglet et revenir plus tard."}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Demandée le {new Date(selectedJob.createdAt).toLocaleString("fr-CH")}</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

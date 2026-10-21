import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RefreshCw, Send, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  loadMarketingContentReview,
  retryMarketingContentReview,
  type MarketingContentReviewFailureCode,
  type MarketingContentReviewState,
  type MarketingContentReviewTarget,
} from "@/marketing/contentReviewClient";

const STATUS_COPY: Record<MarketingContentReviewState["status"], { label: string; description: string }> = {
  queued: { label: "En file d’attente", description: "La demande est enregistrée. L’envoi Telegram sera traité automatiquement." },
  waiting_items: { label: "En attente des publications", description: "Les publications de la campagne doivent être prêtes avant l’envoi pour validation." },
  waiting_visuals: { label: "En attente des visuels", description: "Les visuels doivent être prêts avant l’envoi pour validation." },
  delivering: { label: "Envoi Telegram en cours", description: "Le dossier est en cours de transmission vers Telegram." },
  pending: { label: "À valider dans Telegram", description: "Le dossier est disponible dans Telegram. La décision portera sur cette version du contenu." },
  approved: { label: "Contenu approuvé", description: "Cette version du contenu a été approuvée dans Telegram." },
  rejected: { label: "Contenu refusé", description: "Relisez le contenu avant de demander une nouvelle validation." },
  expired: { label: "Demande expirée", description: "Une nouvelle demande est nécessaire pour faire valider ce contenu dans Telegram." },
  failed: { label: "Demande en échec", description: "La demande de validation n’a pas abouti. Vous pouvez préparer une nouvelle tentative." },
  delivery_unknown: { label: "Envoi Telegram non confirmé", description: "Un message peut déjà avoir été reçu. Une relance invalide la demande précédente et prépare une nouvelle validation." },
  stale: { label: "Contenu modifié", description: "La validation précédente concerne une autre version. Une nouvelle demande portera sur le contenu actuel." },
  not_requested: { label: "Aucune demande enregistrée", description: "Aucune validation Telegram n’est enregistrée pour ce contenu." },
  cancelled: { label: "Demande annulée", description: "Cette demande de validation a été annulée." },
};

const RETRY_STATUSES = new Set<MarketingContentReviewState["status"]>([
  "failed", "expired", "rejected", "delivery_unknown", "stale",
]);

const FAILURE_COPY: Record<MarketingContentReviewFailureCode, string> = {
  content_review_document_too_large: "Le dossier dépasse la limite d’envoi Telegram. Réduisez sa taille avant de demander une nouvelle validation.",
  content_review_visual_missing: "Complétez les visuels avant de relancer la validation.",
  content_review_visual_invalid: "Un visuel enregistré ne peut pas être transmis. Remplacez-le avant de relancer la validation.",
  content_review_text_missing: "Complétez le texte des publications avant de relancer la validation.",
  content_review_items_missing: "Ajoutez les publications à la campagne avant de relancer la validation.",
  content_review_snapshot_invalid: "Le dossier de contenu n’a pas pu être confirmé. Actualisez les données avant de relancer.",
  content_review_budget_exhausted: "Le dossier n’a pas pu être transmis entièrement. Une nouvelle demande transmettra à nouveau l’ensemble du contenu.",
  content_review_telegram_rejected: "Telegram a refusé l’envoi. Vérifiez sa configuration avant de relancer.",
  content_review_delivery_unknown: "La réception du dossier complet n’a pas pu être confirmée.",
};

type ReviewDisplay = {
  scope: string;
  busy: "status" | "retry" | null;
  data: MarketingContentReviewState | null;
  error: string | null;
  notice: string | null;
};

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
  }).format(new Date(value));
}

export function MarketingContentReview({
  targetType, targetId, revisionKey, enabled = true, canRetry = false,
}: MarketingContentReviewTarget & {
  /** Reload the status when the content currently shown in the dialog changes. */
  revisionKey?: string | null;
  enabled?: boolean;
  canRetry?: boolean;
}) {
  const titleId = useId();
  const scope = JSON.stringify([targetType, targetId, revisionKey ?? null]);
  const [display, setDisplay] = useState<ReviewDisplay>({ scope, busy: null, data: null, error: null, notice: null });
  const requestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const request = useCallback(async (operation: "status" | "retry", previous?: MarketingContentReviewState) => {
    // This synchronous guard also prevents a double click from queuing two retries.
    if (activeRequest.current && !activeRequest.current.signal.aborted) return;
    if (operation === "retry" && (!previous?.revision || !RETRY_STATUSES.has(previous.status))) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const currentRequest = ++requestId.current;
    setDisplay({ scope, busy: operation, data: null, error: null, notice: null });
    try {
      const data = operation === "retry" && previous?.revision
        ? await retryMarketingContentReview({ targetType, targetId, expectedRevision: previous.revision, expectedReviewId: previous.review?.id ?? null }, controller.signal)
        : await loadMarketingContentReview({ targetType, targetId }, controller.signal);
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      if (data.targetType !== targetType || data.targetId.toLowerCase() !== targetId.toLowerCase()) throw new Error("Unexpected review target");
      setDisplay({
        scope, busy: null, data, error: null,
        notice: operation === "retry" && data.status === "queued" ? "Nouvelle demande mise en file d’attente pour Telegram." : null,
      });
    } catch {
      if (controller.signal.aborted || currentRequest !== requestId.current) return;
      // A timeout can occur after a retry has been accepted. Require a fresh read before another attempt.
      setDisplay({
        scope, busy: null, data: null, notice: null,
        error: operation === "retry"
          ? "La relance n’a pas pu être confirmée. Actualisez le statut avant une nouvelle tentative."
          : "Le statut de validation Telegram n’a pas pu être confirmé. Actualisez pour réessayer.",
      });
    } finally {
      if (currentRequest === requestId.current) activeRequest.current = null;
    }
  }, [scope, targetId, targetType]);

  useEffect(() => {
    if (enabled) void request("status");
    else setDisplay({ scope, busy: null, data: null, error: null, notice: null });
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      requestId.current += 1;
    };
  }, [enabled, request, scope]);

  // Never render a previous target or content revision while the next request is starting.
  const current = enabled && display.scope === scope ? display : null;
  const data = current?.data;
  const busy = current?.busy;
  const copy = data ? STATUS_COPY[data.status] : null;
  const failure = data?.review?.errorCode && ["failed", "delivery_unknown", "waiting_items", "waiting_visuals"].includes(data.status)
    ? FAILURE_COPY[data.review.errorCode] : null;
  const retryAvailable = Boolean(data?.revision && RETRY_STATUSES.has(data.status));

  return (
    <section aria-labelledby={titleId} aria-busy={Boolean(busy)} className="space-y-3 rounded-2xl border bg-muted/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-violet-600" />Validation Telegram</h3>
        <Button type="button" size="sm" variant="outline" disabled={!enabled || Boolean(busy)} onClick={() => void request("status")}>
          <RefreshCw aria-hidden="true" className={cn("mr-2 h-4 w-4", busy === "status" && "animate-spin")} />Actualiser le statut Telegram
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">La validation Telegram porte sur le contenu de {targetType === "campaign" ? "la campagne" : "la publication"}. La diffusion suit la programmation confirmée dans TOK.</p>

      <div role="status" aria-live="polite" className="space-y-2">
        {!enabled ? <p className="text-sm text-muted-foreground">Le statut Telegram sera disponible après confirmation des données.</p> : null}
        {busy ? <p className="text-sm text-muted-foreground">{busy === "retry" ? "Enregistrement de la relance…" : "Chargement du statut Telegram…"}</p> : null}
        {data && copy ? <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-medium", data.status === "approved"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : RETRY_STATUSES.has(data.status) ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" : "bg-background")}>{copy.label}</Badge>
            {data.revision ? <span className="text-xs text-muted-foreground">Version {data.revision}</span> : null}
          </div>
          <p className="text-sm">{copy.description}</p>
          {failure ? <p className="text-sm">{failure}</p> : null}
          {data.updatedAt || data.review?.expiresAt || data.review?.decidedAt ? <dl className="space-y-1 text-xs text-muted-foreground">
            {data.updatedAt ? <div className="flex flex-wrap gap-x-1"><dt>Mis à jour :</dt><dd>{formatReviewDate(data.updatedAt)} (Zurich)</dd></div> : null}
            {data.review?.expiresAt && data.status === "pending" ? <div className="flex flex-wrap gap-x-1"><dt>À valider avant :</dt><dd>{formatReviewDate(data.review.expiresAt)} (Zurich)</dd></div> : null}
            {data.review?.decidedAt && ["approved", "rejected"].includes(data.status) ? <div className="flex flex-wrap gap-x-1"><dt>Décision :</dt><dd>{formatReviewDate(data.review.decidedAt)} (Zurich)</dd></div> : null}
          </dl> : null}
        </> : null}
        {current?.notice ? <p className="text-sm font-medium">{current.notice}</p> : null}
      </div>
      {current?.error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{current.error}</p> : null}
      {retryAvailable ? <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" disabled={!canRetry || Boolean(busy)} onClick={() => { if (canRetry && data) void request("retry", data); }}>
          <Send aria-hidden="true" className="mr-2 h-4 w-4" />Relancer la validation Telegram
        </Button>
        <p className="text-xs text-muted-foreground">La relance prépare une nouvelle demande de validation du contenu dans Telegram.</p>
      </div> : null}
    </section>
  );
}

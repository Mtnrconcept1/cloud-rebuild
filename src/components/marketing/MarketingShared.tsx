import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  MarketingAvailability,
  MarketingChannelId,
  MarketingDeliveryStatus,
  MarketingItemStatus,
} from "@/marketing/types";

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannelId, string> = {
  tok_news: "Actualités TOK",
  in_app: "Notification interne",
  email: "E-mail",
  push: "Push",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  google_business: "Google Business",
  telegram: "Telegram",
  website: "Site web",
  manual_call: "Appel manuel",
  manual_email: "E-mail manuel",
  manual_visit: "Visite terrain",
};

const STATUS_LABELS: Record<string, string> = {
  available: "Disponible",
  manual: "Manuel",
  blocked_configuration: "Configuration bloquante",
  disconnected: "Déconnecté",
  draft: "Brouillon",
  scheduled: "Planifié",
  active: "Actif",
  paused: "En pause",
  completed: "Terminé",
  published: "Publié",
  cancelled: "Annulé",
  running: "En cours",
  failed: "Échec",
  queued: "En attente",
  leased: "Réservé",
  processing: "Traitement",
  retrying: "Nouvelle tentative",
  sent: "Envoyé",
  delivered: "Distribué",
  opened: "Ouvert",
  clicked: "Cliqué",
  bounced: "Rebond",
  complained: "Plainte",
  unsubscribed: "Désinscrit",
  skipped: "Ignoré",
  disabled: "Désactivé",
  error: "Erreur",
  manual_required: "Action manuelle",
  pending: "À approuver",
  approved: "Approuvé",
  rejected: "Refusé",
  new: "Nouveau",
  qualified: "Qualifié",
  contacted: "Contacté",
  follow_up: "À relancer",
  converted: "Converti",
  opted_out: "Opposition",
};

function statusTone(status: string) {
  if (["available", "active", "completed", "delivered", "opened", "clicked", "approved", "converted"].includes(status)) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (["blocked_configuration", "failed", "cancelled", "rejected", "opted_out"].includes(status)) {
    return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (["manual", "manual_required", "paused", "pending", "scheduled"].includes(status)) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "disconnected") {
    return "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

export function MarketingStatusBadge({
  status,
  className,
}: {
  status: MarketingAvailability | MarketingItemStatus | MarketingDeliveryStatus | string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", statusTone(status), className)}>
      {STATUS_LABELS[status] || status.replace(/_/g, " ")}
    </Badge>
  );
}

export function MarketingChannelBadge({ channel }: { channel: MarketingChannelId }) {
  return (
    <Badge variant="secondary" className="max-w-full truncate font-medium">
      {MARKETING_CHANNEL_LABELS[channel] || channel}
    </Badge>
  );
}

export function MarketingMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "orange",
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: "orange" | "emerald" | "sky" | "violet";
}) {
  const tones = {
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  };
  return (
    <Card className="min-w-0 border-border/70 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
          </div>
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function MarketingEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function MarketingPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  if (total <= pageSize) return null;
  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        Page {safePage} sur {pageCount} · {total.toLocaleString("fr-CH")} éléments
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
          Précédent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
        >
          Suivant
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

export function formatMarketingDate(value: string | null | undefined, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CH", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" }
    : { dateStyle: "medium", timeZone: "Europe/Zurich" });
}

export function formatMarketingPercent(value: number) {
  return new Intl.NumberFormat("fr-CH", { style: "percent", maximumFractionDigits: 1 }).format(value || 0);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Filter,
  Mail,
  MapPin,
  Navigation,
  Percent,
  Phone,
  ReceiptText,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import CommercialWorkspaceChrome from "@/components/commercial/CommercialWorkspaceChrome";
import {
  fetchGenevaCommercialProspects,
  type GenevaCommercialProspect,
} from "@/data/genevaCommercialProspects";

type ProspectStatus = Database["public"]["Enums"]["commercial_visit_status"];
type CommercialPipelineStatus = Exclude<ProspectStatus, "visited">;
type CommercialSubscriptionPlanSlug = "starter" | "pro" | "premium" | "elite";
type CommercialSubscriptionBillingPeriod = "monthly" | "yearly";
type CommercialCompensationMode = "commission_only" | "fixed_plus_reservation";

type CommercialProspectFollowup = {
  source_objectid: number;
  status: ProspectStatus;
  notes: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  last_contacted_by: string | null;
  last_contacted_by_name: string | null;
  signed_by: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
  signed_restaurant_id: string | null;
  signed_subscription_plan_slug: string | null;
  signed_subscription_plan_name: string | null;
  signed_subscription_billing_period: string;
  signed_subscription_monthly_price_chf: number | null;
  signed_subscription_contract_value_chf: number | null;
  acquisition_commission_rate: number;
  acquisition_commission_chf: number;
  commercial_compensation_mode: string;
  reservation_commission_rate: number;
  reservation_commission_starts_at: string | null;
  visited_at: string | null;
  next_follow_up_at: string | null;
  updated_at: string | null;
};

type CommercialCommissionSummary = {
  exists?: boolean;
  signed_restaurant_id?: string | null;
  acquisition_commission?: {
    rate?: number | null;
    amount_chf?: number | null;
  } | null;
  reservation_commission?: {
    enabled?: boolean;
    rate?: number | null;
    starts_at?: string | null;
    reservations_count?: number | null;
    base_chf?: number | null;
    amount_chf?: number | null;
  } | null;
};

type StatusMeta = {
  value: ProspectStatus;
  label: string;
  shortLabel: string;
  color: string;
  marker: string;
  badge: string;
  icon: typeof Circle;
};

const PIPELINE_STATUS_OPTIONS: Array<StatusMeta & { value: CommercialPipelineStatus }> = [
  {
    value: "not_visited",
    label: "Pas encore visité",
    shortLabel: "À visiter",
    color: "#facc15",
    marker: "#facc15",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Circle,
  },
  {
    value: "in_progress",
    label: "En cours",
    shortLabel: "En cours",
    color: "#f97316",
    marker: "#f97316",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    icon: Clock3,
  },
  {
    value: "signed",
    label: "Signature",
    shortLabel: "Signé",
    color: "#16a34a",
    marker: "#16a34a",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: BriefcaseBusiness,
  },
  {
    value: "not_interested",
    label: "Refus",
    shortLabel: "Refus",
    color: "#ef4444",
    marker: "#ef4444",
    badge: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
];

const STATUS_META = [
  ...PIPELINE_STATUS_OPTIONS,
  {
    value: "visited",
    label: "En cours",
    shortLabel: "En cours",
    color: "#f97316",
    marker: "#f97316",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
    icon: CheckCircle2,
  } satisfies StatusMeta,
].reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<ProspectStatus, StatusMeta>,
);

const CLUSTER_STATUS_PRIORITY: ProspectStatus[] = [
  "not_visited",
  "in_progress",
  "visited",
  "signed",
  "not_interested",
];

const ALL_STATUSES = "all";
const ALL_COMMUNES = "all";
const ALL_CATEGORIES = "all";
const RESULT_PREVIEW_LIMIT = 160;
const GENEVA_CENTER: L.LatLngExpression = [46.2044, 6.1432];
const COMMERCIAL_CLUSTER_DISABLE_ZOOM = 16;
const COMMERCIAL_CLUSTER_VIEW_PADDING = 0.35;
const DEFAULT_ACQUISITION_COMMISSION_RATE = 0;
const FIXED_RESERVATION_COMMISSION_RATE = 0.02;
const TOK_RESERVATION_BASE_CHF = 5;
const COMMERCIAL_RESERVATION_COMMISSION_CHF = 0.1;

const COMMERCIAL_SUBSCRIPTION_PLANS: Array<{
  slug: CommercialSubscriptionPlanSlug;
  name: string;
  monthlyPriceChf: number;
  sprintCommissionChf: number;
  engagedCommissionChf: number;
}> = [
  { slug: "starter", name: "TOK Starter", monthlyPriceChf: 69, sprintCommissionChf: 120, engagedCommissionChf: 60 },
  { slug: "pro", name: "TOK Business / Pro", monthlyPriceChf: 129, sprintCommissionChf: 220, engagedCommissionChf: 120 },
  { slug: "premium", name: "TOK Premium", monthlyPriceChf: 199, sprintCommissionChf: 350, engagedCommissionChf: 190 },
  { slug: "elite", name: "TOK Elite", monthlyPriceChf: 499, sprintCommissionChf: 650, engagedCommissionChf: 300 },
];

type CommercialMapProspectPoint = {
  prospect: GenevaCommercialProspect;
  latLng: L.LatLng;
  status: ProspectStatus;
  meta: StatusMeta;
  selected: boolean;
};

type CommercialMapCluster = {
  id: string;
  points: CommercialMapProspectPoint[];
  center: L.LatLng;
  bounds: L.LatLngBounds;
  statusCounts: Map<ProspectStatus, number>;
  selected: boolean;
};

type CommercialSearchFilters = {
  search: string;
  status: CommercialPipelineStatus | typeof ALL_STATUSES;
  commune: string;
  category: string;
};

type CommercialFollowupReminderResult = {
  reminderNotificationStatus: "not_requested" | "queued" | "failed";
  reminderError?: string | null;
};

const DEFAULT_COMMERCIAL_SEARCH_FILTERS: CommercialSearchFilters = {
  search: "",
  status: ALL_STATUSES,
  commune: ALL_COMMUNES,
  category: ALL_CATEGORIES,
};

function normalizeSearchValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function prospectSearchHaystack(prospect: GenevaCommercialProspect) {
  return normalizeSearchValue([
    prospect.name,
    prospect.legalName,
    prospect.category,
    prospect.branch,
    prospect.address,
    prospect.postalCode,
    prospect.locality,
    prospect.commune,
    prospect.phone,
    prospect.email,
    prospect.website,
    prospect.ideNumber,
  ].filter(Boolean).join(" "));
}

function formatAddress(prospect: GenevaCommercialProspect) {
  return [prospect.address, prospect.postalCode, prospect.locality || prospect.commune]
    .filter(Boolean)
    .join(", ");
}

function normalizeExternalUrl(url: string | null) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function getProspectStatus(
  prospect: GenevaCommercialProspect,
  followupsByObjectId: Map<number, CommercialProspectFollowup>,
): ProspectStatus {
  return followupsByObjectId.get(prospect.sourceObjectId)?.status || "not_visited";
}

function toPipelineStatus(status: ProspectStatus): CommercialPipelineStatus {
  return status === "visited" ? "in_progress" : status;
}

function getCommercialDisplayName(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return null;
  const metadata = user.user_metadata as Record<string, unknown> | null;
  const fullName = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";
  return fullName || user.email || null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function roundChf(value: unknown) {
  return Math.round(toFiniteNumber(value) * 100) / 100;
}

function formatChf(value: unknown) {
  return `${roundChf(value).toLocaleString("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CHF`;
}

function formatPercentRate(value: unknown) {
  return `${roundChf(toFiniteNumber(value) * 100).toLocaleString("fr-CH", {
    maximumFractionDigits: 2,
  })} %`;
}

function getCommercialSubscriptionPlan(slug: string | null | undefined) {
  return COMMERCIAL_SUBSCRIPTION_PLANS.find((plan) => plan.slug === slug) || COMMERCIAL_SUBSCRIPTION_PLANS[0];
}

function getSubscriptionContractValueChf(
  plan: { monthlyPriceChf: number },
  billingPeriod: CommercialSubscriptionBillingPeriod,
) {
  return roundChf(plan.monthlyPriceChf * (billingPeriod === "yearly" ? 12 : 1));
}

function getAcquisitionCommissionChf(
  plan: { sprintCommissionChf: number; engagedCommissionChf: number },
  compensationMode: CommercialCompensationMode,
) {
  return roundChf(
    compensationMode === "fixed_plus_reservation"
      ? plan.engagedCommissionChf
      : plan.sprintCommissionChf,
  );
}

function normalizeBillingPeriod(value: string | null | undefined): CommercialSubscriptionBillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

function normalizeCompensationMode(value: string | null | undefined): CommercialCompensationMode {
  return value === "fixed_plus_reservation" ? "fixed_plus_reservation" : "commission_only";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function getJitteredLatLng(
  prospect: GenevaCommercialProspect,
  coordinateUseCount: Map<string, number>,
): [number, number] {
  const key = `${prospect.latitude.toFixed(6)}:${prospect.longitude.toFixed(6)}`;
  const count = coordinateUseCount.get(key) || 0;
  coordinateUseCount.set(key, count + 1);

  if (count === 0) return [prospect.latitude, prospect.longitude];

  const angle = (count * 137.5 * Math.PI) / 180;
  const radius = 0.00008 + Math.floor(count / 6) * 0.00004;
  return [
    prospect.latitude + Math.cos(angle) * radius,
    prospect.longitude + Math.sin(angle) * radius,
  ];
}

function escapeMapHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character] || character;
  });
}

function commercialProspectMarkerIcon(meta: StatusMeta, selected: boolean) {
  const size = selected ? 40 : 34;
  const innerSize = selected ? 22 : 18;
  const ringColor = selected ? "#020617" : "#ffffff";

  return L.divIcon({
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:rgba(255,255,255,0.95);
        border:2px solid ${ringColor};
        box-shadow:0 14px 30px rgba(15,23,42,0.24),0 0 0 ${selected ? "5px" : "3px"} rgba(255,255,255,0.72);
      ">
        <span style="
          width:${innerSize}px;
          height:${innerSize}px;
          border-radius:9999px;
          display:block;
          background:${meta.marker};
          box-shadow:0 0 0 2px rgba(255,255,255,0.94),0 0 22px ${meta.marker};
        "></span>
      </div>
    `,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function getCommercialClusterCellSize(zoom: number) {
  if (zoom >= COMMERCIAL_CLUSTER_DISABLE_ZOOM) return 1;
  if (zoom >= 15) return 46;
  if (zoom >= 14) return 64;
  if (zoom >= 13) return 88;
  if (zoom >= 12) return 118;
  if (zoom >= 11) return 150;
  return 190;
}

function getCommercialClusterSize(count: number, zoom: number) {
  const baseSize = count >= 250 ? 82 : count >= 100 ? 72 : count >= 35 ? 62 : 52;
  const zoomReduction = Math.max(0, zoom - 11) * 3;
  return Math.max(42, baseSize - zoomReduction);
}

function getDominantClusterStatus(statusCounts: Map<ProspectStatus, number>) {
  return CLUSTER_STATUS_PRIORITY.reduce(
    (best, status) => {
      const count = statusCounts.get(status) || 0;
      return count > best.count ? { status, count } : best;
    },
    { status: "not_visited" as ProspectStatus, count: -1 },
  ).status;
}

function getClusterStatusSummary(statusCounts: Map<ProspectStatus, number>) {
  return CLUSTER_STATUS_PRIORITY
    .map((status) => {
      const count = statusCounts.get(status) || 0;
      return count > 0 ? `${escapeMapHtml(STATUS_META[status].shortLabel)}: ${count}` : null;
    })
    .filter(Boolean)
    .join("<br>");
}

function commercialProspectClusterIcon(cluster: CommercialMapCluster, zoom: number) {
  const count = cluster.points.length;
  const size = getCommercialClusterSize(count, zoom);
  const status = getDominantClusterStatus(cluster.statusCounts);
  const color = STATUS_META[status].marker;
  const selectedRing = cluster.selected ? "#020617" : "#ffffff";

  return L.divIcon({
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:9999px;
        display:flex;
        align-items:center;
        justify-content:center;
        background:${color};
        border:3px solid ${selectedRing};
        color:white;
        font-weight:900;
        font-size:${count >= 100 ? 16 : 15}px;
        letter-spacing:-0.02em;
        box-shadow:0 18px 42px rgba(15,23,42,0.28),0 0 0 5px rgba(255,255,255,0.7),0 0 30px ${color};
      ">
        ${count.toLocaleString("fr-CH")}
      </div>
    `,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function buildCommercialMapClusters({
  map,
  prospects,
  followupsByObjectId,
  selectedObjectId,
}: {
  map: L.Map;
  prospects: GenevaCommercialProspect[];
  followupsByObjectId: Map<number, CommercialProspectFollowup>;
  selectedObjectId: number | null;
}) {
  const zoom = map.getZoom();
  const cellSize = getCommercialClusterCellSize(zoom);
  const shouldRenderSingles = zoom >= COMMERCIAL_CLUSTER_DISABLE_ZOOM;
  const visibleBounds = map.getBounds().pad(COMMERCIAL_CLUSTER_VIEW_PADDING);
  const coordinateUseCount = new Map<string, number>();
  const buckets = new Map<string, CommercialMapCluster>();

  for (const prospect of prospects) {
    const latLng = L.latLng(getJitteredLatLng(prospect, coordinateUseCount));
    if (!visibleBounds.contains(latLng)) continue;

    const status = getProspectStatus(prospect, followupsByObjectId);
    const meta = STATUS_META[status];
    const selected = selectedObjectId === prospect.sourceObjectId;
    const projectedPoint = map.project(latLng, zoom);
    const bucketKey = shouldRenderSingles
      ? `single:${prospect.sourceObjectId}`
      : `${Math.floor(projectedPoint.x / cellSize)}:${Math.floor(projectedPoint.y / cellSize)}`;

    const existingBucket = buckets.get(bucketKey);
    const point: CommercialMapProspectPoint = { prospect, latLng, status, meta, selected };

    if (existingBucket) {
      existingBucket.points.push(point);
      existingBucket.bounds.extend(latLng);
      existingBucket.statusCounts.set(status, (existingBucket.statusCounts.get(status) || 0) + 1);
      existingBucket.selected ||= selected;
      continue;
    }

    const bounds = L.latLngBounds([latLng]);
    const statusCounts = new Map<ProspectStatus, number>();
    statusCounts.set(status, 1);
    buckets.set(bucketKey, {
      id: bucketKey,
      points: [point],
      center: latLng,
      bounds,
      statusCounts,
      selected,
    });
  }

  return Array.from(buckets.values()).map((cluster) => {
    if (cluster.points.length === 1) return cluster;

    const center = L.latLng(
      cluster.points.reduce((sum, point) => sum + point.latLng.lat, 0) / cluster.points.length,
      cluster.points.reduce((sum, point) => sum + point.latLng.lng, 0) / cluster.points.length,
    );

    return { ...cluster, center };
  });
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: ProspectStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex max-w-full min-w-0 shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold", meta.badge)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
      <span className="min-w-0 truncate">{meta.shortLabel}</span>
    </span>
  );
}

function ContactLink({
  icon: Icon,
  href,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  href: string | null;
  label: string | null;
}) {
  if (!href || !label) return null;
  return (
    <a
      href={href}
      className="inline-flex min-h-10 max-w-full min-w-0 flex-[1_1_11rem] items-center gap-2 rounded-full border px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary dark:border-white/10 dark:text-slate-200 sm:flex-none"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </a>
  );
}

function CommercialMapLegend() {
  return (
    <div className="grid gap-2 rounded-2xl border bg-white/90 p-3 text-xs font-bold shadow-sm dark:border-white/10 dark:bg-slate-950/80 sm:grid-cols-2 xl:grid-cols-4">
      {PIPELINE_STATUS_OPTIONS.map((item) => (
        <div key={item.value} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
          <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: item.marker }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function CommercialProspectionMap({
  prospects,
  followupsByObjectId,
  selectedObjectId,
  onOpenDetails,
}: {
  prospects: GenevaCommercialProspect[];
  followupsByObjectId: Map<number, CommercialProspectFollowup>;
  selectedObjectId: number | null;
  onOpenDetails: (prospect: GenevaCommercialProspect) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const fitSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: GENEVA_CENTER,
      zoom: 12,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let animationFrame: number | null = null;

    const renderMapClusters = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        if (markerLayerRef.current) {
          markerLayerRef.current.clearLayers();
          markerLayerRef.current.removeFrom(map);
        }

        const layer = L.layerGroup().addTo(map);
        const zoom = map.getZoom();
        const clusters = buildCommercialMapClusters({
          map,
          prospects,
          followupsByObjectId,
          selectedObjectId,
        });

        for (const cluster of clusters) {
          if (cluster.points.length > 1) {
            const marker = L.marker(cluster.center, {
              icon: commercialProspectClusterIcon(cluster, zoom),
              keyboard: true,
              riseOnHover: true,
              title: `${cluster.points.length.toLocaleString("fr-CH")} restaurants`,
              zIndexOffset: cluster.selected ? 900 : 0,
            });

            marker.bindTooltip(
              `<strong>${cluster.points.length.toLocaleString("fr-CH")} restaurants</strong><br>${getClusterStatusSummary(cluster.statusCounts)}`,
              { direction: "top", sticky: true, opacity: 0.95 },
            );
            marker.on("click", () => {
              map.fitBounds(cluster.bounds, {
                padding: [56, 56],
                maxZoom: Math.min(Math.max(map.getZoom() + 2, 13), COMMERCIAL_CLUSTER_DISABLE_ZOOM),
              });
            });
            marker.addTo(layer);
            continue;
          }

          const point = cluster.points[0];
          const marker = L.marker(point.latLng, {
            icon: commercialProspectMarkerIcon(point.meta, point.selected),
            keyboard: true,
            riseOnHover: true,
            title: point.prospect.name,
            zIndexOffset: point.selected ? 1000 : 0,
          });

          marker.bindTooltip(
            `<strong>${escapeMapHtml(point.prospect.name)}</strong><br>${escapeMapHtml(point.meta.label)}${point.prospect.commune ? ` · ${escapeMapHtml(point.prospect.commune)}` : ""}`,
            { direction: "top", sticky: true, opacity: 0.95 },
          );
          marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            onOpenDetails(point.prospect);
          });
          marker.addTo(layer);
        }

        markerLayerRef.current = layer;
      });
    };

    const fitSignature = prospects.map((prospect) => prospect.sourceObjectId).join("|");
    if (prospects.length > 0 && fitSignatureRef.current !== fitSignature) {
      const bounds = L.latLngBounds(prospects.map((prospect) => [prospect.latitude, prospect.longitude]));
      fitSignatureRef.current = fitSignature;
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: prospects.length === 1 ? 17 : 13 });
      }
    }

    renderMapClusters();
    map.on("zoomend", renderMapClusters);
    map.on("moveend", renderMapClusters);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      map.off("zoomend", renderMapClusters);
      map.off("moveend", renderMapClusters);
    };
  }, [followupsByObjectId, onOpenDetails, prospects, selectedObjectId]);

  return (
    <div
      ref={mapRef}
      className="relative isolate z-0 h-[58vh] min-h-[420px] w-full overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_22px_70px_rgba(15,23,42,0.16)] dark:border-white/10 md:h-[calc(100vh-12rem)]"
    />
  );
}

function CommercialProspectDetailsDialog({
  open,
  onOpenChange,
  prospect,
  followup,
  status,
  assignedName,
  lastContactName,
  signedName,
  commissionSummary,
  workflowContent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: GenevaCommercialProspect | null;
  followup: CommercialProspectFollowup | null;
  status: ProspectStatus;
  assignedName: string | null;
  lastContactName: string | null;
  signedName: string | null;
  commissionSummary: CommercialCommissionSummary | null | undefined;
  workflowContent: ReactNode;
}) {
  if (!prospect) return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${prospect.name} ${formatAddress(prospect)}`)}`;
  const signedPlanName = followup?.signed_subscription_plan_name || (
    followup?.signed_subscription_plan_slug
      ? getCommercialSubscriptionPlan(followup.signed_subscription_plan_slug).name
      : null
  );
  const reservationCommission = commissionSummary?.reservation_commission;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden p-0 sm:max-w-4xl sm:rounded-[30px]">
        <DialogHeader className="relative overflow-hidden border-b bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 px-6 pb-6 pt-7 text-left text-white">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.26em] text-orange-300">
                Fiche terrain
              </p>
              <DialogTitle className="mt-3 font-display text-3xl font-black leading-tight text-white">
                {prospect.name}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-white/72">
                {formatAddress(prospect) || "Adresse non renseignée"}
              </DialogDescription>
            </div>
            <StatusPill status={status} />
          </div>
        </DialogHeader>

        <div data-dialog-scroll-area className="max-h-[calc(100dvh-15rem)] space-y-4 overflow-y-auto p-5">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Restaurant
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-start gap-2">
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{prospect.category || prospect.branch || "Catégorie non renseignée"}</span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{formatAddress(prospect) || "Adresse non renseignée"}</span>
                </p>
                {prospect.legalName ? <p><span className="font-bold">Raison sociale:</span> {prospect.legalName}</p> : null}
                {prospect.ideNumber ? <p><span className="font-bold">IDE:</span> {prospect.ideNumber}</p> : null}
                <p><span className="font-bold">Object ID:</span> {prospect.sourceObjectId}</p>
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Suivi TOK
              </p>
              <div className="mt-3 space-y-2 text-sm">
                {assignedName ? <p><span className="font-bold">Assigné à:</span> {assignedName}</p> : null}
                {lastContactName ? <p><span className="font-bold">Dernière action:</span> {lastContactName}</p> : null}
                {followup?.next_follow_up_at ? <p><span className="font-bold">Relance:</span> {followup.next_follow_up_at}</p> : null}
                {followup?.updated_at ? <p><span className="font-bold">Mise à jour:</span> {formatDateTime(followup.updated_at)}</p> : null}
                {signedName && followup?.status === "signed" ? (
                  <p>
                    <span className="font-bold">Signature:</span>{" "}
                    {signedName}
                    {formatDateTime(followup.signed_at) ? ` le ${formatDateTime(followup.signed_at)}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {followup?.status === "signed" ? (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-4 text-sm dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                <ReceiptText className="h-4 w-4" />
                Abonnement et commission
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Abonnement signé</p>
                  <p className="font-black">{signedPlanName || "Non renseigné"}</p>
                  <p className="text-xs text-muted-foreground">
                    {followup.signed_subscription_billing_period === "yearly" ? "Annuel" : "Mensuel"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valeur contrat</p>
                  <p className="font-black">{formatChf(followup.signed_subscription_contract_value_chf || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Commission acquisition</p>
                  <p className="font-black">{formatChf(followup.acquisition_commission_chf || 0)}</p>
                  <p className="text-xs text-muted-foreground">
                    {followup.commercial_compensation_mode === "fixed_plus_reservation" ? "Barème engagé" : "Barème sprint"}
                  </p>
                </div>
              </div>
              {followup.commercial_compensation_mode === "fixed_plus_reservation" ? (
                <div className="mt-3 rounded-2xl border bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold">Fixe + {formatChf(COMMERCIAL_RESERVATION_COMMISSION_CHF)} par réservation honorée</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {followup.signed_restaurant_id
                      ? `${Number(reservationCommission?.reservations_count || 0).toLocaleString("fr-CH")} réservation(s) honorée(s), ${formatChf(reservationCommission?.amount_chf || 0)} estimés.`
                      : "Liez le restaurant TOK pour calculer les réservations réelles automatiquement."}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex min-w-0 flex-wrap gap-2">
            <ContactLink
              icon={Phone}
              href={prospect.phone ? `tel:${prospect.phone.replace(/\s+/g, "")}` : null}
              label={prospect.phone}
            />
            <ContactLink
              icon={Mail}
              href={prospect.email ? `mailto:${prospect.email}` : null}
              label={prospect.email}
            />
            <ContactLink
              icon={ExternalLink}
              href={normalizeExternalUrl(prospect.website)}
              label={prospect.website ? "Site web" : null}
            />
            <ContactLink icon={Navigation} href={mapsUrl} label="Itinéraire" />
          </div>

          <div className="space-y-5 rounded-[24px] border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-400/20 dark:bg-orange-500/5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                Inscription et suivi commercial
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Gérez ici toute la procédure du restaurant, du premier passage jusqu'à la signature ou au refus.
              </p>
            </div>
            {workflowContent}
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-2xl"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CommercialProspection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const commercialName = getCommercialDisplayName(user);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CommercialPipelineStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [communeFilter, setCommuneFilter] = useState(ALL_COMMUNES);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [hasLaunchedSearch, setHasLaunchedSearch] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<CommercialSearchFilters>(DEFAULT_COMMERCIAL_SEARCH_FILTERS);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [prospectDialogOpen, setProspectDialogOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<CommercialPipelineStatus>("not_visited");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFollowUpDate, setDraftFollowUpDate] = useState("");
  const [draftSubscriptionPlanSlug, setDraftSubscriptionPlanSlug] = useState<CommercialSubscriptionPlanSlug>("starter");
  const [draftSubscriptionBillingPeriod, setDraftSubscriptionBillingPeriod] = useState<CommercialSubscriptionBillingPeriod>("monthly");
  const [draftCompensationMode, setDraftCompensationMode] = useState<CommercialCompensationMode>("commission_only");
  const [draftSignedRestaurantId, setDraftSignedRestaurantId] = useState("");

  const prospectsQuery = useQuery({
    queryKey: ["commercial-prospects-source"],
    queryFn: fetchGenevaCommercialProspects,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const prospects = useMemo(() => prospectsQuery.data ?? [], [prospectsQuery.data]);

  const prospectsWithSearch = useMemo(
    () => prospects.map((prospect) => ({
      prospect,
      haystack: prospectSearchHaystack(prospect),
    })),
    [prospects],
  );

  const followupsQuery = useQuery({
    queryKey: ["commercial-prospect-followups"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("commercial_prospect_followups")
        .select("source_objectid,status,notes,assigned_to,assigned_to_name,last_contacted_by,last_contacted_by_name,signed_by,signed_by_name,signed_at,signed_restaurant_id,signed_subscription_plan_slug,signed_subscription_plan_name,signed_subscription_billing_period,signed_subscription_monthly_price_chf,signed_subscription_contract_value_chf,acquisition_commission_rate,acquisition_commission_chf,commercial_compensation_mode,reservation_commission_rate,reservation_commission_starts_at,visited_at,next_follow_up_at,updated_at");

      if (error) throw error;
      return (data || []) as CommercialProspectFollowup[];
    },
    staleTime: 15_000,
  });

  const followupsByObjectId = useMemo(() => {
    return new Map((followupsQuery.data || []).map((followup) => [followup.source_objectid, followup]));
  }, [followupsQuery.data]);

  const communeOptions = useMemo(() => {
    return Array.from(new Set(prospects.map((prospect) => prospect.commune).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(prospects.map((prospect) => prospect.category).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, "fr"));
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(appliedFilters.search);
    return prospectsWithSearch
      .filter(({ prospect, haystack }) => {
        if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
        if (appliedFilters.commune !== ALL_COMMUNES && prospect.commune !== appliedFilters.commune) return false;
        if (appliedFilters.category !== ALL_CATEGORIES && prospect.category !== appliedFilters.category) return false;
        if (
          appliedFilters.status !== ALL_STATUSES
          && toPipelineStatus(getProspectStatus(prospect, followupsByObjectId)) !== appliedFilters.status
        ) return false;
        return true;
      })
      .map(({ prospect }) => prospect);
  }, [appliedFilters, followupsByObjectId, prospectsWithSearch]);

  const mapProspects = hasLaunchedSearch ? filteredProspects : prospects;

  const selectedProspect = useMemo(() => {
    return prospects.find((prospect) => prospect.sourceObjectId === selectedObjectId)
      || mapProspects[0]
      || null;
  }, [mapProspects, prospects, selectedObjectId]);

  const selectedFollowup = selectedProspect
    ? followupsByObjectId.get(selectedProspect.sourceObjectId) || null
    : null;
  const selectedAssignedName = selectedFollowup?.assigned_to_name || (selectedFollowup?.assigned_to ? "Commercial attribué" : null);
  const selectedLastContactName = selectedFollowup?.last_contacted_by_name
    || (selectedFollowup?.last_contacted_by ? "Commercial TOK" : null);
  const selectedSignedName = selectedFollowup?.signed_by_name || (selectedFollowup?.signed_by ? "Commercial TOK" : null);
  const draftSubscriptionPlan = getCommercialSubscriptionPlan(draftSubscriptionPlanSlug);
  const draftContractValueChf = getSubscriptionContractValueChf(draftSubscriptionPlan, draftSubscriptionBillingPeriod);
  const draftAcquisitionCommissionChf = getAcquisitionCommissionChf(
    draftSubscriptionPlan,
    draftCompensationMode,
  );
  const draftAcquisitionCommissionRate = DEFAULT_ACQUISITION_COMMISSION_RATE;

  const commissionSummaryQuery = useQuery({
    queryKey: [
      "commercial-prospect-commission-summary",
      selectedFollowup?.source_objectid,
      selectedFollowup?.updated_at,
      selectedFollowup?.signed_restaurant_id,
      selectedFollowup?.commercial_compensation_mode,
    ],
    enabled: Boolean(selectedFollowup?.status === "signed"),
    queryFn: async () => {
      if (!selectedFollowup) return null;
      const { data, error } = await getSupabase().rpc("get_commercial_prospect_commission_summary", {
        p_source_objectid: selectedFollowup.source_objectid,
      });

      if (error) throw error;
      return data as CommercialCommissionSummary;
    },
    staleTime: 15_000,
  });

  const commissionSummary = commissionSummaryQuery.data || null;

  useEffect(() => {
    if (!selectedProspect) return;
    const followup = followupsByObjectId.get(selectedProspect.sourceObjectId);
    setDraftStatus(followup ? toPipelineStatus(followup.status) : "not_visited");
    setDraftNotes(followup?.notes || "");
    setDraftFollowUpDate(followup?.next_follow_up_at || "");
    setDraftSubscriptionPlanSlug(getCommercialSubscriptionPlan(followup?.signed_subscription_plan_slug).slug);
    setDraftSubscriptionBillingPeriod(normalizeBillingPeriod(followup?.signed_subscription_billing_period));
    setDraftCompensationMode(normalizeCompensationMode(followup?.commercial_compensation_mode));
    setDraftSignedRestaurantId(followup?.signed_restaurant_id || "");
  }, [followupsByObjectId, selectedProspect]);

  useEffect(() => {
    if (selectedObjectId || !prospects[0]) return;
    setSelectedObjectId(prospects[0].sourceObjectId);
  }, [prospects, selectedObjectId]);

  useEffect(() => {
    if (!mapProspects.length) {
      setSelectedObjectId(null);
      return;
    }

    if (!selectedObjectId || !mapProspects.some((prospect) => prospect.sourceObjectId === selectedObjectId)) {
      setSelectedObjectId(mapProspects[0].sourceObjectId);
    }
  }, [mapProspects, selectedObjectId]);

  const stats = useMemo(() => {
    const base = PIPELINE_STATUS_OPTIONS.reduce((acc, item) => {
      acc[item.value] = 0;
      return acc;
    }, {} as Record<CommercialPipelineStatus, number>);

    for (const prospect of prospects) {
      base[toPipelineStatus(getProspectStatus(prospect, followupsByObjectId))] += 1;
    }

    return base;
  }, [followupsByObjectId, prospects]);

  const saveFollowupMutation = useMutation<CommercialFollowupReminderResult>({
    mutationFn: async () => {
      if (!selectedProspect) throw new Error("Aucun restaurant sélectionné.");
      const now = new Date().toISOString();
      const existingVisitedAt = selectedFollowup?.visited_at || null;
      const shouldStampVisitedAt = draftStatus !== "not_visited" && !existingVisitedAt;
      const currentUserId = user?.id || null;
      const assignedTo = selectedFollowup?.assigned_to || currentUserId;
      const assignedToName = selectedFollowup?.assigned_to_name || commercialName;
      const isSigned = draftStatus === "signed";
      const keepExistingSignature = isSigned && selectedFollowup?.status === "signed";
      const signedRestaurantId = draftSignedRestaurantId.trim() || null;
      const isFixedPlusReservation = draftCompensationMode === "fixed_plus_reservation";
      const reservationCommissionStartsAt = selectedFollowup?.reservation_commission_starts_at
        || selectedFollowup?.signed_at
        || now;
      const shouldNotifyFollowUp = Boolean(
        draftFollowUpDate && draftFollowUpDate !== (selectedFollowup?.next_follow_up_at || ""),
      );

      if (isSigned && signedRestaurantId && !isUuidLike(signedRestaurantId)) {
        throw new Error("L'identifiant du restaurant TOK doit être un UUID valide.");
      }

      const { error } = await getSupabase()
        .from("commercial_prospect_followups")
        .upsert({
          source_objectid: selectedProspect.sourceObjectId,
          status: draftStatus,
          notes: draftNotes.trim() || null,
          next_follow_up_at: draftFollowUpDate || null,
          visited_at: shouldStampVisitedAt ? now : existingVisitedAt,
          assigned_to: assignedTo,
          assigned_to_name: assignedToName,
          last_contacted_by: currentUserId,
          last_contacted_by_name: commercialName,
          signed_by: isSigned ? (keepExistingSignature ? selectedFollowup?.signed_by || currentUserId : currentUserId) : null,
          signed_by_name: isSigned ? (keepExistingSignature ? selectedFollowup?.signed_by_name || commercialName : commercialName) : null,
          signed_at: isSigned ? (keepExistingSignature ? selectedFollowup?.signed_at || now : now) : null,
          signed_restaurant_id: isSigned ? signedRestaurantId : null,
          signed_subscription_plan_slug: isSigned ? draftSubscriptionPlan.slug : null,
          signed_subscription_plan_name: isSigned ? draftSubscriptionPlan.name : null,
          signed_subscription_billing_period: isSigned ? draftSubscriptionBillingPeriod : "monthly",
          signed_subscription_monthly_price_chf: isSigned ? draftSubscriptionPlan.monthlyPriceChf : null,
          signed_subscription_contract_value_chf: isSigned ? draftContractValueChf : null,
          acquisition_commission_rate: isSigned ? draftAcquisitionCommissionRate : DEFAULT_ACQUISITION_COMMISSION_RATE,
          acquisition_commission_chf: isSigned ? draftAcquisitionCommissionChf : 0,
          commercial_compensation_mode: isSigned ? draftCompensationMode : "commission_only",
          reservation_commission_rate: isSigned && isFixedPlusReservation ? FIXED_RESERVATION_COMMISSION_RATE : 0,
          reservation_commission_starts_at: isSigned && isFixedPlusReservation ? reservationCommissionStartsAt : null,
        }, { onConflict: "source_objectid" });

      if (error) throw error;

      let reminderNotificationStatus: CommercialFollowupReminderResult["reminderNotificationStatus"] = "not_requested";
      let reminderError: string | null = null;

      if (shouldNotifyFollowUp) {
        const { data: reminderData, error: reminderInvokeError } = await getSupabase().functions.invoke(
          "commercial-followup-reminder",
          {
            body: {
              sourceObjectId: selectedProspect.sourceObjectId,
              prospectName: selectedProspect.name,
              prospectAddress: formatAddress(selectedProspect),
            },
          },
        );

        if (reminderInvokeError || (reminderData as { error?: string } | null)?.error) {
          reminderNotificationStatus = "failed";
          reminderError = reminderInvokeError?.message
            || (reminderData as { error?: string } | null)?.error
            || "La relance est enregistrée, mais l'alerte n'a pas pu être envoyée.";
          console.warn("[commercial] follow-up reminder dispatch failed", reminderError);
        } else {
          reminderNotificationStatus = "queued";
        }
      }

      return { reminderNotificationStatus, reminderError };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["commercial-prospect-followups"] });
      queryClient.invalidateQueries({ queryKey: ["commercial-prospect-commission-summary"] });
      toast({
        title: "Suivi enregistré",
        description: result.reminderNotificationStatus === "queued"
          ? "La relance est planifiée et l'alerte push/SMS est préparée pour le commercial."
          : "La carte et la fiche sont mises à jour.",
      });

      if (result.reminderNotificationStatus === "failed") {
        toast({
          title: "Alerte de relance non envoyée",
          description: result.reminderError || "Le suivi est enregistré, mais l'envoi push/SMS a échoué.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Suivi non enregistré",
        description: error instanceof Error ? error.message : "La mise à jour a échoué.",
        variant: "destructive",
      });
    },
  });

  const handleSelectProspect = useCallback((prospect: GenevaCommercialProspect) => {
    setSelectedObjectId(prospect.sourceObjectId);
  }, []);

  const handleOpenProspectDetails = useCallback((prospect: GenevaCommercialProspect) => {
    setSelectedObjectId(prospect.sourceObjectId);
    setProspectDialogOpen(true);
  }, []);

  const handleRunSearch = useCallback(() => {
    setAppliedFilters({
      search: search.trim(),
      status: statusFilter,
      commune: communeFilter,
      category: categoryFilter,
    });
    setHasLaunchedSearch(true);
    setSelectedObjectId(null);
  }, [categoryFilter, communeFilter, search, statusFilter]);

  const handleResetSearch = useCallback(() => {
    setSearch("");
    setStatusFilter(ALL_STATUSES);
    setCommuneFilter(ALL_COMMUNES);
    setCategoryFilter(ALL_CATEGORIES);
    setAppliedFilters(DEFAULT_COMMERCIAL_SEARCH_FILTERS);
    setHasLaunchedSearch(false);
    setSelectedObjectId(null);
  }, []);

  const workflowContent = selectedProspect ? (
    <div className="space-y-5">
                <div className="space-y-3">
                  <Label>Avancement terrain</Label>
                  <div className="grid min-w-0 grid-cols-1 gap-2 min-[430px]:grid-cols-2">
                    {PIPELINE_STATUS_OPTIONS.map((item) => {
                      const Icon = item.icon;
                      const selected = draftStatus === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setDraftStatus(item.value)}
                          className={cn(
                            "flex min-h-12 min-w-0 items-center gap-2 overflow-hidden rounded-2xl border px-3 text-left text-sm font-bold transition-all",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(255,106,26,0.25)]"
                              : "border-slate-200 bg-white hover:border-primary/50 dark:border-white/10 dark:bg-slate-900",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {draftStatus === "signed" ? (
                  <div className="min-w-0 space-y-4 overflow-hidden rounded-[24px] border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_12px_28px_rgba(22,163,74,0.24)]">
                        <ReceiptText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black">Abonnement signé et commission</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Ces informations figent la valeur du contrat signé et calculent la commission du commercial.
                        </p>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <div className="min-w-0 space-y-2">
                        <Label>Abonnement restaurateur</Label>
                        <Select
                          value={draftSubscriptionPlanSlug}
                          onValueChange={(value) => setDraftSubscriptionPlanSlug(value as CommercialSubscriptionPlanSlug)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMERCIAL_SUBSCRIPTION_PLANS.map((plan) => (
                              <SelectItem key={plan.slug} value={plan.slug}>
                                {plan.name} - {formatChf(plan.monthlyPriceChf)}/mois
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-0 space-y-2">
                        <Label>Période de facturation</Label>
                        <Select
                          value={draftSubscriptionBillingPeriod}
                          onValueChange={(value) => setDraftSubscriptionBillingPeriod(value as CommercialSubscriptionBillingPeriod)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Mensuelle</SelectItem>
                            <SelectItem value="yearly">Annuelle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-0 space-y-2 overflow-hidden rounded-2xl border bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                        <Label className="flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Commission signature officielle
                        </Label>
                        <p className="text-sm font-black text-slate-950 dark:text-white">
                          {formatChf(draftAcquisitionCommissionChf)}
                        </p>
                        <p className="break-words text-xs leading-5 text-muted-foreground">
                          Sprint: {formatChf(draftSubscriptionPlan.sprintCommissionChf)} · Engagé:{" "}
                          {formatChf(draftSubscriptionPlan.engagedCommissionChf)}
                        </p>
                      </div>

                      <div className="min-w-0 space-y-2">
                        <Label>Mode de rémunération</Label>
                        <Select
                          value={draftCompensationMode}
                          onValueChange={(value) => setDraftCompensationMode(value as CommercialCompensationMode)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="commission_only">Sprint 60 jours sans fixe</SelectItem>
                            <SelectItem value="fixed_plus_reservation">Commercial engagé + réservations</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {draftCompensationMode === "fixed_plus_reservation" ? (
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="commercial-signed-restaurant">Restaurant TOK lié</Label>
                        <Input
                          id="commercial-signed-restaurant"
                          value={draftSignedRestaurantId}
                          onChange={(event) => setDraftSignedRestaurantId(event.target.value)}
                          placeholder="UUID du restaurant TOK lié"
                        />
                        <p className="text-xs leading-5 text-muted-foreground">
                          Le commercial engagé touche {formatChf(COMMERCIAL_RESERVATION_COMMISSION_CHF)} par réservation honorée
                          ({formatPercentRate(FIXED_RESERVATION_COMMISSION_RATE)} de la base TOK {formatChf(TOK_RESERVATION_BASE_CHF)}).
                          Sans restaurant TOK lié, la règle est enregistrée mais les réservations réelles ne peuvent pas encore être calculées.
                        </p>
                      </div>
                    ) : null}

                    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                      <div className="min-w-0 overflow-hidden rounded-2xl border bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">Valeur contrat</p>
                        <p className="mt-1 text-lg font-black">{formatChf(draftContractValueChf)}</p>
                      </div>
                      <div className="min-w-0 overflow-hidden rounded-2xl border bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">Acquisition</p>
                        <p className="mt-1 text-lg font-black">{formatChf(draftAcquisitionCommissionChf)}</p>
                        <p className="text-xs text-muted-foreground">
                          {draftCompensationMode === "fixed_plus_reservation" ? "Barème engagé" : "Barème sprint"}
                        </p>
                      </div>
                      <div className="min-w-0 overflow-hidden rounded-2xl border bg-white/80 p-3 dark:border-white/10 dark:bg-white/5">
                        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">Réservations</p>
                        <p className="mt-1 text-lg font-black">
                          {draftCompensationMode === "fixed_plus_reservation"
                            ? formatChf(commissionSummary?.reservation_commission?.amount_chf || 0)
                            : "0 CHF"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {draftCompensationMode === "fixed_plus_reservation"
                            ? `${Number(commissionSummary?.reservation_commission?.reservations_count || 0).toLocaleString("fr-CH")} réservation(s)`
                            : "Non actif"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="commercial-notes">Notes terrain</Label>
                  <Textarea
                    id="commercial-notes"
                    value={draftNotes}
                    onChange={(event) => setDraftNotes(event.target.value)}
                    placeholder="Décideur rencontré, objections, intérêt pour réservation Google, prochain contact..."
                    className="min-h-32"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="commercial-follow-up" className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Prochaine relance
                  </Label>
                  <Input
                    id="commercial-follow-up"
                    type="date"
                    value={draftFollowUpDate}
                    onChange={(event) => setDraftFollowUpDate(event.target.value)}
                  />
                </div>

                <Button
                  className="h-12 w-full rounded-2xl bg-orange-500 text-base font-black text-white hover:bg-orange-600"
                  onClick={() => saveFollowupMutation.mutate()}
                  disabled={saveFollowupMutation.isPending}
                >
                  {saveFollowupMutation.isPending ? "Enregistrement..." : "Enregistrer le suivi"}
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
    </div>
  ) : null;

  const previewResults = hasLaunchedSearch ? filteredProspects.slice(0, RESULT_PREVIEW_LIMIT) : [];

  return (
    <>
      <CommercialWorkspaceChrome activeLabel="Prospection" />
      <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.12),transparent_34%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_44%,#eef6ff_100%)] px-3 pb-6 pt-[calc(env(safe-area-inset-top,0px)+5.5rem)] text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.18),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#08111f_100%)] dark:text-white sm:px-4 md:px-6 md:pt-[calc(env(safe-area-inset-top,0px)+5rem)]">
      <div className="mx-auto flex w-full max-w-[1800px] min-w-0 flex-col gap-5">
        <section className="min-w-0 overflow-hidden rounded-[24px] border border-white/70 bg-white/88 p-4 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/74 sm:rounded-[30px] sm:p-5">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                Espace commercial
              </div>
              <h1 className="mt-4 break-words font-display text-3xl font-black leading-tight md:text-5xl">
                Carte commerciale des restaurants genevois
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                Connecté avec vos identifiants commerciaux, recherchez un établissement, ouvrez sa fiche sur la carte,
                puis marquez l'avancement. Les signatures restent rattachées au commercial qui les enregistre.
              </p>
              <div className="mt-4 flex min-w-0 flex-wrap gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                  <UserRound className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 truncate">{commercialName || "Commercial TOK"}</span>
                </span>
                <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="min-w-0 truncate">Accès commercial sécurisé</span>
                </span>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:flex-[0_1_560px]">
              {PIPELINE_STATUS_OPTIONS.map((item) => (
                <StatCard key={item.value} label={item.shortLabel} value={stats[item.value]} color={item.color} />
              ))}
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4 overflow-hidden rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/74 sm:rounded-[30px]">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black">Filtres</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commercial-search">Recherche</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="commercial-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRunSearch();
                    }
                  }}
                  placeholder="Nom, commune, téléphone, email..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CommercialPipelineStatus | typeof ALL_STATUSES)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>Tous les statuts</SelectItem>
                  {PIPELINE_STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Commune</Label>
              <Select value={communeFilter} onValueChange={setCommuneFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COMMUNES}>Toutes les communes</SelectItem>
                  {communeOptions.map((commune) => (
                    <SelectItem key={commune} value={commune}>{commune}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CATEGORIES}>Toutes les catégories</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Button type="button" className="h-11 rounded-2xl" onClick={handleRunSearch}>
                <Search className="mr-2 h-4 w-4" />
                Lancer la recherche
              </Button>
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={handleResetSearch}>
                Réinitialiser
              </Button>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
              {hasLaunchedSearch ? (
                <>
                  <p className="font-bold">{filteredProspects.length.toLocaleString("fr-CH")} restaurants trouvés</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recherche lancée sur le grand fichier CSV/JSON `outputs`, chargé depuis `/data/geneva-commercial-prospects.json`.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">Liste masquée avant recherche</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Renseignez les filtres puis cliquez sur Lancer la recherche. Vous pouvez aussi lancer avec tous les filtres sur Tous.
                  </p>
                </>
              )}
            </div>

            {hasLaunchedSearch ? (
              <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                {previewResults.map((prospect) => {
                  const status = getProspectStatus(prospect, followupsByObjectId);
                  const selected = selectedProspect?.sourceObjectId === prospect.sourceObjectId;
                  return (
                    <button
                      key={prospect.sourceObjectId}
                      type="button"
                      onClick={() => handleOpenProspectDetails(prospect)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-all hover:border-primary/50 hover:bg-orange-50/80 dark:hover:bg-orange-500/10",
                        selected
                          ? "border-primary bg-orange-50 shadow-[0_12px_34px_rgba(255,106,26,0.14)] dark:bg-orange-500/10"
                          : "border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{prospect.name}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{formatAddress(prospect) || "Adresse non renseignée"}</p>
                        </div>
                        <StatusPill status={status} />
                      </div>
                    </button>
                  );
                })}
                {filteredProspects.length === 0 ? (
                  <p className="rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Aucun restaurant ne correspond à cette recherche.
                  </p>
                ) : null}
                {filteredProspects.length > RESULT_PREVIEW_LIMIT ? (
                  <p className="rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                    {filteredProspects.length - RESULT_PREVIEW_LIMIT} autres points sont visibles sur la carte. Affinez la recherche pour réduire la liste.
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="min-w-0 overflow-hidden">
            <div className="space-y-3">
              <CommercialMapLegend />
              <CommercialProspectionMap
                prospects={mapProspects}
                followupsByObjectId={followupsByObjectId}
                selectedObjectId={selectedProspect?.sourceObjectId || null}
                onOpenDetails={handleOpenProspectDetails}
              />
            </div>
          </section>

          
        </section>
      </div>
      </main>
      <CommercialProspectDetailsDialog
        open={prospectDialogOpen}
        onOpenChange={setProspectDialogOpen}
        prospect={selectedProspect}
        followup={selectedFollowup}
        status={draftStatus}
        assignedName={selectedAssignedName}
        lastContactName={selectedLastContactName}
        signedName={selectedSignedName}
        commissionSummary={commissionSummary}
        workflowContent={workflowContent}
      />
    </>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Phone,
  Search,
  Store,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  fetchGenevaCommercialProspects,
  type GenevaCommercialProspect,
} from "@/data/genevaCommercialProspects";

type ProspectStatus = Database["public"]["Enums"]["commercial_visit_status"];

type CommercialProspectFollowup = {
  source_objectid: number;
  status: ProspectStatus;
  notes: string | null;
  assigned_to: string | null;
  last_contacted_by: string | null;
  visited_at: string | null;
  next_follow_up_at: string | null;
  updated_at: string | null;
};

const STATUS_OPTIONS: Array<{
  value: ProspectStatus;
  label: string;
  shortLabel: string;
  color: string;
  marker: string;
  badge: string;
  icon: typeof Circle;
}> = [
  {
    value: "not_visited",
    label: "À visiter",
    shortLabel: "À visiter",
    color: "#64748b",
    marker: "#64748b",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Circle,
  },
  {
    value: "visited",
    label: "Déjà visité",
    shortLabel: "Visité",
    color: "#2563eb",
    marker: "#2563eb",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    icon: CheckCircle2,
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
    label: "Signé",
    shortLabel: "Signé",
    color: "#059669",
    marker: "#059669",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: BriefcaseBusiness,
  },
  {
    value: "not_interested",
    label: "Pas intéressé",
    shortLabel: "Refus",
    color: "#dc2626",
    marker: "#dc2626",
    badge: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
];

const STATUS_META = STATUS_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<ProspectStatus, (typeof STATUS_OPTIONS)[number]>,
);

const ALL_STATUSES = "all";
const ALL_COMMUNES = "all";
const ALL_CATEGORIES = "all";
const RESULT_PREVIEW_LIMIT = 160;
const GENEVA_CENTER: L.LatLngExpression = [46.2044, 6.1432];

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
    <div className="rounded-2xl border bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: ProspectStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold", meta.badge)}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.shortLabel}
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
      className="inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary dark:border-white/10 dark:text-slate-200"
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </a>
  );
}

function CommercialProspectionMap({
  prospects,
  followupsByObjectId,
  selectedObjectId,
  onSelect,
}: {
  prospects: GenevaCommercialProspect[];
  followupsByObjectId: Map<number, CommercialProspectFollowup>;
  selectedObjectId: number | null;
  onSelect: (prospect: GenevaCommercialProspect) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasRendererRef = useRef<L.Renderer | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: GENEVA_CENTER,
      zoom: 12,
      preferCanvas: true,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapInstanceRef.current = map;
    canvasRendererRef.current = L.canvas({ padding: 0.5 });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      canvasRendererRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const renderer = canvasRendererRef.current;
    if (!map || !renderer) return;

    if (markerLayerRef.current) {
      markerLayerRef.current.clearLayers();
      markerLayerRef.current.removeFrom(map);
    }

    const layer = L.layerGroup().addTo(map);
    const bounds = L.latLngBounds([]);
    const coordinateUseCount = new Map<string, number>();

    for (const prospect of prospects) {
      const status = getProspectStatus(prospect, followupsByObjectId);
      const meta = STATUS_META[status];
      const selected = selectedObjectId === prospect.sourceObjectId;
      const latLng = getJitteredLatLng(prospect, coordinateUseCount);
      const marker = L.circleMarker(latLng, {
        renderer,
        radius: selected ? 8 : 5,
        color: selected ? "#111827" : "#ffffff",
        weight: selected ? 3 : 1.4,
        fillColor: meta.marker,
        fillOpacity: status === "not_visited" ? 0.78 : 0.95,
      });

      marker.bindTooltip(
        `<strong>${prospect.name}</strong><br>${meta.label}${prospect.commune ? ` · ${prospect.commune}` : ""}`,
        { direction: "top", sticky: true, opacity: 0.95 },
      );
      marker.on("click", () => onSelect(prospect));
      marker.addTo(layer);
      bounds.extend(latLng);
    }

    markerLayerRef.current = layer;

    if (prospects.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: prospects.length === 1 ? 17 : 13 });
    }
  }, [followupsByObjectId, onSelect, prospects, selectedObjectId]);

  return (
    <div
      ref={mapRef}
      className="h-[58vh] min-h-[420px] w-full overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_22px_70px_rgba(15,23,42,0.16)] dark:border-white/10 md:h-[calc(100vh-12rem)]"
    />
  );
}

export default function CommercialProspection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [communeFilter, setCommuneFilter] = useState(ALL_COMMUNES);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState<ProspectStatus>("not_visited");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFollowUpDate, setDraftFollowUpDate] = useState("");

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
        .select("source_objectid,status,notes,assigned_to,last_contacted_by,visited_at,next_follow_up_at,updated_at");

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
    const normalizedSearch = normalizeSearchValue(search);
    return prospectsWithSearch
      .filter(({ prospect, haystack }) => {
        if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
        if (communeFilter !== ALL_COMMUNES && prospect.commune !== communeFilter) return false;
        if (categoryFilter !== ALL_CATEGORIES && prospect.category !== categoryFilter) return false;
        if (statusFilter !== ALL_STATUSES && getProspectStatus(prospect, followupsByObjectId) !== statusFilter) return false;
        return true;
      })
      .map(({ prospect }) => prospect);
  }, [categoryFilter, communeFilter, followupsByObjectId, prospectsWithSearch, search, statusFilter]);

  const selectedProspect = useMemo(() => {
    return prospects.find((prospect) => prospect.sourceObjectId === selectedObjectId)
      || filteredProspects[0]
      || null;
  }, [filteredProspects, prospects, selectedObjectId]);

  const selectedFollowup = selectedProspect
    ? followupsByObjectId.get(selectedProspect.sourceObjectId) || null
    : null;

  useEffect(() => {
    if (!selectedProspect) return;
    const followup = followupsByObjectId.get(selectedProspect.sourceObjectId);
    setDraftStatus(followup?.status || "not_visited");
    setDraftNotes(followup?.notes || "");
    setDraftFollowUpDate(followup?.next_follow_up_at || "");
  }, [followupsByObjectId, selectedProspect]);

  useEffect(() => {
    if (selectedObjectId || !prospects[0]) return;
    setSelectedObjectId(prospects[0].sourceObjectId);
  }, [prospects, selectedObjectId]);

  useEffect(() => {
    if (!filteredProspects.length) {
      setSelectedObjectId(null);
      return;
    }

    if (!selectedObjectId || !filteredProspects.some((prospect) => prospect.sourceObjectId === selectedObjectId)) {
      setSelectedObjectId(filteredProspects[0].sourceObjectId);
    }
  }, [filteredProspects, selectedObjectId]);

  const stats = useMemo(() => {
    const base = STATUS_OPTIONS.reduce((acc, item) => {
      acc[item.value] = 0;
      return acc;
    }, {} as Record<ProspectStatus, number>);

    for (const prospect of prospects) {
      base[getProspectStatus(prospect, followupsByObjectId)] += 1;
    }

    return base;
  }, [followupsByObjectId, prospects]);

  const saveFollowupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProspect) throw new Error("Aucun restaurant sélectionné.");
      const now = new Date().toISOString();
      const existingVisitedAt = selectedFollowup?.visited_at || null;
      const shouldStampVisitedAt = draftStatus !== "not_visited" && !existingVisitedAt;

      const { error } = await getSupabase()
        .from("commercial_prospect_followups")
        .upsert({
          source_objectid: selectedProspect.sourceObjectId,
          status: draftStatus,
          notes: draftNotes.trim() || null,
          next_follow_up_at: draftFollowUpDate || null,
          visited_at: shouldStampVisitedAt ? now : existingVisitedAt,
          last_contacted_by: user?.id || null,
        }, { onConflict: "source_objectid" });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commercial-prospect-followups"] });
      toast({ title: "Suivi enregistré", description: "La carte et la fiche sont mises à jour." });
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

  const previewResults = filteredProspects.slice(0, RESULT_PREVIEW_LIMIT);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.12),transparent_34%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_44%,#eef6ff_100%)] px-4 py-6 text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.18),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#08111f_100%)] dark:text-white md:px-6">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-5">
        <section className="rounded-[30px] border border-white/70 bg-white/88 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/74">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-orange-700 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-200">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                Prospection terrain
              </div>
              <h1 className="mt-4 font-display text-3xl font-black leading-tight md:text-5xl">
                Carte commerciale des restaurants genevois
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                Recherchez un établissement, ouvrez sa fiche sur la carte, puis marquez l'avancement de la visite.
                Le point change de couleur pour donner une vision terrain immédiate.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 lg:min-w-[680px]">
              {STATUS_OPTIONS.map((item) => (
                <StatCard key={item.value} label={item.shortLabel} value={stats[item.value]} color={item.color} />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
          <aside className="space-y-4 rounded-[30px] border border-white/70 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/74">
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
                  placeholder="Nom, commune, téléphone, email..."
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProspectStatus | typeof ALL_STATUSES)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>Tous les statuts</SelectItem>
                  {STATUS_OPTIONS.map((item) => (
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

            <div className="rounded-2xl border bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
              <p className="font-bold">{filteredProspects.length.toLocaleString("fr-CH")} restaurants affichés</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: grand fichier CSV/JSON `outputs`, chargé depuis `/data/geneva-commercial-prospects.json`.
              </p>
            </div>

            <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
              {previewResults.map((prospect) => {
                const status = getProspectStatus(prospect, followupsByObjectId);
                const selected = selectedProspect?.sourceObjectId === prospect.sourceObjectId;
                return (
                  <button
                    key={prospect.sourceObjectId}
                    type="button"
                    onClick={() => handleSelectProspect(prospect)}
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
              {filteredProspects.length > RESULT_PREVIEW_LIMIT ? (
                <p className="rounded-2xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                  {filteredProspects.length - RESULT_PREVIEW_LIMIT} autres points sont visibles sur la carte. Affinez la recherche pour réduire la liste.
                </p>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
            <CommercialProspectionMap
              prospects={filteredProspects}
              followupsByObjectId={followupsByObjectId}
              selectedObjectId={selectedProspect?.sourceObjectId || null}
              onSelect={handleSelectProspect}
            />
          </section>

          <aside className="space-y-4 rounded-[30px] border border-white/70 bg-white/92 p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/78">
            {selectedProspect ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Fiche restaurant</p>
                    <h2 className="mt-2 font-display text-3xl font-black leading-tight">{selectedProspect.name}</h2>
                  </div>
                  <StatusPill status={draftStatus} />
                </div>

                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{formatAddress(selectedProspect) || "Adresse non renseignée"}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{selectedProspect.category || selectedProspect.branch || "Catégorie non renseignée"}</span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ContactLink
                    icon={Phone}
                    href={selectedProspect.phone ? `tel:${selectedProspect.phone.replace(/\s+/g, "")}` : null}
                    label={selectedProspect.phone}
                  />
                  <ContactLink
                    icon={Mail}
                    href={selectedProspect.email ? `mailto:${selectedProspect.email}` : null}
                    label={selectedProspect.email}
                  />
                  <ContactLink
                    icon={ExternalLink}
                    href={normalizeExternalUrl(selectedProspect.website)}
                    label={selectedProspect.website ? "Site web" : null}
                  />
                  <ContactLink
                    icon={Navigation}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedProspect.name} ${formatAddress(selectedProspect)}`)}`}
                    label="Itinéraire"
                  />
                </div>

                <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <p><span className="font-bold">Object ID:</span> {selectedProspect.sourceObjectId}</p>
                  {selectedProspect.legalName ? <p><span className="font-bold">Raison sociale:</span> {selectedProspect.legalName}</p> : null}
                  {selectedProspect.ideNumber ? <p><span className="font-bold">IDE:</span> {selectedProspect.ideNumber}</p> : null}
                  {selectedFollowup?.updated_at ? (
                    <p><span className="font-bold">Dernière mise à jour:</span> {new Date(selectedFollowup.updated_at).toLocaleString("fr-CH")}</p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <Label>Avancement terrain</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUS_OPTIONS.map((item) => {
                      const Icon = item.icon;
                      const selected = draftStatus === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setDraftStatus(item.value)}
                          className={cn(
                            "flex min-h-12 items-center gap-2 rounded-2xl border px-3 text-left text-sm font-bold transition-all",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-[0_14px_32px_rgba(255,106,26,0.25)]"
                              : "border-slate-200 bg-white hover:border-primary/50 dark:border-white/10 dark:bg-slate-900",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

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
              </>
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">
                Sélectionnez un restaurant sur la carte ou dans la liste.
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

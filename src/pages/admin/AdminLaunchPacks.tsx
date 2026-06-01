import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Search,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowLeft,
  Lock,
  Unlock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  useAdminLaunchPacks,
  useUpdateFulfillment,
  useUpdatePackStatus,
  useUpdateRestaurantFeatures,
  type AdminRestaurantPack,
} from "@/hooks/useAdminLaunchPacks";
import { Switch } from "@/components/ui/switch";
import { ALL_GATABLE_FEATURES, computeDisabledFeatures } from "@/lib/packFeatureGating";
import type { LaunchPackServiceSlug, PackService } from "@/lib/launchPacks";
import {
  getServiceIcon,
  getStatusColor,
  getStatusLabel,
  getPurchaseStatusLabel,
  computePackProgress,
  formatServiceDetail,
  type FulfillmentStatus,
  type PackPurchaseStatus,
  type ServiceFulfillment,
} from "@/lib/launchPacks";

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Tous les statuts" },
  { value: "paid", label: "Paye" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Termine" },
  { value: "cancelled", label: "Annule" },
];

const FULFILLMENT_STATUSES: { value: FulfillmentStatus; label: string }[] = [
  { value: "pending", label: "En attente" },
  { value: "scheduled", label: "Planifie" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Termine" },
  { value: "cancelled", label: "Annule" },
];

const PACK_STATUSES: { value: PackPurchaseStatus; label: string }[] = [
  { value: "paid", label: "Paye" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Termine" },
  { value: "cancelled", label: "Annule" },
];

function PackStatusBadge({ status }: { status: PackPurchaseStatus }) {
  const colors: Record<PackPurchaseStatus, string> = {
    pending_payment: "bg-gray-100 text-gray-700",
    paid: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}>
      {getPurchaseStatusLabel(status)}
    </span>
  );
}

function ProgressBar({ fulfillments }: { fulfillments: ServiceFulfillment[] }) {
  const progress = computePackProgress(fulfillments);
  const completed = fulfillments.filter((f) => f.status === "completed").length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{completed}/{fulfillments.length} services</span>
        <span>{progress}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function FulfillmentEditor({
  fulfillment,
  service,
  onUpdate,
  saving,
}: {
  fulfillment: ServiceFulfillment;
  service?: PackService;
  onUpdate: (id: string, patch: Partial<ServiceFulfillment>) => void;
  saving: string | null;
}) {
  const Icon = getServiceIcon(fulfillment.service_slug);
  const detail = service ? formatServiceDetail(service) : null;
  const isSaving = saving === fulfillment.id;
  const [editNotes, setEditNotes] = useState(fulfillment.notes || "");
  const [editScheduled, setEditScheduled] = useState(
    fulfillment.scheduled_at ? fulfillment.scheduled_at.slice(0, 10) : ""
  );

  function handleStatusChange(newStatus: string) {
    onUpdate(fulfillment.id, { status: newStatus as FulfillmentStatus });
  }

  function handleSaveDetails() {
    onUpdate(fulfillment.id, {
      notes: editNotes || null,
      scheduled_at: editScheduled ? new Date(editScheduled).toISOString() : null,
    } as Partial<ServiceFulfillment>);
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">{fulfillment.service_label}</p>
            {detail && (
              <p className="text-xs text-muted-foreground">{detail}</p>
            )}
            {fulfillment.completed_at && (
              <p className="text-xs text-muted-foreground">
                Termine le {new Date(fulfillment.completed_at).toLocaleDateString("fr-CH")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
          <Select value={fulfillment.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FULFILLMENT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  <span className={`inline-flex items-center gap-1.5`}>
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(s.value).split(" ")[0]}`} />
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Date planifiée
          </Label>
          <Input
            type="date"
            value={editScheduled}
            onChange={(e) => setEditScheduled(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Notes
          </Label>
          <Textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes internes..."
            className="text-xs min-h-[32px] h-8 resize-none"
          />
        </div>
      </div>

      {(editNotes !== (fulfillment.notes || "") ||
        editScheduled !== (fulfillment.scheduled_at ? fulfillment.scheduled_at.slice(0, 10) : "")) && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleSaveDetails} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Enregistrer
          </Button>
        </div>
      )}
    </div>
  );
}

function FeatureGatingEditor({ pack }: { pack: AdminRestaurantPack }) {
  const updateFeatures = useUpdateRestaurantFeatures();
  const currentDisabled = new Set<string>(
    Array.isArray(pack.restaurants?.disabled_dashboard_features)
      ? pack.restaurants.disabled_dashboard_features
      : []
  );
  const [draft, setDraft] = useState<Set<string>>(currentDisabled);
  const [saving, setSaving] = useState(false);

  // Sync draft when pack data changes
  useEffect(() => {
    setDraft(new Set(
      Array.isArray(pack.restaurants?.disabled_dashboard_features)
        ? pack.restaurants.disabled_dashboard_features
        : []
    ));
  }, [pack.restaurants?.disabled_dashboard_features]);

  const packServices = (pack.launch_packs.services as PackService[]).map((s) => s.service);
  const packDefault = new Set(computeDisabledFeatures(packServices as LaunchPackServiceSlug[]));

  const hasChanges = (() => {
    if (draft.size !== currentDisabled.size) return true;
    for (const f of draft) if (!currentDisabled.has(f)) return true;
    return false;
  })();

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetToPackDefaults() {
    setDraft(new Set(packDefault));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateFeatures.mutateAsync({
        restaurantId: pack.restaurant_id,
        disabledFeatures: Array.from(draft),
      });
      toast.success("Acces dashboard mis à jour");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Acces dashboard</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={resetToPackDefaults} title="Réinitialiser selon le pack">
              <RotateCcw className="h-3 w-3 mr-1" /> Defaut pack
            </Button>
            {hasChanges && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Enregistrer
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Activez ou desactivez les onglets du dashboard pour ce restaurant. Les onglets desactives sont grises et inaccessibles.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_GATABLE_FEATURES.map((feature) => {
            const isEnabled = !draft.has(feature.key);
            const isPackDefault = !packDefault.has(feature.key);
            const isOverridden = isEnabled !== isPackDefault;

            return (
              <div
                key={feature.key}
                className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isEnabled ? (
                    <Unlock className="h-3 w-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={`text-sm truncate ${isEnabled ? "" : "text-muted-foreground"}`}>
                    {feature.label}
                  </span>
                  {isOverridden && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">override</Badge>
                  )}
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={() => toggle(feature.key)}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PackDetailView({
  pack,
  onBack,
}: {
  pack: AdminRestaurantPack;
  onBack: () => void;
}) {
  const updateFulfillment = useUpdateFulfillment();
  const updatePackStatus = useUpdatePackStatus();
  const [savingId, setSavingId] = useState<string | null>(null);

  const fulfillments = pack.launch_pack_service_fulfillments || [];
  const progress = computePackProgress(fulfillments);

  async function handleFulfillmentUpdate(id: string, patch: Partial<ServiceFulfillment>) {
    setSavingId(id);
    try {
      await updateFulfillment.mutateAsync({ id, ...patch } as Parameters<typeof updateFulfillment.mutateAsync>[0]);
      toast.success("Service mis à jour");
    } catch (e) {
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSavingId(null);
    }
  }

  async function handlePackStatusChange(newStatus: string) {
    try {
      await updatePackStatus.mutateAsync({
        id: pack.id,
        status: newStatus as PackPurchaseStatus,
      });
      toast.success("Statut du pack mis à jour");
    } catch (e) {
      toast.error("Erreur lors de la mise à jour du statut");
    }
  }

  // Auto-detect if pack should move to in_progress or completed
  const allCompleted = fulfillments.length > 0 && fulfillments.every((f) => f.status === "completed");
  const anyStarted = fulfillments.some((f) => f.status !== "pending" && f.status !== "cancelled");
  const suggestedStatus: PackPurchaseStatus | null =
    allCompleted && pack.status !== "completed"
      ? "completed"
      : anyStarted && pack.status === "paid"
      ? "in_progress"
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-lg">
                {pack.restaurants?.name || "Restaurant"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {pack.launch_packs.name} — {pack.launch_packs.price_chf.toLocaleString("fr-CH")} CHF
              </p>
              {pack.paid_at && (
                <p className="text-xs text-muted-foreground">
                  Paye le {new Date(pack.paid_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Select value={pack.status} onValueChange={handlePackStatusChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProgressBar fulfillments={fulfillments} />

          {suggestedStatus && (
            <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between">
              <p className="text-sm text-blue-800">
                {suggestedStatus === "completed"
                  ? "Tous les services sont terminés. Marquer le pack comme terminé ?"
                  : "Des services ont demarre. Passer le pack en cours ?"}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePackStatusChange(suggestedStatus)}
              >
                {suggestedStatus === "completed" ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Terminer</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" /> En cours</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fulfillments */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Services ({fulfillments.length})</h2>
        {fulfillments.map((f) => (
          <FulfillmentEditor
            key={f.id}
            fulfillment={f}
            service={(pack.launch_packs.services as PackService[]).find(
              (service) => service.service === f.service_slug,
            )}
            onUpdate={handleFulfillmentUpdate}
            saving={savingId}
          />
        ))}
      </div>

      {/* Feature gating */}
      <FeatureGatingEditor pack={pack} />
    </div>
  );
}

export default function AdminLaunchPacks() {
  const { data: packs, isLoading } = useAdminLaunchPacks();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!packs) return [];
    return packs.filter((p) => {
      const matchesSearch =
        !search ||
        p.restaurants?.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.launch_packs?.name?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [packs, search, statusFilter]);

  const selectedPack = packs?.find((p) => p.id === selectedPackId) || null;

  // Stats
  const stats = useMemo(() => {
    if (!packs) return { total: 0, paid: 0, in_progress: 0, completed: 0 };
    return {
      total: packs.length,
      paid: packs.filter((p) => p.status === "paid").length,
      in_progress: packs.filter((p) => p.status === "in_progress").length,
      completed: packs.filter((p) => p.status === "completed").length,
    };
  }, [packs]);

  if (selectedPack) {
    return (
      <div className="container max-w-4xl mx-auto py-6 px-4">
        <PackDetailView
          pack={selectedPack}
          onBack={() => setSelectedPackId(null)}
        />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4 space-y-6">
      <DashboardPageHero
        badge="Services admin"
        title="Packs de lancement"
        description="Suivez les packs achetes, les activations de fonctionnalités et l'avancement des services promis aux restaurants."
        icon={Package}
        tone="violet"
        visualLabel="Packs"
        stats={[
          { label: "Total", value: stats.total, icon: Package },
          { label: "En cours", value: stats.in_progress, icon: Clock },
          { label: "Completes", value: stats.completed, icon: CheckCircle2 },
        ]}
        actions={(
          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour admin
            </Link>
          </Button>
        )}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.paid}</p>
            <p className="text-xs text-muted-foreground">Payes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.in_progress}</p>
            <p className="text-xs text-muted-foreground">En cours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Termines</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un restaurant ou un pack..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pack list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {packs && packs.length > 0
                ? "Aucun pack ne correspond aux filtres."
                : "Aucun pack de lancement achete pour le moment."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((pack) => {
            const fulfillments = pack.launch_pack_service_fulfillments || [];
            const progress = computePackProgress(fulfillments);
            const completed = fulfillments.filter((f) => f.status === "completed").length;

            return (
              <Card
                key={pack.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedPackId(pack.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">
                          {pack.restaurants?.name || "Restaurant"}
                        </h3>
                        <PackStatusBadge status={pack.status} />
                        <Badge variant="outline" className="text-xs">
                          {pack.launch_packs.name}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{pack.launch_packs.price_chf.toLocaleString("fr-CH")} CHF</span>
                        {pack.paid_at && (
                          <span>
                            Paye le {new Date(pack.paid_at).toLocaleDateString("fr-CH")}
                          </span>
                        )}
                        <span>
                          {completed}/{fulfillments.length} services terminés
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-48">
                      <div className="flex-1">
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{progress}%</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

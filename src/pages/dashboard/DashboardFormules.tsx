import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Percent, UtensilsCrossed, CakeSlice, Salad, Loader2, Timer, Users } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import {
  formatProgressiveCountdown,
  formatProgressiveServiceDate,
  getCurrentProgressiveDiscount,
  getNextProgressiveDiscount,
  getProgressiveOfferProgressPercent,
  getProgressiveOfferRemainingTables,
  getProgressiveOfferServiceLabel,
  getProgressiveOfferServicePeriod,
  type ProgressiveReservationOffer,
} from "@/lib/progressiveReservationOffers";
import { cn } from "@/lib/utils";
import { DEFAULT_SERVICE_SETTINGS, getServicePeriodLabel, type ServicePeriod } from "@/lib/serviceSettings";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

const DAYS_OF_WEEK = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Jeu" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sam" },
  { value: "sun", label: "Dim" },
] as const;

const SERVICE_PERIODS: Array<{ key: ServicePeriod; note: string }> = [
  { key: "lunch", note: "Formule visible sur le service du midi." },
  { key: "dinner", note: "Formule visible sur le service du soir." },
];

const PROGRESSIVE_OFFER_LIMIT = 20;
const PROGRESSIVE_RECURRENCE_MAX_COUNT = 30;

type ProgressiveOfferRecurrence = "none" | "daily" | "weekly";

type PresetFormula = {
  formula_key: string;
  name: string;
  description: string;
  categories: string[];
  defaultDiscount: number;
  icon: ComponentType<{ className?: string }>;
  color: string;
};

const PRESET_FORMULAS: PresetFormula[] = [
  {
    formula_key: "entree_plat",
    name: "Entree + Plat",
    description: "Offrez une réduction lorsque le client prend une entrée et un plat.",
    categories: ["Entrees", "Plats"],
    defaultDiscount: 15,
    icon: Salad,
    color: "from-emerald-500 to-green-600",
  },
  {
    formula_key: "plat_dessert",
    name: "Plat + Dessert",
    description: "Encouragez les clients a prendre un dessert avec leur plat.",
    categories: ["Plats", "Desserts"],
    defaultDiscount: 15,
    icon: CakeSlice,
    color: "from-orange-500 to-amber-600",
  },
  {
    formula_key: "entree_plat_dessert",
    name: "Entree + Plat + Dessert",
    description: "Le menu complet avec la meilleure remise.",
    categories: ["Entrees", "Plats", "Desserts"],
    defaultDiscount: 20,
    icon: UtensilsCrossed,
    color: "from-violet-500 to-indigo-600",
  },
];

type ServiceAvailability = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type Availability = {
  days: string[];
  servicePeriods: ServicePeriod[];
  services: Record<ServicePeriod, ServiceAvailability>;
  maxTablesPerService: number;
};

const DEFAULT_AVAILABILITY: Availability = {
  days: DAYS_OF_WEEK.map((day) => day.value),
  servicePeriods: ["lunch", "dinner"],
  services: {
    lunch: {
      enabled: true,
      startTime: DEFAULT_SERVICE_SETTINGS.lunch.start_time,
      endTime: DEFAULT_SERVICE_SETTINGS.lunch.end_time,
    },
    dinner: {
      enabled: true,
      startTime: DEFAULT_SERVICE_SETTINGS.dinner.start_time,
      endTime: DEFAULT_SERVICE_SETTINGS.dinner.end_time,
    },
  },
  maxTablesPerService: 10,
};

function normalizeMaxTablesPerService(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AVAILABILITY.maxTablesPerService;
  return Math.max(1, Math.min(200, Math.floor(numeric)));
}

function normalizeAvailability(raw: any): Availability {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_AVAILABILITY;
  }

  const days = Array.isArray(raw.days) && raw.days.length > 0
    ? raw.days.filter((day: unknown): day is string => typeof day === "string")
    : DEFAULT_AVAILABILITY.days;

  const normalized: Availability = {
    days,
    servicePeriods: [],
    services: {
      lunch: { ...DEFAULT_AVAILABILITY.services.lunch },
      dinner: { ...DEFAULT_AVAILABILITY.services.dinner },
    },
    maxTablesPerService: normalizeMaxTablesPerService(
      raw.maxTablesPerService ?? raw.max_tables_per_service,
    ),
  };

  const servicePeriods = Array.isArray(raw.servicePeriods)
    ? raw.servicePeriods.filter((period: unknown): period is ServicePeriod => period === "lunch" || period === "dinner")
    : [];

  if (raw.services && typeof raw.services === "object") {
    SERVICE_PERIODS.forEach(({ key }) => {
      const service = raw.services[key];
      if (!service || typeof service !== "object") return;
      normalized.services[key] = {
        enabled: typeof service.enabled === "boolean" ? service.enabled : DEFAULT_AVAILABILITY.services[key].enabled,
        startTime: typeof service.startTime === "string" ? service.startTime : DEFAULT_AVAILABILITY.services[key].startTime,
        endTime: typeof service.endTime === "string" ? service.endTime : DEFAULT_AVAILABILITY.services[key].endTime,
      };
    });
  } else {
    const fallbackStart = typeof raw.startTime === "string" ? raw.startTime : DEFAULT_AVAILABILITY.services.lunch.startTime;
    const fallbackEnd = typeof raw.endTime === "string" ? raw.endTime : DEFAULT_AVAILABILITY.services.lunch.endTime;
    normalized.services.lunch = {
      enabled: true,
      startTime: fallbackStart,
      endTime: fallbackEnd,
    };
    normalized.services.dinner = {
      enabled: false,
      startTime: DEFAULT_AVAILABILITY.services.dinner.startTime,
      endTime: DEFAULT_AVAILABILITY.services.dinner.endTime,
    };
  }

  normalized.servicePeriods = SERVICE_PERIODS
    .map(({ key }) => key)
    .filter((key) => normalized.services[key].enabled);

  if (servicePeriods.length > 0) {
    normalized.servicePeriods = servicePeriods;
    SERVICE_PERIODS.forEach(({ key }) => {
      normalized.services[key].enabled = servicePeriods.includes(key);
    });
  }

  if (normalized.servicePeriods.length === 0) {
    normalized.servicePeriods = ["lunch", "dinner"];
    normalized.services.lunch.enabled = true;
    normalized.services.dinner.enabled = true;
  }

  return normalized;
}

function serializeAvailability(availability: Availability) {
  const servicePeriods = SERVICE_PERIODS
    .map(({ key }) => key)
    .filter((key) => availability.services[key].enabled);

  return {
    days: availability.days,
    servicePeriods,
    maxTablesPerService: normalizeMaxTablesPerService(availability.maxTablesPerService),
    services: {
      lunch: availability.services.lunch,
      dinner: availability.services.dinner,
    },
  };
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function toDateTimeLocalValue(date: Date) {
  return `${toDateInputValue(date)}T${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getProgressiveServiceDefaultTime(period: ServicePeriod) {
  return DEFAULT_SERVICE_SETTINGS[period].start_time;
}

function readProgressiveRecurrence(offer: ProgressiveReservationOffer): {
  recurrence: ProgressiveOfferRecurrence;
  recurrenceCount: string;
} {
  const metadata = offer.metadata;
  const recurrence = metadata && typeof metadata === "object" && "recurrence" in metadata
    ? (metadata.recurrence as Record<string, unknown> | null)
    : null;
  const frequency = recurrence?.frequency === "daily" || recurrence?.frequency === "weekly"
    ? recurrence.frequency
    : "none";
  const occurrenceCount = typeof recurrence?.occurrence_count === "number"
    ? recurrence.occurrence_count
    : 1;

  return {
    recurrence: frequency,
    recurrenceCount: String(Math.max(1, Math.min(PROGRESSIVE_RECURRENCE_MAX_COUNT, occurrenceCount))),
  };
}

function buildDefaultProgressiveOfferForm() {
  const now = new Date();
  const serviceDate = new Date(now);
  serviceDate.setDate(serviceDate.getDate() + 1);
  serviceDate.setHours(19, 0, 0, 0);

  const countdownEnd = new Date(serviceDate);
  countdownEnd.setHours(18, 0, 0, 0);

  return {
    id: null as string | null,
    title: "Offre progressive du soir",
    description: "Plus les clients reservent avant la fin du compte a rebours, plus la remise finale augmente pour tous les participants.",
    serviceDate: toDateInputValue(serviceDate),
    serviceTime: "19:00",
    countdownEndsAt: toDateTimeLocalValue(countdownEnd),
    maxTables: "10",
    maxDiscountPercent: "50",
    isActive: true,
    recurrence: "none" as ProgressiveOfferRecurrence,
    recurrenceCount: "1",
  };
}

function progressiveOfferToForm(offer: ProgressiveReservationOffer) {
  const countdownEnd = new Date(offer.countdown_ends_at);
  const recurrence = readProgressiveRecurrence(offer);
  return {
    id: offer.id,
    title: offer.title || "Offre progressive",
    description: offer.description || "",
    serviceDate: offer.service_date,
    serviceTime: (offer.service_time || "19:00").slice(0, 5),
    countdownEndsAt: Number.isNaN(countdownEnd.getTime())
      ? buildDefaultProgressiveOfferForm().countdownEndsAt
      : toDateTimeLocalValue(countdownEnd),
    maxTables: String(offer.max_tables || 10),
    maxDiscountPercent: String(offer.max_discount_percent || 50),
    isActive: offer.status === "active",
    recurrence: recurrence.recurrence,
    recurrenceCount: recurrence.recurrenceCount,
  };
}

function ProgressiveOfferManager({
  restaurantId,
  offers,
  loading,
  onSaved,
}: {
  restaurantId: string;
  offers: ProgressiveReservationOffer[];
  loading: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(buildDefaultProgressiveOfferForm);

  const currentOffer = useMemo(
    () => offers.find((offer) => offer.status === "active") || offers[0] || null,
    [offers],
  );

  useEffect(() => {
    if (currentOffer) {
      setForm(progressiveOfferToForm(currentOffer));
    } else {
      setForm(buildDefaultProgressiveOfferForm());
    }
  }, [currentOffer]);

  const resetForNewOffer = () => {
    setForm(buildDefaultProgressiveOfferForm());
  };

  const save = async () => {
    const title = form.title.trim();
    const serviceDate = new Date(`${form.serviceDate}T12:00:00`);
    const countdownEnd = new Date(form.countdownEndsAt);
    const maxTables = Math.max(1, Math.min(200, Number(form.maxTables) || 10));
    const maxDiscountPercent = Math.max(1, Math.min(100, Number(form.maxDiscountPercent) || 50));
    const recurrenceCount = form.id || form.recurrence === "none"
      ? 1
      : Math.max(1, Math.min(PROGRESSIVE_RECURRENCE_MAX_COUNT, Number(form.recurrenceCount) || 1));
    const recurrenceIntervalDays = form.recurrence === "weekly" ? 7 : 1;

    if (!title) {
      toast({ title: "Titre requis", description: "Nommez l'offre progressive.", variant: "destructive" });
      return;
    }

    if (!form.serviceDate || Number.isNaN(serviceDate.getTime())) {
      toast({ title: "Date requise", description: "Choisissez le jour de service de l'offre.", variant: "destructive" });
      return;
    }

    if (Number.isNaN(countdownEnd.getTime())) {
      toast({ title: "Compte a rebours invalide", description: "Choisissez une date et une heure de fin.", variant: "destructive" });
      return;
    }

    const bookingCutoff = new Date(countdownEnd.getTime() - 30 * 60 * 1000);
    if (bookingCutoff.getTime() <= Date.now() && form.isActive) {
      toast({
        title: "Compte a rebours trop court",
        description: "Une offre active doit laisser au moins 30 minutes de reservation.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payloads = Array.from({ length: recurrenceCount }, (_, index) => {
        const offsetDays = form.recurrence === "none" ? 0 : index * recurrenceIntervalDays;
        const occurrenceServiceDate = addDays(serviceDate, offsetDays);
        const occurrenceCountdownEnd = addDays(countdownEnd, offsetDays);
        const occurrenceBookingCutoff = addDays(bookingCutoff, offsetDays);

        return {
        restaurant_id: restaurantId,
        title,
        description: form.description.trim() || null,
          service_date: toDateInputValue(occurrenceServiceDate),
        service_time: form.serviceTime || "19:00",
          countdown_ends_at: occurrenceCountdownEnd.toISOString(),
          booking_cutoff_at: occurrenceBookingCutoff.toISOString(),
        max_tables: maxTables,
        max_discount_percent: maxDiscountPercent,
        status: form.isActive ? "active" : "draft",
          metadata: {
            recurrence: {
              frequency: form.id ? "none" : form.recurrence,
              occurrence_index: index + 1,
              occurrence_count: recurrenceCount,
            },
          },
        updated_at: new Date().toISOString(),
        };
      });

      if (form.isActive) {
        const scheduledDates = payloads.map((payload) => payload.service_date);
        let conflictQuery = (supabase.from("reservation_progressive_offers" as any) as any)
          .select("id, service_date, title")
          .eq("restaurant_id", restaurantId)
          .eq("status", "active")
          .in("service_date", scheduledDates);

        if (form.id) {
          conflictQuery = conflictQuery.neq("id", form.id);
        }

        const { data: conflicts, error: conflictError } = await conflictQuery;
        if (conflictError) throw conflictError;

        if ((conflicts || []).length > 0) {
          const firstConflict = conflicts[0];
          toast({
            title: "Une offre existe deja ce jour-la",
            description: `Une seule offre progressive active est autorisee par jour. Conflit le ${firstConflict.service_date}.`,
            variant: "destructive",
          });
          return;
        }
      }

      if (form.id) {
        const { error } = await (supabase.from("reservation_progressive_offers" as any) as any)
          .update(payloads[0])
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase.from("reservation_progressive_offers" as any) as any)
          .insert(payloads)
          .select("id")
          .limit(1);
        if (error) throw error;
        if (data?.[0]?.id) setForm((current) => ({ ...current, id: data[0].id }));
      }

      onSaved();
      toast({
        title: form.isActive ? "Offre progressive activee" : "Offre progressive enregistree",
        description: recurrenceCount > 1 ? `${recurrenceCount} occurrences programmees.` : undefined,
      });
    } catch (error: any) {
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "L'offre progressive n'a pas pu etre enregistree.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const finalizeOffer = async (offerId: string) => {
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("finalize_progressive_offer", {
        p_offer_id: offerId,
      });
      if (error) throw error;
      onSaved();
      toast({
        title: "Remise finale figee",
        description: "Les reservations liees affichent maintenant le pourcentage final.",
      });
    } catch (error: any) {
      toast({
        title: "Finalisation impossible",
        description: error?.message || "Impossible de finaliser cette offre.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const previewOffer = {
    max_discount_percent: Number(form.maxDiscountPercent || 50),
    max_tables: Number(form.maxTables || 10),
    current_reservations_count: currentOffer?.current_reservations_count || 0,
    final_discount_percent: currentOffer?.final_discount_percent || null,
    status: currentOffer?.status || (form.isActive ? "active" : "draft"),
  };
  const currentDiscount = getCurrentProgressiveDiscount(previewOffer);
  const nextDiscount = getNextProgressiveDiscount(previewOffer);
  const selectedProgressiveService = getProgressiveOfferServicePeriod({ service_time: form.serviceTime });

  return (
    <Card className="border-orange-200 bg-orange-50/70 shadow-sm dark:bg-orange-950/10">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
              <Timer className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">Offre progressive</h3>
                {currentOffer ? <Badge variant="outline">{currentOffer.status}</Badge> : null}
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Le client reserve avant l'heure limite. Plus il y a de reservations sur le service choisi, plus la remise finale augmente pour tous les clients participants.
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-xl border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Remise actuelle</p>
              <p className="text-xl font-bold text-primary">-{currentDiscount}%</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Prochaine reservation</p>
              <p className="text-xl font-bold text-emerald-600">-{nextDiscount}%</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Tables restantes</p>
              <p className="text-xl font-bold">{currentOffer ? getProgressiveOfferRemainingTables(currentOffer) : form.maxTables}</p>
            </div>
          </div>
        </div>

        {currentOffer ? (
          <div className="grid gap-3 rounded-xl border bg-background/70 p-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-orange-500 text-white">
                  {formatProgressiveServiceDate(currentOffer.service_date)}
                </Badge>
                <Badge variant="outline">Service {getProgressiveOfferServiceLabel(currentOffer)}</Badge>
                <Badge variant="outline">
                  {currentOffer.current_reservations_count}/{currentOffer.max_tables} table(s)
                </Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${getProgressiveOfferProgressPercent(currentOffer)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Fin du compte a rebours dans {formatProgressiveCountdown(currentOffer.countdown_ends_at)}. Les clients peuvent reserver jusqu'a 30 minutes avant la fin.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" onClick={() => finalizeOffer(currentOffer.id)} disabled={saving || currentOffer.status === "finalized"}>
                Finaliser la remise
              </Button>
              <Button type="button" variant="ghost" onClick={resetForNewOffer} disabled={saving}>
                Nouvelle offre
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Titre</Label>
                <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2">
                <div>
                  <Label className="text-sm">Publier sur l'accueil</Label>
                  <p className="text-[11px] text-muted-foreground">Rend l'offre visible et reservable.</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Jour J</Label>
              <Input type="date" value={form.serviceDate} onChange={(event) => setForm((current) => ({ ...current, serviceDate: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Service cible</Label>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_PERIODS.map(({ key }) => {
                  const isSelected = selectedProgressiveService === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, serviceTime: getProgressiveServiceDefaultTime(key) }))}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        isSelected ? "border-orange-500 bg-orange-500/10 text-orange-700" : "border-border bg-background hover:border-orange-300",
                      )}
                    >
                      <span className="block font-semibold">{getServicePeriodLabel(key)}</span>
                      <span className="text-[11px] text-muted-foreground">Tous les creneaux du service</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Fin du compte a rebours</Label>
              <Input
                type="datetime-local"
                value={form.countdownEndsAt}
                onChange={(event) => setForm((current) => ({ ...current, countdownEndsAt: event.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Derniere reservation autorisee 30 minutes avant cette heure.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Recurrence</Label>
              <Select
                value={form.recurrence}
                onValueChange={(value) => setForm((current) => ({ ...current, recurrence: value as ProgressiveOfferRecurrence }))}
                disabled={Boolean(form.id)}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune recurrence</SelectItem>
                  <SelectItem value="daily">Tous les jours</SelectItem>
                  <SelectItem value="weekly">Chaque semaine</SelectItem>
                </SelectContent>
              </Select>
              {form.id ? (
                <p className="text-[11px] text-muted-foreground">La recurrence se parametre lors de la creation d'une nouvelle serie.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Nombre d'occurrences</Label>
              <Input
                type="number"
                min={1}
                max={PROGRESSIVE_RECURRENCE_MAX_COUNT}
                value={form.recurrenceCount}
                onChange={(event) => setForm((current) => ({ ...current, recurrenceCount: event.target.value }))}
                disabled={Boolean(form.id) || form.recurrence === "none"}
              />
              <p className="text-[11px] text-muted-foreground">Maximum {PROGRESSIVE_RECURRENCE_MAX_COUNT} dates programmees.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Tables maximum</Label>
              <Input type="number" min={1} max={200} value={form.maxTables} onChange={(event) => setForm((current) => ({ ...current, maxTables: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Remise maximum (%)</Label>
              <Input type="number" min={1} max={100} value={form.maxDiscountPercent} onChange={(event) => setForm((current) => ({ ...current, maxDiscountPercent: event.target.value }))} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Exemple: 50% pour 10 tables donne +5% a chaque reservation participante, puis la remise est figee a la fin du compte a rebours.
          </p>
          <Button type="button" onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enregistrer l'offre
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardFormules() {
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();

  const { data: formulas, isLoading } = useQuery({
    queryKey: ["dashboard-formulas", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("meal_formulas")
        .select("*, meal_formula_categories(*)")
        .eq("restaurant_id", selectedId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedId,
  });

  const { data: progressiveOffers = [], isLoading: isProgressiveOffersLoading } = useQuery({
    queryKey: ["dashboard-progressive-offers", selectedId],
    queryFn: async () => {
      if (!selectedId) return [] as ProgressiveReservationOffer[];
      const { data, error } = await (supabase.from("reservation_progressive_offers" as any) as any)
        .select("*")
        .eq("restaurant_id", selectedId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(PROGRESSIVE_OFFER_LIMIT);
      if (error) throw error;
      return (data || []) as ProgressiveReservationOffer[];
    },
    enabled: !!selectedId,
  });

  const formulaMap = useMemo(() => {
    const map = new Map<string, any>();
    (formulas || []).forEach((formula: any) => {
      if (formula?.formula_key) map.set(formula.formula_key, formula);
    });
    return map;
  }, [formulas]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Offre menu"
          title="Formules & Menus"
          description="Activez vos formules et choisissez precisement les services midi et soir pour guider les paniers sans complexifier la carte."
          icon={Percent}
          tone="orange"
          visualLabel="Formules"
          stats={[
            { label: "Modeles", value: PRESET_FORMULAS.length, icon: UtensilsCrossed },
            { label: "Configurees", value: (formulas?.length || 0) + progressiveOffers.length, icon: Percent },
            { label: "Restaurant", value: selectedId ? "Selectionne" : "Aucun", icon: Salad },
          ]}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {selectedId ? (
              <ProgressiveOfferManager
                restaurantId={selectedId}
                offers={progressiveOffers}
                loading={isProgressiveOffersLoading}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["dashboard-progressive-offers", selectedId] });
                }}
              />
            ) : null}
            {PRESET_FORMULAS.map((preset) => (
              <PresetFormulaCard
                key={preset.formula_key}
                preset={preset}
                existing={formulaMap.get(preset.formula_key) || null}
                restaurantId={selectedId!}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["dashboard-formulas", selectedId] });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function PresetFormulaCard({
  preset,
  existing,
  restaurantId,
  onSaved,
}: {
  preset: PresetFormula;
  existing: any | null;
  restaurantId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? false);
  const [discount, setDiscount] = useState((existing?.discount_percent ?? preset.defaultDiscount).toString());
  const [availability, setAvailability] = useState<Availability>(normalizeAvailability(existing?.availability));

  useEffect(() => {
    setIsActive(existing?.is_active ?? false);
    setDiscount((existing?.discount_percent ?? preset.defaultDiscount).toString());
    setAvailability(normalizeAvailability(existing?.availability));
  }, [existing, preset.defaultDiscount]);

  const save = async (active: boolean, discountValue: string, availabilityValue: Availability) => {
    const enabledServices = SERVICE_PERIODS.filter(({ key }) => availabilityValue.services[key].enabled);
    if (active && enabledServices.length === 0) {
      toast({
        title: "Service requis",
        description: "Active au moins un service pour rendre la formule disponible.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const discountPercent = Math.min(100, Math.max(1, Number(discountValue) || preset.defaultDiscount));
      const normalizedAvailability = {
        ...availabilityValue,
        maxTablesPerService: normalizeMaxTablesPerService(availabilityValue.maxTablesPerService),
      };
      const payload = {
        is_active: active,
        discount_percent: discountPercent,
        availability: serializeAvailability(normalizedAvailability),
      };

      if (existing) {
        const { error } = await supabase.from("meal_formulas").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("meal_formulas")
          .insert({
            restaurant_id: restaurantId,
            name: preset.name,
            description: preset.description,
            formula_key: preset.formula_key,
            discount_percent: discountPercent,
            applies_to: "both",
            is_active: active,
            is_standard: true,
            availability: serializeAvailability(normalizedAvailability),
          })
          .select("id")
          .single();
        if (error) throw error;

        if (data?.id) {
          const categories = preset.categories.map((category, index) => ({
            formula_id: data.id,
            category,
            course_order: index + 1,
          }));
          const { error: categoryError } = await supabase.from("meal_formula_categories").insert(categories);
          if (categoryError) throw categoryError;
        }
      }

      onSaved();
      toast({ title: active ? "Formule activée" : "Formule désactivée" });
    } catch (error: any) {
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "La formule n'a pas pu être enregistrée.",
        variant: "destructive",
      });
      setIsActive(existing?.is_active ?? false);
      setDiscount((existing?.discount_percent ?? preset.defaultDiscount).toString());
      setAvailability(normalizeAvailability(existing?.availability));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    setIsActive(checked);
    await save(checked, discount, availability);
  };

  const handleDiscountBlur = async () => {
    if (!existing && !isActive) return;
    await save(isActive, discount, availability);
  };

  const handleFormulaLimitBlur = async () => {
    const nextAvailability = {
      ...availability,
      maxTablesPerService: normalizeMaxTablesPerService(availability.maxTablesPerService),
    };
    setAvailability(nextAvailability);
    if (!existing && !isActive) return;
    await save(isActive, discount, nextAvailability);
  };

  const handleDayToggle = async (day: string) => {
    const nextAvailability = {
      ...availability,
      days: availability.days.includes(day)
        ? availability.days.filter((value) => value !== day)
        : [...availability.days, day],
    };
    setAvailability(nextAvailability);
    if (existing || isActive) {
      await save(isActive, discount, nextAvailability);
    }
  };

  const updateService = (period: ServicePeriod, patch: Partial<ServiceAvailability>) => {
    setAvailability((current) => {
      const nextServices = {
        ...current.services,
        [period]: {
          ...current.services[period],
          ...patch,
        },
      };
      const nextPeriods = SERVICE_PERIODS.map(({ key }) => key).filter((key) => nextServices[key].enabled);
      return {
        ...current,
        services: nextServices,
        servicePeriods: nextPeriods,
      };
    });
  };

  const handleServiceToggle = async (period: ServicePeriod, checked: boolean) => {
    const nextAvailability = {
      ...availability,
      services: {
        ...availability.services,
        [period]: {
          ...availability.services[period],
          enabled: checked,
        },
      },
      servicePeriods: SERVICE_PERIODS
        .map(({ key }) => key)
        .filter((key) => (key === period ? checked : availability.services[key].enabled)),
    };
    setAvailability(nextAvailability);
    if (existing || isActive) {
      await save(isActive, discount, nextAvailability);
    }
  };

  const handleServiceTimeBlur = async () => {
    if (!existing && !isActive) return;
    await save(isActive, discount, availability);
  };

  const Icon = preset.icon;

  return (
    <Card className={cn("transition-all", isActive ? "border-primary/30 shadow-sm" : "opacity-75")}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", preset.color)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{preset.name}</h3>
                {isActive && <Badge className="bg-green-100 text-[10px] text-green-700">Active</Badge>}
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {preset.categories.map((category, index) => (
                  <span key={category}>
                    {index > 0 && <span className="mx-0.5 text-muted-foreground">+</span>}
                    <Badge variant="outline" className="text-[10px] font-normal">{category}</Badge>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Switch checked={isActive} onCheckedChange={handleToggle} disabled={saving} />
        </div>

        {(isActive || existing) && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 md:grid-cols-[8rem_12rem_minmax(0,1fr)] md:items-end">
              <div className="w-32 space-y-1">
                <Label className="text-xs font-medium">Réduction</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    onBlur={handleDiscountBlur}
                    className="pr-8"
                    disabled={saving}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Tables maximum avec promotion</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={availability.maxTablesPerService}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAvailability((current) => ({
                      ...current,
                      maxTablesPerService: value === "" ? 1 : normalizeMaxTablesPerService(value),
                    }));
                  }}
                  onBlur={handleFormulaLimitBlur}
                  disabled={saving}
                />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">
                  Quand la limite est atteinte, la formule s'arrete jusqu'au prochain service.
                  Le pourcentage de réduction applique sur le total de la formule.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Jours disponibles</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleDayToggle(day.value)}
                    disabled={saving}
                    className={cn(
                      "h-9 w-10 rounded-lg border text-xs font-medium transition-colors",
                      availability.days.includes(day.value)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium">Services disponibles</Label>
                <p className="text-[11px] text-muted-foreground">
                  Active chaque formule sur le midi, le soir, ou les deux avec une plage horaire dédiée.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {SERVICE_PERIODS.map((period) => {
                  const settings = availability.services[period.key];
                  return (
                    <div key={period.key} className="rounded-xl border bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{getServicePeriodLabel(period.key)}</p>
                          <p className="text-[11px] text-muted-foreground">{period.note}</p>
                        </div>
                        <Switch
                          checked={settings.enabled}
                          onCheckedChange={(checked) => handleServiceToggle(period.key, checked)}
                          disabled={saving}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Debut</Label>
                          <Input
                            type="time"
                            value={settings.startTime}
                            onChange={(event) => updateService(period.key, { startTime: event.target.value })}
                            onBlur={handleServiceTimeBlur}
                            disabled={saving || !settings.enabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-medium">Fin</Label>
                          <Input
                            type="time"
                            value={settings.endTime}
                            onChange={(event) => updateService(period.key, { endTime: event.target.value })}
                            onBlur={handleServiceTimeBlur}
                            disabled={saving || !settings.enabled}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

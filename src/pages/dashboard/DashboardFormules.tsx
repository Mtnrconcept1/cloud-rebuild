import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Percent,
  UtensilsCrossed,
  CakeSlice,
  Salad,
  Loader2,
  Timer,
  Users,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

const COMMERCIAL_DEMO_FORMULAS_TOOL = "formulas";
const COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL = "progressive-offers";

function commercialDemoFormulaId(sessionId: string, formulaKey: string) {
  return `commercial-demo-formula-${sessionId}-${formulaKey}`;
}

function commercialDemoProgressiveOfferId(sessionId: string, serviceDate: string, index: number) {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  return `commercial-demo-progressive-${sessionId}-${serviceDate}-${suffix}`;
}

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

const PROGRESSIVE_OFFER_LIMIT = 120;
const PROGRESSIVE_RECURRENCE_MAX_COUNT = 30;

const PROGRESSIVE_EDITOR_STEPS = [
  {
    id: "base",
    eyebrow: "Etape 1",
    title: "Base de l'offre",
    description: "Titre, description et visibilite client.",
  },
  {
    id: "schedule",
    eyebrow: "Etape 2",
    title: "Calendrier",
    description: "Jour unique, occurrence, service et compte a rebours.",
  },
  {
    id: "capacity",
    eyebrow: "Etape 3",
    title: "Capacite et remise",
    description: "Tables disponibles, remise maximum et enregistrement.",
  },
] as const;

type ProgressiveEditorStepId = (typeof PROGRESSIVE_EDITOR_STEPS)[number]["id"];

type ProgressiveScheduleMode = "single" | "occurrence";
type ProgressiveOccurrenceMode = "custom" | "weekly";
type WeekdayValue = (typeof DAYS_OF_WEEK)[number]["value"];

const WEEKDAY_BY_JS_DAY: WeekdayValue[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

function fromDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getProgressiveServiceDefaultTime(period: ServicePeriod) {
  return DEFAULT_SERVICE_SETTINGS[period].start_time;
}

function isDateInputValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTimeValue(value: string | null | undefined, fallback: string) {
  const normalized = typeof value === "string" ? value.slice(0, 5) : "";
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
}

function buildProgressiveDateTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${normalizeTimeValue(timeValue, "19:00")}:00`);
}

function getProgressiveCountdownDefaults(period: ServicePeriod) {
  return period === "lunch"
    ? { startTime: "08:00", endTime: "11:30" }
    : { startTime: "12:00", endTime: "18:00" };
}

function readLocalTimeFromIso(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function getWeekdayValue(date: Date): WeekdayValue {
  return WEEKDAY_BY_JS_DAY[date.getDay()] || "mon";
}

function getUniqueSortedDates(dates: string[]) {
  return Array.from(new Set(dates.filter(isDateInputValue))).sort();
}

function getDateRangeByWeekdays(startValue: string, endValue: string, weekdays: WeekdayValue[]) {
  const startDate = fromDateInputValue(startValue);
  const endDate = fromDateInputValue(endValue);
  if (!startDate || !endDate || endDate.getTime() < startDate.getTime() || weekdays.length === 0) return [];

  const selected = new Set<WeekdayValue>(weekdays);
  const dates: string[] = [];
  let cursor = new Date(startDate);

  while (cursor.getTime() <= endDate.getTime() && dates.length < PROGRESSIVE_RECURRENCE_MAX_COUNT) {
    if (selected.has(getWeekdayValue(cursor))) {
      dates.push(toDateInputValue(cursor));
    }
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function readProgressiveRecurrence(offer: ProgressiveReservationOffer): {
  occurrenceMode: ProgressiveOccurrenceMode;
  selectedDates: string[];
  weekdays: WeekdayValue[];
  recurrenceEndDate: string;
} {
  const metadata = offer.metadata;
  const recurrence = metadata && typeof metadata === "object" && "recurrence" in metadata
    ? (metadata.recurrence as Record<string, unknown> | null)
    : null;
  const occurrenceMode = recurrence?.frequency === "weekly" ? "weekly" : "custom";
  const selectedDates = Array.isArray(recurrence?.selected_dates)
    ? getUniqueSortedDates(recurrence.selected_dates.filter((date): date is string => typeof date === "string"))
    : [offer.service_date];
  const weekdays = Array.isArray(recurrence?.weekdays)
    ? recurrence.weekdays.filter((day): day is WeekdayValue => DAYS_OF_WEEK.some(({ value }) => value === day))
    : [getWeekdayValue(new Date(`${offer.service_date}T12:00:00`))];
  const recurrenceEndDate = typeof recurrence?.ends_on === "string" && isDateInputValue(recurrence.ends_on)
    ? recurrence.ends_on
    : offer.service_date;

  return {
    occurrenceMode,
    selectedDates,
    weekdays: weekdays.length > 0 ? weekdays : [getWeekdayValue(new Date(`${offer.service_date}T12:00:00`))],
    recurrenceEndDate,
  };
}

function buildDefaultProgressiveOfferForm() {
  const now = new Date();
  const serviceDate = new Date(now);
  serviceDate.setDate(serviceDate.getDate() + 1);
  serviceDate.setHours(19, 0, 0, 0);
  const countdownDefaults = getProgressiveCountdownDefaults("dinner");
  const recurrenceEnd = addDays(serviceDate, 14);
  const serviceDateValue = toDateInputValue(serviceDate);

  return {
    id: null as string | null,
    title: "Offre progressive du soir",
    description: "Plus les clients reservent avant la fin du compte a rebours, plus la remise finale augmente pour tous les participants.",
    serviceDate: serviceDateValue,
    serviceTime: "19:00",
    scheduleMode: "single" as ProgressiveScheduleMode,
    occurrenceMode: "custom" as ProgressiveOccurrenceMode,
    selectedDates: [serviceDateValue],
    weekdays: [getWeekdayValue(serviceDate)] as WeekdayValue[],
    recurrenceEndDate: toDateInputValue(recurrenceEnd),
    countdownStartTime: countdownDefaults.startTime,
    countdownEndTime: countdownDefaults.endTime,
    maxTables: "10",
    maxDiscountPercent: "50",
    isActive: true,
  };
}

function buildProgressiveOfferFormForDate(serviceDate: string) {
  const form = buildDefaultProgressiveOfferForm();
  const date = fromDateInputValue(serviceDate) || new Date();
  return {
    ...form,
    serviceDate,
    selectedDates: [serviceDate],
    weekdays: [getWeekdayValue(date)],
    recurrenceEndDate: toDateInputValue(addDays(date, 14)),
  };
}

function progressiveOfferToForm(offer: ProgressiveReservationOffer) {
  const recurrence = readProgressiveRecurrence(offer);
  const serviceTime = normalizeTimeValue(offer.service_time, "19:00");
  const countdownDefaults = getProgressiveCountdownDefaults(getProgressiveOfferServicePeriod({ service_time: serviceTime }));
  return {
    id: offer.id,
    title: offer.title || "Offre progressive",
    description: offer.description || "",
    serviceDate: offer.service_date,
    serviceTime,
    scheduleMode: "single" as ProgressiveScheduleMode,
    occurrenceMode: recurrence.occurrenceMode,
    selectedDates: recurrence.selectedDates.length > 0 ? recurrence.selectedDates : [offer.service_date],
    weekdays: recurrence.weekdays,
    recurrenceEndDate: recurrence.recurrenceEndDate,
    countdownStartTime: readLocalTimeFromIso(offer.countdown_starts_at, countdownDefaults.startTime),
    countdownEndTime: readLocalTimeFromIso(offer.countdown_ends_at, countdownDefaults.endTime),
    maxTables: String(offer.max_tables || 10),
    maxDiscountPercent: String(offer.max_discount_percent || 50),
    isActive: offer.status === "active",
  };
}

type ProgressiveOfferForm = ReturnType<typeof buildDefaultProgressiveOfferForm>;

function getProgressiveScheduledDates(form: ProgressiveOfferForm) {
  if (form.id || form.scheduleMode === "single") return getUniqueSortedDates([form.serviceDate]);
  if (form.occurrenceMode === "weekly") {
    return getDateRangeByWeekdays(form.serviceDate, form.recurrenceEndDate, form.weekdays);
  }
  return getUniqueSortedDates(form.selectedDates.length > 0 ? form.selectedDates : [form.serviceDate]);
}

function ProgressiveOfferManager({
  restaurantId,
  offers,
  loading,
  demoSessionId,
  onDemoOffersChanged,
  onSaved,
}: {
  restaurantId: string;
  offers: ProgressiveReservationOffer[];
  loading: boolean;
  demoSessionId?: string | null;
  onDemoOffersChanged?: (offers: ProgressiveReservationOffer[]) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(buildDefaultProgressiveOfferForm);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => buildDefaultProgressiveOfferForm().serviceDate);
  const [calendarTouched, setCalendarTouched] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<ProgressiveEditorStepId>("base");

  const offersByDate = useMemo(() => {
    const grouped = new Map<string, ProgressiveReservationOffer[]>();
    offers.forEach((offer) => {
      const list = grouped.get(offer.service_date) || [];
      list.push(offer);
      grouped.set(offer.service_date, list);
    });
    return grouped;
  }, [offers]);

  const currentOffer = useMemo(
    () => {
      const selectedDateOffers = offersByDate.get(selectedCalendarDate) || [];
      return (
      selectedDateOffers.find((offer) => offer.status === "active")
      || selectedDateOffers.find((offer) => offer.status === "draft")
      || selectedDateOffers[0]
      || null
      );
    },
    [offersByDate, selectedCalendarDate],
  );

  useEffect(() => {
    if (calendarTouched || offers.length === 0) return;
    const firstOffer = offers.find((offer) => offer.status === "active") || offers[0];
    if (firstOffer) setSelectedCalendarDate(firstOffer.service_date);
  }, [calendarTouched, offers]);

  useEffect(() => {
    if (currentOffer) {
      setForm(progressiveOfferToForm(currentOffer));
    } else {
      setForm(buildProgressiveOfferFormForDate(selectedCalendarDate));
    }
  }, [currentOffer, selectedCalendarDate]);

  const openEditor = (nextForm = form) => {
    setForm(nextForm);
    setEditorStep("base");
    setEditorOpen(true);
  };

  const resetForNewOffer = () => {
    openEditor(buildProgressiveOfferFormForDate(selectedCalendarDate));
  };

  const selectCalendarDate = (date: Date | undefined) => {
    if (!date) return;
    setCalendarTouched(true);
    setSelectedCalendarDate(toDateInputValue(date));
  };

  const save = async () => {
    const title = form.title.trim();
    const scheduledDates = getProgressiveScheduledDates(form);
    const maxTables = Math.max(1, Math.min(200, Number(form.maxTables) || 10));
    const maxDiscountPercent = Math.max(1, Math.min(100, Number(form.maxDiscountPercent) || 50));
    const serviceTime = normalizeTimeValue(form.serviceTime, "19:00");
    const countdownStartTime = normalizeTimeValue(form.countdownStartTime, getProgressiveCountdownDefaults(selectedProgressiveService).startTime);
    const countdownEndTime = normalizeTimeValue(form.countdownEndTime, getProgressiveCountdownDefaults(selectedProgressiveService).endTime);

    if (!title) {
      toast({ title: "Titre requis", description: "Nommez l'offre progressive.", variant: "destructive" });
      return false;
    }

    if (scheduledDates.length === 0) {
      toast({
        title: "Date requise",
        description: form.scheduleMode === "single"
          ? "Choisissez le jour unique de l'offre."
          : "Choisissez au moins une date ou un jour de la semaine pour l'occurrence.",
        variant: "destructive",
      });
      return false;
    }

    if (scheduledDates.length > PROGRESSIVE_RECURRENCE_MAX_COUNT) {
      toast({
        title: "Trop d'occurrences",
        description: `Limitez la serie a ${PROGRESSIVE_RECURRENCE_MAX_COUNT} dates maximum.`,
        variant: "destructive",
      });
      return false;
    }

    for (const dateValue of scheduledDates) {
      const serviceAt = buildProgressiveDateTime(dateValue, serviceTime);
      const countdownStart = buildProgressiveDateTime(dateValue, countdownStartTime);
      const countdownEnd = buildProgressiveDateTime(dateValue, countdownEndTime);
      const bookingCutoff = new Date(countdownEnd.getTime() - 30 * 60 * 1000);

      if ([serviceAt, countdownStart, countdownEnd, bookingCutoff].some((date) => Number.isNaN(date.getTime()))) {
        toast({ title: "Compte a rebours invalide", description: "Verifiez les dates et les heures choisies.", variant: "destructive" });
        return false;
      }

      if (countdownStart.getTime() >= countdownEnd.getTime()) {
        toast({
          title: "Compte a rebours invalide",
          description: "L'heure de debut doit etre avant l'heure de fin du compte a rebours.",
          variant: "destructive",
        });
        return false;
      }

      if (countdownEnd.getTime() >= serviceAt.getTime()) {
        toast({
          title: "Fin du compte a rebours invalide",
          description: "La fin du compte a rebours doit etre avant l'heure de reservation du client.",
          variant: "destructive",
        });
        return false;
      }

      if (bookingCutoff.getTime() <= Date.now() && form.isActive) {
        toast({
          title: "Compte a rebours trop court",
          description: "Une offre active doit laisser au moins 30 minutes de reservation.",
          variant: "destructive",
        });
        return false;
      }
    }

    setSaving(true);
    try {
      const payloads = scheduledDates.map((dateValue, index) => {
        const occurrenceCountdownStart = buildProgressiveDateTime(dateValue, countdownStartTime);
        const occurrenceCountdownEnd = buildProgressiveDateTime(dateValue, countdownEndTime);
        const occurrenceBookingCutoff = new Date(occurrenceCountdownEnd.getTime() - 30 * 60 * 1000);

        return {
          restaurant_id: restaurantId,
          title,
          description: form.description.trim() || null,
          service_date: dateValue,
          service_time: serviceTime,
          countdown_starts_at: occurrenceCountdownStart.toISOString(),
          countdown_ends_at: occurrenceCountdownEnd.toISOString(),
          booking_cutoff_at: occurrenceBookingCutoff.toISOString(),
          max_tables: maxTables,
          max_discount_percent: maxDiscountPercent,
          status: form.isActive ? "active" : "draft",
          metadata: {
            recurrence: {
              mode: form.id ? "single" : form.scheduleMode,
              frequency: form.id || form.scheduleMode === "single" ? "none" : form.occurrenceMode,
              occurrence_index: index + 1,
              occurrence_count: scheduledDates.length,
              selected_dates: scheduledDates,
              weekdays: form.scheduleMode === "occurrence" && form.occurrenceMode === "weekly" ? form.weekdays : [],
              ends_on: form.scheduleMode === "occurrence" && form.occurrenceMode === "weekly" ? form.recurrenceEndDate : null,
              countdown_start_time: countdownStartTime,
              countdown_end_time: countdownEndTime,
            },
          },
          updated_at: new Date().toISOString(),
        };
      });

      if (demoSessionId) {
        const current = readCommercialDemoToolState<ProgressiveReservationOffer[]>(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          offers,
        );

        if (form.isActive) {
          const conflict = current.find((offer) => (
            offer.status === "active"
            && scheduledDates.includes(offer.service_date)
            && offer.id !== form.id
          ));
          if (conflict) {
            toast({
              title: "Une offre existe deja ce jour-la",
              description: `Une seule offre progressive active est autorisee par jour. Conflit le ${conflict.service_date}.`,
              variant: "destructive",
            });
            return false;
          }
        }

        const now = new Date().toISOString();
        let firstSavedId = form.id || "";
        let next: ProgressiveReservationOffer[];

        if (form.id) {
          const existingOffer = current.find((offer) => offer.id === form.id);
          const existingCreatedAt = (existingOffer as ProgressiveReservationOffer & { created_at?: string } | undefined)?.created_at;
          const exists = Boolean(existingOffer);
          const updated = {
            ...(existingOffer || {}),
            ...payloads[0],
            id: form.id,
            created_at: existingCreatedAt || now,
          } as ProgressiveReservationOffer;
          next = exists
            ? current.map((offer) => offer.id === form.id ? updated : offer)
            : [updated, ...current];
        } else {
          const created = payloads.map((payload, index) => ({
            ...payload,
            id: commercialDemoProgressiveOfferId(
              demoSessionId,
              payload.service_date,
              index,
            ),
            current_reservations_count: 0,
            final_discount_percent: null,
            created_at: now,
          })) as ProgressiveReservationOffer[];
          firstSavedId = created[0]?.id || "";
          next = [...created, ...current];
        }

        writeCommercialDemoToolState(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          next,
        );
        onDemoOffersChanged?.(next);
        if (firstSavedId) setForm((currentForm) => ({ ...currentForm, id: firstSavedId }));
        onSaved();
        toast({
          title: form.isActive ? "Offre progressive activee" : "Offre progressive enregistree",
          description: scheduledDates.length > 1 ? `${scheduledDates.length} occurrences programmees.` : undefined,
        });
        return true;
      }

      if (form.isActive) {
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
          return false;
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
        description: scheduledDates.length > 1 ? `${scheduledDates.length} occurrences programmees.` : undefined,
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Enregistrement impossible",
        description: error?.message || "L'offre progressive n'a pas pu etre enregistree.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finalizeOffer = async (offerId: string) => {
    setSaving(true);
    try {
      if (demoSessionId) {
        const current = readCommercialDemoToolState<ProgressiveReservationOffer[]>(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          offers,
        );
        const next = current.map((offer) => offer.id === offerId
          ? {
            ...offer,
            status: "finalized",
            final_discount_percent: getCurrentProgressiveDiscount(offer),
            updated_at: new Date().toISOString(),
          } as ProgressiveReservationOffer
          : offer);
        writeCommercialDemoToolState(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          next,
        );
        onDemoOffersChanged?.(next);
        onSaved();
        toast({
          title: "Remise finale figee",
          description: "Les reservations liees affichent maintenant le pourcentage final.",
        });
        return;
      }

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

  const updateOfferStatus = async (offer: ProgressiveReservationOffer, status: "active" | "draft") => {
    if (offer.status === status) return;
    setSaving(true);
    try {
      if (demoSessionId) {
        const current = readCommercialDemoToolState<ProgressiveReservationOffer[]>(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          offers,
        );
        if (status === "active") {
          const conflict = current.find((candidate) => (
            candidate.status === "active"
            && candidate.service_date === offer.service_date
            && candidate.id !== offer.id
          ));
          if (conflict) {
            toast({
              title: "Une offre existe deja ce jour-la",
              description: "Désactivez l'autre offre active avant d'activer celle-ci.",
              variant: "destructive",
            });
            return;
          }
        }

        const next = current.map((candidate) => candidate.id === offer.id
          ? { ...candidate, status, updated_at: new Date().toISOString() } as ProgressiveReservationOffer
          : candidate);
        writeCommercialDemoToolState(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          next,
        );
        onDemoOffersChanged?.(next);
        onSaved();
        toast({
          title: status === "active" ? "Offre activée" : "Offre désactivée",
          description: status === "active"
            ? "Cette offre est maintenant visible pour le jour selectionne."
            : "Cette offre reste configuree mais n'est plus visible aux clients.",
        });
        return;
      }

      if (status === "active") {
        const { data: conflicts, error: conflictError } = await (supabase.from("reservation_progressive_offers" as any) as any)
          .select("id, service_date, title")
          .eq("restaurant_id", restaurantId)
          .eq("status", "active")
          .eq("service_date", offer.service_date)
          .neq("id", offer.id);
        if (conflictError) throw conflictError;
        if ((conflicts || []).length > 0) {
          toast({
            title: "Une offre existe deja ce jour-la",
            description: "Désactivez l'autre offre active avant d'activer celle-ci.",
            variant: "destructive",
          });
          return;
        }
      }

      const { error } = await (supabase.from("reservation_progressive_offers" as any) as any)
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", offer.id);
      if (error) throw error;

      onSaved();
      toast({
        title: status === "active" ? "Offre activée" : "Offre désactivée",
        description: status === "active"
          ? "Cette offre est maintenant visible pour le jour selectionne."
          : "Cette offre reste configuree mais n'est plus visible aux clients.",
      });
    } catch (error: any) {
      toast({
        title: "Changement impossible",
        description: error?.message || "Le statut de l'offre n'a pas pu etre modifie.",
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
  const scheduledPreviewDates = getProgressiveScheduledDates(form);
  const selectedOccurrenceDateObjects = form.selectedDates
    .map((date) => fromDateInputValue(date))
    .filter(Boolean) as Date[];
  const editorStepIndex = PROGRESSIVE_EDITOR_STEPS.findIndex((step) => step.id === editorStep);
  const currentEditorStep = PROGRESSIVE_EDITOR_STEPS[Math.max(0, editorStepIndex)];
  const isFirstEditorStep = editorStepIndex <= 0;
  const isLastEditorStep = editorStepIndex === PROGRESSIVE_EDITOR_STEPS.length - 1;
  const goToPreviousEditorStep = () => {
    setEditorStep(PROGRESSIVE_EDITOR_STEPS[Math.max(0, editorStepIndex - 1)].id);
  };
  const goToNextEditorStep = () => {
    setEditorStep(PROGRESSIVE_EDITOR_STEPS[Math.min(PROGRESSIVE_EDITOR_STEPS.length - 1, editorStepIndex + 1)].id);
  };
  const selectedCalendarDateObject = fromDateInputValue(selectedCalendarDate) || new Date();
  const calendarActiveDates = offers
    .filter((offer) => offer.status === "active")
    .map((offer) => fromDateInputValue(offer.service_date))
    .filter(Boolean) as Date[];
  const calendarDraftDates = offers
    .filter((offer) => offer.status === "draft")
    .map((offer) => fromDateInputValue(offer.service_date))
    .filter(Boolean) as Date[];
  const calendarFinalizedDates = offers
    .filter((offer) => offer.status === "finalized")
    .map((offer) => fromDateInputValue(offer.service_date))
    .filter(Boolean) as Date[];

  const setProgressiveServicePeriod = (period: ServicePeriod) => {
    const countdownDefaults = getProgressiveCountdownDefaults(period);
    setForm((current) => ({
      ...current,
      serviceTime: getProgressiveServiceDefaultTime(period),
      countdownStartTime: countdownDefaults.startTime,
      countdownEndTime: countdownDefaults.endTime,
    }));
  };

  const setProgressiveServiceDate = (nextServiceDate: string) => {
    const nextDate = fromDateInputValue(nextServiceDate) || new Date();
    setCalendarTouched(true);
    setSelectedCalendarDate(nextServiceDate);
    setForm((current) => ({
      ...current,
      serviceDate: nextServiceDate,
      selectedDates: current.scheduleMode === "single"
        ? [nextServiceDate]
        : getUniqueSortedDates([nextServiceDate, ...current.selectedDates]),
      weekdays: current.weekdays.length > 0 ? current.weekdays : [getWeekdayValue(nextDate)],
      recurrenceEndDate: current.recurrenceEndDate < nextServiceDate
        ? toDateInputValue(addDays(nextDate, 14))
        : current.recurrenceEndDate,
    }));
  };

  const toggleProgressiveWeekday = (day: WeekdayValue) => {
    setForm((current) => {
      const hasDay = current.weekdays.includes(day);
      const weekdays = hasDay
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day];

      return {
        ...current,
        weekdays: weekdays.length > 0 ? weekdays : [day],
      };
    });
  };

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

        <div className="grid gap-4 rounded-2xl border bg-background/70 p-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Calendrier des offres</p>
                <p className="text-xs text-muted-foreground">Cliquez sur un jour pour le parametrer.</p>
              </div>
              <CalendarDays className="h-5 w-5 text-orange-500" />
            </div>
            <Calendar
              mode="single"
              selected={selectedCalendarDateObject}
              onSelect={selectCalendarDate}
              modifiers={{
                activeOffer: calendarActiveDates,
                draftOffer: calendarDraftDates,
                finalizedOffer: calendarFinalizedDates,
              }}
              modifiersClassNames={{
                activeOffer: "border border-emerald-500 bg-emerald-50 text-emerald-700 font-bold",
                draftOffer: "border border-orange-300 bg-orange-50 text-orange-700 font-semibold",
                finalizedOffer: "border border-slate-300 bg-slate-100 text-slate-500",
              }}
              className="rounded-2xl border bg-white p-3"
              classNames={{
                months: "flex w-full",
                month: "w-full space-y-4",
                table: "w-full border-collapse space-y-1",
                head_row: "grid grid-cols-7",
                row: "grid grid-cols-7 w-full mt-2",
                cell: "h-10 text-center text-sm p-0 relative",
                day: "h-10 w-full rounded-xl p-0 font-normal hover:bg-orange-50",
              }}
            />
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Active</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Brouillon</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Finalisee</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border bg-white p-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatProgressiveServiceDate(selectedCalendarDate)}</Badge>
                {currentOffer ? <Badge className={currentOffer.status === "active" ? "bg-emerald-500 text-white" : "bg-orange-500 text-white"}>{currentOffer.status}</Badge> : <Badge variant="secondary">Aucune offre</Badge>}
              </div>
              <h4 className="text-lg font-semibold">
                {currentOffer ? currentOffer.title : "Configurer une offre pour ce jour"}
              </h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {currentOffer
                  ? "Chargez, modifiez, activez ou désactivez l'offre liée au jour sélectionné."
                  : "Le formulaire est pret pour creer une nouvelle offre progressive sur cette date."}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => openEditor(currentOffer ? progressiveOfferToForm(currentOffer) : buildProgressiveOfferFormForDate(selectedCalendarDate))}
                disabled={saving}
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                {currentOffer ? "Modifier" : "Creer"}
              </Button>
              <Button type="button" onClick={() => currentOffer && updateOfferStatus(currentOffer, "active")} disabled={saving || !currentOffer || currentOffer.status === "active" || currentOffer.status === "finalized"}>
                Activer
              </Button>
              <Button type="button" variant="outline" onClick={() => currentOffer && updateOfferStatus(currentOffer, "draft")} disabled={saving || !currentOffer || currentOffer.status !== "active"}>
                Désactiver
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold">Parametrage en 3 etapes</p>
              <p className="text-sm text-muted-foreground">
                Remplace le grand formulaire par un parcours guide pour creer ou modifier l'offre du jour selectionne.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {PROGRESSIVE_EDITOR_STEPS.map((step) => (
                <div key={step.id} className="rounded-xl border bg-white px-3 py-2 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-600">{step.eyebrow}</p>
                  <p className="font-semibold">{step.title}</p>
                </div>
              ))}
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0 gap-2"
            onClick={() => openEditor(currentOffer ? progressiveOfferToForm(currentOffer) : buildProgressiveOfferFormForDate(selectedCalendarDate))}
            disabled={saving}
          >
            <CalendarCheck className="h-4 w-4" />
            {currentOffer ? "Modifier en 3 etapes" : "Creer en 3 etapes"}
          </Button>
        </div>

        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent
            className="flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
            data-testid="progressive-offer-editor-modal"
          >
            <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 text-left sm:px-6">
              <DialogTitle>Offre progressive en 3 etapes</DialogTitle>
              <DialogDescription>
                {currentEditorStep.eyebrow} - {currentEditorStep.description}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <ol className="grid gap-2 sm:grid-cols-3" data-testid="progressive-offer-stepper">
                {PROGRESSIVE_EDITOR_STEPS.map((step, index) => {
                  const isCurrent = step.id === editorStep;
                  const isDone = index < editorStepIndex;
                  return (
                    <li
                      key={step.id}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-sm transition-colors",
                        isCurrent && "border-orange-500 bg-orange-50 text-orange-950",
                        isDone && "border-emerald-200 bg-emerald-50 text-emerald-900",
                        !isCurrent && !isDone && "bg-background text-muted-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                            isCurrent && "bg-orange-500 text-white",
                            isDone && "bg-emerald-500 text-white",
                            !isCurrent && !isDone && "bg-muted text-muted-foreground",
                          )}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="font-semibold">{step.title}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5">{step.description}</p>
                    </li>
                  );
                })}
              </ol>

              {editorStep === "base" ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Titre</Label>
                      <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description</Label>
                      <Textarea
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        rows={5}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border bg-background px-4 py-3 lg:flex-col lg:items-start">
                    <div>
                      <Label className="text-sm">Publier sur l'accueil</Label>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Rend l'offre visible et reservable apres enregistrement.</p>
                    </div>
                    <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
                  </div>
                </div>
              ) : null}

              {editorStep === "schedule" ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Type de planification</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { value: "single" as const, title: "Jour unique", description: "Une seule date avec son compte a rebours." },
                        { value: "occurrence" as const, title: "Occurrence", description: "Plusieurs dates choisies ou regulieres." },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm((current) => ({
                            ...current,
                            scheduleMode: option.value,
                            selectedDates: option.value === "single"
                              ? [current.serviceDate]
                              : getUniqueSortedDates(current.selectedDates.length > 0 ? current.selectedDates : [current.serviceDate]),
                          }))}
                          disabled={Boolean(form.id) && option.value === "occurrence"}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            form.scheduleMode === option.value
                              ? "border-orange-500 bg-orange-50 text-orange-950"
                              : "border-border bg-background hover:border-orange-300",
                          )}
                        >
                          <span className="block font-semibold">{option.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                        </button>
                      ))}
                    </div>
                    {form.id ? (
                      <p className="text-[11px] text-muted-foreground">Pour modifier toute une serie, creez une nouvelle occurrence depuis le calendrier.</p>
                    ) : null}
                  </div>

                  {form.scheduleMode === "single" ? (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Jour unique</Label>
                      <Input
                        type="date"
                        value={form.serviceDate}
                        onChange={(event) => setProgressiveServiceDate(event.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border bg-background p-4 lg:col-span-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Label>Mode d'occurrence</Label>
                          <p className="mt-1 text-xs text-muted-foreground">Choisissez des dates libres ou une recurrence par jour de semaine.</p>
                        </div>
                        <Select
                          value={form.occurrenceMode}
                          onValueChange={(value) => setForm((current) => ({ ...current, occurrenceMode: value as ProgressiveOccurrenceMode }))}
                          disabled={Boolean(form.id)}
                        >
                          <SelectTrigger className="w-full bg-white sm:w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Dates personnalisees</SelectItem>
                            <SelectItem value="weekly">Jours reguliers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {form.occurrenceMode === "custom" ? (
                        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                          <Calendar
                            mode="multiple"
                            selected={selectedOccurrenceDateObjects}
                            onSelect={(dates) => {
                              const nextDates = getUniqueSortedDates((dates || []).map(toDateInputValue));
                              const fallbackDate = nextDates[0] || form.serviceDate;
                              setCalendarTouched(true);
                              setSelectedCalendarDate(fallbackDate);
                              setForm((current) => ({
                                ...current,
                                selectedDates: nextDates,
                                serviceDate: fallbackDate,
                              }));
                            }}
                            className="rounded-2xl border bg-white p-3"
                            classNames={{
                              months: "flex w-full",
                              month: "w-full space-y-4",
                              table: "w-full border-collapse space-y-1",
                              head_row: "grid grid-cols-7",
                              row: "grid grid-cols-7 w-full mt-2",
                              cell: "h-10 text-center text-sm p-0 relative",
                              day: "h-10 w-full rounded-xl p-0 font-normal hover:bg-orange-50",
                            }}
                          />
                          <div className="rounded-2xl border bg-white p-4">
                            <p className="text-sm font-semibold">Dates selectionnees</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {scheduledPreviewDates.length > 0 ? scheduledPreviewDates.slice(0, 12).map((date) => (
                                <Badge key={date} variant="secondary">{formatProgressiveServiceDate(date)}</Badge>
                              )) : (
                                <span className="text-sm text-muted-foreground">Aucune date selectionnee.</span>
                              )}
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">Maximum {PROGRESSIVE_RECURRENCE_MAX_COUNT} dates programmees.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Date de debut</Label>
                            <Input type="date" value={form.serviceDate} onChange={(event) => setProgressiveServiceDate(event.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Date de fin de l'occurrence</Label>
                            <Input
                              type="date"
                              value={form.recurrenceEndDate}
                              min={form.serviceDate}
                              onChange={(event) => setForm((current) => ({ ...current, recurrenceEndDate: event.target.value }))}
                            />
                          </div>
                          <div className="space-y-2 lg:col-span-2">
                            <Label>Jours de la semaine</Label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map((day) => {
                                const isSelected = form.weekdays.includes(day.value);
                                return (
                                  <button
                                    key={day.value}
                                    type="button"
                                    onClick={() => toggleProgressiveWeekday(day.value)}
                                    className={cn(
                                      "rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
                                      isSelected ? "border-orange-500 bg-orange-500 text-white" : "border-border bg-white hover:border-orange-300",
                                    )}
                                  >
                                    {day.label}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-xs text-muted-foreground">{scheduledPreviewDates.length} dates seront programmees, limitees a {PROGRESSIVE_RECURRENCE_MAX_COUNT}.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Service cible</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {SERVICE_PERIODS.map(({ key }) => {
                        const isSelected = selectedProgressiveService === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setProgressiveServicePeriod(key)}
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
                  <div className="space-y-1.5">
                    <Label>Heure de reservation cible</Label>
                    <Input
                      type="time"
                      value={form.serviceTime}
                      onChange={(event) => setForm((current) => ({ ...current, serviceTime: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Debut du compte a rebours</Label>
                    <Input
                      type="time"
                      value={form.countdownStartTime}
                      onChange={(event) => setForm((current) => ({ ...current, countdownStartTime: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fin du compte a rebours</Label>
                    <Input
                      type="time"
                      value={form.countdownEndTime}
                      onChange={(event) => setForm((current) => ({ ...current, countdownEndTime: event.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">La fin doit rester avant l'heure de reservation; les reservations sont bloquees 30 minutes avant cette fin.</p>
                  </div>
                  <div className="rounded-2xl border bg-emerald-50 p-4 text-sm text-emerald-900 lg:col-span-2">
                    <p className="font-semibold">{scheduledPreviewDates.length || 0} date(s) prete(s) a programmer</p>
                    <p className="mt-1 text-xs leading-5">
                      Compte a rebours {form.countdownStartTime} - {form.countdownEndTime}, puis reservation cible a {form.serviceTime}.
                    </p>
                  </div>
                </div>
              ) : null}

              {editorStep === "capacity" ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Tables maximum</Label>
                      <Input type="number" min={1} max={200} value={form.maxTables} onChange={(event) => setForm((current) => ({ ...current, maxTables: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Remise maximum (%)</Label>
                      <Input type="number" min={1} max={100} value={form.maxDiscountPercent} onChange={(event) => setForm((current) => ({ ...current, maxDiscountPercent: event.target.value }))} />
                    </div>
                    <div className="rounded-2xl border bg-background p-4 sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Exemple</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        50% pour 10 tables donne +5% a chaque reservation participante, puis la remise est figee a la fin du compte a rebours.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl border bg-orange-50 p-4">
                      <p className="text-xs text-muted-foreground">Remise actuelle</p>
                      <p className="text-2xl font-bold text-primary">-{currentDiscount}%</p>
                    </div>
                    <div className="rounded-2xl border bg-emerald-50 p-4">
                      <p className="text-xs text-muted-foreground">Prochaine reservation</p>
                      <p className="text-2xl font-bold text-emerald-700">-{nextDiscount}%</p>
                    </div>
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-xs text-muted-foreground">Tables restantes</p>
                      <p className="text-2xl font-bold">{currentOffer ? getProgressiveOfferRemainingTables(currentOffer) : form.maxTables}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={goToPreviousEditorStep} disabled={saving || isFirstEditorStep} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Precedent
              </Button>
              {isLastEditorStep ? (
                <Button
                  type="button"
                  onClick={async () => {
                    const saved = await save();
                    if (saved) setEditorOpen(false);
                  }}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Enregistrer l'offre
                </Button>
              ) : (
                <Button type="button" onClick={goToNextEditorStep} disabled={saving} className="gap-2">
                  Suivant
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function DashboardFormules() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const demoSessionId = isCommercialDemo ? commercialDemoFrame.config.sessionId : null;
  const { selectedId } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const effectiveRestaurantId = isCommercialDemo && commercialDemoFrame
    ? commercialDemoFrame.snapshot.demo_restaurant.id
    : selectedId;
  const formulasQueryKey = ["dashboard-formulas", effectiveRestaurantId, demoSessionId] as const;
  const progressiveOffersQueryKey = [
    "dashboard-progressive-offers",
    effectiveRestaurantId,
    demoSessionId,
  ] as const;

  const { data: formulas, isLoading } = useQuery({
    queryKey: formulasQueryKey,
    queryFn: async () => {
      if (!effectiveRestaurantId) return [];

      if (demoSessionId) {
        return readCommercialDemoToolState<any[]>(
          demoSessionId,
          COMMERCIAL_DEMO_FORMULAS_TOOL,
          [],
        );
      }

      const { data, error } = await supabase
        .from("meal_formulas")
        .select("*, meal_formula_categories(*)")
        .eq("restaurant_id", effectiveRestaurantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveRestaurantId,
  });

  const { data: progressiveOffers = [], isLoading: isProgressiveOffersLoading } = useQuery({
    queryKey: progressiveOffersQueryKey,
    queryFn: async () => {
      if (!effectiveRestaurantId) return [] as ProgressiveReservationOffer[];

      if (demoSessionId) {
        return readCommercialDemoToolState<ProgressiveReservationOffer[]>(
          demoSessionId,
          COMMERCIAL_DEMO_PROGRESSIVE_OFFERS_TOOL,
          [],
        );
      }

      const { data, error } = await (supabase.from("reservation_progressive_offers" as any) as any)
        .select("*")
        .eq("restaurant_id", effectiveRestaurantId)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(PROGRESSIVE_OFFER_LIMIT);
      if (error) throw error;
      return (data || []) as ProgressiveReservationOffer[];
    },
    enabled: !!effectiveRestaurantId,
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
            { label: "Restaurant", value: effectiveRestaurantId ? "Selectionne" : "Aucun", icon: Salad },
          ]}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {effectiveRestaurantId ? (
              <ProgressiveOfferManager
                restaurantId={effectiveRestaurantId}
                offers={progressiveOffers}
                loading={isProgressiveOffersLoading}
                demoSessionId={demoSessionId}
                onDemoOffersChanged={(next) => {
                  queryClient.setQueryData(progressiveOffersQueryKey, next);
                }}
                onSaved={() => {
                  if (!demoSessionId) {
                    queryClient.invalidateQueries({ queryKey: progressiveOffersQueryKey });
                  }
                }}
              />
            ) : null}
            {effectiveRestaurantId ? PRESET_FORMULAS.map((preset) => (
              <PresetFormulaCard
                key={preset.formula_key}
                preset={preset}
                existing={formulaMap.get(preset.formula_key) || null}
                restaurantId={effectiveRestaurantId!}
                demoSessionId={demoSessionId}
                demoFormulas={formulas || []}
                onDemoFormulasChanged={(next) => {
                  queryClient.setQueryData(formulasQueryKey, next);
                }}
                onSaved={() => {
                  if (!demoSessionId) {
                    queryClient.invalidateQueries({ queryKey: formulasQueryKey });
                  }
                }}
              />
            )) : null}
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
  demoSessionId,
  demoFormulas,
  onDemoFormulasChanged,
  onSaved,
}: {
  preset: PresetFormula;
  existing: any | null;
  restaurantId: string;
  demoSessionId?: string | null;
  demoFormulas: any[];
  onDemoFormulasChanged?: (formulas: any[]) => void;
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

      if (demoSessionId) {
        const current = readCommercialDemoToolState<any[]>(
          demoSessionId,
          COMMERCIAL_DEMO_FORMULAS_TOOL,
          demoFormulas,
        );
        const formulaId = existing?.id
          || commercialDemoFormulaId(demoSessionId, preset.formula_key);
        const now = new Date().toISOString();
        const demoFormula = {
          ...(existing || {}),
          id: formulaId,
          restaurant_id: restaurantId,
          name: preset.name,
          description: preset.description,
          formula_key: preset.formula_key,
          discount_percent: discountPercent,
          applies_to: "both",
          is_active: active,
          is_standard: true,
          availability: serializeAvailability(normalizedAvailability),
          created_at: existing?.created_at || now,
          updated_at: now,
          meal_formula_categories: preset.categories.map((category, index) => ({
            id: `commercial-demo-formula-category-${demoSessionId}-${preset.formula_key}-${index}`,
            formula_id: formulaId,
            category,
            course_order: index + 1,
          })),
        };
        const exists = current.some((formula) => (
          formula.id === formulaId || formula.formula_key === preset.formula_key
        ));
        const next = exists
          ? current.map((formula) => (
            formula.id === formulaId || formula.formula_key === preset.formula_key
              ? demoFormula
              : formula
          ))
          : [...current, demoFormula];
        writeCommercialDemoToolState(
          demoSessionId,
          COMMERCIAL_DEMO_FORMULAS_TOOL,
          next,
        );
        onDemoFormulasChanged?.(next);
        onSaved();
        toast({ title: active ? "Formule activée" : "Formule désactivée" });
        return;
      }

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

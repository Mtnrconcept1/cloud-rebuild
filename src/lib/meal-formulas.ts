import { detectServiceFromTime, type ServicePeriod } from "@/lib/serviceSettings";

export type FormulaCourse = "entree" | "plat" | "dessert";
export type MealFormulaContext = "cart" | "zero-attente";

export type MealFormulaServiceAvailability = {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
};

export type MealFormulaAvailability = {
  days?: string[];
  startTime?: string;
  endTime?: string;
  servicePeriods?: ServicePeriod[];
  services?: Partial<Record<ServicePeriod, MealFormulaServiceAvailability>>;
  maxTablesPerService?: number | string | null;
  max_tables_per_service?: number | string | null;
} | null;

export type MealFormulaRow = {
  id: string;
  name: string;
  discount_percent: number;
  formula_key?: string | null;
  applies_to?: string | null;
  availability?: MealFormulaAvailability;
  meal_formula_categories?: Array<{ category: string; course_order: number }> | null;
};

export type MealFormulaDetectionItem = {
  category?: string | null;
  quantity: number;
  unitPrice: number;
};

export type FormulaMatchResult = {
  formulaId: string;
  name: string;
  discountPercent: number;
  discountAmount: number;
  requiredCourses: FormulaCourse[];
};

export type FormulaSuggestionResult = {
  formulaId: string;
  name: string;
  discountPercent: number;
  requiredCourses: FormulaCourse[];
  matchedCourses: FormulaCourse[];
  missingCourses: FormulaCourse[];
};

export type MealFormulaDetectionResult = {
  matchedFormula: FormulaMatchResult | null;
  suggestion: FormulaSuggestionResult | null;
  discountAmount: number;
  finalTotal: number;
  itemCourses: FormulaCourse[];
};

const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function roundCurrency(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toCourse(raw: string | null | undefined): FormulaCourse | null {
  const text = normalizeText(String(raw || ""));
  if (!text) return null;
  if (text.includes("entree") || text.includes("starter") || text.includes("appet")) return "entree";
  if (text.includes("plat") || text.includes("main")) return "plat";
  if (text.includes("dessert") || text.includes("sweet")) return "dessert";
  return null;
}

export function coursesFromFormulaKey(formulaKey: string | null | undefined): FormulaCourse[] {
  if (formulaKey === "entree_plat") return ["entree", "plat"];
  if (formulaKey === "plat_dessert") return ["plat", "dessert"];
  if (formulaKey === "entree_plat_dessert") return ["entree", "plat", "dessert"];
  return [];
}

function uniqueCourses(courses: FormulaCourse[]): FormulaCourse[] {
  const seen = new Set<FormulaCourse>();
  return courses.filter((course) => {
    if (seen.has(course)) return false;
    seen.add(course);
    return true;
  });
}

export function resolveRequiredCourses(formula: MealFormulaRow): FormulaCourse[] {
  const fromKey = coursesFromFormulaKey(formula.formula_key);
  if (fromKey.length > 0) return uniqueCourses(fromKey);
  const fromCategories = (formula.meal_formula_categories || [])
    .map((row) => toCourse(row.category))
    .filter((course): course is FormulaCourse => !!course);
  return uniqueCourses(fromCategories);
}

function parseTimeToMinutes(value: string): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isTimeInWindow(target: number, start: number, end: number): boolean {
  if (start <= end) return target >= start && target <= end;
  return target >= start || target <= end;
}

function isServiceAvailabilityShape(
  value: MealFormulaAvailability
): value is Exclude<MealFormulaAvailability, null> & {
  services: Partial<Record<ServicePeriod, MealFormulaServiceAvailability>>;
} {
  return !!value && typeof value === "object" && !!value.services && typeof value.services === "object";
}

export function isMealFormulaAvailableForSlot(
  availability: MealFormulaAvailability,
  reservationDate?: string,
  reservationTime?: string
): boolean {
  if (!reservationDate || !reservationTime) return true;
  if (!availability || typeof availability !== "object") return true;

  const dateObj = new Date(`${reservationDate}T${reservationTime}`);
  if (Number.isNaN(dateObj.getTime())) return true;

  const days = Array.isArray(availability.days)
    ? availability.days.map((day) => normalizeText(day))
    : [];
  if (days.length > 0) {
    const dayCode = DAY_CODES[dateObj.getDay()];
    if (!days.includes(dayCode)) return false;
  }

  const servicePeriod = detectServiceFromTime(reservationTime);
  const targetMinutes = parseTimeToMinutes(reservationTime);

  if (isServiceAvailabilityShape(availability)) {
    const serviceConfig = availability.services?.[servicePeriod];
    if (serviceConfig?.enabled === false) return false;

    const serviceStart = parseTimeToMinutes(String(serviceConfig?.startTime || ""));
    const serviceEnd = parseTimeToMinutes(String(serviceConfig?.endTime || ""));
    if (targetMinutes !== null && serviceStart !== null && serviceEnd !== null) {
      return isTimeInWindow(targetMinutes, serviceStart, serviceEnd);
    }

    if (serviceConfig) return true;
  }

  const servicePeriods = Array.isArray(availability.servicePeriods)
    ? availability.servicePeriods.filter(
        (period): period is ServicePeriod => period === "lunch" || period === "dinner"
      )
    : [];
  if (servicePeriods.length > 0 && !servicePeriods.includes(servicePeriod)) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(String(availability.startTime || ""));
  const endMinutes = parseTimeToMinutes(String(availability.endTime || ""));
  if (targetMinutes === null || startMinutes === null || endMinutes === null) return true;

  return isTimeInWindow(targetMinutes, startMinutes, endMinutes);
}

function parsePositiveIntegerLimit(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : typeof value === "number"
      ? value
      : NaN;
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : null;
}

export function getMealFormulaMaxTablesPerService(availability: MealFormulaAvailability): number | null {
  if (!availability || typeof availability !== "object") return null;
  return (
    parsePositiveIntegerLimit(availability.maxTablesPerService)
    ?? parsePositiveIntegerLimit(availability.max_tables_per_service)
  );
}

export function getMealFormulaRemainingTablesForService(
  availability: MealFormulaAvailability,
  reservedTables: number,
): number | null {
  const maxTables = getMealFormulaMaxTablesPerService(availability);
  if (maxTables === null) return null;
  return Math.max(0, maxTables - Math.max(0, Math.floor(Number(reservedTables) || 0)));
}

export function isMealFormulaBelowServiceLimit(
  availability: MealFormulaAvailability,
  reservedTables: number,
): boolean {
  const remainingTables = getMealFormulaRemainingTablesForService(availability, reservedTables);
  return remainingTables === null || remainingTables > 0;
}

function isContextCompatible(appliesTo: string | null | undefined, context: MealFormulaContext): boolean {
  const value = normalizeText(String(appliesTo || ""));
  if (!value || value === "both") return true;

  if (context === "cart") {
    return value !== "dine_in" && value !== "reservation";
  }

  return value !== "delivery" && value !== "takeaway";
}

function coursesFromItems(items: MealFormulaDetectionItem[]): Set<FormulaCourse> {
  const courses = new Set<FormulaCourse>();
  items.forEach((item) => {
    if (!item || item.quantity <= 0) return;
    const course = toCourse(item.category);
    if (course) courses.add(course);
  });
  return courses;
}

export function detectBestMealFormula(input: {
  formulas: MealFormulaRow[];
  items: MealFormulaDetectionItem[];
  subtotal: number;
  context: MealFormulaContext;
  reservationDate?: string;
  reservationTime?: string;
}): MealFormulaDetectionResult {
  const safeSubtotal = roundCurrency(Math.max(0, Number(input.subtotal) || 0));
  const itemCoursesSet = coursesFromItems(input.items);
  const itemCourses = Array.from(itemCoursesSet);

  let bestMatch: FormulaMatchResult | null = null;
  const suggestions: FormulaSuggestionResult[] = [];

  for (const formula of input.formulas || []) {
    if (!isContextCompatible(formula.applies_to, input.context)) continue;
    if (!isMealFormulaAvailableForSlot(formula.availability || null, input.reservationDate, input.reservationTime)) continue;

    const requiredCourses = resolveRequiredCourses(formula);
    if (requiredCourses.length === 0) continue;

    const matchedCourses = requiredCourses.filter((course) => itemCoursesSet.has(course));
    const missingCourses = requiredCourses.filter((course) => !itemCoursesSet.has(course));

    if (missingCourses.length === 0) {
      const discountPercent = Number(formula.discount_percent) || 0;
      const discountAmount = roundCurrency((safeSubtotal * discountPercent) / 100);
      const candidate: FormulaMatchResult = {
        formulaId: formula.id,
        name: formula.name,
        discountPercent,
        discountAmount,
        requiredCourses,
      };

      if (
        !bestMatch ||
        candidate.discountPercent > bestMatch.discountPercent ||
        (candidate.discountPercent === bestMatch.discountPercent &&
          candidate.requiredCourses.length > bestMatch.requiredCourses.length)
      ) {
        bestMatch = candidate;
      }
      continue;
    }

    if (matchedCourses.length > 0) {
      suggestions.push({
        formulaId: formula.id,
        name: formula.name,
        discountPercent: Number(formula.discount_percent) || 0,
        requiredCourses,
        matchedCourses,
        missingCourses,
      });
    }
  }

  const bestSuggestion = bestMatch
    ? null
    : suggestions.sort((a, b) => {
        if (a.missingCourses.length !== b.missingCourses.length) {
          return a.missingCourses.length - b.missingCourses.length;
        }
        if (a.discountPercent !== b.discountPercent) {
          return b.discountPercent - a.discountPercent;
        }
        return b.matchedCourses.length - a.matchedCourses.length;
      })[0] || null;

  const discountAmount = bestMatch?.discountAmount || 0;
  return {
    matchedFormula: bestMatch,
    suggestion: bestSuggestion,
    discountAmount,
    finalTotal: roundCurrency(Math.max(0, safeSubtotal - discountAmount)),
    itemCourses,
  };
}

export function formatMissingCoursesText(courses: FormulaCourse[]): string {
  const labels = courses.map((course) => {
    if (course === "entree") return "une entrée";
    if (course === "plat") return "un plat";
    return "un dessert";
  });
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

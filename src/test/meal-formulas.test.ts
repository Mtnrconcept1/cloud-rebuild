import { describe, expect, it } from "vitest";
import {
  detectBestMealFormula,
  getMealFormulaMaxTablesPerService,
  getMealFormulaRemainingTablesForService,
  isMealFormulaBelowServiceLimit,
  toCourse,
  coursesFromFormulaKey,
  formatMissingCoursesText,
  type MealFormulaRow,
} from "@/lib/meal-formulas";

const baseFormulas: MealFormulaRow[] = [
  {
    id: "f1",
    name: "Entree + Plat",
    discount_percent: 15,
    formula_key: "entree_plat",
    applies_to: "both",
    availability: { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], startTime: "00:00", endTime: "23:59" },
    meal_formula_categories: [],
  },
  {
    id: "f2",
    name: "Plat + Dessert",
    discount_percent: 15,
    formula_key: "plat_dessert",
    applies_to: "both",
    availability: { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], startTime: "00:00", endTime: "23:59" },
    meal_formula_categories: [],
  },
  {
    id: "f3",
    name: "Menu complet",
    discount_percent: 20,
    formula_key: "entree_plat_dessert",
    applies_to: "both",
    availability: { days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], startTime: "00:00", endTime: "23:59" },
    meal_formula_categories: [],
  },
];

describe("meal formulas helpers", () => {
  it("maps categories to courses", () => {
    expect(toCourse("Entrées")).toBe("entree");
    expect(toCourse("PLATS PRINCIPAUX")).toBe("plat");
    expect(toCourse("Desserts maison")).toBe("dessert");
    expect(toCourse("Boissons")).toBeNull();
  });

  it("maps formula keys to required courses", () => {
    expect(coursesFromFormulaKey("entree_plat")).toEqual(["entree", "plat"]);
    expect(coursesFromFormulaKey("plat_dessert")).toEqual(["plat", "dessert"]);
    expect(coursesFromFormulaKey("unknown")).toEqual([]);
  });

  it("tracks table quotas per service for reservation formulas", () => {
    const availability = {
      days: ["mon"],
      services: {
        lunch: { enabled: true, startTime: "12:00", endTime: "14:30" },
      },
      servicePeriods: ["lunch"],
      maxTablesPerService: 4,
    };

    expect(getMealFormulaMaxTablesPerService(availability)).toBe(4);
    expect(getMealFormulaRemainingTablesForService(availability, 3)).toBe(1);
    expect(isMealFormulaBelowServiceLimit(availability, 3)).toBe(true);
    expect(getMealFormulaRemainingTablesForService(availability, 4)).toBe(0);
    expect(isMealFormulaBelowServiceLimit(availability, 4)).toBe(false);
    expect(isMealFormulaBelowServiceLimit({ days: ["mon"] }, 500)).toBe(true);
  });
});

describe("detectBestMealFormula", () => {
  it("selects the best fully matched formula by discount", () => {
    const result = detectBestMealFormula({
      formulas: baseFormulas,
      items: [
        { category: "Entrees", quantity: 1, unitPrice: 10 },
        { category: "Plats", quantity: 1, unitPrice: 20 },
        { category: "Desserts", quantity: 1, unitPrice: 8 },
      ],
      subtotal: 38,
      context: "zero-attente",
      reservationDate: "2026-03-11",
      reservationTime: "19:30",
    });

    expect(result.matchedFormula?.name).toBe("Menu complet");
    expect(result.discountAmount).toBe(7.6);
    expect(result.finalTotal).toBe(30.4);
    expect(result.suggestion).toBeNull();
  });

  it("returns the closest suggestion when formula is not complete", () => {
    const result = detectBestMealFormula({
      formulas: baseFormulas,
      items: [{ category: "Entrees", quantity: 1, unitPrice: 10 }],
      subtotal: 10,
      context: "zero-attente",
      reservationDate: "2026-03-11",
      reservationTime: "12:30",
    });

    expect(result.matchedFormula).toBeNull();
    expect(result.suggestion?.name).toBe("Entree + Plat");
    expect(result.suggestion?.missingCourses).toEqual(["plat"]);
    expect(formatMissingCoursesText(result.suggestion?.missingCourses || [])).toBe("un plat");
  });

  it("filters out formulas unavailable on selected day/time", () => {
    const formulas: MealFormulaRow[] = [
      {
        ...baseFormulas[0],
        availability: { days: ["mon"], startTime: "11:30", endTime: "14:30" },
      },
    ];
    const result = detectBestMealFormula({
      formulas,
      items: [
        { category: "Entrees", quantity: 1, unitPrice: 10 },
        { category: "Plats", quantity: 1, unitPrice: 20 },
      ],
      subtotal: 30,
      context: "zero-attente",
      reservationDate: "2026-03-11",
      reservationTime: "19:30",
    });

    expect(result.matchedFormula).toBeNull();
    expect(result.discountAmount).toBe(0);
  });

  it("filters formulas by split lunch and dinner services", () => {
    const formulas: MealFormulaRow[] = [
      {
        ...baseFormulas[0],
        availability: {
          days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          services: {
            lunch: { enabled: true, startTime: "11:30", endTime: "14:30" },
            dinner: { enabled: false, startTime: "18:30", endTime: "22:00" },
          },
          servicePeriods: ["lunch"],
        },
      },
    ];

    const lunchResult = detectBestMealFormula({
      formulas,
      items: [
        { category: "Entrees", quantity: 1, unitPrice: 10 },
        { category: "Plats", quantity: 1, unitPrice: 20 },
      ],
      subtotal: 30,
      context: "zero-attente",
      reservationDate: "2026-03-11",
      reservationTime: "12:30",
    });

    const dinnerResult = detectBestMealFormula({
      formulas,
      items: [
        { category: "Entrees", quantity: 1, unitPrice: 10 },
        { category: "Plats", quantity: 1, unitPrice: 20 },
      ],
      subtotal: 30,
      context: "zero-attente",
      reservationDate: "2026-03-11",
      reservationTime: "19:30",
    });

    expect(lunchResult.matchedFormula?.name).toBe("Entree + Plat");
    expect(dinnerResult.matchedFormula).toBeNull();
  });

  it("excludes dine-in only formulas in cart context", () => {
    const formulas: MealFormulaRow[] = [
      {
        ...baseFormulas[0],
        applies_to: "dine_in",
      },
    ];
    const result = detectBestMealFormula({
      formulas,
      items: [
        { category: "Entrees", quantity: 1, unitPrice: 10 },
        { category: "Plats", quantity: 1, unitPrice: 20 },
      ],
      subtotal: 30,
      context: "cart",
    });

    expect(result.matchedFormula).toBeNull();
    expect(result.discountAmount).toBe(0);
  });
});

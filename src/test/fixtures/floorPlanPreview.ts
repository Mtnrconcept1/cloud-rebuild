/** Entirely fictional, in-memory data for the real floor-plan page preview/tests.
 * This module is never imported by a production entry point.
 */
type Row = Record<string, unknown> & { id?: string };
type Response = { data: unknown; error: Error | null; count?: number };
type WriteOperation = "insert" | "update" | "upsert" | "delete";

export const PREVIEW_RESTAURANT_ID = "00000000-0000-4000-8000-000000000001";
export const PREVIEW_BRANCH_ID = "00000000-0000-4000-8000-000000000002";
export const previewRestaurant = {
  id: PREVIEW_RESTAURANT_ID,
  name: "La Maison des Tilleuls · restaurant fictif",
  address: "1 place du Jardin",
  city: "Ville de démonstration",
  postal_code: "0000",
  country: "Suisse",
  is_active: true,
  status: "active",
  owner_id: "preview-owner",
  disabled_dashboard_features: [],
  is_demo: false,
};

function fixtureDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function item(
  id: string,
  number: string,
  capacity: number,
  x: number,
  y: number,
  w: number,
  h: number,
  options: Row = {},
): Row {
  const { sector = "Salle principale", ...layout } = options;
  return {
    id,
    branch_id: PREVIEW_BRANCH_ID,
    table_number: number,
    capacity,
    sector,
    is_active: true,
    layout: {
      x,
      y,
      w,
      h,
      rotation: 0,
      shape: "round",
      kind: "table",
      seat_type: "chair",
      seat_labels: Array.from({ length: capacity }, () => 1),
      ...layout,
    },
  };
}

function makeFixture() {
  const date = fixtureDate();
  const tables = [
    item("t01", "T01", 2, 110, 135, 150, 150),
    item("t02", "T02", 4, 350, 145, 164, 164),
    item("t03", "T03", 4, 635, 145, 220, 160, { shape: "rect" }),
    item("t04", "T04", 4, 640, 400, 220, 160, { shape: "rect" }),
    item("t05", "T05", 4, 110, 400, 176, 176, {
      shape: "rect",
      table_width: 104,
      table_height: 104,
    }),
    item("t06", "T06", 2, 375, 430, 150, 150),
    item("plant-left", "Ficus", 0, 58, 52, 90, 90, {
      kind: "plant",
      locked: true,
    }),
    item("plant-right", "Olivier", 0, 900, 65, 82, 82, { kind: "plant" }),
    item("banquette", "Banquette sauge", 0, 585, 60, 335, 72, {
      kind: "banquette",
      shape: "rect",
    }),
    item("console", "Console de service", 0, 765, 625, 180, 70, {
      kind: "service-station",
      shape: "rect",
    }),
    item("window", "Fenêtre", 0, 240, 35, 280, 24, {
      kind: "divider",
      shape: "rect",
      visual_variant: "window",
      locked: true,
    }),
    item("door", "Entrée", 0, 470, 645, 100, 100, {
      kind: "divider",
      shape: "rect",
      visual_variant: "door",
      locked: true,
    }),
    item("terrace01", "TR01", 4, 155, 240, 175, 175, { sector: "Terrasse" }),
    item("terrace02", "TR02", 2, 560, 280, 150, 150, { sector: "Terrasse" }),
    item("parasol", "Parasol", 0, 750, 140, 180, 180, {
      sector: "Terrasse",
      kind: "plant",
      visual_variant: "parasol",
    }),
    item("planter", "Jardinière", 0, 110, 590, 360, 80, {
      sector: "Terrasse",
      kind: "divider",
      visual_variant: "planter",
      shape: "rect",
    }),
  ];
  const profiles = [
    { user_id: "client-camille", full_name: "Camille Martin", phone: null },
    { user_id: "client-alex", full_name: "Alex Morel", phone: null },
    { user_id: "client-lea", full_name: "Léa Bernard", phone: null },
    { user_id: "client-sarah", full_name: "Sarah Petit", phone: null },
    { user_id: "client-jules", full_name: "Jules Perrin", phone: null },
  ];
  const reservation = (
    id: string,
    client: string,
    time: string,
    status: string,
    partySize: number,
    notes: string | null = null,
  ) => ({
    id,
    restaurant_id: PREVIEW_RESTAURANT_ID,
    branch_id: PREVIEW_BRANCH_ID,
    user_id: `client-${client}`,
    date,
    time,
    status,
    party_size: partySize,
    notes,
    feature: "reservation",
    metadata: { service: "dinner" },
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
    confirmed_at: `${date}T10:00:00Z`,
  });
  const now = new Date().toISOString();
  return {
    restaurants: [{ ...previewRestaurant }],
    restaurant_branches: [
      {
        ...previewRestaurant,
        id: PREVIEW_BRANCH_ID,
        restaurant_id: PREVIEW_RESTAURANT_ID,
        name: "Restaurant des Tilleuls",
        created_at: now,
      },
    ],
    reservation_tables: tables,
    reservations: [
      reservation(
        "r-camille",
        "camille",
        "19:30",
        "confirmed",
        4,
        "Anniversaire · prévoir une attention au dessert.",
      ),
      reservation("r-alex", "alex", "19:45", "confirmed", 4),
      reservation("r-lea", "lea", "20:00", "pending", 2),
      reservation("r-sarah", "sarah", "18:30", "seated", 2),
      reservation(
        "r-jules",
        "jules",
        "19:00",
        "arrived",
        4,
        "Une personne préfère une place côté allée.",
      ),
    ],
    reservation_slots: [
      { id: "slot-camille", reservation_id: "r-camille", table_id: "t03" },
      { id: "slot-alex", reservation_id: "r-alex", table_id: "t04" },
      { id: "slot-sarah", reservation_id: "r-sarah", table_id: "t01" },
      { id: "slot-jules", reservation_id: "r-jules", table_id: "t05" },
    ],
    reservation_table_layout_overrides: [],
    restaurant_preferred_tables: [],
    floor_plan_variants: [
      {
        id: "variant-classic",
        restaurant_id: PREVIEW_RESTAURANT_ID,
        branch_id: PREVIEW_BRANCH_ID,
        name: "Dîner classique",
        source: "manual",
        created_by: "preview-owner",
        created_at: now,
        updated_at: now,
        snapshot: { version: 1, canvas: { width: 1040, height: 760 }, tables },
      },
    ],
    profiles,
  } satisfies Record<string, Row[]>;
}

export const previewState: {
  rows: Record<string, Row[]>;
  rejectWrites: boolean;
  operations: Array<{ table: string; operation: string; rejected: boolean }>;
} = { rows: makeFixture(), rejectWrites: false, operations: [] };

export function resetFloorPlanPreview() {
  previewState.rows = makeFixture();
  previewState.rejectWrites = false;
  previewState.operations = [];
}

function response(data: unknown, error: Error | null = null): Response {
  return { data: data === undefined ? null : structuredClone(data), error };
}

class MemoryQuery implements PromiseLike<Response> {
  private predicates: Array<(row: Row) => boolean> = [];
  private operation: "select" | WriteOperation = "select";
  private payload: Row[] = [];
  private one = false;
  private maximum = Infinity;
  private orderBy: Array<{ column: string; ascending: boolean }> = [];
  private conflicts = ["id"];
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.predicates.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.predicates.push((row) => values.includes(row[column]));
    return this;
  }
  gte(column: string, value: unknown) {
    this.predicates.push((row) => String(row[column]) >= String(value));
    return this;
  }
  lt(column: string, value: unknown) {
    this.predicates.push((row) => String(row[column]) < String(value));
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderBy.push({ column, ascending: options.ascending !== false });
    return this;
  }
  limit(value: number) {
    this.maximum = value;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  insert(value: Row | Row[]) {
    this.operation = "insert";
    this.payload = Array.isArray(value) ? value : [value];
    return this;
  }
  update(value: Row) {
    this.operation = "update";
    this.payload = [value];
    return this;
  }
  upsert(value: Row | Row[], options: { onConflict?: string } = {}) {
    this.operation = "upsert";
    this.payload = Array.isArray(value) ? value : [value];
    this.conflicts = (options.onConflict || "id").split(",");
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  private execute() {
    const rows = previewState.rows[this.table];
    if (!rows)
      return response(
        null,
        new Error(`Table d’aperçu inconnue : ${this.table}`),
      );
    const matches = (row: Row) =>
      this.predicates.every((predicate) => predicate(row));
    if (this.operation !== "select") {
      previewState.operations.push({
        table: this.table,
        operation: this.operation,
        rejected: previewState.rejectWrites,
      });
      if (previewState.rejectWrites)
        return response(
          null,
          new Error(
            "Refus de sauvegarde simulé pour vérifier la conservation du brouillon.",
          ),
        );
    }
    let result: Row[];
    if (this.operation === "insert") {
      result = this.payload.map((row) => ({
        id: `preview-${crypto.randomUUID()}`,
        ...structuredClone(row),
      }));
      rows.push(...result);
    } else if (this.operation === "update") {
      result = rows.filter(matches);
      result.forEach((row) =>
        Object.assign(row, structuredClone(this.payload[0])),
      );
    } else if (this.operation === "delete") {
      result = rows.filter(matches);
      previewState.rows[this.table] = rows.filter((row) => !matches(row));
    } else if (this.operation === "upsert") {
      result = this.payload.map((payload) => {
        const existing = rows.find((row) =>
          this.conflicts.every((column) => row[column] === payload[column]),
        );
        if (existing) return Object.assign(existing, structuredClone(payload));
        const next = {
          id: `preview-${crypto.randomUUID()}`,
          ...structuredClone(payload),
        };
        rows.push(next);
        return next;
      });
    } else {
      result = rows.filter(matches);
      result.sort((left, right) => {
        for (const { column, ascending } of this.orderBy) {
          const comparison = String(left[column] ?? "").localeCompare(
            String(right[column] ?? ""),
            "fr",
          );
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      result = result.slice(0, this.maximum);
    }
    return response(this.one ? result[0] || null : result);
  }
  then<TResult1 = Response, TResult2 = never>(
    fulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(fulfilled, rejected);
  }
}

export const previewSupabase = {
  from: (table: string) => new MemoryQuery(table),
  auth: {
    getUser: async () => ({
      data: { user: { id: "preview-owner" } },
      error: null,
    }),
  },
  functions: {
    invoke: async () =>
      response(
        null,
        new Error(
          "Les appels distants sont désactivés dans cet aperçu fictif.",
        ),
      ),
  },
  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "get_reservation_customers")
      return response(previewState.rows.profiles);
    previewState.operations.push({
      table: name,
      operation: "rpc",
      rejected: previewState.rejectWrites,
    });
    if (previewState.rejectWrites)
      return response(
        null,
        new Error(
          "Refus de sauvegarde simulé pour vérifier la conservation du brouillon.",
        ),
      );
    if (name === "restaurant_save_floor_plan_assignments") {
      for (const [reservationId, tableId] of Object.entries(
        args.p_assignments as Record<string, string | null>,
      )) {
        previewState.rows.reservation_slots =
          previewState.rows.reservation_slots.filter(
            (slot) => slot.reservation_id !== reservationId,
          );
        if (tableId)
          previewState.rows.reservation_slots.push({
            id: `slot-${reservationId}`,
            reservation_id: reservationId,
            table_id: tableId,
          });
      }
      return response({ ok: true });
    }
    if (name === "update_restaurant_reservation_status_safe") {
      const reservation = previewState.rows.reservations.find(
        (row) => row.id === args.p_reservation_id,
      );
      if (!reservation)
        return response([
          { updated: false, error_message: "Réservation fictive introuvable." },
        ]);
      reservation.status = args.p_status;
      return response([
        { updated: true, error_code: null, error_message: null },
      ]);
    }
    if (name === "restaurant_set_preferred_table")
      return response({ ok: true });
    return response(null, new Error(`RPC non simulée : ${name}`));
  },
};

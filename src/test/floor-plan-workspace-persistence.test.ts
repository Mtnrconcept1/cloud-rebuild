import { describe, expect, it } from "vitest";
import { buildDraftFloorPlanLayout } from "@/lib/floorPlan";
import {
  buildFloorPlanWorkspaceRequest,
  buildFloorPlanWorkspaceSnapshot,
  getFloorPlanWorkspaceSaveError,
  serializeFloorPlanWorkspaceLayout,
} from "@/lib/floorPlanWorkspacePersistence";

const layout = buildDraftFloorPlanLayout({
  id: "two", label: "Table", category: "table", kind: "table", capacity: 2,
  shape: "round", w: 120, h: 120,
}, 0);
const rawTables = [
  { id: "t1", table_number: "Table 1", capacity: 2, is_active: null, sector: null, layout: null },
  { id: "t2", table_number: "Table 2", capacity: 4, is_active: true, sector: "Salle", layout: { legacy_extension: "preserved", ...serializeFloorPlanWorkspaceLayout(layout) } },
];
const persistedSlots = [{ reservation_id: "r1", table_id: "t1" }, { reservation_id: "r2", table_id: "t2" }];
const draftTables = rawTables.map((table) => ({ ...table, persisted: true, layout }));
const options = {
  branchId: "b1", mode: "template" as const, serviceDate: "2026-10-19", requestId: "save-1",
  rawTables, rawOverrides: [], persistedSlots, draftTables,
  draftAssignments: { r1: "t1", r2: "t2" },
};

describe("atomic floor plan workspace contract", () => {
  it("uses untouched database nulls, isolates changed slots, and does not mutate source snapshots", () => {
    const before = JSON.stringify(rawTables);
    const snapshot = buildFloorPlanWorkspaceSnapshot([...rawTables].reverse(), [], persistedSlots, ["r2"]);
    expect(snapshot.tables[0]).toEqual(rawTables[0]);
    expect(snapshot.slots).toEqual([persistedSlots[1]]);
    expect(JSON.stringify(rawTables)).toBe(before);
    (snapshot.tables[1].layout as Record<string, unknown>).legacy_extension = "changed clone";
    expect((rawTables[1].layout as Record<string, unknown>).legacy_extension).toBe("preserved");
  });

  it("sends only the assignment delta and includes releases in the optimistic snapshot", () => {
    const request = buildFloorPlanWorkspaceRequest({ ...options, draftAssignments: { r1: "t1", r2: null } });
    expect(request.p_assignments).toEqual({ r2: null });
    expect(request.p_expected_snapshot.slots).toEqual([persistedSlots[1]]);
    expect(request.p_upserts[1].layout.legacy_extension).toBe("preserved");
  });

  it("preserves new client IDs for transactional remapping and computes explicit deletions", () => {
    const request = buildFloorPlanWorkspaceRequest({ ...options,
      draftTables: [{ ...draftTables[0], id: "new-local-table", persisted: false }],
      draftAssignments: { r1: "new-local-table", r2: null },
    });
    expect(request.p_upserts[0]).toMatchObject({ id: null, client_id: "new-local-table" });
    expect(request.p_assignments).toEqual({ r1: "new-local-table", r2: null });
    expect(request.p_delete_ids).toEqual(["t1", "t2"]);
  });

  it("saves all furniture kinds without v2 object type mapping", () => {
    const request = buildFloorPlanWorkspaceRequest({ ...options, draftTables: [{
      ...draftTables[0], layout: { ...layout, kind: "stage", w: 800, h: 450 },
    }] });
    expect(request.p_upserts[0]).toMatchObject({ capacity: 0, layout: { kind: "stage", w: 800, h: 450 } });
    expect(request.p_upserts[0].layout).not.toHaveProperty("v2_object_type");
  });

  it("blocks new inventory in service mode and keeps its template payload empty", () => {
    expect(() => buildFloorPlanWorkspaceRequest({ ...options, mode: "service", draftTables: [{ ...draftTables[0], persisted: false }] })).toThrow("Enregistrez la salle");
    const request = buildFloorPlanWorkspaceRequest({ ...options, mode: "service" });
    expect(request.p_upserts).toEqual([]);
    expect(request.p_delete_ids).toEqual([]);
    expect(request.p_assignments).toEqual({});
  });

  it("keeps a service extension unchanged when saving only a placement delta", () => {
    const templateLayout = serializeFloorPlanWorkspaceLayout(layout);
    const serviceLayout = { ...templateLayout, service_extension: { occasion: "Anniversaire" } };
    const rawTable = { ...rawTables[0], layout: templateLayout };
    const rawOverrides = [{ reservation_table_id: rawTable.id, layout: serviceLayout }];
    const request = buildFloorPlanWorkspaceRequest({ ...options, mode: "service",
      rawTables: [rawTable], rawOverrides,
      draftTables: [{ ...rawTable, persisted: true, layout }],
      persistedSlots: [persistedSlots[0]], draftAssignments: { r1: null },
    });
    expect(request.p_assignments).toEqual({ r1: null });
    expect(request.p_layouts).toEqual([]);
    expect(request.p_expected_snapshot.overrides).toEqual(rawOverrides);
    expect(serviceLayout.service_extension).toEqual({ occasion: "Anniversaire" });
  });

  it("preserves a service extension when its geometry is reset to the room template", () => {
    const templateLayout = serializeFloorPlanWorkspaceLayout(layout);
    const rawTable = { ...rawTables[0], layout: templateLayout };
    const request = buildFloorPlanWorkspaceRequest({ ...options, mode: "service",
      rawTables: [rawTable],
      rawOverrides: [{ reservation_table_id: rawTable.id, layout: { ...templateLayout, x: layout.x + 200, service_extension: "Terrasse privée" } }],
      draftTables: [{ ...rawTable, persisted: true, layout }],
      persistedSlots: [persistedSlots[0]], draftAssignments: { r1: "t1" },
    });
    expect(request.p_layouts).toEqual([{ table_id: rawTable.id, layout: { ...templateLayout, service_extension: "Terrasse privée" } }]);
  });

  it("translates conflict and undeployed RPC errors without a sequential write fallback", () => {
    expect(getFloorPlanWorkspaceSaveError({ message: "FLOOR_PLAN_REVISION_CONFLICT: changed" })).toContain("Vos changements sont conservés");
    expect(getFloorPlanWorkspaceSaveError({ code: "PGRST202", message: "missing function" })).toContain("activée sur le serveur");
    expect(getFloorPlanWorkspaceSaveError({ message: "FLOOR_PLAN_TABLE_IN_USE" })).toContain("Déplacez les clients");
  });
});

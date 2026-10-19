type LayoutItem = {
  id: string;
  persisted: boolean;
  table_number: string;
  sector: string;
  layout: { kind: string };
};

/** A saved room is a new arrangement of existing tables, whose bookings keep their IDs. */
export function restoreFloorPlanVariant<T extends LayoutItem>({
  current,
  proposed,
  assignments,
}: {
  current: readonly T[];
  proposed: readonly T[];
  assignments: Record<string, string | null>;
}) {
  const matchedIds = new Set<string>();
  const tables = proposed.map((item) => {
    const match = current.find((candidate) => !matchedIds.has(candidate.id)
      && candidate.table_number.trim().toLocaleLowerCase("fr") === item.table_number.trim().toLocaleLowerCase("fr")
      && candidate.layout.kind === item.layout.kind);
    if (!match) return item;
    matchedIds.add(match.id);
    return { ...item, id: match.id, persisted: match.persisted };
  });
  const removedIds = new Set(current.filter((item) => !matchedIds.has(item.id)).map((item) => item.id));
  return {
    tables,
    assignments: Object.fromEntries(Object.entries(assignments).map(([reservationId, tableId]) => [
      reservationId, tableId && removedIds.has(tableId) ? null : tableId,
    ])),
  };
}

/** An AI proposal is scoped to one zone; matching tables keep their identities and bookings. */
export function mergeFloorPlanAiLayout<T extends LayoutItem>({
  current,
  proposed,
  sector,
  mode,
  assignments,
}: {
  current: readonly T[];
  proposed: readonly T[];
  sector: string;
  mode: "append" | "update" | "replace";
  assignments: Record<string, string | null>;
}) {
  const existingInZone = current.filter((item) => item.sector === sector);
  const matchedIds = new Set<string>();
  const normalizeName = (name: string) => name.trim().toLocaleLowerCase("fr");
  const proposals = proposed.filter((item) => mode !== "append" || item.layout.kind !== "table").map((item) => {
    const match = mode === "append" ? undefined : existingInZone.find((candidate) => (
      !matchedIds.has(candidate.id)
      && normalizeName(candidate.table_number) === normalizeName(item.table_number)
      && candidate.layout.kind === item.layout.kind
    ));
    if (!match) return { ...item, sector };
    matchedIds.add(match.id);
    return { ...item, id: match.id, persisted: match.persisted, sector };
  });
  const retained = current.filter((item) => (
    item.sector !== sector || (mode !== "replace" && !matchedIds.has(item.id))
  ));
  const usedNames = new Set(retained.map((item) => normalizeName(item.table_number)));
  const renamedProposals = proposals.map((item) => {
    const baseName = item.table_number.trim().slice(0, 40) || (item.layout.kind === "table" ? "Table" : "Mobilier");
    let name = baseName;
    let suffix = 2;
    while (usedNames.has(normalizeName(name))) {
      const ending = ` (${suffix++})`;
      name = `${baseName.slice(0, 40 - ending.length)}${ending}`;
    }
    usedNames.add(normalizeName(name));
    return { ...item, table_number: name };
  });
  const tables = [...retained, ...renamedProposals];
  const remainingIds = new Set(tables.map((item) => item.id));
  const removedIds = new Set(current.filter((item) => !remainingIds.has(item.id)).map((item) => item.id));
  return {
    tables,
    assignments: Object.fromEntries(Object.entries(assignments).map(([reservationId, tableId]) => [
      reservationId, tableId && removedIds.has(tableId) ? null : tableId,
    ])),
  };
}

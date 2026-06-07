export type SortDirection = "asc" | "desc";

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortColumn<T, K extends string = string> = {
  key: K;
  label: string;
  type?: "date" | "number" | "text";
  getValue: (row: T) => SortValue;
};

export type SortState<K extends string = string> = {
  key: K;
  direction: SortDirection;
};

function toComparableNumber(value: SortValue, type: SortColumn<unknown>["type"]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  if (value instanceof Date) return value.getTime();
  if (type === "date") {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  }
  if (type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
  }
  return null;
}

function compareSortValues(left: SortValue, right: SortValue, type: SortColumn<unknown>["type"] = "text") {
  const leftNumber = toComparableNumber(left, type);
  const rightNumber = toComparableNumber(right, type);

  if (leftNumber !== null || rightNumber !== null) {
    return (leftNumber ?? Number.NEGATIVE_INFINITY) - (rightNumber ?? Number.NEGATIVE_INFINITY);
  }

  return String(left ?? "").localeCompare(String(right ?? ""), "fr", {
    sensitivity: "base",
    numeric: true,
  });
}

export function sortByColumn<T, K extends string>(
  rows: readonly T[],
  columns: readonly SortColumn<T, K>[],
  sortState: SortState<K>,
) {
  const column = columns.find((candidate) => candidate.key === sortState.key) ?? columns[0];
  if (!column) return [...rows];

  const directionFactor = sortState.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const result = compareSortValues(column.getValue(left), column.getValue(right), column.type);
    return result * directionFactor;
  });
}

export type DayGroup<T> = {
  dateKey: string;
  items: T[];
};

export function groupItemsByDay<T>(items: readonly T[], getDateKey: (item: T) => string): DayGroup<T>[] {
  const groupedItems = new Map<string, T[]>();

  items.forEach((item) => {
    const dateKey = getDateKey(item);
    const existingItems = groupedItems.get(dateKey);

    if (existingItems) {
      existingItems.push(item);
      return;
    }

    groupedItems.set(dateKey, [item]);
  });

  return Array.from(groupedItems.entries())
    .sort(([leftDateKey], [rightDateKey]) => leftDateKey.localeCompare(rightDateKey, "fr"))
    .map(([dateKey, groupedDayItems]) => ({
      dateKey,
      items: groupedDayItems,
    }));
}

export function getDefaultOpenDayKey(dateKeys: readonly string[], currentDateKey: string): string | null {
  if (dateKeys.includes(currentDateKey)) {
    return currentDateKey;
  }

  return dateKeys[0] ?? null;
}

export function resolveOpenDayKey(input: {
  visibleDateKeys: readonly string[];
  currentDateKey: string;
  previousOpenDayKey: string | null;
}): string | null {
  const { visibleDateKeys, currentDateKey, previousOpenDayKey } = input;

  if (previousOpenDayKey && visibleDateKeys.includes(previousOpenDayKey)) {
    return previousOpenDayKey;
  }

  return getDefaultOpenDayKey(visibleDateKeys, currentDateKey);
}

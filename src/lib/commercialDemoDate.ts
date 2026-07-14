export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRelativeLocalDateKey(dayOffset: number, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  return getLocalDateKey(date);
}

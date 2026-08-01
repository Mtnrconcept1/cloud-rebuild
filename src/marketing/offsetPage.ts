export function marketingPageOffset(page: number, pageSize: number) {
  if (
    !Number.isSafeInteger(page)
    || page < 1
    || !Number.isSafeInteger(pageSize)
    || pageSize < 1
  ) {
    throw new Error("Pagination marketing invalide.");
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw new Error("Pagination marketing hors limites.");
  return offset;
}

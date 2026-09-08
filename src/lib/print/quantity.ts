function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

export function normalizePrintOrderQuantity(
  requested: unknown,
  minimumQuantity: unknown,
  quantityStep: unknown,
) {
  const minimum = positiveInteger(minimumQuantity, 1);
  const step = positiveInteger(quantityStep, 1);
  const parsed = Number(requested);
  const quantity = Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : minimum;
  if (quantity === minimum || step === 1) return quantity;
  return Math.max(minimum, Math.ceil(quantity / step) * step);
}

export function isPrintOrderQuantityValid(
  requested: unknown,
  minimumQuantity: unknown,
  quantityStep: unknown,
) {
  const quantity = Number(requested);
  const minimum = positiveInteger(minimumQuantity, 1);
  const step = positiveInteger(quantityStep, 1);
  if (!Number.isInteger(quantity) || quantity < minimum) return false;
  if (quantity === minimum || step === 1) return true;
  return quantity % step === 0;
}

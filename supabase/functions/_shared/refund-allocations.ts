export type RefundCapacityTarget = {
  key: string;
  amountCents: number;
};

export type RefundAllocationOperation = {
  mode: string;
  stripeRefundId: string;
  targetKey: string;
  amountCents: number;
  status: string;
};

export type PlannedRefundAllocation<T extends RefundCapacityTarget> = {
  target: T;
  allocatedCents: number;
};

/** Allocate integer cents exactly and deterministically (largest remainder). */
export function allocateRefundCents(totalCents: number, targets: RefundCapacityTarget[]) {
  const safeTotal = Math.max(0, Math.round(totalCents));
  if (targets.length === 0) return [];
  const positiveWeight = targets.reduce((sum, target) => sum + Math.max(0, target.amountCents), 0);
  const denominator = positiveWeight > 0 ? positiveWeight : targets.length;
  const provisional = targets.map((target, index) => {
    const weight = positiveWeight > 0 ? Math.max(0, target.amountCents) : 1;
    const numerator = safeTotal * weight;
    return {
      index,
      cents: Math.floor(numerator / denominator),
      remainder: numerator % denominator,
      key: target.key,
    };
  });
  let centsLeft = safeTotal - provisional.reduce((sum, row) => sum + row.cents, 0);
  const ranked = [...provisional].sort(
    (left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key),
  );
  for (let index = 0; centsLeft > 0; index = (index + 1) % ranked.length) {
    ranked[index].cents += 1;
    centsLeft -= 1;
  }
  return provisional
    .sort((left, right) => left.index - right.index)
    .map((row) => row.cents);
}

/**
 * Reuse the immutable rows already recorded for this refund, subtract every
 * pending/succeeded reservation made by other refunds, then allocate only the
 * still-available target capacity. This makes a partially persisted plan safe
 * to resume after a concurrent webhook wins one of the target reservations.
 */
export function planRefundAllocations<T extends RefundCapacityTarget>(input: {
  refundId: string;
  mode: "live" | "test";
  refundAmountCents: number;
  targets: T[];
  currentOperations: RefundAllocationOperation[];
  reservedOperations: RefundAllocationOperation[];
}): PlannedRefundAllocation<T>[] {
  const targetByKey = new Map(input.targets.map((target) => [target.key, target]));
  const plannedByKey = new Map<string, number>();

  for (const operation of input.currentOperations) {
    if (!targetByKey.has(operation.targetKey)) {
      throw new Error(`REFUND_EXISTING_TARGET_IDENTITY_MISMATCH:${input.refundId}:${operation.targetKey}`);
    }
    const amountCents = Math.max(0, Math.round(operation.amountCents));
    if (amountCents > 0) plannedByKey.set(operation.targetKey, amountCents);
  }

  const reservedByKey = new Map<string, number>();
  for (const operation of input.reservedOperations) {
    if (operation.mode === input.mode && operation.stripeRefundId === input.refundId) continue;
    if (operation.status !== "pending" && operation.status !== "succeeded") continue;
    reservedByKey.set(
      operation.targetKey,
      (reservedByKey.get(operation.targetKey) || 0) + Math.max(0, Math.round(operation.amountCents)),
    );
  }

  const safeRefundAmount = Math.max(0, Math.round(input.refundAmountCents));
  const alreadyAllocated = Array.from(plannedByKey.values()).reduce((sum, amount) => sum + amount, 0);
  if (alreadyAllocated > safeRefundAmount) {
    throw new Error(`REFUND_EXISTING_ALLOCATION_EXCEEDS_AMOUNT:${input.refundId}`);
  }

  const remainingCents = safeRefundAmount - alreadyAllocated;
  if (remainingCents > 0) {
    const availableTargets = input.targets.map((target) => ({
      key: target.key,
      // (refund,target) is an immutable identity in refund_operations. Once
      // this refund owns a row for a target, a retry must reuse that amount
      // rather than trying to enlarge the existing row.
      amountCents: plannedByKey.has(target.key)
        ? 0
        : Math.max(0, target.amountCents - (reservedByKey.get(target.key) || 0)),
    }));
    const availableCents = availableTargets.reduce((sum, target) => sum + target.amountCents, 0);
    if (remainingCents > availableCents) {
      throw new Error(
        `REFUND_ALLOCATION_CAPACITY_EXCEEDED:${input.refundId}:${remainingCents}:${availableCents}`,
      );
    }

    const additions = allocateRefundCents(remainingCents, availableTargets);
    for (const [index, target] of input.targets.entries()) {
      const additionalCents = additions[index] || 0;
      if (additionalCents <= 0) continue;
      plannedByKey.set(target.key, (plannedByKey.get(target.key) || 0) + additionalCents);
    }
  }

  const plannedTotal = Array.from(plannedByKey.values()).reduce((sum, amount) => sum + amount, 0);
  if (plannedTotal !== safeRefundAmount) {
    throw new Error(`REFUND_ALLOCATION_TOTAL_MISMATCH:${input.refundId}:${plannedTotal}:${safeRefundAmount}`);
  }

  return input.targets
    .map((target) => ({ target, allocatedCents: plannedByKey.get(target.key) || 0 }))
    .filter((allocation) => allocation.allocatedCents > 0);
}

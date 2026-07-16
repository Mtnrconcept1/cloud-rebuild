import { describe, expect, it } from "vitest";

import {
  allocateRefundCents,
  planRefundAllocations,
  type RefundAllocationOperation,
} from "../../supabase/functions/_shared/refund-allocations";

const targets = [
  { key: "order:00000000-0000-4000-8000-000000000001", amountCents: 100 },
  { key: "order:00000000-0000-4000-8000-000000000002", amountCents: 100 },
];

function operation(input: Partial<RefundAllocationOperation> & Pick<RefundAllocationOperation, "targetKey" | "amountCents">): RefundAllocationOperation {
  return {
    mode: "live",
    stripeRefundId: "re_other",
    status: "pending",
    ...input,
  };
}

describe("refund allocation planning", () => {
  it("allocates every cent deterministically", () => {
    expect(allocateRefundCents(101, targets)).toEqual([51, 50]);
    expect(allocateRefundCents(1, targets)).toEqual([1, 0]);
  });

  it("reserves pending allocations from other refunds", () => {
    const first = planRefundAllocations({
      refundId: "re_first",
      mode: "live",
      refundAmountCents: 101,
      targets,
      currentOperations: [],
      reservedOperations: [],
    });
    const firstOperations = first.map(({ target, allocatedCents }) => operation({
      stripeRefundId: "re_first",
      targetKey: target.key,
      amountCents: allocatedCents,
    }));
    const second = planRefundAllocations({
      refundId: "re_second",
      mode: "live",
      refundAmountCents: 99,
      targets,
      currentOperations: [],
      reservedOperations: firstOperations,
    });

    expect(first.map((row) => row.allocatedCents)).toEqual([51, 50]);
    expect(second.map((row) => row.allocatedCents)).toEqual([49, 50]);
    expect(first[0].allocatedCents + second[0].allocatedCents).toBe(100);
    expect(first[1].allocatedCents + second[1].allocatedCents).toBe(100);
  });

  it("keeps a partial current allocation immutable and fills only remaining capacity", () => {
    const partial = operation({
      stripeRefundId: "re_resume",
      targetKey: targets[0].key,
      amountCents: 51,
    });
    const planned = planRefundAllocations({
      refundId: "re_resume",
      mode: "live",
      refundAmountCents: 101,
      targets,
      currentOperations: [partial],
      reservedOperations: [partial],
    });

    expect(planned.map((row) => row.allocatedCents)).toEqual([51, 50]);
    expect(planned.reduce((sum, row) => sum + row.allocatedCents, 0)).toBe(101);
  });

  it("does not reserve failed or cancelled refunds", () => {
    const ignored = [
      operation({ targetKey: targets[0].key, amountCents: 100, status: "failed" }),
      operation({ targetKey: targets[1].key, amountCents: 100, status: "cancelled" }),
    ];
    const planned = planRefundAllocations({
      refundId: "re_after_failure",
      mode: "live",
      refundAmountCents: 200,
      targets,
      currentOperations: [],
      reservedOperations: ignored,
    });
    expect(planned.map((row) => row.allocatedCents)).toEqual([100, 100]);
  });

  it("fails closed when pending/succeeded reservations exhaust capacity", () => {
    expect(() => planRefundAllocations({
      refundId: "re_overflow",
      mode: "live",
      refundAmountCents: 1,
      targets,
      currentOperations: [],
      reservedOperations: targets.map((target) => operation({
        targetKey: target.key,
        amountCents: target.amountCents,
        status: "succeeded",
      })),
    })).toThrow("REFUND_ALLOCATION_CAPACITY_EXCEEDED");
  });
});

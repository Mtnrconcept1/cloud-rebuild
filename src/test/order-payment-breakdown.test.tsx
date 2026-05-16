import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OrderPaymentBreakdown from "@/components/orders/OrderPaymentBreakdown";

describe("OrderPaymentBreakdown", () => {
  it("shows Miamz discounts as covered by Tok on the customer receipt", () => {
    render(
      <OrderPaymentBreakdown
        order={{
          total_amount: 18,
          delivery_fee: 3,
          metadata: {
            pre_discount_subtotal: 20,
            points_discount_amount: 5,
            payment_method: "card",
          },
        }}
        alwaysShowTotal
      />,
    );

    expect(screen.getByText("Miamz pris en charge par Tok")).toBeInTheDocument();
    expect(screen.getByText("Reduction fidelite appliquee")).toBeInTheDocument();
    expect(screen.getByText("-5.00 CHF")).toBeInTheDocument();
  });
});

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
    expect(screen.getByText("Réduction fidélité appliquée")).toBeInTheDocument();
    expect(screen.getByText("-5.00 CHF")).toBeInTheDocument();
  });

  it("does not show card payment when Miamz and Tok One fully cover the order", () => {
    render(
      <OrderPaymentBreakdown
        order={{
          total_amount: 0,
          delivery_fee: 0,
          metadata: {
            pre_discount_subtotal: 1,
            tok_one_discount_amount: 0.2,
            tok_one_discount_percent: 20,
            points_discount_amount: 0.8,
            payment_method: "card",
            card_last4: "4242",
          },
        }}
        alwaysShowTotal
      />,
    );

    expect(screen.getByText("Montant payé intégralement avec les Miamz/Tok One")).toBeInTheDocument();
    expect(screen.queryByText("Payé par Carte bancaire")).not.toBeInTheDocument();
    expect(screen.queryByText("**** 4242")).not.toBeInTheDocument();
  });

  it("shows Miamz-only wording when points fully cover the order", () => {
    render(
      <OrderPaymentBreakdown
        order={{
          total_amount: 0,
          delivery_fee: 0,
          metadata: {
            pre_discount_subtotal: 5,
            points_discount_amount: 5,
            payment_method: "card",
          },
        }}
        alwaysShowTotal
      />,
    );

    expect(screen.getByText("Montant payé intégralement avec les Miamz")).toBeInTheDocument();
    expect(screen.queryByText("Payé par Carte bancaire")).not.toBeInTheDocument();
  });
});

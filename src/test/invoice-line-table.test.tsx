import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { InvoiceLineTable } from "@/components/invoices/InvoiceLineTable";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("InvoiceLineTable", () => {
  it("shows the Tok-covered Miamz amount on payout order lines", () => {
    renderWithQueryClient(
      <InvoiceLineTable
        mode="payout"
        lines={[
          {
            lineId: "order-1",
            lineType: "order",
            source: "orders",
            reference: "#MZ-1",
            label: "Commande #MZ-1",
            occurredAt: "2026-05-16T15:02:00.000Z",
            grossAmount: 41,
            rateApplied: 0.9,
            invoicedAmount: 36.9,
            tokCoveredMiamzAmount: 5,
          },
        ]}
      />,
    );

    expect(screen.getByText("Miamz Tok")).toBeInTheDocument();
    expect(screen.getByText("5,00 CHF")).toBeInTheDocument();
    expect(screen.getByText("Miamz pris en charge par Tok")).toBeInTheDocument();
  });
});

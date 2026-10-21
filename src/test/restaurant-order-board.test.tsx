import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RestaurantOrderBoard from "@/components/dashboard/RestaurantOrderBoard";

describe("RestaurantOrderBoard", () => {
  it("shows every order once, normalizes legacy statuses, and preserves other states", () => {
    const orders = [
      { id: "new", status: "confirmed" },
      { id: "accepted", status: "accepted" },
      { id: "cooking", status: "preparing" },
      { id: "ready", status: "ready_for_pickup" },
      { id: "driving", status: "on_the_way" },
      { id: "payment", status: "pending_payment" },
      { id: "finished", status: "delivered" },
      { id: "cancelled", status: "cancelled" },
      { id: "custom", status: "unexpected-status" },
    ];

    render(<RestaurantOrderBoard orders={orders} renderOrder={(order) => <article key={order.id}>{order.id}</article>} />);

    expect(within(screen.getByRole("region", { name: "À confirmer" })).getByText("new")).toBeInTheDocument();
    const preparing = within(screen.getByRole("region", { name: "En préparation" }));
    expect(preparing.getByText("accepted")).toBeInTheDocument();
    expect(preparing.getByText("cooking")).toBeInTheDocument();
    const ready = within(screen.getByRole("region", { name: "Prêtes / en livraison" }));
    expect(ready.getByText("ready")).toBeInTheDocument();
    expect(ready.getByText("driving")).toBeInTheDocument();
    const other = within(screen.getByRole("region", { name: "Autres commandes" }));
    for (const id of ["payment", "finished", "cancelled", "custom"]) {
      expect(other.getByText(id)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("article")).toHaveLength(orders.length);
  });

  it("keeps empty service columns visible without fabricating orders", () => {
    render(<RestaurantOrderBoard orders={[]} renderOrder={(order) => <article key={order.id}>{order.id}</article>} />);

    expect(screen.getAllByText("Aucune commande dans cette étape.")).toHaveLength(3);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Autres commandes" })).not.toBeInTheDocument();
  });
});

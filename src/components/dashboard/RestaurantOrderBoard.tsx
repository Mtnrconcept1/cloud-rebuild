import type { ReactNode } from "react";
import { ChefHat, CheckCircle2, ShoppingBag } from "lucide-react";

import { normalizeOrderStatus } from "@/lib/orderStatus";

type BoardOrder = { id: string; status: string };
type RestaurantOrderBoardProps<T extends BoardOrder> = {
  orders: T[];
  renderOrder: (order: T) => ReactNode;
};

const columns = [
  { id: "confirmation", label: "À confirmer", statuses: ["confirmed"], icon: ShoppingBag },
  { id: "preparation", label: "En préparation", statuses: ["accepted", "preparing"], icon: ChefHat },
  { id: "ready", label: "Prêtes / en livraison", statuses: ["ready", "delivering"], icon: CheckCircle2 },
] as const;

export default function RestaurantOrderBoard<T extends BoardOrder>({ orders, renderOrder }: RestaurantOrderBoardProps<T>) {
  const activeStatuses = new Set<string>(columns.flatMap((column) => [...column.statuses]));
  const otherOrders = orders.filter((order) => !activeStatuses.has(normalizeOrderStatus(order.status)));

  return (
    <div className="tok-order-board-workspace">
      <div className="tok-order-board">
        {columns.map(({ id, label, statuses, icon: Icon }) => {
          const columnOrders = orders.filter((order) => (statuses as readonly string[]).includes(normalizeOrderStatus(order.status)));
          return (
            <section key={id} className="tok-order-board-column" data-order-status={id} aria-label={label}>
              <header><span><Icon aria-hidden="true" /><h2>{label}</h2></span><strong>{columnOrders.length}</strong></header>
              <div className="tok-order-board-cards">
                {columnOrders.map(renderOrder)}
                {!columnOrders.length ? <p className="tok-order-board-empty">Aucune commande dans cette étape.</p> : null}
              </div>
            </section>
          );
        })}
      </div>
      {otherOrders.length ? (
        <section className="tok-order-board-history" aria-label="Autres commandes">
          <h2>Autres commandes <span>({otherOrders.length})</span></h2>
          <p className="text-sm text-muted-foreground">Paiements en attente, commandes terminées, annulations et autres statuts de la période sélectionnée.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{otherOrders.map(renderOrder)}</div>
        </section>
      ) : null}
    </div>
  );
}

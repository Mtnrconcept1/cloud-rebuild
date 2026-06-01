import { Badge } from "@/components/ui/badge";
import { normalizeOrderStatus } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: {
    label: "En attente",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  },
  pending_payment: {
    label: "Paiement en attente",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  },
  paid: {
    label: "Payée",
    className: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700",
  },
  confirmed: {
    label: "Confirmee",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  },
  preparing: {
    label: "En préparation",
    className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  },
  ready: {
    label: "Prete",
    className: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
  },
  ready_for_pickup: {
    label: "Prete",
    className: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
  },
  picked_up: {
    label: "Pris en charge",
    className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700",
  },
  in_transit: {
    label: "En route",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  },
  delivering: {
    label: "En livraison",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  },
  on_the_way: {
    label: "En livraison",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  },
  delivered: {
    label: "Livree",
    className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  },
  cancelled: {
    label: "Annulee",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  },
  refunded: {
    label: "Remboursée",
    className: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700",
  },
  refused: {
    label: "Refusee",
    className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  },
  payment_failed: {
    label: "Paiement echoue",
    className: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700",
  },
};

export default function OrderStatusBadge({ status }: { status: string }) {
  const normalizedStatus = normalizeOrderStatus(status);
  const mappedStatus = STATUS_MAP[normalizedStatus] || { label: normalizedStatus, className: "" };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", mappedStatus.className)}>
      {mappedStatus.label}
    </Badge>
  );
}

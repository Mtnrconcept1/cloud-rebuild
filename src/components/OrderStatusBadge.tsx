import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeOrderStatus } from "@/lib/orderStatus";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  confirmed: { label: "Confirmée", className: "bg-blue-100 text-blue-800 border-blue-200" },
  preparing: { label: "En préparation", className: "bg-orange-100 text-orange-800 border-orange-200" },
  picked_up: { label: "Pris en charge", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  in_transit: { label: "En route", className: "bg-purple-100 text-purple-800 border-purple-200" },
  delivering: { label: "En livraison", className: "bg-purple-100 text-purple-800 border-purple-200" },
  on_the_way: { label: "En livraison", className: "bg-purple-100 text-purple-800 border-purple-200" },
  delivered: { label: "Livrée", className: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Annulée", className: "bg-red-100 text-red-800 border-red-200" },
  refused: { label: "Refusée", className: "bg-red-100 text-red-800 border-red-200" },
};

export default function OrderStatusBadge({ status }: { status: string }) {
  const normalizedStatus = normalizeOrderStatus(status);
  const s = STATUS_MAP[normalizedStatus] || { label: normalizedStatus, className: "" };
  return <Badge variant="outline" className={cn("text-xs font-medium", s.className)}>{s.label}</Badge>;
}

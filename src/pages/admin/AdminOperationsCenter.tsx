import AdminUrgentActions from "@/components/admin/AdminUrgentActions";
import AdminOrdersReservations from "./AdminOrdersReservations";

export default function AdminOperationsCenter() {
  return (
    <div className="space-y-6">
      <div className="container pt-8">
        <AdminUrgentActions />
      </div>
      <AdminOrdersReservations />
    </div>
  );
}

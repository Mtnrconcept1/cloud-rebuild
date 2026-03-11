import { DashboardProvider } from "@/pages/dashboard/DashboardContext";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function DashboardRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole="restaurateur">
      <DashboardProvider>
        {children}
      </DashboardProvider>
    </ProtectedRoute>
  );
}

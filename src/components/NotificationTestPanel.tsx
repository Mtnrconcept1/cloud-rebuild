import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  Bike,
  ChevronDown,
  ChevronUp,
  Package,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const supabase = getSupabase();

type NotificationPreset = {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  label: string;
  title: string;
  body: string;
  type: string;
  category: string;
  data: Record<string, unknown>;
};

const NOTIFICATION_PRESETS: NotificationPreset[] = [
  {
    id: "new_dispatch",
    icon: Bike,
    iconColor: "text-emerald-500",
    label: "Nouvelle course (livreur)",
    title: "Nouvelle course dans votre zone",
    body: "Le Gourmet Gourmand - 2x Burger Classic, 1x Salade César - Rue du Marché 12, Lausanne - 45 min",
    type: "dispatch",
    category: "transactional",
    data: {
      dispatch_job_id: "test-dispatch-job-001",
      dispatch_attempt_id: "test-attempt-001",
      order_id: "test-order-001",
      order_number: "ORD-2026-0042",
      restaurant_name: "Le Gourmet Gourmand",
      restaurant_address: "Avenue de la Gare 8, Lausanne",
      restaurant_lat: 46.5197,
      restaurant_lng: 6.6323,
      delivery_address: "Rue du Marché 12, Lausanne",
      delivery_lat: 46.5227,
      delivery_lng: 6.6340,
      total_amount: 38.50,
      items_count: 3,
      items_summary: "2x Burger Classic, 1x Salade César",
      distance_km: 1.2,
      estimated_earnings: 7.80,
      delivery_window_label: "45 min",
      multi_restaurant: false,
      delivery_proof_required: true,
      url: "/courier/jobs",
      route_steps: [
        {
          id: "pickup-1",
          type: "pickup",
          label: "Retrait",
          address: "Avenue de la Gare 8, Lausanne",
          latitude: 46.5197,
          longitude: 6.6323,
          restaurant_name: "Le Gourmet Gourmand",
          step_index: 1,
        },
        {
          id: "dropoff",
          type: "dropoff",
          label: "Livraison",
          address: "Rue du Marché 12, Lausanne",
          latitude: 46.5227,
          longitude: 6.6340,
          step_index: 2,
        },
      ],
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
  {
    id: "multi_dispatch",
    icon: Store,
    iconColor: "text-violet-500",
    label: "Course multi-restaurant",
    title: "Nouvelle course dans votre zone",
    body: "Pizzeria Bella + Sushi Zen - Rue de Bourg 22, Lausanne - 45 min",
    type: "dispatch",
    category: "transactional",
    data: {
      dispatch_job_id: "test-dispatch-job-002",
      dispatch_attempt_id: "test-attempt-002",
      order_id: "test-order-002",
      order_number: "ORD-2026-0043",
      restaurant_name: "Pizzeria Bella",
      restaurant_address: "Place Saint-François 5, Lausanne",
      restaurant_lat: 46.5200,
      restaurant_lng: 6.6350,
      delivery_address: "Rue de Bourg 22, Lausanne",
      delivery_lat: 46.5215,
      delivery_lng: 6.6375,
      total_amount: 62.00,
      items_count: 5,
      items_summary: "1x Margherita, 2x California Roll, 2x Edamame",
      distance_km: 2.1,
      estimated_earnings: 11.50,
      delivery_window_label: "45 min",
      multi_restaurant: true,
      delivery_proof_required: true,
      url: "/courier/jobs",
      route_steps: [
        {
          id: "pickup-1",
          type: "pickup",
          label: "Retrait 1",
          address: "Place Saint-François 5, Lausanne",
          latitude: 46.5200,
          longitude: 6.6350,
          restaurant_name: "Pizzeria Bella",
          step_index: 1,
        },
        {
          id: "pickup-2",
          type: "pickup",
          label: "Retrait 2",
          address: "Rue Centrale 18, Lausanne",
          latitude: 46.5210,
          longitude: 6.6360,
          restaurant_name: "Sushi Zen",
          step_index: 2,
        },
        {
          id: "dropoff",
          type: "dropoff",
          label: "Livraison",
          address: "Rue de Bourg 22, Lausanne",
          latitude: 46.5215,
          longitude: 6.6375,
          step_index: 3,
        },
      ],
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
  {
    id: "courier_assigned",
    icon: Package,
    iconColor: "text-blue-500",
    label: "Livreur assigné (client)",
    title: "Livreur assigné",
    body: "Jean Dupont prend en charge votre commande ORD-2026-0042.",
    type: "dispatch",
    category: "transactional",
    data: {
      order_id: "test-order-001",
      dispatch_job_id: "test-dispatch-job-001",
      courier_id: "test-courier-001",
      url: "/commandes",
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
  {
    id: "order_delivered",
    icon: ShoppingBag,
    iconColor: "text-primary",
    label: "Commande livrée (client)",
    title: "Commande livrée",
    body: "Votre commande ORD-2026-0042 a été livrée.",
    type: "order",
    category: "transactional",
    data: {
      order_id: "test-order-001",
      dispatch_job_id: "test-dispatch-job-001",
      url: "/commandes",
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
  {
    id: "no_courier",
    icon: Zap,
    iconColor: "text-amber-500",
    label: "Aucun livreur (admin)",
    title: "Aucun livreur disponible",
    body: "Commande de Le Gourmet Gourmand - aucun livreur trouvé après 3 tentatives.",
    type: "dispatch",
    category: "transactional",
    data: {
      order_id: "test-order-001",
      dispatch_job_id: "test-dispatch-job-001",
      status: "no_courier",
      url: "/admin",
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
  {
    id: "order_confirmed",
    icon: Sparkles,
    iconColor: "text-cyan-500",
    label: "Commande confirmée",
    title: "Commande confirmée",
    body: "Votre commande ORD-2026-0042 est confirmée et passe en préparation.",
    type: "order_update",
    category: "transactional",
    data: {
      order_id: "test-order-001",
      order_number: "ORD-2026-0042",
      status: "confirmed",
      url: "/commandes",
      requested_channels: { in_app: true, push: false, email: false },
    },
  },
];

export default function NotificationTestPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [lastSentId, setLastSentId] = useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: async (preset: NotificationPreset) => {
      if (!user?.id) throw new Error("Non connecté");

      const { data, error } = await supabase.rpc("enqueue_notification" as any, {
        p_user_id: user.id,
        p_title: preset.title,
        p_body: preset.body,
        p_type: preset.type,
        p_category: preset.category,
        p_data: preset.data,
      });

      if (error) throw error;
      return { notificationId: data, preset };
    },
    onSuccess: ({ notificationId, preset }) => {
      setLastSentId(preset.id);
      setTimeout(() => setLastSentId(null), 2000);

      queryClient.invalidateQueries({ queryKey: ["navbar-notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });

      toast.success("Notification de test envoyée", {
        description: `${preset.label} — ID: ${notificationId || "ok"}`,
      });
    },
    onError: (error) => {
      toast.error("Échec de l'envoi", {
        description: error instanceof Error ? error.message : "Erreur inconnue",
      });
    },
  });

  if (!user) return null;

  return (
    <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20">
      <CardHeader className="cursor-pointer pb-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">Test Notifications</CardTitle>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <CardDescription>
          Injectez des notifications de test pour vérifier le pipeline Realtime + UI.
        </CardDescription>
      </CardHeader>

      {expanded ? (
        <CardContent className="space-y-2 pt-0">
          <p className="text-[11px] text-muted-foreground">
            Chaque bouton insère une notification via <code className="rounded bg-muted px-1 py-0.5 text-[10px]">enqueue_notification()</code> dans
            la table <code className="rounded bg-muted px-1 py-0.5 text-[10px]">notifications</code>. Le canal push est désactivé (test local uniquement).
          </p>

          <div className="grid gap-2 pt-2">
            {NOTIFICATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate(preset)}
                className={`
                  group flex items-center gap-3 rounded-xl border p-3 text-left transition-all
                  hover:bg-background hover:shadow-sm
                  ${lastSentId === preset.id ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-card"}
                `}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 transition-colors group-hover:bg-primary/10">
                  <preset.icon className={`h-4 w-4 ${preset.iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{preset.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{preset.title}: {preset.body.slice(0, 60)}…</p>
                </div>
                <Send className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary ${sendMutation.isPending ? "animate-pulse" : ""}`} />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-semibold">Pipeline testé :</span>
            <span>RPC → notifications (INSERT) → Supabase Realtime → toast + cloche Navbar</span>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

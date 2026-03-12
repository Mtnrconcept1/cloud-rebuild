import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Bell, Send, Trash2, Mail, Smartphone, AppWindow } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CATEGORIES = [
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactionnel" },
  { value: "product", label: "Produit" },
  { value: "system", label: "Systeme" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  scheduled: { label: "Planifiee", variant: "secondary" },
  sent: { label: "Envoyee", variant: "default" },
};

type CampaignStat = {
  campaign_id: string;
  recipients: number;
  notifications_count: number;
  read_count: number;
  deliveries_total: number;
  deliveries_queued: number;
  deliveries_sent: number;
  deliveries_failed: number;
  in_app_total: number;
  email_total: number;
  push_total: number;
};

export default function AdminNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading, error } = useQuery({
    queryKey: ["admin-notification-campaigns"],
    queryFn: async () => {
      const { data, error: campaignError } = await supabase
        .from("notification_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (campaignError) throw campaignError;
      return data || [];
    },
  });

  const campaignIds = useMemo(() => campaigns.map((campaign: any) => campaign.id), [campaigns]);

  const { data: campaignStats = [] } = useQuery({
    queryKey: ["admin-notification-campaign-stats", campaignIds],
    queryFn: async () => {
      if (!campaignIds.length) return [];
      const { data, error: statsError } = await (supabase.rpc as any)("get_campaign_stats", { campaign_ids: campaignIds });
      if (statsError) throw statsError;
      return (data || []) as CampaignStat[];
    },
    enabled: campaignIds.length > 0,
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, CampaignStat>();
    for (const stat of campaignStats) {
      map.set(stat.campaign_id, stat);
    }
    return map;
  }, [campaignStats]);

  const sendCampaign = async (id: string) => {
    setSendingId(id);
    const { data, error: rpcError } = await (supabase.rpc as any)("admin_dispatch_notification_campaign", {
      p_campaign_id: id,
    });
    setSendingId(null);

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    try {
      await supabase.functions.invoke("send-push", { body: {} });
    } catch {
      // Queueing happened in SQL; push dispatch can fail independently.
    }

    try {
      await supabase.functions.invoke("send-email", { body: {} });
    } catch {
      // Email delivery can fail independently from queue creation.
    }

    const result = Array.isArray(data) ? data[0] : data;
    toast({
      title: "Campagne envoyee",
      description: result ? `${result.recipients || 0} destinataires, ${result.deliveries_total || 0} livraisons creees.` : undefined,
    });
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaign-stats"] });
  };

  const deleteCampaign = async (id: string) => {
    const { error: deleteError } = await supabase.from("notification_campaigns").delete().eq("id", id);
    if (deleteError) {
      toast({ title: "Erreur", description: deleteError.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaign-stats"] });
    toast({ title: "Campagne supprimee" });
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl font-bold">Campagnes de notifications</h1>
            <p className="text-sm text-muted-foreground">Creer, cibler et envoyer les notifications depuis l'admin.</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nouvelle campagne
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle notification</DialogTitle></DialogHeader>
            <NotificationForm
              userId={user?.id}
              onSaved={() => {
                setOpen(false);
                queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] });
                toast({ title: "Campagne creee" });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((index) => <div key={index} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : error ? (
        <Card><CardContent className="py-12 text-center text-destructive">Impossible de charger les campagnes.</CardContent></Card>
      ) : !campaigns.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune campagne de notifications</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign: any) => {
            const status = STATUS_MAP[campaign.status] || STATUS_MAP.draft;
            const stats = statsMap.get(campaign.id);
            const channels = campaign.channels || {};
            return (
              <Card key={campaign.id}>
                <CardContent className="space-y-4 py-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-sm">{campaign.title}</p>
                        <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{campaign.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{campaign.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Roles: {(campaign.target_roles || []).join(", ") || "tous"} | Villes: {(campaign.target_cities || []).join(", ") || "toutes"}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        {channels.in_app !== false ? <span className="inline-flex items-center gap-1"><AppWindow className="h-3 w-3" />In-app</span> : null}
                        {channels.email !== false ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />Email</span> : null}
                        {channels.push !== false ? <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" />Push</span> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {campaign.status !== "sent" ? (
                        <Button size="sm" onClick={() => sendCampaign(campaign.id)} disabled={sendingId === campaign.id} className="gap-1">
                          <Send className="h-3 w-3" />
                          {sendingId === campaign.id ? "Envoi..." : "Envoyer"}
                        </Button>
                      ) : null}
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(campaign.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Destinataires</p>
                      <p className="font-semibold">{stats?.recipients || 0}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Notif.</p>
                      <p className="font-semibold">{stats?.notifications_count || 0}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Livraisons</p>
                      <p className="font-semibold">{stats?.deliveries_total || 0}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Queue</p>
                      <p className="font-semibold">{stats?.deliveries_queued || 0}</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-muted-foreground">Lues</p>
                      <p className="font-semibold">{stats?.read_count || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationForm({ userId, onSaved }: { userId?: string; onSaved: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("marketing");
  const [targetRoles, setTargetRoles] = useState("");
  const [targetCities, setTargetCities] = useState("");
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("notification_campaigns").insert({
      title,
      body,
      category,
      status: "draft",
      created_by: userId || null,
      target_roles: targetRoles ? targetRoles.split(",").map((role) => role.trim()).filter(Boolean) : [],
      target_cities: targetCities ? targetCities.split(",").map((city) => city.trim()).filter(Boolean) : [],
      channels: {
        push: pushEnabled,
        email: emailEnabled,
        in_app: inAppEnabled,
      },
    });

    setLoading(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Titre</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Corps du message</Label>
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Categorie</Label>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Roles cibles (virgules)</Label>
        <Input value={targetRoles} onChange={(event) => setTargetRoles(event.target.value)} placeholder="client, restaurateur" />
      </div>
      <div className="space-y-2">
        <Label>Villes cibles (virgules)</Label>
        <Input value={targetCities} onChange={(event) => setTargetCities(event.target.value)} placeholder="Geneve, Lausanne" />
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm">
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <input type="checkbox" checked={inAppEnabled} onChange={() => setInAppEnabled((value) => !value)} />
          <span>Canal in-app</span>
        </label>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <input type="checkbox" checked={emailEnabled} onChange={() => setEmailEnabled((value) => !value)} />
          <span>Canal email</span>
        </label>
        <label className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <input type="checkbox" checked={pushEnabled} onChange={() => setPushEnabled((value) => !value)} />
          <span>Canal push</span>
        </label>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creation..." : "Creer la campagne"}
      </Button>
    </form>
  );
}

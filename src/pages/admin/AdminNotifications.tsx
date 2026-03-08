import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Bell, Send, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CATEGORIES = [
  { value: "marketing", label: "Marketing" },
  { value: "transactional", label: "Transactionnel" },
  { value: "product", label: "Produit" },
  { value: "system", label: "Système" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  scheduled: { label: "Planifiée", variant: "secondary" },
  sent: { label: "Envoyée", variant: "default" },
};

export default function AdminNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin-notification-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("notification_campaigns").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const sendCampaign = async (id: string) => {
    await supabase.from("notification_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] });
    toast({ title: "Campagne envoyée" });
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from("notification_campaigns").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] });
    toast({ title: "Campagne supprimée" });
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="font-display text-3xl font-bold">Campagnes de notifications</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle campagne</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle notification</DialogTitle></DialogHeader>
            <NotificationForm userId={user?.id} onSaved={() => { setOpen(false); queryClient.invalidateQueries({ queryKey: ["admin-notification-campaigns"] }); toast({ title: "Campagne créée" }); }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : !campaigns?.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune campagne de notifications</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: any) => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.draft;
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm">{c.title}</p>
                      <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">{c.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Cibles: {(c.target_roles || []).join(", ") || "tous"} · Villes: {(c.target_cities || []).join(", ") || "toutes"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status === "draft" && <Button size="sm" onClick={() => sendCampaign(c.id)} className="gap-1"><Send className="h-3 w-3" /> Envoyer</Button>}
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(c.id)}><Trash2 className="h-4 w-4" /></Button>
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("marketing");
  const [targetRoles, setTargetRoles] = useState("");
  const [targetCities, setTargetCities] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from("notification_campaigns").insert({
      title, body, category, status: "draft",
      created_by: userId || null,
      target_roles: targetRoles ? targetRoles.split(",").map(r => r.trim()) : [],
      target_cities: targetCities ? targetCities.split(",").map(c => c.trim()) : [],
    });
    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Titre</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Corps du message</Label><Textarea value={body} onChange={e => setBody(e.target.value)} required /></div>
      <div className="space-y-2">
        <Label>Catégorie</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Rôles cibles (virgules)</Label>
        <Input value={targetRoles} onChange={e => setTargetRoles(e.target.value)} placeholder="client, restaurateur" />
      </div>
      <div className="space-y-2">
        <Label>Villes cibles (virgules)</Label>
        <Input value={targetCities} onChange={e => setTargetCities(e.target.value)} placeholder="Genève, Lausanne" />
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Création..." : "Créer la campagne"}</Button>
    </form>
  );
}
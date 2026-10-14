import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { invokeSupabaseFunction } from "@/lib/session";
import ImageUpload from "@/components/ImageUpload";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const supabase = getSupabase();
type Accreditation = {
  status: string;
  review_reason: string | null;
  subscription_status: string;
  stripe_mode: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
type Drop = {
  id: string; chef_name: string; dish_name: string; price: number;
  description: string | null; image_url: string | null;
  original_price: number | null; drop_time: string; is_active: boolean;
  is_vip: boolean; required_miamz_points: number;
  remaining_portions: number; total_portions: number;
};
const emptyForm = () => ({
  chef_name: "", dish_name: "", description: "", image_url: "",
  price: "", original_price: "", total_portions: "20",
  drop_time: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  is_active: true, is_vip: false, required_miamz_points: "5000",
});

export default function GoldenTokPanel({ restaurantId, isCommercialDemo }: {
  restaurantId: string;
  isCommercialDemo: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const statusQuery = useQuery({
    queryKey: ["golden-tok-accreditation", restaurantId],
    enabled: !isCommercialDemo,
    queryFn: async () => {
      const { data, error } = await (supabase.from("golden_tok_accreditations" as any) as any)
        .select("status, review_reason, subscription_status, stripe_mode, current_period_end, cancel_at_period_end")
        .eq("restaurant_id", restaurantId).maybeSingle();
      if (error) throw error;
      return data as Accreditation | null;
    },
  });
  const accreditation = statusQuery.data;
  const isEntitled = accreditation?.status === "approved"
    && accreditation.subscription_status === "active"
    && accreditation.stripe_mode === "live"
    && Date.parse(accreditation.current_period_end || "") > Date.now();

  const listQuery = useQuery({
    queryKey: ["golden-tok-formulas", restaurantId, page],
    enabled: !isCommercialDemo,
    queryFn: async () => {
      const { data, error, count } = await (supabase.from("chef_table_drops" as any) as any)
        .select("id, chef_name, dish_name, description, image_url, price, original_price, total_portions, remaining_portions, drop_time, is_active, is_vip, required_miamz_points", { count: "exact" })
        .eq("restaurant_id", restaurantId)
        .eq("golden_tok_self_published", true)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .range(page * 25, (page + 1) * 25 - 1);
      if (error) throw error;
      return { rows: (data || []) as Drop[], count: count || 0 };
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("apply_golden_tok_accreditation", {
        p_restaurant_id: restaurantId, p_application_note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["golden-tok-accreditation", restaurantId] });
      toast({ title: "Candidature transmise à TOK" });
    },
    onError: (e: Error) => toast({ title: "Candidature refusée", description: e.message, variant: "destructive" }),
  });

  const billing = useMutation({
    mutationFn: async (action: "checkout" | "cancel" | "resume") => {
      const { data, error } = await invokeSupabaseFunction<{ ok: boolean; url?: string; error?: string }>(
        "golden-tok-membership", { body: { restaurant_id: restaurantId, action } },
      );
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Abonnement indisponible");
      if (action === "checkout") {
        const url = new URL(data.url || "");
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Lien de paiement invalide");
        window.location.assign(url.href);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["golden-tok-accreditation", restaurantId] }),
    onError: (e: Error) => toast({ title: "Abonnement", description: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const time = new Date(form.drop_time);
      if (!Number.isFinite(time.getTime())) throw new Error("Date invalide");
      const { error } = await (supabase.rpc as any)("restaurant_save_golden_tok_drop", {
        p_restaurant_id: restaurantId, p_drop_id: editingId,
        p_payload: {
          ...form, price: Number(form.price),
          original_price: form.original_price ? Number(form.original_price) : null,
          total_portions: Number(form.total_portions),
          required_miamz_points: Number(form.required_miamz_points),
          drop_time: time.toISOString(),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["golden-tok-formulas", restaurantId] });
      toast({ title: "Formule La Tok d’Or enregistrée" });
      setForm(emptyForm());
      setEditingId(null);
    },
    onError: (e: Error) => toast({ title: "Erreur de formule", description: e.message, variant: "destructive" }),
  });

  const startEdit = (drop: Drop) => {
    setEditingId(drop.id);
    setForm({
      chef_name: drop.chef_name,
      dish_name: drop.dish_name,
      description: drop.description || "",
      image_url: drop.image_url || "",
      price: String(drop.price),
      original_price: drop.original_price == null ? "" : String(drop.original_price),
      total_portions: String(drop.total_portions),
      drop_time: new Date(drop.drop_time).toISOString().slice(0, 16),
      is_active: drop.is_active,
      is_vip: drop.is_vip,
      required_miamz_points: String(drop.required_miamz_points || 5000),
    });
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isEntitled && !isCommercialDemo) save.mutate();
  };

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle>La Tok d’Or — gastronomie</CardTitle>
        <p className="text-sm text-muted-foreground">Réservé aux restaurants gastronomiques agréés par TOK. Abonnement spécial à 99 CHF par mois, après validation de votre candidature.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isCommercialDemo ? <p>La candidature et le paiement ne sont pas disponibles en démonstration.</p>
          : statusQuery.isLoading ? <p>Vérification de l’agrément…</p>
          : statusQuery.isError ? <p role="alert" className="text-destructive">Impossible de charger l’agrément.</p>
          : !accreditation || accreditation.status === "rejected" ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); apply.mutate(); }}>
              {accreditation?.status === "rejected" && <p>Refus précédent : {accreditation.review_reason || "motif non précisé"}</p>}
              <Label htmlFor="golden-tok-application">Présentez votre cuisine, le chef et l’expérience gastronomique (20 caractères minimum)</Label>
              <Textarea id="golden-tok-application" minLength={20} maxLength={2000} required value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" disabled={apply.isPending || note.trim().length < 20}>Postuler à l’agrément</Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p>Statut : <strong>{accreditation.status === "approved" ? "Agrément approuvé" : accreditation.status === "pending" ? "Candidature en cours d’examen" : "Agrément suspendu"}</strong></p>
              {accreditation.review_reason && <p className="text-xs text-muted-foreground">Décision TOK : {accreditation.review_reason}</p>}
              {accreditation.status === "approved" && (
                <>
                  <p>Abonnement spécial : {accreditation.subscription_status}</p>
                  {accreditation.current_period_end && <p className="text-xs">Échéance : {new Date(accreditation.current_period_end).toLocaleDateString("fr-CH")}</p>}
                  {accreditation.subscription_status === "not_subscribed" && (
                    <Button type="button" disabled={billing.isPending} onClick={() => billing.mutate("checkout")}>Souscrire — 99 CHF/mois via Stripe</Button>
                  )}
                  {accreditation.subscription_status === "active" && (
                    <Button type="button" variant="outline" disabled={billing.isPending}
                      onClick={() => billing.mutate(accreditation.cancel_at_period_end ? "resume" : "cancel")}>
                      {accreditation.cancel_at_period_end ? "Annuler la résiliation" : "Résilier en fin de période"}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

        {isEntitled && !isCommercialDemo && (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <h3 className="font-semibold md:col-span-2">{editingId ? "Modifier ma formule" : "Créer une formule La Tok d’Or"}</h3>
            <div className="space-y-1"><Label>Chef</Label><Input required minLength={2} maxLength={150} value={form.chef_name} onChange={(e) => setForm({ ...form, chef_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Nom du plat ou de la formule</Label><Input required minLength={2} maxLength={200} value={form.dish_name} onChange={(e) => setForm({ ...form, dish_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Prix (CHF)</Label><Input required type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div className="space-y-1"><Label>Prix d’origine (CHF)</Label><Input type="number" min="0.01" step="0.01" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} /></div>
            <div className="space-y-1"><Label>Portions</Label><Input required type="number" min="1" max="2000" value={form.total_portions} onChange={(e) => setForm({ ...form, total_portions: e.target.value })} /></div>
            <div className="space-y-1"><Label>Date</Label><Input required type="datetime-local" value={form.drop_time} onChange={(e) => setForm({ ...form, drop_time: e.target.value })} /></div>
            <div className="md:col-span-2"><ImageUpload label="Photo de la formule" bucket="restaurant-images" pathPrefix={restaurantId} value={form.image_url} onChange={(url) => setForm((p) => ({ ...p, image_url: url }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Description</Label><Textarea maxLength={3000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_vip} onChange={(e) => setForm({ ...form, is_vip: e.target.checked })} /> Table VIP</label>
            {form.is_vip && <div className="space-y-1"><Label>Seuil Miamz VIP</Label><Input type="number" min="1" value={form.required_miamz_points} onChange={(e) => setForm({ ...form, required_miamz_points: e.target.value })} /></div>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Offre active</label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={save.isPending}>{editingId ? "Enregistrer" : "Publier la formule"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Annuler</Button>}
            </div>
          </form>
        )}

        {listQuery.isSuccess && listQuery.data.count > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Mes formules La Tok d’Or ({listQuery.data.count})</h3>
            {listQuery.data.rows.map((drop) => (
              <div key={drop.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span className="text-sm">{drop.dish_name} · {drop.chef_name} · {drop.price} CHF · {drop.remaining_portions}/{drop.total_portions} portions</span>
                {isEntitled && (
                  <Button type="button" variant="outline" size="sm"
                    disabled={drop.remaining_portions !== drop.total_portions}
                    onClick={() => startEdit(drop)}
                    title={drop.remaining_portions !== drop.total_portions ? "Offre déjà réservée : modification bloquée" : undefined}
                  >Modifier</Button>
                )}
              </div>
            ))}
            {listQuery.data.count > 25 && <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>Précédent</Button>
              <Button type="button" variant="outline" disabled={(page + 1) * 25 >= listQuery.data.count} onClick={() => setPage((v) => v + 1)}>Suivant</Button>
            </div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const supabase = getSupabase();
const emptyCode = { code: "", type: "percentage", value: 0, min_order_amount: 0,
  max_discount: null, max_uses: null, per_user_limit: 1, restaurant_id: null,
  is_first_order_only: false, is_stackable: false, is_active: false,
  valid_until: "", required_miamz_tier: null, required_tok_one_benefit: null };
const emptyCampaign = { title: "", description: "", audience: "tok_one", benefit: "surprise_offers",
  starts_at: "", ends_at: "", promo_code_id: null, is_active: false };

export default function BenefitCampaignManager() {
  const cache = useQueryClient();
  const [kind, setKind] = useState<"code" | "campaign">("code");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({ ...emptyCode });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const table = kind === "code" ? "promo_codes" : "member_benefit_campaigns";
  const records = useQuery({
    queryKey: ["admin-benefit-management", kind, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(table).select("*")
        .order("created_at", { ascending: false }).order("id").range(page * 25, page * 25 + 24);
      if (error) throw error;
      return data as Array<Record<string, any>>;
    },
  });
  const codes = useQuery({ queryKey: ["admin-campaign-code-options"], enabled: kind === "campaign",
    queryFn: async () => { const { data, error } = await supabase.from("promo_codes").select("id,code").order("code").limit(250);
      if (error) throw error; return data; } });
  const [claimsPage, setClaimsPage] = useState(0);
  const claims = useQuery({ queryKey: ["admin-member-claims", editing, claimsPage], enabled: kind === "campaign" && Boolean(editing),
    queryFn: async () => { const { data, error } = await (supabase.rpc as any)("admin_member_campaign_claims", { p_campaign_id: editing, p_offset: claimsPage * 50 });
      if (error) throw error; return data as Array<{ user_id: string; member_name: string; claim_reference: string; fulfilled_at: string | null }>; } });
  const fulfill = async (userId: string) => {
    if (reason.trim().length < 6) { toast.error("Indiquez le motif avant de confirmer la remise."); return; }
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("admin_fulfill_member_benefit", { p_campaign_id: editing, p_user_id: userId, p_reason: reason });
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["admin-member-claims", editing] });
      toast.success("Remise enregistrée");
    } catch { toast.error("La remise n’a pas pu être enregistrée."); }
    finally { setSaving(false); }
  };
  const update = (key: string, value: unknown) => setForm(old => ({ ...old, [key]: value, ...(key === "audience" ? { benefit: value === "tok_one" ? "surprise_offers" : "early_deals" } : {}) }));
  const reset = (next = kind) => { setEditing(null); setReason(""); setForm({ ...(next === "code" ? emptyCode : emptyCampaign) }); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      for (const field of ["starts_at", "ends_at", "valid_from", "valid_until"]) {
        if (field in payload) payload[field] = payload[field] ? new Date(payload[field]).toISOString() : null;
      }
      const { error } = await (supabase.rpc as any)(kind === "code" ? "admin_save_promo_code" : "admin_save_member_campaign", {
        p_id: editing, p_payload: payload, p_reason: reason,
      });
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["admin-benefit-management"] });
      await cache.invalidateQueries({ queryKey: ["member-benefit-campaigns"] });
      reset(); toast.success("Enregistrement effectué");
    } catch (error) { toast.error(error instanceof Error ? error.message : (error as any)?.message || "Enregistrement impossible"); }
    finally { setSaving(false); }
  };
  const field = (key: string, label: string, type = "text", nullable = false) => (
    <div className="space-y-1" key={key}><Label htmlFor={`benefit-${key}`}>{label}</Label>
      <Input id={`benefit-${key}`} type={type} value={form[key] ?? ""} min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        onChange={e => update(key, nullable && !e.target.value ? null : type === "number" ? Number(e.target.value) : e.target.value)} /></div>
  );
  const select = (key: string, label: string, options: Array<[string, string]>) => (
    <div className="space-y-1"><Label htmlFor={`benefit-${key}`}>{label}</Label>
      <select id={`benefit-${key}`} className="w-full rounded-md border bg-background p-2" value={form[key] || ""}
        onChange={e => update(key, e.target.value || null)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
  );
  return <Card><CardHeader><CardTitle>Codes promo et offres réservées</CardTitle></CardHeader><CardContent className="space-y-5">
    <div className="flex flex-wrap gap-2">{(["code", "campaign"] as const).map(next => <Button key={next}
      variant={kind === next ? "default" : "outline"} onClick={() => { setKind(next); setPage(0); reset(next); }}>
      {next === "code" ? "Codes promo" : "Offres membres"}</Button>)}</div>
    {records.isError && <p role="alert" className="text-destructive">Chargement impossible. <button onClick={() => records.refetch()}>Réessayer</button></p>}
    {records.isLoading ? <p>Chargement…</p> : <ul className="divide-y">{records.data?.map(row => <li key={row.id} className="flex items-center justify-between gap-3 py-2">
      <span>{row.code || row.title} — {row.is_active ? "Actif" : "Inactif"}{kind === "code" ? ` · ${row.current_uses || 0} utilisation(s)` : ""}</span>
      <Button variant="outline" size="sm" onClick={() => { setEditing(row.id); setClaimsPage(0); setReason(""); setForm({ ...row }); }}>Modifier</Button>
    </li>)}</ul>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Précédent</Button>
      <span>Page {page + 1}</span><Button variant="outline" disabled={records.data?.length !== 25} onClick={() => setPage(page + 1)}>Suivant</Button></div>
    <form onSubmit={save} className="space-y-4 border-t pt-4"><h3 className="font-semibold">{editing ? "Modifier" : "Créer"} {kind === "code" ? "un code" : "une offre"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{kind === "code" ? <>
        {field("code", "Code (3 à 40 caractères)")}
        {select("type", "Réduction", [["percentage", "Pourcentage"], ["fixed", "Montant CHF"], ["free_delivery", "Livraison offerte"]])}
        {field("value", "Valeur", "number")}{field("min_order_amount", "Panier minimum CHF", "number")}
        {field("max_discount", "Remise maximale CHF (facultatif)", "number", true)}
        {field("max_uses", "Nombre total d’utilisations (facultatif)", "number", true)}
        {field("per_user_limit", "Utilisations par client", "number")}
        {field("restaurant_id", "Identifiant restaurant (facultatif)", "text", true)}
        {field("valid_until", "Fin de validité (date ISO, facultative)")}
        {select("required_miamz_tier", "Niveau MIAMZ minimum", [["", "Tous"], ["bronze", "Bronze"], ["silver", "Silver"], ["gold", "Gold"], ["platinum", "Platinum"]])}
        {select("required_tok_one_benefit", "Restriction Tok One", [["", "Aucune"], ["surprise_offers", "Membres avec offres surprises"]])}
      </> : <>
        {field("title", "Titre")}{field("starts_at", "Début (date ISO, vide = maintenant)")}{field("ends_at", "Fin (date ISO)")}
        {select("audience", "Public", [["tok_one", "Tok One"], ["miamz", "MIAMZ"]])}
        {select("benefit", "Avantage", form.audience === "tok_one" ? [["surprise_offers", "Offres surprises Tok One"]] : [["early_deals", "Bons plans MIAMZ"], ["exclusive_partner_events", "Événements partenaires"], ["restaurant_gifts", "Attentions restaurants"]])}
        {select("promo_code_id", "Code promo associé (facultatif)", [["", "Aucun"], ...(codes.data || []).map(row => [row.id, row.code] as [string, string])])}
        <div className="sm:col-span-2"><Label htmlFor="benefit-description">Description et modalités de retrait</Label>
          <Textarea id="benefit-description" required value={form.description || ""} onChange={e => update("description", e.target.value)} /></div>
      </>}</div>
      <div className="flex flex-wrap gap-4">{(kind === "code" ? [["is_active", "Actif"], ["is_stackable", "Cumulable"], ["is_first_order_only", "Première commande uniquement"]] : [["is_active", "Actif"]]).map(([key, label]) =>
        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form[key])} onChange={e => update(key, e.target.checked)} />{label}</label>)}</div>
      <div><Label htmlFor="benefit-reason">Motif de la modification</Label><Input id="benefit-reason" required minLength={6} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Les offres actives apparaissent uniquement aux membres éligibles. Aucun message n’est envoyé lors de l’enregistrement. Le code associé conserve ses propres dates, limites et restrictions d’accès.</p>
      <div className="flex gap-2"><Button disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button><Button type="button" variant="outline" onClick={() => reset()}>Nouvelle fiche</Button></div>
    </form>
    {kind === "campaign" && editing && <section className="space-y-2 border-t pt-4"><h3 className="font-semibold">Retraits et participations</h3>
      <p className="text-sm">Vérifiez la référence présentée par le membre, puis confirmez la remise effective de l’avantage.</p>
      {claims.isError && <p role="alert">Chargement impossible. <button onClick={() => claims.refetch()}>Réessayer</button></p>}
      {claims.data?.map(claim => <div key={claim.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
        <span>{claim.member_name || "Membre"} · {claim.claim_reference.slice(0, 18).toUpperCase()}</span>
        {claim.fulfilled_at ? <span>Remis</span> : <Button disabled={saving} onClick={() => fulfill(claim.user_id)}>Confirmer la remise</Button>}
      </div>)}
      <div className="flex gap-2"><Button variant="outline" disabled={!claimsPage} onClick={() => setClaimsPage(claimsPage - 1)}>Précédent</Button>
        <Button variant="outline" disabled={claims.data?.length !== 50} onClick={() => setClaimsPage(claimsPage + 1)}>Suivant</Button></div>
    </section>}
  </CardContent></Card>;
}

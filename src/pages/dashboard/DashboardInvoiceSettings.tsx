import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Loader2, Upload, X, FileText, Building2, CreditCard, Globe } from "lucide-react";

type InvoiceSettings = {
  id?: string;
  restaurant_id: string;
  logo_url: string;
  company_name: string;
  company_address: string;
  company_city: string;
  company_postal_code: string;
  company_country: string;
  siret: string;
  vat_number: string;
  iban: string;
  bic: string;
  bank_name: string;
  payment_terms: string;
  footer_note: string;
  email: string;
  phone: string;
  website: string;
};

const EMPTY: Omit<InvoiceSettings, "restaurant_id"> = {
  logo_url: "", company_name: "", company_address: "", company_city: "",
  company_postal_code: "", company_country: "Suisse", siret: "", vat_number: "",
  iban: "", bic: "", bank_name: "", payment_terms: "Paiement à 30 jours",
  footer_note: "", email: "", phone: "", website: "",
};

export default function DashboardInvoiceSettings() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: lr } = useOwnerRestaurants();
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (restaurantIds.length && !selectedRestaurant) setSelectedRestaurant(restaurantIds[0]);
  }, [restaurantIds, selectedRestaurant]);

  useEffect(() => {
    if (!selectedRestaurant) return;
    setLoading(true);
    supabase
      .from("restaurant_invoice_settings")
      .select("*")
      .eq("restaurant_id", selectedRestaurant)
      .maybeSingle()
      .then(({ data }) => {
        setSettings(data ? (data as any) : { ...EMPTY, restaurant_id: selectedRestaurant });
        setLoading(false);
      });
  }, [selectedRestaurant]);

  const update = (field: keyof InvoiceSettings, value: string) =>
    setSettings((s) => s ? { ...s, [field]: value } : s);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploading(true);
    const file = e.target.files[0];
    const ext = file.name.split(".").pop();
    const path = `${selectedRestaurant}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("invoice-logos").upload(path, file);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); setUploading(false); return; }
    const { data } = supabase.storage.from("invoice-logos").getPublicUrl(path);
    update("logo_url", data.publicUrl);
    setUploading(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const payload = { ...settings };
    delete (payload as any).id;

    const { error } = settings.id
      ? await supabase.from("restaurant_invoice_settings").update(payload).eq("id", settings.id)
      : await supabase.from("restaurant_invoice_settings").insert(payload);

    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Paramètres sauvegardés" });
      // Reload to get the id
      const { data } = await supabase.from("restaurant_invoice_settings").select("*").eq("restaurant_id", selectedRestaurant).maybeSingle();
      if (data) setSettings(data as any);
    }
    setSaving(false);
  };

  if (lr || loading) return <DashboardLayout><p className="p-6">Chargement...</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> Paramètres de facturation
          </h1>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Sauvegarder
          </Button>
        </div>

        {restaurants.length > 1 && (
          <div className="flex gap-2">
            {restaurants.map((r) => (
              <Button key={r.id} variant={selectedRestaurant === r.id ? "default" : "outline"} size="sm" onClick={() => setSelectedRestaurant(r.id)}>
                {r.name}
              </Button>
            ))}
          </div>
        )}

        {settings && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Logo */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Upload className="h-5 w-5" /> Logo de facturation</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  {settings.logo_url ? (
                    <div className="relative w-40 h-40 border rounded-lg overflow-hidden bg-muted">
                      <img src={settings.logo_url} alt="Logo" className="w-full h-full object-contain" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => update("logo_url", "")}><X className="h-3 w-3" /></Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-40 h-40 border-2 border-dashed rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                      {uploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : (
                        <>
                          <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">Uploader le logo</span>
                        </>
                      )}
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploading} />
                    </label>
                  )}
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Ce logo apparaîtra en haut de vos factures.</p>
                    <p>Formats acceptés : PNG, JPG · Taille recommandée : 400×200px</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company info */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-5 w-5" /> Informations de l'entreprise</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Raison sociale</Label><Input value={settings.company_name} onChange={(e) => update("company_name", e.target.value)} placeholder="Ma Société SA" /></div>
                <div><Label>Adresse</Label><Input value={settings.company_address} onChange={(e) => update("company_address", e.target.value)} placeholder="12 rue de la Paix" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Code postal</Label><Input value={settings.company_postal_code} onChange={(e) => update("company_postal_code", e.target.value)} placeholder="1204" /></div>
                  <div><Label>Ville</Label><Input value={settings.company_city} onChange={(e) => update("company_city", e.target.value)} placeholder="Genève" /></div>
                </div>
                <div><Label>Pays</Label><Input value={settings.company_country} onChange={(e) => update("company_country", e.target.value)} /></div>
                <div><Label>N° IDE / SIRET</Label><Input value={settings.siret} onChange={(e) => update("siret", e.target.value)} placeholder="CHE-123.456.789" /></div>
                <div><Label>N° TVA</Label><Input value={settings.vat_number} onChange={(e) => update("vat_number", e.target.value)} placeholder="CHE-123.456.789 TVA" /></div>
              </CardContent>
            </Card>

            {/* Bank info */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" /> Coordonnées bancaires</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>IBAN</Label><Input value={settings.iban} onChange={(e) => update("iban", e.target.value)} placeholder="CH93 0076 2011 6238 5295 7" /></div>
                <div><Label>BIC / SWIFT</Label><Input value={settings.bic} onChange={(e) => update("bic", e.target.value)} placeholder="UBSWCHZH80A" /></div>
                <div><Label>Nom de la banque</Label><Input value={settings.bank_name} onChange={(e) => update("bank_name", e.target.value)} placeholder="UBS Switzerland AG" /></div>
                <div><Label>Conditions de paiement</Label><Input value={settings.payment_terms} onChange={(e) => update("payment_terms", e.target.value)} /></div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Globe className="h-5 w-5" /> Contact</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Email de facturation</Label><Input type="email" value={settings.email} onChange={(e) => update("email", e.target.value)} placeholder="compta@monrestaurant.ch" /></div>
                <div><Label>Téléphone</Label><Input value={settings.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+41 22 000 00 00" /></div>
                <div><Label>Site web</Label><Input value={settings.website} onChange={(e) => update("website", e.target.value)} placeholder="https://monrestaurant.ch" /></div>
              </CardContent>
            </Card>

            {/* Footer */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Note de bas de page</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={settings.footer_note} onChange={(e) => update("footer_note", e.target.value)} placeholder="Merci pour votre confiance ! En cas de question, contactez-nous." rows={4} />
                <p className="text-xs text-muted-foreground mt-2">Ce texte apparaîtra en bas de chaque facture générée.</p>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-lg">Aperçu de la facture</CardTitle></CardHeader>
              <CardContent>
                <div className="border rounded-lg p-8 bg-white text-black max-w-2xl mx-auto space-y-6 text-sm">
                  <div className="flex justify-between items-start">
                    {settings.logo_url ? <img src={settings.logo_url} alt="Logo" className="h-16 object-contain" /> : <div className="h-16 w-32 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">Logo</div>}
                    <div className="text-right">
                      <p className="font-bold text-lg">{settings.company_name || "Nom de l'entreprise"}</p>
                      <p>{settings.company_address || "Adresse"}</p>
                      <p>{settings.company_postal_code} {settings.company_city}</p>
                      {settings.vat_number && <p className="text-xs mt-1">TVA: {settings.vat_number}</p>}
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="font-bold text-xl">FACTURE</p>
                    <p className="text-xs text-gray-500">N° FAC-202603-0001 · Date : 08.03.2026</p>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead><tr className="border-b"><th className="py-2">Description</th><th className="py-2 text-right">Montant</th></tr></thead>
                    <tbody>
                      <tr className="border-b"><td className="py-2">Commission plateforme — Mars 2026</td><td className="py-2 text-right">1'250.00 CHF</td></tr>
                      <tr><td className="py-2 font-bold">Total HT</td><td className="py-2 text-right font-bold">1'250.00 CHF</td></tr>
                      <tr><td className="py-2">TVA 7.7%</td><td className="py-2 text-right">96.25 CHF</td></tr>
                      <tr className="border-t"><td className="py-2 font-bold text-lg">Total TTC</td><td className="py-2 text-right font-bold text-lg">1'346.25 CHF</td></tr>
                    </tbody>
                  </table>
                  {settings.iban && (
                    <div className="bg-gray-50 rounded p-3 text-xs">
                      <p className="font-semibold">Coordonnées bancaires</p>
                      <p>IBAN : {settings.iban}{settings.bic ? ` · BIC : ${settings.bic}` : ""}</p>
                      {settings.bank_name && <p>Banque : {settings.bank_name}</p>}
                    </div>
                  )}
                  {settings.payment_terms && <p className="text-xs text-gray-500">{settings.payment_terms}</p>}
                  {settings.footer_note && <p className="text-xs text-gray-400 border-t pt-3">{settings.footer_note}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

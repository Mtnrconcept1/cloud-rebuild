import { useEffect, useState, type ChangeEvent } from "react";

import {
  Building2,
  CreditCard,
  FileText,
  Globe,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import CityAutocomplete from "@/components/CityAutocomplete";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";

import { useOwnerRestaurants } from "./useOwnerRestaurants";

const supabase = getSupabase();

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
  logo_url: "",
  company_name: "",
  company_address: "",
  company_city: "",
  company_postal_code: "",
  company_country: "Suisse",
  siret: "",
  vat_number: "",
  iban: "",
  bic: "",
  bank_name: "",
  payment_terms: "Paiement a 30 jours",
  footer_note: "",
  email: "",
  phone: "",
  website: "",
};

const COUNTRY_OPTIONS = ["Suisse", "France", "Belgique", "Allemagne", "Italie"] as const;

export default function DashboardInvoiceSettings() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: lr } = useOwnerRestaurants();
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const selectedRestaurantRecord = restaurants.find((restaurant) => restaurant.id === selectedRestaurant) || null;

  useEffect(() => {
    if (restaurantIds.length && !selectedRestaurant) {
      setSelectedRestaurant(restaurantIds[0]);
    }
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
        setSettings(data ? (data as InvoiceSettings) : { ...EMPTY, restaurant_id: selectedRestaurant });
        setLoading(false);
      });
  }, [selectedRestaurant]);

  const update = (field: keyof InvoiceSettings, value: string) => {
    setSettings((current) => (current ? { ...current, [field]: value } : current));
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;

    setUploading(true);
    const file = event.target.files[0];
    const extension = file.name.split(".").pop();
    const path = `${selectedRestaurant}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("invoice-logos").upload(path, file);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("invoice-logos").getPublicUrl(path);
    update("logo_url", data.publicUrl);
    setUploading(false);
  };

  const save = async () => {
    if (!settings) return;

    setSaving(true);
    const payload = { ...settings };
    delete (payload as Partial<InvoiceSettings>).id;

    const { error } = settings.id
      ? await supabase.from("restaurant_invoice_settings").update(payload).eq("id", settings.id)
      : await supabase.from("restaurant_invoice_settings").insert(payload);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Parametres sauvegardes" });
      const { data } = await supabase
        .from("restaurant_invoice_settings")
        .select("*")
        .eq("restaurant_id", selectedRestaurant)
        .maybeSingle();
      if (data) setSettings(data as InvoiceSettings);
    }

    setSaving(false);
  };

  if (lr || loading) {
    return (
      <DashboardLayout>
        <p className="p-6">Chargement...</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Facturation"
          title="Parametres de facturation"
          description="Renseignez les informations legales, bancaires et de presentation qui alimentent vos factures restaurateur."
          icon={FileText}
          tone="sky"
          visualLabel="Factures"
          stats={[
            { label: "Restaurant", value: selectedRestaurantRecord?.name || "Aucun", icon: Building2 },
            { label: "Logo", value: settings?.logo_url ? "Charge" : "Absent", icon: Upload },
            { label: "IBAN", value: settings?.iban ? "Renseigne" : "Manquant", icon: CreditCard },
          ]}
          actions={(
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sauvegarder
          </Button>
          )}
        />

        {restaurants.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {restaurants.map((restaurant) => (
              <Button
                key={restaurant.id}
                variant={selectedRestaurant === restaurant.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRestaurant(restaurant.id)}
              >
                {restaurant.name}
              </Button>
            ))}
          </div>
        ) : null}

        {settings ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5" />
                  Logo de facturation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  {settings.logo_url ? (
                    <div className="relative h-40 w-40 overflow-hidden rounded-lg border bg-muted">
                      <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => update("logo_url", "")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex h-40 w-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-muted/50 transition-colors hover:bg-muted">
                      {uploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Upload className="mb-1 h-6 w-6 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Uploader le logo</span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploading}
                      />
                    </label>
                  )}

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>Ce logo apparaitra en haut de vos factures.</p>
                    <p>Formats acceptes : PNG, JPG. Taille recommandee : 400x200 px.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5" />
                  Informations de l entreprise
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Raison sociale</Label>
                  <Input
                    value={settings.company_name}
                    onChange={(event) => update("company_name", event.target.value)}
                    placeholder="Ma Societe SA"
                  />
                </div>
                <div>
                  <Label>Adresse</Label>
                  <AddressAutocomplete
                    value={settings.company_address}
                    onValueChange={(value) => update("company_address", value)}
                    onAddressSelect={(address, city, selection) => {
                      update("company_address", address);
                      if (city) update("company_city", city);
                      if (selection?.postcode) update("company_postal_code", selection.postcode);
                      if (selection?.country) update("company_country", selection.country);
                    }}
                    placeholder="12 rue de la Paix"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Code postal</Label>
                    <Input
                      value={settings.company_postal_code}
                      onChange={(event) => update("company_postal_code", event.target.value)}
                      placeholder="1204"
                    />
                  </div>
                  <div>
                    <Label>Ville</Label>
                    <CityAutocomplete
                      value={settings.company_city}
                      onValueChange={(value) => update("company_city", value)}
                      onCitySelect={(city) => update("company_city", city)}
                      placeholder="Geneve"
                    />
                  </div>
                </div>
                <div>
                  <Label>Pays</Label>
                  <Select
                    value={settings.company_country || "Suisse"}
                    onValueChange={(value) => update("company_country", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>N deg IDE / SIRET</Label>
                  <Input
                    value={settings.siret}
                    onChange={(event) => update("siret", event.target.value)}
                    placeholder="CHE-123.456.789"
                  />
                </div>
                <div>
                  <Label>N deg TVA</Label>
                  <Input
                    value={settings.vat_number}
                    onChange={(event) => update("vat_number", event.target.value)}
                    placeholder="CHE-123.456.789 TVA"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="h-5 w-5" />
                  Coordonnees bancaires
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>IBAN</Label>
                  <Input
                    value={settings.iban}
                    onChange={(event) => update("iban", event.target.value)}
                    placeholder="CH93 0076 2011 6238 5295 7"
                  />
                </div>
                <div>
                  <Label>BIC / SWIFT</Label>
                  <Input
                    value={settings.bic}
                    onChange={(event) => update("bic", event.target.value)}
                    placeholder="UBSWCHZH80A"
                  />
                </div>
                <div>
                  <Label>Nom de la banque</Label>
                  <Input
                    value={settings.bank_name}
                    onChange={(event) => update("bank_name", event.target.value)}
                    placeholder="UBS Switzerland AG"
                  />
                </div>
                <div>
                  <Label>Conditions de paiement</Label>
                  <Input
                    value={settings.payment_terms}
                    onChange={(event) => update("payment_terms", event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5" />
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email de facturation</Label>
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(event) => update("email", event.target.value)}
                    placeholder="compta@monrestaurant.ch"
                  />
                </div>
                <div>
                  <Label>Telephone</Label>
                  <Input
                    value={settings.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="+41 22 000 00 00"
                  />
                </div>
                <div>
                  <Label>Site web</Label>
                  <Input
                    value={settings.website}
                    onChange={(event) => update("website", event.target.value)}
                    placeholder="https://monrestaurant.ch"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Note de bas de page</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={settings.footer_note}
                  onChange={(event) => update("footer_note", event.target.value)}
                  placeholder="Merci pour votre confiance ! En cas de question, contactez-nous."
                  rows={4}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Ce texte apparaitra en bas de chaque facture generee.
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Apercu de la facture</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mx-auto max-w-2xl space-y-6 rounded-lg border bg-white p-8 text-sm text-black">
                  <div className="flex items-start justify-between">
                    {settings.logo_url ? (
                      <img src={settings.logo_url} alt="Logo" className="h-16 object-contain" />
                    ) : (
                      <div className="flex h-16 w-32 items-center justify-center rounded bg-gray-200 text-xs text-gray-500">
                        Logo
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-lg font-bold">{settings.company_name || "Nom de l'entreprise"}</p>
                      <p>{settings.company_address || "Adresse"}</p>
                      <p>
                        {settings.company_postal_code} {settings.company_city}
                      </p>
                      {settings.vat_number ? <p className="mt-1 text-xs">TVA : {settings.vat_number}</p> : null}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-xl font-bold">FACTURE</p>
                    <p className="text-xs text-gray-500">N deg FAC-202603-0001 - Date : 08.03.2026</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Restaurant concerne</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {selectedRestaurantRecord?.name || "Nom du restaurant"}
                    </p>
                  </div>

                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2">Description</th>
                        <th className="py-2 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">Commission plateforme - Mars 2026</td>
                        <td className="py-2 text-right">1'250.00 CHF</td>
                      </tr>
                      <tr>
                        <td className="py-2 font-bold">Total HT</td>
                        <td className="py-2 text-right font-bold">1'250.00 CHF</td>
                      </tr>
                      <tr>
                        <td className="py-2">TVA 7.7%</td>
                        <td className="py-2 text-right">96.25 CHF</td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-2 text-lg font-bold">Total TTC</td>
                        <td className="py-2 text-right text-lg font-bold">1'346.25 CHF</td>
                      </tr>
                    </tbody>
                  </table>

                  {settings.iban ? (
                    <div className="rounded bg-gray-50 p-3 text-xs">
                      <p className="font-semibold">Coordonnees bancaires</p>
                      <p>
                        IBAN : {settings.iban}
                        {settings.bic ? ` - BIC : ${settings.bic}` : ""}
                      </p>
                      {settings.bank_name ? <p>Banque : {settings.bank_name}</p> : null}
                    </div>
                  ) : null}

                  {settings.payment_terms ? (
                    <p className="text-xs text-gray-500">{settings.payment_terms}</p>
                  ) : null}
                  {settings.footer_note ? (
                    <p className="border-t pt-3 text-xs text-gray-400">{settings.footer_note}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

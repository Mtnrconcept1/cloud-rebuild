import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Download, FileText, Euro, Settings, RefreshCcw, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Invoice = {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount_ht: number;
  amount_tva: number;
  amount_ttc: number;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  restaurant_id: string;
};

type InvoiceSettings = {
  logo_url: string | null;
  company_name: string | null;
  company_address: string | null;
  company_city: string | null;
  company_postal_code: string | null;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  payment_terms: string | null;
  footer_note: string | null;
  email: string | null;
  phone: string | null;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  pending: { label: "En attente", variant: "secondary" },
  paid: { label: "Payée", variant: "default" },
  overdue: { label: "En retard", variant: "destructive" },
};

export default function DashboardFactures() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<Record<string, InvoiceSettings>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);

    const [invoiceRes, settingsRes] = await Promise.all([
      supabase.from("restaurant_invoices").select("*").in("restaurant_id", restaurantIds).order("period_end", { ascending: false }),
      supabase.from("restaurant_invoice_settings").select("*").in("restaurant_id", restaurantIds),
    ]);

    setError(invoiceRes.error?.message || null);
    setInvoices((invoiceRes.data || []) as Invoice[]);

    const sMap: Record<string, InvoiceSettings> = {};
    (settingsRes.data || []).forEach((s: any) => { sMap[s.restaurant_id] = s; });
    setSettings(sMap);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const generateInvoices = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc("generate_monthly_invoices");
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { toast({ title: `${data} facture(s) générée(s)` }); load(); }
    setGenerating(false);
  };

  const totalHT = invoices.reduce((s, i) => s + Number(i.amount_ht), 0);
  const totalTTC = invoices.reduce((s, i) => s + Number(i.amount_ttc), 0);
  const unpaid = invoices.filter((i) => i.status !== "paid");

  const restaurantName = (id: string) => restaurants.find((r) => r.id === id)?.name || "—";
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  const getInvoiceSettings = (restaurantId: string) => settings[restaurantId] || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-display text-3xl font-bold">Factures</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/factures/parametres"><Settings className="h-4 w-4 mr-1" /> Personnaliser</Link>
            </Button>
            <Button size="sm" onClick={generateInvoices} disabled={generating}>
              <RefreshCcw className={`h-4 w-4 mr-1 ${generating ? "animate-spin" : ""}`} />
              Générer factures
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total HT</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalHT.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalTTC.toFixed(2)} CHF</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Impayées</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{unpaid.length}</p></CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur : {restaurantError || error}</p> : null}
        {!loading && !error && !invoices.length ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <FileText className="mx-auto h-10 w-10 mb-2 opacity-40" />
              <p>Aucune facture pour le moment.</p>
              <p className="text-xs mt-1">Cliquez sur « Générer factures » pour créer les factures du mois précédent.</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3">
          {invoices.map((inv) => {
            const s = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            const hasBranding = !!getInvoiceSettings(inv.restaurant_id);
            return (
              <Card key={inv.id}>
                <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Euro className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{Number(inv.amount_ttc).toFixed(2)} CHF TTC</span>
                      <Badge variant={s.variant}>{s.label}</Badge>
                      {inv.invoice_number && <span className="text-xs text-muted-foreground font-mono">{inv.invoice_number}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {restaurantName(inv.restaurant_id)} · Période : {fmt(inv.period_start)} → {fmt(inv.period_end)}
                    </p>
                    {inv.due_at && !inv.paid_at && (
                      <p className="text-xs text-muted-foreground">Échéance : {fmt(inv.due_at)}</p>
                    )}
                    {inv.paid_at && (
                      <p className="text-xs text-muted-foreground">Payée le {fmt(inv.paid_at)}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setPreviewInvoice(inv)}>
                      <Eye className="h-4 w-4 mr-1" /> Aperçu
                    </Button>
                    {inv.pdf_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={inv.pdf_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" />PDF</a>
                      </Button>
                    )}
                    {inv.status !== "paid" && (
                      <Button size="sm" onClick={async () => {
                        const { error } = await supabase
                          .from("restaurant_invoices")
                          .update({ status: "paid", paid_at: new Date().toISOString() })
                          .eq("id", inv.id);
                        if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
                        else { toast({ title: "Facture marquée comme payée" }); load(); }
                      }}>
                        Marquer payée
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Invoice Preview Dialog */}
        <Dialog open={!!previewInvoice} onOpenChange={() => setPreviewInvoice(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Aperçu de la facture</DialogTitle></DialogHeader>
            {previewInvoice && <InvoicePreview invoice={previewInvoice} settings={getInvoiceSettings(previewInvoice.restaurant_id)} restaurantName={restaurantName(previewInvoice.restaurant_id)} />}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function InvoicePreview({ invoice, settings, restaurantName }: { invoice: Invoice; settings: InvoiceSettings | null; restaurantName: string }) {
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="border rounded-lg p-8 bg-white text-black space-y-6 text-sm print:border-0">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-16 object-contain mb-2" />
          ) : (
            <div className="h-12 w-28 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400 mb-2">Logo</div>
          )}
          <p className="font-bold text-base">{settings?.company_name || restaurantName}</p>
          {settings?.company_address && <p>{settings.company_address}</p>}
          {(settings?.company_postal_code || settings?.company_city) && (
            <p>{settings?.company_postal_code} {settings?.company_city}</p>
          )}
          {settings?.vat_number && <p className="text-xs mt-1">N° TVA : {settings.vat_number}</p>}
          {settings?.email && <p className="text-xs">{settings.email}</p>}
          {settings?.phone && <p className="text-xs">{settings.phone}</p>}
        </div>
        <div className="text-right">
          <p className="font-bold text-2xl text-gray-800">FACTURE</p>
          {invoice.invoice_number && <p className="font-mono text-sm mt-1">{invoice.invoice_number}</p>}
          <p className="text-xs text-gray-500 mt-2">Date d'émission : {fmt(invoice.created_at)}</p>
          {invoice.due_at && <p className="text-xs text-gray-500">Échéance : {fmt(invoice.due_at)}</p>}
        </div>
      </div>

      {/* Period */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Période de facturation</p>
        <p className="font-medium">{fmt(invoice.period_start)} — {fmt(invoice.period_end)}</p>
      </div>

      {/* Items */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="py-3 text-left font-semibold">Description</th>
            <th className="py-3 text-right font-semibold">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-3">Commissions plateforme — {restaurantName}</td>
            <td className="py-3 text-right">{Number(invoice.amount_ht).toFixed(2)} CHF</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td className="py-2 font-semibold">Sous-total HT</td><td className="py-2 text-right">{Number(invoice.amount_ht).toFixed(2)} CHF</td></tr>
          <tr><td className="py-2">TVA (7.7%)</td><td className="py-2 text-right">{Number(invoice.amount_tva).toFixed(2)} CHF</td></tr>
          <tr className="border-t-2 border-gray-800"><td className="py-3 font-bold text-lg">Total TTC</td><td className="py-3 text-right font-bold text-lg">{Number(invoice.amount_ttc).toFixed(2)} CHF</td></tr>
        </tfoot>
      </table>

      {/* Bank info */}
      {settings?.iban && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-1">
          <p className="font-semibold text-xs uppercase tracking-wider text-gray-500">Coordonnées bancaires</p>
          <p>IBAN : {settings.iban}</p>
          {settings.bic && <p>BIC : {settings.bic}</p>}
          {settings.bank_name && <p>Banque : {settings.bank_name}</p>}
        </div>
      )}

      {settings?.payment_terms && <p className="text-xs text-gray-500">{settings.payment_terms}</p>}

      {/* Status */}
      <div className={`text-center py-3 rounded-lg font-bold text-lg ${invoice.status === "paid" ? "bg-green-50 text-green-700" : invoice.status === "overdue" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"}`}>
        {invoice.status === "paid" ? "✓ PAYÉE" : invoice.status === "overdue" ? "⚠ EN RETARD" : "EN ATTENTE DE PAIEMENT"}
      </div>

      {settings?.footer_note && <p className="text-xs text-gray-400 border-t pt-4 text-center">{settings.footer_note}</p>}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Thermometer, QrCode, CreditCard,
  CheckCircle2, Package, AlertTriangle, Truck, Eye,
  Plus, Minus
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FeatureWizard, WizardBackButton, WizardNextButton, WizardCartSummary } from "@/components/FeatureWizard";

const supabase = getSupabase();

type Step = "option" | "restaurant" | "menu" | "confirm";

export default function GarantieQualite() {
  const { addItem, clearCart, updateCartMetadata } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("option");
  const [optionEnabled, setOptionEnabled] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<any>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [scanned, setScanned] = useState(false);

  const QUALITY_FEE = 1.50;

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-quality"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_active", true)
        .eq("delivery_available", true)
        .order("rating", { ascending: false })
        .limit(9);
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menu-quality", selectedRestaurant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", selectedRestaurant.id)
        .eq("is_available", true)
        .order("category");
      return data || [];
    },
    enabled: !!selectedRestaurant,
  });

  const updateQty = (id: string, d: number) => setQuantities((p) => {
    const n = Math.max(0, (p[id] || 0) + d);
    if (n === 0) { const { [id]: _, ...r } = p; return r; }
    return { ...p, [id]: n };
  });

  const count = Object.values(quantities).reduce((a, b) => a + b, 0);
  const subtotal = menuItems ? Object.entries(quantities).reduce((s, [id, q]) => {
    const it = menuItems.find((m: any) => m.id === id);
    return s + (it ? Number(it.price) * q : 0);
  }, 0) : 0;
  const totalWithOption = subtotal + (optionEnabled ? QUALITY_FEE : 0);
  const categories = menuItems ? [...new Set(menuItems.map((i: any) => i.category || "Autres"))] as string[] : [];

  const stepIdx = (s: Step) => ["option", "restaurant", "menu", "confirm"].indexOf(s);

  const handleAddToCart = () => {
    if (!selectedRestaurant || !menuItems) return;
    clearCart();

    // Save quality guarantee status to cart metadata
    updateCartMetadata({
      feature: "garantie-qualite",
      qualityGuarantee: optionEnabled
    });

    Object.entries(quantities).forEach(([id, qty]) => {
      const item = menuItems.find((m: any) => m.id === id);
      if (item && qty > 0) {
        for (let i = 0; i < qty; i++) {
          addItem({
            menuItemId: item.id,
            name: item.name,
            price: Number(item.price),
            restaurantId: selectedRestaurant.id,
            restaurantName: selectedRestaurant.name,
          });
        }
      }
    });
    // Add quality guarantee fee as a line item
    if (optionEnabled) {
      addItem({
        menuItemId: "garantie-qualite-fee",
        name: "🛡️ Garantie Qualité",
        price: QUALITY_FEE,
        restaurantId: selectedRestaurant.id,
        restaurantName: selectedRestaurant.name,
      });
    }
    setStep("confirm");
  };

  const handleCheckout = () => {
    toast({
      title: optionEnabled ? "Garantie Qualité activée !" : "Commande confirmée !",
      description: `${selectedRestaurant?.name} · ${count} article${count > 1 ? "s" : ""} · ${totalWithOption.toFixed(2)} CHF`,
    });
    navigate("/panier");
  };

  const qualityChecks = [
    { id: "seal", label: "Sac scellé", status: scanned ? "ok" : "pending", detail: "Intégrité de l'emballage vérifiée" },
    { id: "temp", label: "Température", status: scanned ? "ok" : "pending", detail: scanned ? "68°C - Conforme" : "En attente de scan" },
    { id: "time", label: "Délai de livraison", status: scanned ? "ok" : "pending", detail: scanned ? "23 min - Dans les temps" : "En cours" },
    { id: "integrity", label: "Intégrité visuelle", status: scanned ? "ok" : "pending", detail: scanned ? "Aucun dommage détecté" : "Vérification au scan" },
  ];

  return (
    <FeatureWizard
      title="Garantie qualité"
      subtitle="Chaud garanti, intégrité vérifiée, compensation auto"
      icon={ShieldCheck}
      colorClass="teal-500"
      steps={[
        { id: "option", label: "Option" },
        { id: "restaurant", label: "Restaurant" },
        { id: "menu", label: "Menu" },
        { id: "confirm", label: "Confirmer" }
      ]}
      currentStepId={step}
      onStepChange={(id) => setStep(id as Step)}
    >
      <div className="space-y-6">
        {step === "option" && (
          <div className="space-y-6 animate-in fade-in-50">
            {/* Main option */}
            <div className={`rounded-2xl border-2 p-6 transition-all ${optionEnabled ? "border-teal-500 bg-teal-500/5" : "border-border"}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${optionEnabled ? "bg-teal-500/10" : "bg-secondary"}`}>
                    <Thermometer className={`h-7 w-7 ${optionEnabled ? "text-teal-500" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">Option "Chaud garanti"</h2>
                    <p className="text-sm text-muted-foreground">Protection complète de votre commande</p>
                  </div>
                </div>
                <Badge className={optionEnabled ? "bg-teal-500 text-white" : "bg-secondary text-muted-foreground"}>
                  +{QUALITY_FEE.toFixed(2)} CHF
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { icon: Package, label: "Sac scellé", desc: "Emballage inviolable" },
                  { icon: Thermometer, label: "Capteur temp.", desc: "Suivi en temps réel" },
                  { icon: QrCode, label: "QR vérification", desc: "Scan à la réception" },
                  { icon: CreditCard, label: "Compensation", desc: "Remboursement auto" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-background border p-3 space-y-1">
                    <item.icon className={`h-4 w-4 ${optionEnabled ? "text-teal-500" : "text-muted-foreground"}`} />
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => setOptionEnabled(!optionEnabled)}
                className={`w-full ${optionEnabled ? "bg-teal-500 hover:bg-teal-600" : ""}`}
                variant={optionEnabled ? "default" : "outline"}
              >
                {optionEnabled ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Option activée</>
                ) : (
                  "Activer la garantie qualité"
                )}
              </Button>
            </div>

            {/* Compensation table */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Comment fonctionne la compensation ?
              </h3>
              <div className="space-y-3 text-sm">
                {[
                  { condition: "Température < 55°C à réception", compensation: "100% remboursé", severity: "high" as const },
                  { condition: "Température 55-60°C", compensation: "50% en crédit", severity: "medium" as const },
                  { condition: "Sac ouvert / endommagé", compensation: "100% + 5 CHF crédit", severity: "high" as const },
                  { condition: "Retard > 15 min", compensation: "Livraison offerte", severity: "low" as const },
                ].map((rule, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
                    <span className="text-muted-foreground">{rule.condition}</span>
                    <Badge variant={rule.severity === "high" ? "destructive" : "outline"} className="text-xs shrink-0">
                      {rule.compensation}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <WizardNextButton
              onClick={() => setStep("restaurant")}
              label="Choisir un restaurant"
              colorClass="teal-500"
            />
          </div>
        )}

        {step === "restaurant" && (
          <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
            <WizardBackButton onClick={() => setStep("option")} label="Option" />
            <div className="rounded-lg bg-teal-500/5 p-3 flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-teal-500" />
              <span>Garantie qualité : <strong className="text-teal-600">{optionEnabled ? "Activée" : "Désactivée"}</strong></span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants?.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRestaurant(r); setQuantities({}); setStep("menu"); }}
                  className="text-left rounded-xl border-2 overflow-hidden hover:border-teal-500/30 border-border transition-all"
                >
                  <img src={r.image_url || "/images/kebab-box-spread.jpeg"} alt={r.name} className="w-full h-32 object-cover" />
                  <div className="p-3">
                    <p className="font-bold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.cuisine_type} · {r.city}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "menu" && (
          <div className="space-y-4 animate-in fade-in-50 slide-in-from-right-4">
            <WizardBackButton onClick={() => setStep("restaurant")} label="Restaurant" />
            <div className="rounded-lg bg-teal-500/5 p-3 text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-500" />
              {selectedRestaurant?.name} {optionEnabled && <Badge className="bg-teal-500 text-white text-[10px] ml-auto">+{QUALITY_FEE.toFixed(2)} CHF garanti</Badge>}
            </div>
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">{cat}</h3>
                {menuItems?.filter((i: any) => (i.category || "Autres") === cat).map((item: any) => {
                  const q = quantities[item.id] || 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-xl bg-card">
                      {item.image_url && <img src={item.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>}
                        <p className="text-sm font-bold text-primary">{Number(item.price).toFixed(2)} CHF</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {q > 0 && <>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold">{q}</span>
                        </>}
                        <Button size="icon" variant={q > 0 ? "outline" : "default"} className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <WizardCartSummary
              count={count}
              subtotal={subtotal}
              colorClass="teal-500"
              feeLabel="🛡️ Garantie Qualité"
              feeAmount={optionEnabled ? QUALITY_FEE : 0}
              total={totalWithOption}
              onValidate={handleAddToCart}
            />
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8">
            <div className="rounded-2xl bg-teal-500/5 border border-teal-500/20 p-6 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-teal-500 mx-auto" />
              <h2 className="font-display text-xl font-bold">Commande prête !</h2>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restaurant</span>
                <span className="font-medium">{selectedRestaurant?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Articles</span>
                <span className="font-medium">{count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Garantie qualité</span>
                <span className={`font-medium ${optionEnabled ? "text-teal-600" : "text-muted-foreground"}`}>
                  {optionEnabled ? `Activée (+${QUALITY_FEE.toFixed(2)} CHF)` : "Non"}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold">{totalWithOption.toFixed(2)} CHF</span>
              </div>
            </div>

            {/* QR Scan simulation (only if option enabled) */}
            {optionEnabled && (
              <div className="rounded-2xl border bg-card p-6 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-teal-500" />
                  Vérification à la réception
                </h3>
                {!scanned ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="w-32 h-32 mx-auto rounded-2xl border-2 border-dashed border-teal-500/30 flex items-center justify-center">
                      <QrCode className="h-16 w-16 text-teal-500/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">Scannez le QR code sur votre sac à la réception</p>
                    <Button onClick={() => setScanned(true)} className="bg-teal-500 hover:bg-teal-600 gap-2">
                      <Eye className="h-4 w-4" /> Simuler le scan
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {qualityChecks.map((check) => (
                      <div key={check.id} className="flex items-center gap-3 rounded-lg bg-secondary/50 p-3">
                        <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{check.label}</p>
                          <p className="text-xs text-muted-foreground">{check.detail}</p>
                        </div>
                        <Badge className="bg-teal-500 text-white text-xs">OK</Badge>
                      </div>
                    ))}
                    <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 p-4 text-center">
                      <CheckCircle2 className="h-8 w-8 text-teal-500 mx-auto mb-2" />
                      <p className="font-semibold text-teal-700">Tout est conforme !</p>
                      <p className="text-xs text-muted-foreground">Votre commande est parfaite. Bon appétit !</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl bg-secondary/30 p-4 flex items-center gap-3">
              <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Tous nos livreurs sont équipés de sacs isothermes certifiés.
              </p>
            </div>

            <WizardNextButton
              onClick={handleCheckout}
              label="Procéder au paiement"
              colorClass="teal-500"
            />
          </div>
        )}
      </div>
    </FeatureWizard>
  );
}

import { Banknote, CreditCard, ShieldCheck, Smartphone, Wallet, WalletCards } from "lucide-react";

import { Label } from "@/components/ui/label";
import type { PaymentMethodId } from "@/lib/paymentMethods";
import { cn } from "@/lib/utils";

interface PaymentMethodSelectorProps {
  paymentMethod: PaymentMethodId;
  setPaymentMethod: (value: PaymentMethodId) => void;
  allowedMethods?: PaymentMethodId[];
  cashDescription?: string;
  secureDescription?: string;
  variant?: "default" | "chef-table";
}

const METHODS: { id: PaymentMethodId; label: string; icon: any; description: string }[] = [
  { id: "twint", label: "TWINT", icon: Smartphone, description: "Paiement mobile suisse" },
  { id: "card", label: "Carte bancaire", icon: CreditCard, description: "Visa, Mastercard, AMEX" },
  { id: "postfinance_card", label: "PostFinance Card", icon: Wallet, description: "Carte PostFinance" },
  { id: "postfinance_efinance", label: "PostFinance E-Finance", icon: Wallet, description: "E-banking PostFinance" },
  { id: "cash", label: "Espèces", icon: Banknote, description: "Paiement sur place ou règlement manuel" },
  { id: "credits", label: "Credits TOK", icon: WalletCards, description: "Solde abonnement ou pack de credits" },
];

export default function PaymentMethodSelector({
  paymentMethod,
  setPaymentMethod,
  allowedMethods,
  cashDescription,
  secureDescription,
  variant = "default",
}: PaymentMethodSelectorProps) {
  const visibleMethods = allowedMethods?.length
    ? METHODS.filter((method) => allowedMethods.includes(method.id))
    : METHODS;
  const isChefTable = variant === "chef-table";

  if (allowedMethods && visibleMethods.length === 0) {
    return (
      <div className="space-y-3 border-t pt-4">
        <Label className="font-bold flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Mode de paiement
        </Label>
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          Aucun moyen de paiement n'est actuellement disponible pour ce parcours.
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 border-t pt-4",
        isChefTable && "rounded-[28px] border border-amber-300/35 bg-gradient-to-br from-stone-950 via-neutral-900 to-amber-950 p-5 text-white shadow-[0_28px_90px_-42px_rgba(15,23,42,0.82)]",
      )}
    >
      <Label className={cn("flex items-center gap-2 font-bold", isChefTable && "text-white")}>
        <CreditCard className={cn("h-4 w-4", isChefTable && "text-amber-400")} />
        Mode de paiement
      </Label>

      {isChefTable ? (
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">Confirmation immédiate après paiement</p>
            <p className="text-xs leading-5 text-white/72">
              Vos créneaux Table du Chef et votre nombre de convives sont déjà pris en compte dans cette étape.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleMethods.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => setPaymentMethod(method.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
              isChefTable
                ? paymentMethod === method.id
                  ? "border-amber-400 bg-amber-500/18 ring-1 ring-amber-300"
                  : "border-white/12 bg-white/6 hover:border-amber-300/60 hover:bg-white/10"
                : paymentMethod === method.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-muted bg-card hover:border-primary/20",
            )}
          >
            <method.icon
              className={cn(
                "h-5 w-5 shrink-0",
                isChefTable
                  ? paymentMethod === method.id
                    ? "text-amber-300"
                    : "text-white/65"
                  : paymentMethod === method.id
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            />
            <div>
              <div className={cn("text-sm font-medium", isChefTable && "text-white")}>{method.label}</div>
              <div className={cn("text-[11px]", isChefTable ? "text-white/65" : "text-muted-foreground")}>
                {method.description}
              </div>
            </div>
          </button>
        ))}
      </div>
      <p
        className={cn(
          "text-[10px]",
          isChefTable
            ? "text-left text-white/72"
            : "text-center italic text-muted-foreground",
        )}
      >
        {paymentMethod === "cash"
          ? (cashDescription || "Le paiement sera effectué sur place lors du retrait ou de la livraison")
          : (secureDescription || "Paiement sécurisé via Stripe")}
      </p>
    </div>
  );
}

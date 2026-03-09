import { CreditCard, Wallet, Banknote, Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";

export type PaymentMethodId = "card" | "twint" | "postfinance_card" | "postfinance_efinance" | "cash";

interface PaymentMethodSelectorProps {
  paymentMethod: PaymentMethodId;
  setPaymentMethod: (v: PaymentMethodId) => void;
}

const METHODS: { id: PaymentMethodId; label: string; icon: any; description: string }[] = [
  { id: "card", label: "Carte bancaire", icon: CreditCard, description: "Visa, Mastercard, AMEX" },
  { id: "twint", label: "TWINT", icon: Smartphone, description: "Paiement mobile suisse" },
  { id: "postfinance_card", label: "PostFinance Card", icon: Wallet, description: "Carte PostFinance" },
  { id: "postfinance_efinance", label: "PostFinance E-Finance", icon: Wallet, description: "E-banking PostFinance" },
  { id: "cash", label: "Espèces", icon: Banknote, description: "Paiement à la livraison / au retrait" },
];

export default function PaymentMethodSelector({ paymentMethod, setPaymentMethod }: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <Label className="font-bold flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> Mode de paiement
      </Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {METHODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaymentMethod(p.id)}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
              paymentMethod === p.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-muted bg-card hover:border-primary/20"
            }`}
          >
            <p.icon className={`h-5 w-5 shrink-0 ${paymentMethod === p.id ? "text-primary" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-[11px] text-muted-foreground">{p.description}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center italic">
        {paymentMethod === "cash"
          ? "Le paiement sera effectué sur place lors du retrait ou de la livraison"
          : "Paiement sécurisé via Stripe"}
      </p>
    </div>
  );
}

import { CreditCard, Wallet } from "lucide-react";
import { Label } from "@/components/ui/label";

interface PaymentMethodSelectorProps {
  paymentMethod: "card" | "paypal" | "apple" | "google";
  setPaymentMethod: (v: "card" | "paypal" | "apple" | "google") => void;
}

const METHODS = [
  { id: "card" as const, label: "Carte", icon: CreditCard },
  { id: "paypal" as const, label: "PayPal", icon: Wallet },
  { id: "apple" as const, label: "Apple Pay", icon: Wallet },
  { id: "google" as const, label: "Google Pay", icon: Wallet },
];

export default function PaymentMethodSelector({ paymentMethod, setPaymentMethod }: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <Label className="font-bold flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> Mode de paiement
      </Label>
      <div className="grid grid-cols-2 gap-3">
        {METHODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPaymentMethod(p.id)} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-sm font-medium ${paymentMethod === p.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted bg-card hover:border-primary/20"}`}>
            <p.icon className={`h-4 w-4 ${paymentMethod === p.id ? "text-primary" : "text-muted-foreground"}`} />
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground text-center italic">Paiement sécurisé et crypté par Miamz Pay</p>
    </div>
  );
}

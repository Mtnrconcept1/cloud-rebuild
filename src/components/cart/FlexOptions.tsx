import { Zap, Clock, Gift } from "lucide-react";
import { Label } from "@/components/ui/label";

interface FlexOptionsProps {
  flexOption: "express" | "standard" | "flex";
  setFlexOption: (v: "express" | "standard" | "flex") => void;
}

export default function FlexOptions({ flexOption, setFlexOption }: FlexOptionsProps) {
  const options = [
    { id: "express" as const, icon: Zap, iconBg: "bg-amber-500/10", iconColor: "text-amber-500", label: "Express (30 min)", desc: "Garantie : 1% rabais / minute de retard", price: "+2.50 CHF", priceClass: "text-primary" },
    { id: "standard" as const, icon: Clock, iconBg: "bg-blue-500/10", iconColor: "text-blue-500", label: "Standard (45 min)", desc: "Garantie : 1% rabais / 2 minute de retard", price: "+1.00 CHF", priceClass: "text-primary" },
    { id: "flex" as const, icon: Gift, iconBg: "bg-emerald-500/10", iconColor: "text-emerald-500", label: "Offres (1h - 1h30)", desc: "Fenêtre flexible : Rabais fixe de 10%", price: "-10%", priceClass: "text-emerald-600" },
  ];

  return (
    <div className="space-y-3 pt-4 border-t">
      <Label className="font-bold flex items-center gap-2">
        <Gift className="h-4 w-4" /> Options de livraison Offres
      </Label>
      <div className="grid grid-cols-1 gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = flexOption === opt.id;
          const borderClass = opt.id === "flex" && isSelected
            ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500 text-emerald-900"
            : isSelected
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-muted bg-card hover:border-primary/20";

          return (
            <button key={opt.id} type="button" onClick={() => setFlexOption(opt.id)} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${borderClass}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${opt.iconBg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${opt.iconColor}`} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className={`text-[10px] ${opt.id === "flex" ? "text-emerald-600" : "text-muted-foreground"} uppercase font-bold tracking-tight`}>{opt.desc}</p>
                </div>
              </div>
              <span className={`font-bold text-sm ${opt.priceClass}`}>{opt.price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

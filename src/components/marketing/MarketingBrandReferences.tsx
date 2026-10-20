import { useState } from "react";
import { TOK_MARKETING_REFERENCES } from "../../../supabase/functions/_shared/marketing-brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MarketingBrandReferences() {
  const [missing, setMissing] = useState<string[]>([]);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Direction artistique TOK</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          Ces références accompagnent chaque génération de visuel : même chef, logo TOK,
          palette orange, noir et crème, titres condensés et touches de jaune.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TOK_MARKETING_REFERENCES.map((reference) => (
            <a key={reference.id} href={reference.path} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-slate-200 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
              {missing.includes(reference.id) ? (
                <div className="flex aspect-[4/5] items-center justify-center bg-slate-50 p-2 text-center text-xs text-rose-700">Référence indisponible</div>
              ) : (
                <img src={reference.path} alt={reference.label} loading="lazy"
                  className="aspect-[4/5] w-full rounded object-contain bg-slate-50"
                  onError={() => setMissing((current) => [...new Set([...current, reference.id])])} />
              )}
              <span className="mt-2 block text-xs font-medium text-slate-700">{reference.label}</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Les affiches servent de références graphiques. Leurs prix et promotions ne sont pas repris.
          Avant approbation, vérifiez le logo, le chef, les couleurs et la lisibilité du texte du visuel généré.
          Si une référence ne peut pas être utilisée, aucun visuel de remplacement sans référence n’est créé.
        </p>
      </CardContent>
    </Card>
  );
}

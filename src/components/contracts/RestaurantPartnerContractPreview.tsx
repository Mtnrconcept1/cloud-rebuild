import { useState } from "react";
import { Download, Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  RESTAURANT_PARTNER_CONTRACT_SECTIONS,
  RESTAURANT_PARTNER_CONTRACT_TITLE,
  RESTAURANT_PARTNER_CONTRACT_VERSION,
} from "@/lib/restaurantPartnerContract";

export const RESTAURANT_PARTNER_CONTRACT_EXPORT_ACTION_LABEL =
  "Imprimer ou enregistrer en PDF";

function ContractContent() {
  return (
    <>
      <header className="mb-6 border-b pb-4">
        <h2 className="text-xl font-bold text-slate-950">
          {RESTAURANT_PARTNER_CONTRACT_TITLE}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Version {RESTAURANT_PARTNER_CONTRACT_VERSION}
        </p>
      </header>
      <div className="space-y-5">
        {RESTAURANT_PARTNER_CONTRACT_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2">
            <h3 className="font-semibold text-slate-950">{section.title}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-slate-600">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

type RestaurantPartnerContractPreviewProps = {
  onExport?: () => void | Promise<void>;
  exportDisabled?: boolean;
};

export default function RestaurantPartnerContractPreview({
  onExport,
  exportDisabled = false,
}: RestaurantPartnerContractPreviewProps) {
  const [zoom, setZoom] = useState(100);

  return (
    <div className="space-y-2">
      <div className="max-h-72 overflow-auto rounded-xl border bg-background p-4 text-sm">
        <ContractContent />
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-2">
            <Maximize2 className="h-4 w-4" />
            Lire en grand
          </Button>
        </DialogTrigger>
        <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-[-50%] translate-y-[-50%] gap-0 rounded-none border-0 p-0" hideCloseButton>
          <DialogHeader className="border-b px-4 py-3 text-left sm:px-6">
            <DialogTitle>Aperçu grand format du contrat restaurateur</DialogTitle>
            <DialogDescription>
              Feuille A4 zoomable. Utilisez la zone défilante pour lire l'intégralité du contrat.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 border-b px-4 py-2 sm:px-6">
            <span className="text-sm font-medium" aria-live="polite">Zoom {zoom}%</span>
            <div className="flex items-center gap-1" aria-label="Commandes de zoom">
              <Button type="button" variant="outline" size="icon" aria-label="Réduire le zoom" onClick={() => setZoom((value) => Math.max(60, value - 10))}>
                <Minus className="h-4 w-4" />
              </Button>
              <input
                className="w-24 sm:w-40"
                type="range"
                min="60"
                max="160"
                step="10"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                aria-label="Niveau de zoom du contrat"
              />
              <Button type="button" variant="outline" size="icon" aria-label="Augmenter le zoom" onClick={() => setZoom((value) => Math.min(160, value + 10))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div data-dialog-scroll-area className="min-h-0 flex-1 overflow-auto bg-slate-200 p-2 sm:p-6">
            <article
              className="mx-auto origin-top bg-white p-[7%] text-sm shadow-xl"
              style={{ width: `${Math.max(210, 210 * zoom / 100)}mm`, minHeight: `${297 * zoom / 100}mm`, fontSize: `${zoom}%` }}
              aria-label="Contrat restaurateur au format A4"
            >
              <ContractContent />
            </article>
          </div>
          <DialogFooter className="border-t bg-background px-4 py-3 sm:px-6">
            {onExport ? (
              <Button type="button" onClick={onExport} disabled={exportDisabled} className="gap-2">
                <Download className="h-4 w-4" />
                {RESTAURANT_PARTNER_CONTRACT_EXPORT_ACTION_LABEL}
              </Button>
            ) : null}
            <DialogClose asChild>
              <Button type="button" variant="outline">Fermer l'aperçu</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

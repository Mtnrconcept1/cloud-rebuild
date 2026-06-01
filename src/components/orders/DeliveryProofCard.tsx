import { ShieldCheck, QrCode, ScanLine } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildDeliveryProofQrImageUrl, formatDeliveryProofCode } from "@/lib/deliveryProof";

type DeliveryProofCardProps = {
  code: string;
  verifiedAt?: string | null;
};

export default function DeliveryProofCard({ code, verifiedAt }: DeliveryProofCardProps) {
  const formattedCode = formatDeliveryProofCode(code);
  const qrUrl = buildDeliveryProofQrImageUrl(code);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Preuve de remise
          </CardTitle>
          {verifiedAt ? (
            <Badge className="bg-emerald-100 text-emerald-700">Verifie</Badge>
          ) : (
            <Badge variant="outline" className="border-primary/30 text-primary">QR client</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Présentez ce QR au livreur à l'arrivée. En secours, vous pouvez aussi lui donner le code a 6 chiffres.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
        <div className="overflow-hidden rounded-2xl border bg-background p-3">
          <img
            src={qrUrl}
            alt="QR de preuve de livraison"
            className="mx-auto h-[196px] w-[196px] rounded-xl bg-white p-2"
            loading="lazy"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border bg-background/80 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <QrCode className="h-3.5 w-3.5" />
              Code de secours
            </p>
            <p className="font-display text-3xl font-black tracking-[0.25em] text-foreground">
              {formattedCode}
            </p>
          </div>

          <div className="rounded-2xl border border-dashed bg-background/60 p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <ScanLine className="h-4 w-4 text-primary" />
              Comment ca marche
            </p>
            <p className="mt-2">
              Le livreur scanne le QR ou saisit le code. La commande n'est marquée livrée qu'apres vérification.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

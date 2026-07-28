import { useEffect, useMemo, useState } from "react";
import { Download, FileSignature, Scale } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/integrations/supabase/client";
import {
  buildCommercialContractDocument,
  COMMERCIAL_CONTRACT_LEGAL_STATUS,
  COMMERCIAL_CONTRACT_PAGE_COUNT,
  hashCommercialContract,
} from "@/lib/commercialContract";

const TOK_PARTY = {
  id: "TOK-LEGAL-ENTITY-CH",
  legalName: "TOK — entité juridique à confirmer",
  address: "Siège suisse à confirmer avant activation",
  representativeName: "Représentant TOK à confirmer",
  representativeRole: "Direction",
};

type Props = {
  commercialUserId: string;
  commercialName: string;
  isAdmin: boolean;
};

export default function CommercialContractPanel({ commercialUserId, commercialName, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [consented, setConsented] = useState(false);
  const [contentHash, setContentHash] = useState("");
  const [saving, setSaving] = useState(false);
  const commercialParty = useMemo(() => ({
    id: commercialUserId,
    legalName: commercialName || "Identité du commercial à compléter",
    address: "Adresse contractuelle issue du dossier commercial",
    representativeName: commercialName || "À compléter",
    representativeRole: "Commercial",
  }), [commercialName, commercialUserId]);
  const document = useMemo(
    () => buildCommercialContractDocument(TOK_PARTY, commercialParty),
    [commercialParty],
  );

  useEffect(() => {
    void hashCommercialContract(document).then(setContentHash);
  }, [document]);

  const legalReviewApproved = COMMERCIAL_CONTRACT_LEGAL_STATUS !== "draft_pending_swiss_legal_review";
  const canSign = legalReviewApproved && !isAdmin && consented && typedName.trim() === commercialName.trim() && contentHash.length === 64;

  async function signContract() {
    if (!canSign) return;
    setSaving(true);
    const signatureProof = {
      method: "typed_name_and_explicit_consent",
      typedName: typedName.trim(),
      consentText: "J’accepte le contrat et son annexe tarifaire figée.",
      userAgent: navigator.userAgent,
    };
    const { error } = await getSupabase().rpc("accept_commercial_contract" as never, {
      p_contract_version: document.version,
      p_effective_date: document.effectiveDate,
      p_tok_party: document.tokParty,
      p_commercial_party: document.commercialParty,
      p_content_hash: contentHash,
      p_compensation_snapshot: document.compensationSnapshot,
      p_signature_proof: signatureProof,
    } as never);
    setSaving(false);
    if (error) {
      toast.error("La signature n’a pas pu être enregistrée.");
      return;
    }
    toast.success("Contrat signé et preuve immuable enregistrée.");
  }

  return (
    <section className="rounded-[1.6rem] border border-orange-200 bg-white/90 p-5 shadow-sm dark:border-orange-400/20 dark:bg-slate-950/70">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><FileSignature className="h-5 w-5" /></span>
          <div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600">Document dédié</p><h2 className="mt-1 text-xl font-black">Contrat commercial TOK</h2><p className="text-sm text-muted-foreground">Consultation grand format · exactement {COMMERCIAL_CONTRACT_PAGE_COUNT} pages A4 · annexe figée.</p></div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-xl">Consulter le contrat</Button></DialogTrigger>
          <DialogContent className="h-[96vh] w-[min(96vw,1280px)] max-w-none overflow-y-auto p-3 sm:p-6">
            <DialogHeader className="print:hidden"><DialogTitle>Contrat commercial — aperçu contractuel</DialogTitle></DialogHeader>
            <Alert className="mb-4 border-amber-300 bg-amber-50 print:hidden"><Scale className="h-4 w-4" /><AlertTitle>Activation bloquée</AlertTitle><AlertDescription>Projet de contenu à faire relire et approuver par un juriste suisse. Les identités légales TOK doivent aussi être confirmées avant signature.</AlertDescription></Alert>
            <div className="commercial-contract-print-root bg-slate-200 p-3 print:bg-white print:p-0" data-print-page-count={COMMERCIAL_CONTRACT_PAGE_COUNT}>
              {document.pages.map((page) => (
                <article key={page.number} className="commercial-contract-print-page mx-auto mb-4 flex bg-white p-[14mm] text-[11px] leading-[1.38] text-slate-950 shadow-xl print:mb-0 print:shadow-none" data-print-page={page.number}>
                  <div className="flex min-h-0 w-full flex-col">
                    <header className="border-b-2 border-orange-500 pb-3"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">TOK · Contrat commercial</p><h1 className="mt-1 text-xl font-black">{document.title}</h1><p className="mt-1 font-bold">{page.heading}</p></div><div className="text-right text-[9px]"><p>{document.version}</p><p>Effet: {document.effectiveDate}</p><p>Page {page.number}/{COMMERCIAL_CONTRACT_PAGE_COUNT}</p></div></div></header>
                    {page.number === 1 ? <div className="mt-3 grid grid-cols-2 gap-3 rounded border p-3 text-[9px]"><div><strong>TOK</strong><br />{document.tokParty.legalName}<br />ID: {document.tokParty.id}<br />{document.tokParty.address}</div><div><strong>Commercial</strong><br />{document.commercialParty.legalName}<br />ID: {document.commercialParty.id}<br />{document.commercialParty.address}</div></div> : null}
                    <div className="mt-3 space-y-3">{page.clauses.map((clause) => <section key={clause.title} className="break-inside-avoid"><h2 className="font-black">{clause.title}</h2><p className="mt-1 text-justify">{clause.text}</p></section>)}</div>
                    {page.number === 2 ? <section className="mt-3 break-inside-avoid rounded border border-orange-300 bg-orange-50 p-3"><h2 className="font-black">Annexe tarifaire immuable</h2><pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[8px]">{JSON.stringify(document.compensationSnapshot, null, 2)}</pre></section> : null}
                    {page.number === 3 ? <div className="mt-auto break-inside-avoid border-t pt-3 text-[9px]"><p><strong>Hash SHA-256 du contenu accepté:</strong> <span className="break-all font-mono">{contentHash || "Calcul en cours…"}</span></p><div className="mt-4 grid grid-cols-2 gap-8"><div className="h-20 border-t pt-2">Pour TOK<br />Nom, date, signature</div><div className="h-20 border-t pt-2">Le commercial<br />Nom, date, signature</div></div></div> : null}
                  </div>
                </article>
              ))}
            </div>
            <div className="sticky bottom-0 mt-4 rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur print:hidden">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="flex-1"><Label htmlFor="commercial-signature-name">Nom complet du signataire</Label><Input id="commercial-signature-name" value={typedName} onChange={(event) => setTypedName(event.target.value)} disabled={isAdmin || !legalReviewApproved} /></div><Button type="button" variant="outline" onClick={() => window.print()}><Download className="mr-2 h-4 w-4" />Télécharger / imprimer</Button><Button type="button" disabled={!canSign || saving} onClick={() => void signContract()}>{saving ? "Enregistrement…" : "Signer définitivement"}</Button></div>
              <label className="mt-3 flex items-start gap-2 text-sm"><Checkbox checked={consented} onCheckedChange={(value) => setConsented(value === true)} disabled={isAdmin || !legalReviewApproved} /><span>J’accepte la version {document.version}, son hash et l’annexe tarifaire figée.</span></label>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/integrations/supabase/client";
import WorkforceSignaturePad from "@/components/workforce/WorkforceSignaturePad";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: { sourceObjectId: number; name: string; email?: string | null } | null;
};

const CONSENT_TEXT = "Je confirme représenter le restaurant indiqué et j’autorise TOK à utiliser l’adresse e-mail professionnelle renseignée afin de m’envoyer par e-mail des présentations de services, nouveautés, offres et campagnes commerciales TOK. Cette autorisation est facultative, n’engage aucun abonnement et peut être retirée à tout moment grâce au lien de désabonnement présent dans chaque e-mail ou en contactant TOK.";

export default function CommercialEmailConsentDialog({ open, onOpenChange, prospect }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!prospect || !consented || !signature || !signerName.trim() || !signerRole.trim() || !email.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await getSupabase().rpc("commercial_record_signed_email_consent" as never, {
        p_source_objectid: prospect.sourceObjectId,
        p_restaurant_name: prospect.name,
        p_email: email.trim(),
        p_signer_name: signerName.trim(),
        p_signer_role: signerRole.trim(),
        p_signature_data: signature,
        p_explicit_consent: true,
      } as never);
      if (error) throw error;
      const receipt = data as { receipt_id?: string } | null;
      toast({ title: "Consentement enregistré", description: `Preuve de signature conservée en privé. Référence : ${receipt?.receipt_id ?? "enregistrée"}` });
      setEmail(""); setSignerName(""); setSignerRole(""); setSignature(null); setConsented(false);
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Autorisation non enregistrée", description: error instanceof Error ? error.message : "Vérifiez les champs et réessayez.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Autorisation de contact TOK</DialogTitle>
        <DialogDescription>Signature facultative du restaurateur. Ce document n’est pas un abonnement.</DialogDescription>
      </DialogHeader>
      {prospect && <div className="space-y-4 text-sm">
        <p className="font-semibold">{prospect.name}</p>
        <div className="space-y-1"><Label htmlFor="tok-consent-email">E-mail professionnel</Label><Input id="tok-consent-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder={prospect.email ?? "contact@restaurant.ch"} /></div>
        <div className="space-y-1"><Label htmlFor="tok-consent-signer">Nom et prénom du représentant</Label><Input id="tok-consent-signer" value={signerName} onChange={e => setSignerName(e.target.value)} maxLength={160}/></div>
        <div className="space-y-1"><Label htmlFor="tok-consent-role">Fonction au restaurant</Label><Input id="tok-consent-role" value={signerRole} onChange={e => setSignerRole(e.target.value)} maxLength={100}/></div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-slate-900"><p>{CONSENT_TEXT}</p><p className="mt-2 text-xs">Version tok-b2b-email-v1 · <a className="underline" href="/confidentialite" target="_blank" rel="noreferrer">Confidentialité TOK</a></p></div>
        <label className="flex items-start gap-3"><Checkbox checked={consented} onCheckedChange={value => setConsented(value === true)} /><span>J’ai lu et j’accepte expressément de recevoir les e-mails commerciaux TOK décrits ci-dessus.</span></label>
        <div><Label>Signature manuscrite du représentant</Label><WorkforceSignaturePad key={prospect.sourceObjectId + (open ? "-open" : "-closed")} onChange={setSignature} disabled={busy}/></div>
        <Button className="w-full" disabled={busy || !consented || !signature || !email.trim() || !signerName.trim() || !signerRole.trim()} onClick={submit}>{busy ? "Enregistrement…" : "Signer et autoriser les e-mails TOK"}</Button>
        <p className="text-xs text-muted-foreground">L’adresse ne sera exploitable par Marketing TOK que si les règles de suppression, désabonnement et délivrabilité l’autorisent.</p>
      </div>}
    </DialogContent>
  </Dialog>;
}

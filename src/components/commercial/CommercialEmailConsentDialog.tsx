import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/integrations/supabase/client";
import WorkforceSignaturePad from "@/components/workforce/WorkforceSignaturePad";
import {
  consentErrorMessage, consentStatusLabel, consentDeliveryLabel, normalizeConsentEmail, parseConsentContext, parseConsentReceipt,
  validateConsentFields, type ConsentContext, type ConsentDocument, type ConsentFields, type ConsentReceipt,
} from "@/lib/commercialEmailConsent";

type Prospect = { sourceObjectId: number; name: string; email?: string | null };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; prospect: Prospect | null };
const emptyFields = (): ConsentFields => ({ email: "", emailAgain: "", signerName: "", signerRole: "", signature: null, consented: false });
const formatDate = (value: string) => new Date(value).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" });

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().rpc(name as never, args as never);
  if (error) throw error;
  return data;
}

function DocumentText({ value }: { value: ConsentDocument }) {
  return <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">
    <p><strong>Responsable : {value.controller}</strong><br />{value.address}<br />Contact et retrait : {value.contact}</p>
    <p>{value.text}</p>
    <details><summary className="cursor-pointer font-semibold">Utilisation de vos données</summary><p className="mt-2">{value.privacy}</p></details>
    <p className="break-words text-xs text-muted-foreground">Version {value.version} · <a className="underline" href="https://www.thetok.ch/confidentialite" target="_blank" rel="noreferrer">Confidentialité TOK</a></p>
  </div>;
}

function ControllerSettings({ context, sourceObjectId, onSaved, setBusy }: {
  context: ConsentContext; sourceObjectId: number; onSaved: (value: ConsentContext) => void; setBusy: (value: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!accepted || inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true; setSaving(true); setBusy(true); setError(null);
    try {
      onSaved(parseConsentContext(await rpc("commercial_configure_email_consent_controller", {
        p_source_objectid: sourceObjectId, p_controller: data.get("controller"), p_address: data.get("address"),
        p_contact: data.get("contact"), p_explicit_confirmation: true,
      })));
    } catch (failure) { setError(consentErrorMessage(failure)); }
    finally { inFlight.current = false; setSaving(false); setBusy(false); }
  }
  return <details open={!context.document} className="rounded-xl border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Configuration du responsable — administrateur</summary>
    <p className="my-3 text-xs text-muted-foreground">Ces coordonnées seront visibles par le restaurateur. Un compte administrateur avec double authentification validée est requis.</p>
    <form onSubmit={configure} className="space-y-3">
      <fieldset disabled={saving} className="space-y-3">
        <div><Label htmlFor="consent-controller">Nom ou raison sociale</Label><Input id="consent-controller" name="controller" required minLength={2} maxLength={200} defaultValue={context.document?.controller} /></div>
        <div><Label htmlFor="consent-address">Adresse professionnelle</Label><Input id="consent-address" name="address" required minLength={8} maxLength={500} defaultValue={context.document?.address} /></div>
        <div><Label htmlFor="consent-contact">E-mail de contact et retrait</Label><Input id="consent-contact" name="contact" type="email" required maxLength={254} defaultValue={context.document?.contact} /></div>
        <label className="flex items-start gap-3 text-sm"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)} /><span>Je confirme l’exactitude de ces coordonnées et mon habilitation à configurer le responsable. Cette action ne donne aucun consentement pour un restaurateur.</span></label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving || !accepted}>{saving ? "Enregistrement…" : "Enregistrer le responsable"}</Button>
    </form>
  </details>;
}

function ConsentSession({ prospect, onOpenChange }: { prospect: Prospect; onOpenChange: Props["onOpenChange"] }) {
  const [context, setContext] = useState<ConsentContext | null>(null);
  const [fields, setFields] = useState<ConsentFields>(emptyFields);
  const [receipt, setReceipt] = useState<ConsentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [padKey, setPadKey] = useState(0);
  const requestId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [uncertain, setUncertain] = useState(false);
  const frozenSubmission = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    rpc("commercial_get_email_consent_context", { p_source_objectid: prospect.sourceObjectId })
      .then(data => { if (!cancelled) setContext(parseConsentContext(data)); })
      .catch(failure => { if (!cancelled) setError(consentErrorMessage(failure)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prospect.sourceObjectId, reload]);

  function edit(field: "email" | "emailAgain" | "signerName" | "signerRole", value: string) {
    if (busy || uncertain) return;
    setFields(current => ({ ...current, [field]: value, signature: null, consented: false }));
    setPadKey(current => current + 1); setError(null);
  }
  function reset() {
    setFields(emptyFields()); setPadKey(key => key + 1); setReceipt(null); setUncertain(false);
    frozenSubmission.current = null; requestId.current = crypto.randomUUID(); setReload(value => value + 1);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || !context?.document || !context.document_hash) return;
    const validation = validateConsentFields(fields);
    if (validation) { setError(validation); return; }
    inFlight.current = true; setBusy(true); setError(null);
    frozenSubmission.current ??= {
      p_source_objectid: prospect.sourceObjectId, p_restaurant_name: prospect.name,
      p_email: normalizeConsentEmail(fields.email), p_signer_name: fields.signerName.normalize("NFC").trim(),
      p_signer_role: fields.signerRole.normalize("NFC").trim(), p_signature_data: fields.signature,
      p_explicit_consent: true, p_document_hash: context.document_hash, p_request_id: requestId.current,
    };
    try {
      const value = parseConsentReceipt(await rpc("commercial_record_signed_email_consent_v2", frozenSubmission.current));
      if (mounted.current) { setReceipt(value); setUncertain(false); }
    } catch (failure) {
      if (mounted.current) {
        setError(consentErrorMessage(failure));
        // Freeze signed coordinates after an uncertain request. Retry the same immutable payload and idempotency key.
        setUncertain(true);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function showReceipt(id: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { const value = parseConsentReceipt(await rpc("commercial_get_email_consent_receipt", { p_receipt_id: id })); if (mounted.current) setReceipt(value); }
    catch (failure) { if (mounted.current) setError(consentErrorMessage(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function downloadReceipt() {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `TOK-consentement-${receipt.receipt_id}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const canSubmit = !!context?.document && validateConsentFields(fields) === null && !busy;
  return <Dialog open onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Consentement e-mail du restaurateur</DialogTitle>
        <DialogDescription>À lire et approuver personnellement par le restaurateur, sur cet appareil. Aucun abonnement ni achat.</DialogDescription>
      </DialogHeader>
      {loading && <p role="status" className="py-6 text-sm">Chargement de l’autorisation…</p>}
      {!loading && error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!loading && !context && <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>Réessayer le chargement</Button>}
      {!loading && receipt ? <section className="space-y-4 text-sm">
        <h3 className="font-semibold">{receipt.confirmation_state && receipt.confirmation_state !== "legacy" ? consentStatusLabel(receipt) : "Consentement enregistré dans Marketing TOK"}</h3>
        <p>Accord signé par <strong>{receipt.signer_name}</strong> ({receipt.signer_role}) pour <strong>{receipt.restaurant_name}</strong>, le {formatDate(receipt.signed_at)}.</p>
        <p className="break-all">Adresse renseignée : <strong>{receipt.email}</strong></p>
        {receipt.confirmation_state === "pending" && <p className="rounded-lg bg-primary/5 p-3">Le consentement signé autorise déjà les e-mails prévus par ce texte, sous réserve des autres règles marketing. La copie et la signature seront envoyées à cette adresse. Le restaurateur peut ouvrir le reçu puis cliquer sur <strong>JE CONSENS</strong>. Ce clic facultatif ajoute une seconde preuve et déclenche un e-mail de double confirmation.</p>}
        {consentDeliveryLabel(receipt.email_delivery_state) && <p role="status">{consentDeliveryLabel(receipt.email_delivery_state)}</p>}
        {receipt.confirmed_at && <p>Confirmation depuis la boîte : {formatDate(receipt.confirmed_at)}.</p>}
        {receipt.acknowledgement_delivery_state && <p role="status">Accusé de double confirmation : {consentDeliveryLabel(receipt.acknowledgement_delivery_state)}</p>}
        <p className="rounded-lg border p-3">{receipt.withdrawn ? "Autorisation retirée : cette preuve ne réactive aucun droit d’envoi." : receipt.email_eligible ? "Consentement e-mail actif. Les contrôles de campagne, de fréquence et de délivrabilité restent applicables." : "L’accord est conservé, mais les règles marketing actuelles bloquent l’envoi à cette adresse."}</p>
        <DocumentText value={receipt.document} />
        <img src={receipt.signature_data} alt="Signature manuscrite enregistrée du restaurateur" className="w-full rounded-lg border bg-white" />
        <p className="text-xs text-muted-foreground">{receipt.email_verified ? "Accès au lien envoyé à la boîte confirmé ; cela ne certifie pas l’identité civile ni les pouvoirs du signataire." : "Adresse e-mail non vérifiée tant que son destinataire n’a pas confirmé le lien."} Signature électronique simple. Le commercial est identifié comme collecteur, pas comme signataire.</p>
        <p className="break-all text-xs text-muted-foreground">Référence : {receipt.receipt_id}<br />Empreinte de preuve : {receipt.proof_hash}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" onClick={downloadReceipt}>Télécharger la preuve</Button><Button type="button" variant="outline" disabled={busy} onClick={() => showReceipt(receipt.receipt_id)}>Actualiser la confirmation</Button><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Terminer</Button></div>
      </section> : !loading && context && <div className="space-y-4">
        {context.is_admin && <ControllerSettings key={context.document_hash ?? "setup"} context={context} sourceObjectId={prospect.sourceObjectId} onSaved={value => { setContext(value); setFields(emptyFields()); setPadKey(key => key + 1); setError(null); }} setBusy={setBusy} />}
        {!context.document ? <p className="rounded-lg border p-4 text-sm">L’identité professionnelle de TOK doit être renseignée par un administrateur avant la première signature. Aucune adresse ni signature n’est enregistrée ici tant que cette étape n’est pas terminée.</p> : <>
          {context.latest && <div className="rounded-lg border p-3 text-sm"><p>Dernier accord enregistré : {formatDate(context.latest.signed_at)} — {consentStatusLabel(context.latest)}.</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => showReceipt(context.latest!.receipt_id)}>Voir l’accord enregistré</Button></div>}
          <form onSubmit={submit} className="space-y-4">
            <p className="rounded-lg bg-primary/5 p-3 text-sm"><strong>{prospect.name}</strong><br />Commercial : remettez l’appareil au restaurateur pour qu’il lise, approuve et signe lui-même.</p>
            <fieldset disabled={busy || uncertain} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><Label htmlFor="tok-consent-email">E-mail professionnel</Label><Input id="tok-consent-email" type="email" autoComplete="off" required value={fields.email} onChange={e => edit("email", e.target.value)} maxLength={254} /></div>
                <div><Label htmlFor="tok-consent-email-again">Confirmez l’e-mail</Label><Input id="tok-consent-email-again" type="email" autoComplete="off" required value={fields.emailAgain} onChange={e => edit("emailAgain", e.target.value)} maxLength={254} /></div>
                <div><Label htmlFor="tok-consent-name">Votre prénom et nom</Label><Input id="tok-consent-name" required value={fields.signerName} onChange={e => edit("signerName", e.target.value)} maxLength={160} /></div>
                <div><Label htmlFor="tok-consent-role">Votre fonction</Label><Input id="tok-consent-role" required value={fields.signerRole} onChange={e => edit("signerRole", e.target.value)} maxLength={100} /></div>
              </div>
              <DocumentText value={context.document} />
              <label className="flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed"><Checkbox disabled={busy || uncertain} checked={fields.consented} onCheckedChange={value => setFields(current => ({ ...current, consented: value === true }))} /><span>Je suis le représentant du restaurant indiqué. J’ai lu l’autorisation et <strong>j’accepte personnellement de recevoir les e-mails commerciaux TOK décrits ci-dessus</strong>. Mon accord reste facultatif et révocable.</span></label>
              <div className="space-y-2"><p className="text-sm font-semibold">Votre signature</p><WorkforceSignaturePad key={padKey} onChange={signature => setFields(current => ({ ...current, signature }))} disabled={busy || uncertain} /></div>
            </fieldset>
            {uncertain && <p className="text-xs text-muted-foreground">La demande signée est figée pour éviter toute modification après envoi. Réessayez la même demande ou recommencez avec une nouvelle signature.</p>}
            <div className="sticky -bottom-6 space-y-2 border-t bg-background pb-4 pt-3">
              <Button type="submit" className="h-auto min-h-11 w-full whitespace-normal py-3" disabled={!canSubmit}>{busy ? "Enregistrement…" : "J’approuve et je signe mon consentement"}</Button>
              {uncertain && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={reset}>Recharger le texte et recommencer</Button>}
              <p className="text-xs text-muted-foreground">La signature déclenche un e-mail contenant cette autorisation et votre signature. Votre consentement signé autorise déjà ces campagnes. JE CONSENS ajoute une confirmation complémentaire et un e-mail récapitulatif. Aucun abonnement ni achat.</p>
            </div>
          </form>
        </>}
      </div>}
    </DialogContent>
  </Dialog>;
}

export default function CommercialEmailConsentDialog({ open, onOpenChange, prospect }: Props) {
  // Unmount all fields, approval, signature and idempotency state between visits.
  if (!open || !prospect) return null;
  return <ConsentSession key={prospect.sourceObjectId} prospect={prospect} onOpenChange={onOpenChange} />;
}

import { useId, useState, type FormEvent } from "react";
import { ArrowDown, Check, Gift, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PLINKO_PRIZES, type PlinkoState } from "@/lib/plinko";
import type { PlinkoTrajectory } from "@/lib/plinko-physics";
import PlinkoBoard from "./PlinkoBoard";
import "./plinko.css";

export type PlinkoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: PlinkoState | null;
  busy: boolean;
  animating: boolean;
  error: string | null;
  trajectory: PlinkoTrajectory | null;
  onAnimationComplete: () => void;
  onPlay: () => void;
  onRetry: () => void;
  onClaim: (email: string, marketingConsent: boolean) => void;
};

export default function PlinkoDialog({ open, onOpenChange, state, busy, animating, error, trajectory, onAnimationComplete, onPlay, onRetry, onClaim }: PlinkoDialogProps) {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const emailId = useId();
  const outcome = state?.play?.outcome;
  const visibleResult = !animating && outcome;
  const reward = !animating ? state?.reward : null;
  const claimed = reward && reward.status !== "pending_email";
  const awaitingEmail = reward?.status === "pending_email";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && email.trim()) onClaim(email, marketingConsent);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="tok-plinko" onPointerDownOutside={(event) => event.preventDefault()}>
      <div className="tok-plinko__intro">
        <div className="tok-plinko__eyebrow"><img src="/images/home/tok-logo-ui.webp" width="42" height="42" alt="TOK" /><span>UN PETIT JEU. UN GRAND MIAMZ.</span></div>
        <img className="tok-plinko__chef" src="/chef.png" width="118" height="135" alt="Le chef TOK et sa bulle Miamz" />
        <DialogTitle className="tok-plinko__title">Le Plinko <em>du chef</em></DialogTitle>
        <DialogDescription className="tok-plinko__description">Lâchez votre Miamz.<br />Votre prochain plaisir est peut-être ici.</DialogDescription>
      </div>
      <PlinkoBoard outcome={outcome} playing={busy || animating} animating={animating} trajectory={trajectory} onAnimationComplete={onAnimationComplete} />
      <div className="tok-plinko__actions">
        <div role="status" aria-live="polite" aria-atomic="true">
          {visibleResult && <div className={`tok-plinko__result ${outcome === "lost" ? "is-lost" : ""}`}><strong>{PLINKO_PRIZES[outcome].label}</strong><p>{PLINKO_PRIZES[outcome].description}</p></div>}
          {claimed && <p className="tok-plinko__success"><Check size={20} />{reward.status === "fulfilled" ? "Votre gain a été remis par l’équipe TOK." : reward.status === "cancelled" ? "Cette demande a été clôturée. Contactez TOK avec votre référence pour en savoir plus." : "Votre gain est enregistré. L’équipe TOK vous contactera par e-mail pour sa remise."}</p>}
          {claimed && <p className="tok-plinko__reference">Référence du gain : {reward.id}</p>}
        </div>
        {error && <p className="tok-plinko__error" role="alert">{error}</p>}
        {awaitingEmail && <form onSubmit={submit} className="tok-plinko__claim">
          <p>Votre gain vous attend ! Laissez votre e-mail pour le recevoir, sans créer de compte.</p>
          <label htmlFor={emailId}>Votre adresse e-mail</label>
          <input id={emailId} type="email" name="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.ch" disabled={busy} />
          <label className="tok-plinko__consent"><input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} disabled={busy} /><span>Je souhaite aussi recevoir les nouveautés et offres TOK par e-mail. <span>(facultatif)</span></span></label>
          <button type="submit" className="tok-plinko__primary" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Gift size={18} />}Recevoir mon gain</button>
          <p className="tok-plinko__privacy">Votre e-mail sert à remettre votre gain. <a href="/politique-confidentialite">Confidentialité</a></p>
        </form>}
        {!awaitingEmail && !claimed && (state?.available || !state || animating) && <button type="button" className="tok-plinko__primary" onClick={state ? onPlay : onRetry} disabled={busy || animating}>
          {busy || animating ? <LoaderCircle className="animate-spin" size={18} /> : outcome === "replay" ? <RotateCcw size={18} /> : <ArrowDown size={18} />}
          {busy || animating ? "Le Miamz arrive…" : !state ? "Réessayer" : outcome === "replay" ? "Rejouer mon coup gratuit" : "Lâcher mon Miamz"}
        </button>}
        <DialogClose asChild><button type="button" className="tok-plinko__later">{visibleResult ? "Continuer ma découverte" : "Plus tard"}</button></DialogClose>
        <details className="tok-plinko__rules"><summary><ShieldCheck size={14} />Les gains et les chances</summary>
          <p>Un premier coup gratuit par visiteur, puis un nouveau coup pour chaque « Rejouer ». Aucun achat nécessaire. Les chances sont calculées à chaque bille ; sa trajectoire illustre le tirage.</p>
          <ul>{Object.entries(PLINKO_PRIZES).map(([key, prize]) => <li key={key}><span>{prize.label}</span><strong>{prize.chance}</strong></li>)}</ul>
          <p>Un gain par adresse e-mail pour cette opération. Réclamez-le dans les 7 jours, avant l’expiration de votre partie. L’équipe TOK vous contactera pour vérifier votre adresse et organiser sa remise. Tok One est offert un mois, sans renouvellement payant automatique. L’inscription aux offres TOK est facultative.</p>
        </details>
      </div>
    </DialogContent>
  </Dialog>;
}

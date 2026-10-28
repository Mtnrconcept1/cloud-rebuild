import { useId, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Check, Gift, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, UtensilsCrossed } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PLINKO_PRIZES, type PlinkoOutcome, type PlinkoState } from "@/lib/plinko";
import "./plinko.css";

const POCKETS: PlinkoOutcome[] = ["free_meal", "replay", "tok_one_month", "lost", "half_price"];
const ICONS = [UtensilsCrossed, RotateCcw, Sparkles, Gift, UtensilsCrossed];
const pins = Array.from({ length: 8 }, (_, row) => Array.from({ length: row + 3 }, (_, column) => ({
  x: 250 + (column - (row + 2) / 2) * 40,
  y: 61 + row * 29,
}))).flat();

function PlinkoBoard({ outcome, playing, animationKey }: { outcome?: PlinkoOutcome; playing: boolean; animationKey: number }) {
  const reduceMotion = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const pocket = outcome ? POCKETS.indexOf(outcome) : 2;
  const target = 50 + pocket * 100;
  const x = [250, ...Array.from({ length: 8 }, (_, row) => {
    const progress = (row + 1) / 9;
    return 250 + (target - 250) * progress + (row % 2 === 0 ? 15 : -15);
  }), target, target];
  const y = [15, ...Array.from({ length: 8 }, (_, row) => 45 + row * 29), 310, 322];
  return <div className="tok-plinko__board" aria-hidden="true">
    <div className="tok-plinko__board-caption"><span>LAISSEZ FAIRE LE MIAMZ</span><span>100 % gratuit</span></div>
    <svg viewBox="0 0 500 350" className="tok-plinko__pegboard" focusable="false">
      <defs>
        <radialGradient id={`${id}-coin`} cx="35%" cy="25%"><stop stopColor="#fff7c0" /><stop offset=".6" stopColor="#ffc54d" /><stop offset="1" stopColor="#df7a13" /></radialGradient>
        <linearGradient id={`${id}-peg`} x2="0" y2="1"><stop stopColor="#fff8e7" /><stop offset="1" stopColor="#d78b4b" /></linearGradient>
      </defs>
      <path d="M24 27V288Q24 302 38 302H462Q476 302 476 288V27" fill="none" stroke="#f78b332b" strokeWidth="2" />
      {pins.map((pin, i) => <g key={i}><circle cx={pin.x} cy={pin.y + 3} r="4" fill="#090c12" /><circle cx={pin.x} cy={pin.y} r="3.8" fill={`url(#${id}-peg)`} /></g>)}
      {POCKETS.map((entry, index) => <rect key={entry} x={index * 100 + 5} y="302" width="90" height="43" rx="9" fill={outcome === entry ? "#ef7922" : "#ffffff0a"} stroke={outcome === entry ? "#ffcd80" : "#ffffff20"} />)}
      <motion.g key={animationKey} initial={{ x: 250, y: 15 }} animate={outcome ? { x: reduceMotion || !playing ? target : x, y: reduceMotion || !playing ? 322 : y } : { x: 250, y: 15 }} transition={{ duration: reduceMotion || !playing ? 0 : 2.3, ease: "linear" }}>
        <circle r="13" fill={`url(#${id}-coin)`} stroke="#ffde8b" strokeWidth="2" />
        <circle r="9" fill="none" stroke="#c17522" strokeWidth=".7" />
        <text y="4" textAnchor="middle" fontSize="12" fontWeight="900" fill="#6f350c">M</text>
      </motion.g>
    </svg>
    <div className="tok-plinko__pockets">{POCKETS.map((entry, i) => {
      const Icon = ICONS[i];
      return <div key={entry} className={outcome === entry ? "is-selected" : ""}><Icon size={17} /><span>{PLINKO_PRIZES[entry].short}</span>{entry === "tok_one_month" && <small>1 mois offert</small>}</div>;
    })}</div>
    <p className="tok-plinko__board-note">{playing ? "Le chef prépare votre résultat…" : "Un Miamz, cinq possibilités."}</p>
  </div>;
}

export type PlinkoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: PlinkoState | null;
  busy: boolean;
  animating: boolean;
  error: string | null;
  animationKey: number;
  onPlay: () => void;
  onRetry: () => void;
  onClaim: (email: string, marketingConsent: boolean) => void;
};

export default function PlinkoDialog({ open, onOpenChange, state, busy, animating, error, animationKey, onPlay, onRetry, onClaim }: PlinkoDialogProps) {
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
      <PlinkoBoard outcome={outcome} playing={busy || animating} animationKey={animationKey} />
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

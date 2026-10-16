import { useState } from "react";
import { Link } from "react-router-dom";
import { PiggyBank, RotateCcw } from "lucide-react";
import { FAIR_GROWTH_PLANS, getFairGrowthPlan, RESERVATION_FLAT_FEE_CHF } from "@/lib/fairGrowth";
import "./reservation-calculator.css";

type Props = {
  id: string;
  tables: number;
  covers: number;
  fee: number;
  planSlug: string;
  onTablesChange: (value: number) => void;
  onCoversChange: (value: number) => void;
  onFeeChange: (value: number) => void;
  onPlanChange: (value: string) => void;
  noShowRate?: number;
  onNoShowChange?: (value: number) => void;
  costs: { servedTables: number; servedPeople: number; perCoverCost: number; tokTotal: number };
};

const number = (value: number) => value.toLocaleString("fr-CH", { maximumFractionDigits: 4 });
const chf = (value: number) => `${value.toLocaleString("fr-CH", { maximumFractionDigits: 2 })} CHF`;

/** A readable presentation of the page's existing reservation estimates. */
export function ReservationCostCalculator(props: Props) {
  const [includePack, setIncludePack] = useState(false);
  const plan = getFairGrowthPlan(props.planSlug);
  const tableFees = props.costs.servedTables * RESERVATION_FLAT_FEE_CHF;
  const tokCost = includePack ? props.costs.tokTotal : tableFees;
  const difference = props.costs.perCoverCost - tokCost;
  const percentage = props.costs.perCoverCost > 0
    ? Math.abs(difference) / props.costs.perCoverCost * 100 : null;
  const monthlyDifference = props.costs.perCoverCost - props.costs.tokTotal;
  const reset = () => {
    props.onTablesChange(80);
    props.onCoversChange(3.4);
    props.onFeeChange(4);
    props.onNoShowChange?.(0);
    setIncludePack(false);
  };

  return (
    <section id={props.id} className="tok-math-scene scroll-mt-28" aria-label="Calculateur des frais de réservation">
      <div className="tok-math-layout">
        <aside className="tok-math-host" aria-hidden="true">
          <img className="tok-math-host-logo" src="/images/home/tok-logo-ui.webp" alt="" width="100" height="100" />
          <div className="tok-math-host-message">Vos chiffres.<br />Le calcul.<br /><strong>Tout simplement.</strong></div>
        </aside>
        <div className="tok-math-card">
          <header className="tok-math-heading">
            <p className="tok-math-context">Un mois de réservations, deux façons de facturer</p>
            <h2><span>{number(props.costs.servedTables)}</span> tables servies. <strong>Quel coût ?</strong></h2>
            <p className="tok-math-equation">{number(props.costs.servedTables)} tables × {number(props.covers)} clients en moyenne = <strong>{number(props.costs.servedPeople)} couverts</strong></p>
            <p className="tok-math-definition">Un couvert = une personne. Une table = une réservation honorée par un groupe.</p>
          </header>

          <div className="tok-math-controls">
            <CalculatorField id={`${props.id}-tables`} label={props.onNoShowChange ? "Tables réservées / mois" : "Tables servies / mois"} value={props.tables} onChange={props.onTablesChange} description={props.onNoShowChange ? "Avant déduction des absences, si vous en prévoyez." : "Comptez les réservations effectivement honorées."} />
            <CalculatorField id={`${props.id}-covers`} label="Clients par table, en moyenne" value={props.covers} onChange={props.onCoversChange} step={0.1} description="Exemple : certaines tables de 2, d'autres de 4." />
            <CalculatorField id={`${props.id}-fee`} label="Frais du modèle au couvert" value={props.fee} onChange={props.onFeeChange} step={0.1} suffix="CHF / personne" description="Saisissez le tarif à comparer : 4 CHF est un exemple." />
          </div>

          <div className="tok-math-toolbar">
            <div className="tok-math-mode" role="group" aria-label="Périmètre du calcul">
              <button type="button" aria-pressed={!includePack} onClick={() => setIncludePack(false)}>Frais de réservation seuls</button>
              <button type="button" aria-pressed={includePack} onClick={() => setIncludePack(true)}>Avec l'abonnement TOK</button>
            </div>
            <button className="tok-math-reset" type="button" onClick={reset}><RotateCcw size={15} aria-hidden="true" /> Exemple : 80 tables</button>
          </div>
          <p className="tok-math-scope">{includePack ? "Le total TOK inclut le pack sélectionné. L'abonnement éventuel du modèle au couvert n'est pas inclus." : "Vous comparez ici les frais de réservation seuls. L'abonnement TOK s'ajoute : son montant est détaillé juste en dessous."}</p>

          <table className="tok-math-table">
            <caption className="sr-only">TOK et modèle au couvert : comparaison sur les mêmes tables</caption>
            <colgroup><col className="tok-math-label-column" /><col /><col /></colgroup>
            <thead><tr><th scope="col">Base de comparaison</th><th scope="col">TOK</th><th scope="col">Modèle au couvert</th></tr></thead>
            <tbody>
              <tr><th scope="row">Tables servies</th><td>{number(props.costs.servedTables)}</td><td>{number(props.costs.servedTables)}</td></tr>
              <tr><th scope="row">Clients par table</th><td>{number(props.covers)}</td><td>{number(props.covers)}</td></tr>
              <tr><th scope="row">Total de couverts</th><td>{number(props.costs.servedPeople)}</td><td>{number(props.costs.servedPeople)}</td></tr>
              <tr><th scope="row">Tarif retenu</th><td>{RESERVATION_FLAT_FEE_CHF} CHF <small>/ table</small></td><td>{number(props.fee)} CHF <small>/ couvert</small></td></tr>
              <tr className="tok-math-multiplication"><th scope="row">Calcul des réservations</th><td>{number(props.costs.servedTables)} × {RESERVATION_FLAT_FEE_CHF} CHF</td><td>{number(props.costs.servedPeople)} × {number(props.fee)} CHF</td></tr>
              {includePack && <tr><th scope="row">Abonnement mensuel</th><td>+ {chf(plan.monthlyPriceChf)}<small>{plan.publicName}</small></td><td>Non inclus<small>À vérifier dans votre contrat</small></td></tr>}
              <tr className="tok-math-total"><th scope="row">{includePack ? "Total comparé / mois" : "Frais de réservation"}</th><td><strong>{chf(tokCost)}</strong></td><td><strong>{chf(props.costs.perCoverCost)}</strong></td></tr>
            </tbody>
          </table>

          <div className={`tok-math-result ${difference < 0 ? "tok-math-result-extra" : ""}`} role="status" aria-live="polite" aria-atomic="true">
            <PiggyBank className="tok-math-pig" size={56} strokeWidth={1.7} aria-hidden="true" />
            <div><p><strong>{chf(Math.abs(difference))}</strong> {difference > 0 ? "d'économie avec TOK" : difference < 0 ? "de plus avec TOK" : ": coûts identiques"}</p>
              <p>{percentage !== null ? <>Soit <strong>{percentage.toLocaleString("fr-CH", { maximumFractionDigits: 1 })} %</strong> de frais {difference >= 0 ? "en moins" : "en plus"}</> : "Pourcentage non calculable : le coût comparé est nul."}</p>
              <small>{includePack ? "Abonnement TOK inclus · autres frais éventuels exclus" : "Sur les réservations uniquement · hors abonnement et autres frais"}</small>
            </div>
          </div>

          <div className="tok-math-monthly">
            <div className="tok-math-plan"><label htmlFor={`${props.id}-pack`}>Votre abonnement TOK</label><select id={`${props.id}-pack`} value={props.planSlug} onChange={(event) => props.onPlanChange(event.target.value)}>
              {FAIR_GROWTH_PLANS.map((item) => <option key={item.slug} value={item.slug}>{item.publicName} · {chf(item.monthlyPriceChf)}/mois</option>)}
            </select></div>
            <div><p>Votre budget TOK avec abonnement</p><p className="tok-math-monthly-sum">{chf(tableFees)} + {chf(plan.monthlyPriceChf)} = <strong>{chf(props.costs.tokTotal)}<small> / mois</small></strong></p>
              <p>{chf(Math.abs(monthlyDifference))} {monthlyDifference > 0 ? "de moins" : monthlyDifference < 0 ? "de plus" : "d'écart"} que les frais au couvert, avec ces hypothèses.</p>
            </div>
          </div>
          {props.onNoShowChange && <details className="tok-math-details"><summary>Vous prévoyez des annulations ou des absences ?</summary>
            <CalculatorField id={`${props.id}-absences`} label="Annulations ou absences (%)" value={props.noShowRate ?? 0} onChange={props.onNoShowChange} max={100} description="Les deux modèles utilisent les mêmes réservations honorées." />
            <p>{number(props.tables)} réservations × (1 − {number(props.noShowRate ?? 0)} / 100) = {number(props.costs.servedTables)} tables servies estimées. Les fractions servent à la prévision ; seuls les groupes effectivement reçus sont facturés.</p>
          </details>}
          <p className="tok-math-note">Simulation indicative, sans garantie de fréquentation. Le tarif au couvert est votre hypothèse, pas un tarif concurrent vérifié. Les éventuels frais de commande, livraison, paiement, options et taxes ne sont pas ajoutés. Le pack TOK reste dû même sans table servie. <Link to="/packs-restaurateur">Voir les packs et conditions</Link>.</p>
        </div>
      </div>
    </section>
  );
}

function CalculatorField({ id, label, value, onChange, step = 1, max, suffix, description }: {
  id: string; label: string; value: number; onChange: (value: number) => void; step?: number; max?: number; suffix?: string; description: string;
}) {
  return <div className="tok-math-field"><label htmlFor={id}>{label}</label><div className="tok-math-input-wrap"><input id={id} type="number" min="0" max={max} step={step} value={value} aria-describedby={`${id}-hint`} onChange={(event) => {
    const next = Number(event.target.value);
    onChange(Number.isFinite(next) ? Math.min(max ?? Infinity, Math.max(0, next)) : 0);
  }} />{suffix && <span>{suffix}</span>}</div><small id={`${id}-hint`}>{description}</small></div>;
}

import { useEffect, useId, useRef } from "react";
import { Gift, RotateCcw, Sparkles, UtensilsCrossed } from "lucide-react";
import { PLINKO_PRIZES, type PlinkoOutcome } from "@/lib/plinko";
import { PLINKO_DIVIDERS, PLINKO_GEOMETRY, PLINKO_PEGS, PLINKO_POCKETS, samplePlinkoTrajectory, type PlinkoTrajectory } from "@/lib/plinko-physics";

const ICONS = [UtensilsCrossed, RotateCcw, Sparkles, Gift, UtensilsCrossed];

type Props = {
  outcome?: PlinkoOutcome;
  playing: boolean;
  animating: boolean;
  trajectory: PlinkoTrajectory | null;
  onAnimationComplete: () => void;
  dailyMiamz?: boolean;
};

export default function PlinkoBoard({ outcome, playing, animating, trajectory, onAnimationComplete, dailyMiamz = false }: Props) {
  const id = useId().replace(/:/g, "");
  const coin = useRef<SVGGElement>(null);
  const halos = useRef<(SVGCircleElement | null)[]>([]);
  const selected = !playing ? outcome : undefined;
  const lastFrame = trajectory?.frames.at(-1);
  const rest = outcome
    ? { x: lastFrame?.x ?? 50 + PLINKO_POCKETS.indexOf(outcome) * 100, y: PLINKO_GEOMETRY.floor - PLINKO_GEOMETRY.ballRadius, angle: lastFrame?.angle ?? 0 }
    : { x: 250, y: 18, angle: 0 };

  useEffect(() => {
    if (!animating || !trajectory) return;
    let frame = 0;
    let start: number | undefined;
    let impactIndex = 0;
    const active = new Map<number, number>();
    const haloNodes = halos.current;
    const draw = (timestamp: number) => {
      start ??= timestamp;
      const elapsed = Math.min((timestamp - start) / 1000, trajectory.duration);
      const position = samplePlinkoTrajectory(trajectory, elapsed);
      coin.current?.setAttribute("transform", `translate(${position.x} ${position.y}) rotate(${position.angle})`);
      while (impactIndex < trajectory.impacts.length && trajectory.impacts[impactIndex].time <= elapsed) {
        const impact = trajectory.impacts[impactIndex++];
        active.set(impact.peg, impact.time);
      }
      for (const [peg, time] of active) {
        const opacity = Math.max(0, 1 - (elapsed - time) / 0.2);
        haloNodes[peg]?.setAttribute("opacity", String(opacity));
        if (opacity === 0) active.delete(peg);
      }
      if (elapsed < trajectory.duration) frame = requestAnimationFrame(draw);
      else onAnimationComplete();
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      for (const halo of haloNodes) halo?.setAttribute("opacity", "0");
    };
  }, [animating, trajectory, onAnimationComplete]);

  const first = animating && trajectory ? trajectory.frames[0] : rest;
  return <div className="tok-plinko__board" aria-hidden="true">
    <div className="tok-plinko__board-caption"><span>{dailyMiamz ? "PLINKO QUOTIDIEN" : "LAISSEZ FAIRE LE MIAMZ"}</span><span>100 % gratuit</span></div>
    <svg viewBox="0 0 500 350" className="tok-plinko__pegboard" focusable="false">
      <defs>
        <radialGradient id={`${id}-coin`} cx="35%" cy="25%"><stop stopColor="#fff7c0" /><stop offset=".6" stopColor="#ffc54d" /><stop offset="1" stopColor="#df7a13" /></radialGradient>
        <linearGradient id={`${id}-peg`} x2="0" y2="1"><stop stopColor="#fff8e7" /><stop offset="1" stopColor="#d78b4b" /></linearGradient>
      </defs>
      <path d="M24 27V331Q24 345 38 345H462Q476 345 476 331V27" fill="none" stroke="#f78b334d" strokeWidth="2" />
      {PLINKO_PEGS.map((pin, i) => <g key={i}>
        <circle ref={(element) => { halos.current[i] = element; }} cx={pin.x} cy={pin.y} r="10" fill="#ffc979" opacity="0" />
        <circle cx={pin.x} cy={pin.y + 3} r="4" fill="#090c12" />
        <circle cx={pin.x} cy={pin.y} r={PLINKO_GEOMETRY.pegRadius} fill={`url(#${id}-peg)`} />
      </g>)}
      {PLINKO_POCKETS.map((entry, index) => <rect key={entry} x={index * 100 + 5} y="302" width="90" height="43" rx="9" fill={selected === entry ? "#ef7922" : "#ffffff0a"} stroke={selected === entry ? "#ffcd80" : "#ffffff20"} />)}
      {PLINKO_DIVIDERS.map((x) => <line key={x} x1={x} x2={x} y1={PLINKO_GEOMETRY.dividerTop} y2={PLINKO_GEOMETRY.floor} stroke="#d49a62" strokeWidth={PLINKO_GEOMETRY.dividerRadius * 2} strokeLinecap="round" />)}
      <g ref={coin} className="tok-plinko__coin" transform={`translate(${first.x} ${first.y}) rotate(${first.angle})`}>
        <circle r={PLINKO_GEOMETRY.ballRadius - 1} fill={`url(#${id}-coin)`} stroke="#ffde8b" strokeWidth="2" />
        <circle r="9" fill="none" stroke="#c17522" strokeWidth=".7" />
        <text y="4" textAnchor="middle" fontSize="12" fontWeight="900" fill="#6f350c">M</text>
      </g>
    </svg>
    <div className="tok-plinko__pockets">{PLINKO_POCKETS.map((entry, i) => {
      const Icon = ICONS[i];
      return <div key={entry} className={selected === entry ? "is-selected" : ""}>{dailyMiamz ? <><span>{[1, 3, 5, 7, 10][i]}</span><small>Miamz</small></> : <><Icon size={17} /><span>{PLINKO_PRIZES[entry].short}</span>{entry === "tok_one_month" && <small>1 mois offert</small>}</>}</div>;
    })}</div>
    <p className="tok-plinko__board-note">{playing ? "Le Miamz rebondit…" : "Un Miamz, cinq récompenses."}</p>
  </div>;
}

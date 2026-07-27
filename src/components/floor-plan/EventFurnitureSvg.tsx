import { useId } from "react";

/**
 * Vector artwork for the reception / event furniture.
 *
 * The historical floor-plan library is a set of PNG cut-outs. That works for
 * objects drawn once at a fixed size, but an event plan is zoomed, printed and
 * stretched, and a bitmap chair blurs as soon as the canvas grows. Everything
 * added here is drawn as SVG so it stays crisp at any zoom and follows the
 * same top-down reading as the existing assets: warm wood, slate furniture,
 * white linen.
 *
 * All shapes are authored inside the shared 200x140 viewBox of
 * `FloorPlanItemIllustration` and are built from rectangles and lines rather
 * than pictorial curves, so the non-uniform stretch the canvas applies to a
 * resized object still reads as the same piece of furniture.
 */

const WOOD_LIGHT = "#e3bd8d";
const SLATE = "#33363d";
const SLATE_SOFT = "#454952";
const LINEN = "#f7f5f0";
const ACCENT = "#f97316";

/** Shared soft drop shadow so every event object sits on the floor the same way. */
function GroundShadow({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.28" />
    </filter>
  );
}

export function DancefloorSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;
  const glow = `${uid}-glow`;
  const tiles = `${uid}-tiles`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
        <radialGradient id={glow} cx="50%" cy="50%" r="62%">
          <stop offset="0%" stopColor="#fde3c4" stopOpacity="0.95" />
          <stop offset="70%" stopColor="#f0c79a" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#d7a675" stopOpacity="0.5" />
        </radialGradient>
        {/* A parquet checkerboard is what makes a dance floor readable from
            above; without it the object is just an empty rectangle. */}
        <pattern id={tiles} width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="none" />
          <rect width="10" height="10" fill="#ffffff" fillOpacity="0.34" />
          <rect x="10" y="10" width="10" height="10" fill="#ffffff" fillOpacity="0.34" />
        </pattern>
      </defs>

      <g filter={`url(#${shadow})`}>
        <rect x="10" y="8" width="180" height="124" rx="10" fill={SLATE} />
        <rect x="14" y="12" width="172" height="116" rx="7" fill={`url(#${glow})`} />
        <rect x="14" y="12" width="172" height="116" rx="7" fill={`url(#${tiles})`} />
        <rect
          x="14"
          y="12"
          width="172"
          height="116"
          rx="7"
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.55"
          strokeWidth="2"
        />
      </g>
    </>
  );
}

export function StageSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;
  const deck = `${uid}-deck`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
        <linearGradient id={deck} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4e57" />
          <stop offset="100%" stopColor="#2b2e34" />
        </linearGradient>
      </defs>

      <g filter={`url(#${shadow})`}>
        <rect x="12" y="10" width="176" height="104" rx="8" fill={`url(#${deck})`} />
        {/* Deck planks read as a raised platform rather than a flat block. */}
        {[30, 50, 70, 90].map((y) => (
          <line key={y} x1="18" y1={y} x2="182" y2={y} stroke="#ffffff" strokeOpacity="0.09" strokeWidth="2" />
        ))}
        <rect x="12" y="10" width="176" height="104" rx="8" fill="none" stroke="#1f2126" strokeWidth="2" />
        {/* Front lip plus the two access steps. */}
        <rect x="12" y="108" width="176" height="10" rx="4" fill="#20232a" />
        <rect x="66" y="118" width="68" height="8" rx="3" fill={SLATE_SOFT} />
        <rect x="78" y="126" width="44" height="7" rx="3" fill="#565b65" />
      </g>
    </>
  );
}

export function DjBoothSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
      </defs>

      <g filter={`url(#${shadow})`}>
        <rect x="18" y="26" width="164" height="88" rx="9" fill={SLATE} />
        <rect x="24" y="32" width="152" height="62" rx="6" fill={SLATE_SOFT} />
        {/* Two decks framing a mixer: the silhouette a DJ booth is recognised by. */}
        <circle cx="56" cy="63" r="19" fill="#1d1f24" />
        <circle cx="56" cy="63" r="8" fill={LINEN} fillOpacity="0.85" />
        <circle cx="144" cy="63" r="19" fill="#1d1f24" />
        <circle cx="144" cy="63" r="8" fill={LINEN} fillOpacity="0.85" />
        <rect x="84" y="44" width="32" height="38" rx="4" fill="#1d1f24" />
        {[52, 60, 68, 76].map((y) => (
          <line key={y} x1="89" y1={y} x2="111" y2={y} stroke={ACCENT} strokeOpacity="0.75" strokeWidth="2" />
        ))}
        <rect x="24" y="98" width="152" height="10" rx="4" fill="#22252b" />
      </g>
    </>
  );
}

export function BuffetSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
      </defs>

      <g filter={`url(#${shadow})`}>
        <rect x="8" y="36" width="184" height="68" rx="8" fill={LINEN} />
        <rect x="8" y="36" width="184" height="68" rx="8" fill="none" stroke="#d8d3c8" strokeWidth="2" />
        {/* Table runner down the middle, chafing dishes on top. */}
        <rect x="8" y="60" width="184" height="20" fill={WOOD_LIGHT} fillOpacity="0.45" />
        {[30, 76, 122].map((x) => (
          <g key={x}>
            <rect x={x} y="50" width="40" height="40" rx="6" fill="#c9cdd4" />
            <rect x={x + 5} y="55" width="30" height="30" rx="4" fill="#8f959f" />
            <line x1={x + 12} y1="70" x2={x + 28} y2="70" stroke={LINEN} strokeOpacity="0.7" strokeWidth="2" />
          </g>
        ))}
        <rect x="170" y="54" width="14" height="32" rx="4" fill="#b9bec6" />
      </g>
    </>
  );
}

export function CakeTableSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;
  const cloth = `${uid}-cloth`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
        <radialGradient id={cloth} cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6e1d6" />
        </radialGradient>
      </defs>

      <g filter={`url(#${shadow})`}>
        <circle cx="100" cy="70" r="60" fill={`url(#${cloth})`} />
        <circle cx="100" cy="70" r="60" fill="none" stroke="#d5cfc2" strokeWidth="2" />
        {/* The cake seen from above: concentric tiers, smallest on top. */}
        <circle cx="100" cy="70" r="40" fill="#f4e7d8" stroke="#e0cdb4" strokeWidth="2" />
        <circle cx="100" cy="70" r="27" fill="#fbf3e8" stroke="#e6d4bb" strokeWidth="2" />
        <circle cx="100" cy="70" r="15" fill="#ffffff" stroke="#e6d4bb" strokeWidth="2" />
        <circle cx="100" cy="70" r="5" fill={ACCENT} fillOpacity="0.85" />
      </g>
    </>
  );
}

export function SofaSvg() {
  const uid = useId();
  const shadow = `${uid}-shadow`;
  const fabric = `${uid}-fabric`;

  return (
    <>
      <defs>
        <GroundShadow id={shadow} />
        <linearGradient id={fabric} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d7686" />
          <stop offset="100%" stopColor="#525b69" />
        </linearGradient>
      </defs>

      <g filter={`url(#${shadow})`}>
        {/* Backrest along the top edge, armrests on the sides, two cushions:
            the top-down reading of a lounge sofa. */}
        <rect x="14" y="14" width="172" height="112" rx="16" fill={`url(#${fabric})`} />
        <rect x="22" y="20" width="156" height="26" rx="11" fill="#7b8494" />
        <rect x="18" y="44" width="26" height="72" rx="11" fill="#7b8494" />
        <rect x="156" y="44" width="26" height="72" rx="11" fill="#7b8494" />
        <rect x="50" y="52" width="46" height="62" rx="10" fill="#8c95a5" />
        <rect x="104" y="52" width="46" height="62" rx="10" fill="#8c95a5" />
        <line x1="100" y1="52" x2="100" y2="114" stroke="#454c58" strokeOpacity="0.45" strokeWidth="2" />
      </g>
    </>
  );
}

import { useId } from "react";
import { FloorPlanAssetSprite } from "./FloorPlanAssetSprite";

/**
 * Existing event-only objects retain their vector rendering for saved plans.
 * Objects included in the approved transparent pack use the same real sprites
 * as the editor, service board and furniture library.
 */

const SLATE = "#33363d";
const SLATE_SOFT = "#454952";
const LINEN = "#f7f5f0";
const ACCENT = "#f97316";

/** Shared soft drop shadow so every event object sits on the floor the same way. */
function GroundShadow({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow
        dx="0"
        dy="3"
        stdDeviation="4"
        floodColor="#0f172a"
        floodOpacity="0.28"
      />
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
        <pattern
          id={tiles}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <rect width="20" height="20" fill="none" />
          <rect width="10" height="10" fill="#ffffff" fillOpacity="0.34" />
          <rect
            x="10"
            y="10"
            width="10"
            height="10"
            fill="#ffffff"
            fillOpacity="0.34"
          />
        </pattern>
      </defs>

      <g filter={`url(#${shadow})`}>
        <rect x="10" y="8" width="180" height="124" rx="10" fill={SLATE} />
        <rect
          x="14"
          y="12"
          width="172"
          height="116"
          rx="7"
          fill={`url(#${glow})`}
        />
        <rect
          x="14"
          y="12"
          width="172"
          height="116"
          rx="7"
          fill={`url(#${tiles})`}
        />
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
        <rect
          x="12"
          y="10"
          width="176"
          height="104"
          rx="8"
          fill={`url(#${deck})`}
        />
        {/* Deck planks read as a raised platform rather than a flat block. */}
        {[30, 50, 70, 90].map((y) => (
          <line
            key={y}
            x1="18"
            y1={y}
            x2="182"
            y2={y}
            stroke="#ffffff"
            strokeOpacity="0.09"
            strokeWidth="2"
          />
        ))}
        <rect
          x="12"
          y="10"
          width="176"
          height="104"
          rx="8"
          fill="none"
          stroke="#1f2126"
          strokeWidth="2"
        />
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
          <line
            key={y}
            x1="89"
            y1={y}
            x2="111"
            y2={y}
            stroke={ACCENT}
            strokeOpacity="0.75"
            strokeWidth="2"
          />
        ))}
        <rect x="24" y="98" width="152" height="10" rx="4" fill="#22252b" />
      </g>
    </>
  );
}

export function BuffetSvg() {
  return (
    <FloorPlanAssetSprite
      assetId="buffet"
      x={10}
      y={30}
      width={180}
      height={80}
    />
  );
}

export function CakeTableSvg() {
  return (
    <FloorPlanAssetSprite
      assetId="cake-table"
      x={40}
      y={10}
      width={120}
      height={120}
    />
  );
}

export function SofaSvg() {
  return (
    <FloorPlanAssetSprite
      assetId="banquette-straight"
      x={14}
      y={32}
      width={172}
      height={76}
    />
  );
}

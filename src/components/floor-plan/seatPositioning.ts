export type SeatPosition = {
  x: number;
  y: number;
  angleDeg: number;
  side?: "top" | "bottom" | "left" | "right";
};

export type RectSideDistribution = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export function computeRoundSeatPositions(
  capacity: number,
  cx: number,
  cy: number,
  orbitRadius: number,
): SeatPosition[] {
  const count = Math.max(1, Math.round(capacity));
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + orbitRadius * Math.cos(angle),
      y: cy + orbitRadius * Math.sin(angle),
      angleDeg: (angle * 180) / Math.PI + 90,
    };
  });
}

export function distributeSidesRect(capacity: number): RectSideDistribution {
  const count = Math.max(1, Math.round(capacity));
  if (count === 1) return { top: 0, bottom: 1, left: 0, right: 0 };
  if (count === 2) return { top: 1, bottom: 1, left: 0, right: 0 };
  if (count === 3) return { top: 1, bottom: 2, left: 0, right: 0 };

  const longSideTotal = count <= 4 ? count : count - 2;
  const top = Math.floor(longSideTotal / 2);
  const bottom = Math.ceil(longSideTotal / 2);
  const remainder = Math.max(0, count - top - bottom);
  const left = Math.floor(remainder / 2);
  const right = remainder - left;
  return { top, bottom, left, right };
}

export function computeRectSeatPositions(
  capacity: number,
  tableRect: { x: number; y: number; w: number; h: number },
  seatOffset: number,
): SeatPosition[] {
  const dist = distributeSidesRect(capacity);
  const positions: SeatPosition[] = [];
  const { x, y, w, h } = tableRect;

  const placeSide = (
    count: number,
    side: "top" | "bottom" | "left" | "right",
  ) => {
    if (count === 0) return;
    const isHorizontal = side === "top" || side === "bottom";
    const span = isHorizontal ? w : h;
    const step = span / (count + 1);

    for (let i = 0; i < count; i++) {
      const t = step * (i + 1);
      let px: number;
      let py: number;
      let angleDeg: number;

      switch (side) {
        case "top":
          px = x + t;
          py = y - seatOffset;
          angleDeg = 0;
          break;
        case "bottom":
          px = x + t;
          py = y + h + seatOffset;
          angleDeg = 180;
          break;
        case "left":
          px = x - seatOffset;
          py = y + t;
          angleDeg = 270;
          break;
        case "right":
          px = x + w + seatOffset;
          py = y + t;
          angleDeg = 90;
          break;
      }

      positions.push({ x: px, y: py, angleDeg, side });
    }
  };

  placeSide(dist.top, "top");
  placeSide(dist.bottom, "bottom");
  placeSide(dist.left, "left");
  placeSide(dist.right, "right");

  return positions;
}

/** Returns corners occupied by a corner-bench distribution for rect tables */
export type CornerBenchCorner = {
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  x: number;
  y: number;
  angleDeg: number;
};

export function computeCornerBenchPositions(
  capacity: number,
  tableRect: { x: number; y: number; w: number; h: number },
): CornerBenchCorner[] {
  const corners: CornerBenchCorner[] = [];
  const { x, y, w, h } = tableRect;
  const count = Math.max(1, Math.min(4, Math.round(capacity)));

  const allCorners: CornerBenchCorner[] = [
    { corner: "top-left", x, y, angleDeg: 0 },
    { corner: "top-right", x: x + w, y, angleDeg: 90 },
    { corner: "bottom-right", x: x + w, y: y + h, angleDeg: 180 },
    { corner: "bottom-left", x, y: y + h, angleDeg: 270 },
  ];

  // Distribute capacity across corners: fill starting from top-left
  const perCorner = Math.ceil(count / 4);
  let remaining = count;
  for (const c of allCorners) {
    if (remaining <= 0) break;
    corners.push(c);
    remaining -= perCorner;
  }

  return corners;
}

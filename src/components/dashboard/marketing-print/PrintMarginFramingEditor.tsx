import { useRef, useState } from "react";
import { buildNativePrintTemplate } from "../../../../supabase/functions/_shared/print/artwork";
import type { PrintProductSpec } from "@/lib/print/document";
import { clampPrintFrame, type PrintFrame } from "../../../../supabase/functions/_shared/print/margin-correction";

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = typeof handles[number];
const positions: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" }, n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" }, e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" }, s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" }, w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

/** UI-only geometry: the preview is never rasterized, padded or submitted as print artwork. */
export default function PrintMarginFramingEditor({
  imageUrl, title, product, value, onChange, disabled = false,
}: {
  imageUrl: string; title: string; product: PrintProductSpec;
  value: PrintFrame; onChange: (next: PrintFrame) => void; disabled?: boolean;
}) {
  const frame = clampPrintFrame(value);
  const stage = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; width: number; height: number; start: PrintFrame; handle: Handle | "move" } | null>(null);
  const template = buildNativePrintTemplate(product);
  const safeInsetX = template.safeArea.left * 100;
  const safeInsetY = template.safeArea.top * 100;
  const left = 50 + frame.offsetXPercent - frame.scalePercent / 2;
  const top = 50 + frame.offsetYPercent - frame.scalePercent / 2;
  const ready = left >= safeInsetX && top >= safeInsetY
    && left + frame.scalePercent <= 100 - safeInsetX
    && top + frame.scalePercent <= 100 - safeInsetY;
  const startDrag = (event: React.PointerEvent, handle: Handle | "move") => {
    if (disabled || !stage.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = stage.current.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, start: frame, handle };
    setDragging(true);
  };
  const onDrag = (event: React.PointerEvent) => {
    const origin = drag.current;
    if (!origin || !origin.width || !origin.height) return;
    const dx = (event.clientX - origin.x) / origin.width * 100;
    const dy = (event.clientY - origin.y) / origin.height * 100;
    if (origin.handle === "move") {
      onChange(clampPrintFrame({ ...origin.start, offsetXPercent: origin.start.offsetXPercent + dx, offsetYPercent: origin.start.offsetYPercent + dy }));
      return;
    }
    const horizontal = origin.handle.includes("e") ? dx : origin.handle.includes("w") ? -dx : 0;
    const vertical = origin.handle.includes("s") ? dy : origin.handle.includes("n") ? -dy : 0;
    const delta = origin.handle.length === 2 ? (horizontal + vertical) / 2 : horizontal || vertical;
    onChange(clampPrintFrame({ ...origin.start, scalePercent: origin.start.scalePercent + delta }));
  };
  const finish = () => { drag.current = null; setDragging(false); };
  const reset = () => onChange({ scalePercent: 80, offsetXPercent: 0, offsetYPercent: 0 });
  const setNumber = (key: keyof PrintFrame, next: number) => {
    if (Number.isFinite(next)) onChange(clampPrintFrame({ ...frame, [key]: next }));
  };

  return (
    <div className="space-y-3" data-testid="print-manual-framing">
      <p className="text-xs text-muted-foreground">Glissez l’image pour la déplacer ou utilisez les huit poignées pour changer sa taille. Les commandes ci-dessous permettent aussi un réglage précis au clavier.</p>
      <div ref={stage} className="relative mx-auto w-full overflow-hidden rounded-xl border bg-stone-800"
        style={{ aspectRatio: `${template.mediaWidthMm} / ${template.mediaHeightMm}`,
          maxWidth: `min(100%, ${420 * template.mediaWidthMm / template.mediaHeightMm}px)`, touchAction: "none" }}>
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "repeating-conic-gradient(#b5a49a 0% 25%, #dbcfc5 0% 50%) 50% / 20px 20px" }} />
        <div className={`absolute border-2 ${ready ? "border-emerald-400" : "border-amber-400"}`}
          data-testid="print-framing-bounds"
          style={{ left: `${left}%`, top: `${top}%`, width: `${frame.scalePercent}%`, height: `${frame.scalePercent}%`, boxShadow: ready ? "0 0 0 2px #065f46, 0 0 20px 4px #34d399" : "0 0 0 2px #92400e" }}>
          <img key={imageUrl} src={imageUrl} alt={title} draggable={false} className="h-full w-full select-none object-contain" />
          <button type="button" aria-label="Déplacer le visuel" disabled={disabled}
            className="absolute inset-4 cursor-move touch-none bg-transparent"
            onPointerDown={(e) => startDrag(e, "move")} onPointerMove={onDrag}
            onPointerUp={finish} onPointerCancel={finish} />
          {handles.map((handle) => (
            <button key={handle} type="button" aria-label={`Poignée ${handle}`} disabled={disabled}
              className="absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-md touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={positions[handle]}
              onPointerDown={(e) => startDrag(e, handle)} onPointerMove={onDrag}
              onPointerUp={finish} onPointerCancel={finish} />
          ))}
        </div>
        <div className="pointer-events-none absolute border border-dashed border-red-500" style={{
          left: `${template.bleedMm / template.mediaWidthMm * 100}%`,
          right: `${template.bleedMm / template.mediaWidthMm * 100}%`,
          top: `${template.bleedMm / template.mediaHeightMm * 100}%`,
          bottom: `${template.bleedMm / template.mediaHeightMm * 100}%`,
        }} />
        <div className="pointer-events-none absolute border-2 border-dashed border-emerald-300/80" style={{
          left: `${safeInsetX}%`, right: `${safeInsetX}%`, top: `${safeInsetY}%`, bottom: `${safeInsetY}%`,
        }} />
      </div>
      <p role="status" aria-live="polite" className={`rounded-lg border p-2 text-xs ${ready ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 text-amber-900"}`}>
        {ready ? "✓ Cadrage géométrique dans la zone verte — prêt pour la génération IA. Le contenu et les textes seront contrôlés au BAT." : "Ajustez l'image pour placer ses limites dans le cadre vert de sécurité."}
        {dragging ? " · Ajustement en cours" : ""}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {([
          ["scalePercent", "Taille (%)", 50, 95],
          ["offsetXPercent", "Horizontal (%)", -20, 20],
          ["offsetYPercent", "Vertical (%)", -20, 20],
        ] as const).map(([key, label, min, max]) => (
          <label key={key} className="space-y-1 text-xs"><span>{label}</span>
            <input type="number" aria-label={label} min={min} max={max} step={1} disabled={disabled}
              className="h-10 w-full rounded-md border px-2 text-base" value={frame[key]}
              onChange={(e) => setNumber(key, Number(e.target.value))} />
          </label>
        ))}
      </div>
      <button type="button" className="text-xs font-semibold text-primary underline" disabled={disabled} onClick={reset}>Réinitialiser le cadrage</button>
    </div>
  );
}

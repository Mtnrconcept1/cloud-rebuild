# TOK floor-plan sprites

These 22 WebP images are deterministic web derivatives of the approved `tok-floorplan-transparent-assets` PNG pack. They keep the original artwork, alpha channel, transparent padding and soft shadows. No background, text, table number, selection outline or service state is baked into them.

`manifest.json` records the source PNG hashes, original alpha bounds, output dimensions, byte sizes and derivative settings. Conversion uses Pillow RGBA, `thumbnail((768, 768), Image.Resampling.LANCZOS)`, then WebP `quality=86, method=6, alpha_quality=100, exact=True`. There is no cropping or alpha thresholding in the saved images.

The TypeScript catalogue in `src/components/floor-plan/floorPlanAssets.ts` records each derivative's visible bounds at alpha ≥ 128. The shared SVG sprite sizes the visible body using those bounds and draws the complete bitmap around it, so padding does not change furniture scale and shadows remain intact. Alpha thresholds are used only to measure geometry.

The chair and straight banquette face downward, with their backrest at the top, at 0°. The L banquette has its backrests along the top and left. The dynamic table renderer rotates seats toward the tabletop and stretches the two L arms independently; saved layout measurements and seat placements remain authoritative.

Circular assets, chairs and decorations retain their aspect ratio. Tabletop rectangles, straight banquettes and architectural lengths can adapt to configured dimensions. Table labels, capacities, selection and service statuses are rendered by the application.

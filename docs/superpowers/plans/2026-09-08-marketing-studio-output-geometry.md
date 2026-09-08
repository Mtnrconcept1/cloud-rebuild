# Marketing Studio Output Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Séparer les sorties digitales et Print du Marketing Studio, utiliser la géométrie Cloudprinter hydratée comme source de vérité Print et produire des rasters finaux aux dimensions exactes.

**Architecture:** Un module pur `outputGeometry.ts` calcule les cibles, DPI, crop et upscale. Le shell Print transforme le catalogue sécurisé en cibles et les transmet au Studio cœur, qui reste sans appel fournisseur. Un post-processeur navigateur produit le raster exact ; le Print Composer applique la même géométrie avant le BAT.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase, Supabase Edge Functions/Deno, Canvas 2D navigateur, OpenAI GPT Image 2 via l'Edge Function existante, Cloudprinter CloudCore.

**Spec:** `docs/superpowers/specs/2026-09-08-marketing-studio-output-geometry-design.md`

## Global Constraints

- `/products/info` est la source de vérité pour width/height/bleed/safety/options.
- Les produits pliés utilisent le format `after trimming` à plat ; `after folding` est informatif.
- OpenAI reste limité aux buckets `1024x1024`, `1024x1536`, `1536x1024`.
- Digital : exporter exactement 9:16, 16:9, 4:3, 1:1, 4:5 et 1.91:1 via post-traitement.
- Print : 300 DPI pour supports tenus en main ; 150 DPI pour affiche/grand format/calendrier/bannière.
- Upscale <= 2.5 autorisé avec avertissement ; > 2.5 bloqué.
- Aucun secret provider côté frontend, aucun mapping/activation Cloudprinter automatique.
- Ne jamais modifier une migration Supabase historique appliquée.

---

### Task 1: Corriger l'hydratation géométrique Cloudprinter

**Files:**
- Create: `supabase/functions/_shared/print/product-geometry.ts`
- Modify: `supabase/functions/_shared/print/cloudprinter.ts`
- Modify: `supabase/functions/print-catalog/index.ts`
- Test: `src/test/cloudprinter-product-geometry.test.ts`

**Interfaces:**
- Produces: `parseCloudprinterProductGeometry(specifications: Record<string,string>)`
- Produces: `{ widthMm, heightMm, foldedWidthMm, foldedHeightMm, bleedMm, safeMarginMm }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseCloudprinterProductGeometry } from "../../supabase/functions/_shared/print/product-geometry";

describe("Cloudprinter product geometry", () => {
  it("reads real card after-trimming dimensions", () => {
    expect(parseCloudprinterProductGeometry({
      "the exact width of the card in mm. after trimming": "105.0",
      "the exact height of the card in mm. after trimming": "148.0",
      "bleed in mm": "3",
    })).toMatchObject({ widthMm: 105, heightMm: 148, bleedMm: 3 });
  });

  it("keeps folded size separate from the open trim spread", () => {
    expect(parseCloudprinterProductGeometry({
      "the exact width of the card in mm. after trimming": "297",
      "the exact height of the card in mm. after trimming": "420",
      "the exact width of the card in mm. after folding": "297",
      "the exact height of the card in mm. after folding": "210",
    })).toMatchObject({
      widthMm: 297,
      heightMm: 420,
      foldedWidthMm: 297,
      foldedHeightMm: 210,
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/test/cloudprinter-product-geometry.test.ts`
Expected: FAIL because `product-geometry.ts` does not exist.

- [ ] **Step 3: Implement the pure parser**

Normalize spec keys to lowercase and find geometry by ordered aliases/regex. `after trimming` wins for the open sheet; `after folding` is stored separately. `item`/`product` exact width/height are fallback aliases.

```ts
export type CloudprinterProductGeometry = {
  widthMm: number | null;
  heightMm: number | null;
  foldedWidthMm: number | null;
  foldedHeightMm: number | null;
  bleedMm: number | null;
  safeMarginMm: number | null;
};

export function parseCloudprinterProductGeometry(
  specifications: Record<string, string>,
): CloudprinterProductGeometry;
```

Update `parseProductDetails()` to consume this helper. Preserve `specifications` and raw payload unchanged.

- [ ] **Step 4: Add catalogue validity**

`print-catalog list` must return only active mappings with finite positive `width_mm`/`height_mm`; include `marketingToolId` and `specifications` in the safe response. Do not modify `active` in DB.

- [ ] **Step 5: Verify GREEN and existing provider tests**

Run: `pnpm vitest run src/test/cloudprinter-product-geometry.test.ts src/test/cloudprinter-edge-runtime.test.ts src/test/marketing-print-contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `fix(print): hydrater la géométrie réelle Cloudprinter`

---

### Task 2: Ajouter le moteur pur de géométrie de sortie

**Files:**
- Create: `src/lib/marketing/outputGeometry.ts`
- Test: `src/test/marketing-output-geometry.test.ts`

**Interfaces:**
- Produces: `DIGITAL_MARKETING_OUTPUT_TARGETS`
- Produces: `buildPrintMarketingOutputTargets(products)`
- Produces: `calculateCoverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight)`
- Produces: `calculateMarketingOutputPlan(sourceWidth, sourceHeight, target)`

- [ ] **Step 1: Write failing tests for digital targets**

Assert exact presets:

```ts
expect(target("social-story")).toMatchObject({ widthPx: 1080, heightPx: 1920, ratioLabel: "9:16", nativeFormat: "portrait" });
expect(target("thetok-hero")).toMatchObject({ widthPx: 1600, heightPx: 900, ratioLabel: "16:9", nativeFormat: "landscape" });
expect(target("thetok-card")).toMatchObject({ widthPx: 1200, heightPx: 900, ratioLabel: "4:3" });
expect(target("social-square")).toMatchObject({ widthPx: 1080, heightPx: 1080, ratioLabel: "1:1" });
expect(target("social-portrait")).toMatchObject({ widthPx: 1080, heightPx: 1350, ratioLabel: "4:5" });
expect(target("linkedin-link")).toMatchObject({ widthPx: 1200, heightPx: 627, ratioLabel: "1.91:1" });
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/test/marketing-output-geometry.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement target and crop types**

```ts
export type MarketingOutputDestination = "digital" | "print";
export type MarketingOutputTarget = {
  id: string;
  destination: MarketingOutputDestination;
  label: string;
  group: string;
  widthPx: number;
  heightPx: number;
  ratioLabel: string;
  nativeFormat: TokImageFormat;
  nativeWidthPx: number;
  nativeHeightPx: number;
  targetDpi?: number;
  print?: {
    productId: string;
    providerProductId: string;
    providerReference: string;
    marketingToolId: string | null;
    widthMm: number;
    heightMm: number;
    bleedMm: number;
    safeMarginMm: number;
    foldedWidthMm: number | null;
    foldedHeightMm: number | null;
  };
};
```

Implement exact pixel conversion with `Math.ceil(mm / 25.4 * dpi)` and bucket sizes from the existing TOK contract.

- [ ] **Step 4: Add Print reference tests**

Cover:
- business card 85×55 + 3 mm bleed at 300 DPI => approximately 1075×721 and no upscale from landscape bucket after crop;
- menu A4 + 3 mm bleed at 300 DPI => ~2552×3579 and factor <= 2.5;
- poster A3 + 3 mm bleed at 150 DPI;
- folded spread uses open `widthMm`/`heightMm` while retaining folded dimensions.

- [ ] **Step 5: Implement DPI policy and quality classification**

```ts
export const MAX_PRINT_UPSCALE_FACTOR = 2.5;
export type MarketingOutputQuality = "native_or_downscale" | "upscale_allowed" | "upscale_blocked";
```

Use category/marketing tool mapping; unknown hand-held formats default to 300 DPI.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run src/test/marketing-output-geometry.test.ts`
Commit: `feat(marketing): calculer les formats finaux exacts`

---

### Task 3: Ajouter le rasteriseur exact navigateur

**Files:**
- Create: `src/lib/marketing/imageOutput.ts`
- Test: `src/test/marketing-image-output.test.ts`

**Interfaces:**
- Consumes: `calculateCoverCrop`, `MarketingOutputTarget`
- Produces: `renderMarketingOutputBlob(input)`
- Produces: `downloadMarketingOutput(input)`

- [ ] **Step 1: Write RED tests for pure safeguards**

Move/check the non-DOM guards in exported pure helpers so Vitest can assert:
- reject width/height <= 0;
- reject output > 20,000,000 pixels;
- cover crop stays inside source and matches target ratio.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/test/marketing-image-output.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement browser rasterisation**

`renderMarketingOutputBlob` loads an HTTPS/blob/data source, creates an exact target canvas, sets `imageSmoothingEnabled=true` and `imageSmoothingQuality="high"`, draws the `cover` crop and returns `{ blob, widthPx, heightPx, upscaleFactor }`.

Prefer PNG for Print, JPEG quality 0.94 for opaque digital outputs when requested.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/test/marketing-image-output.test.ts src/test/marketing-output-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(marketing): rasteriser les sorties aux dimensions exactes`

---

### Task 4: Séparer Digital et Print dans le Studio Marketing

**Files:**
- Modify: `src/components/dashboard/TokAiMarketingStudioPrintShell.tsx`
- Modify: `src/components/dashboard/TokAiMarketingStudio.tsx`
- Modify: `src/lib/ai/tokAiClient.ts`
- Test: `src/test/marketing-studio-output-targets.test.ts`
- Update: `src/test/photo-studio-persistence.test.ts`
- Update: `src/test/marketing-print-contract.test.ts`

**Interfaces:**
- Shell passes `printOutputTargets?: MarketingOutputTarget[]` and `printOutputTargetsLoading?: boolean`.
- Core never imports `getPrintCatalog` or Cloudprinter provider modules.

- [ ] **Step 1: Write RED source-contract tests**

Assert:
- destination controls contain `TheTok / réseaux sociaux` and `Impression Cloudprinter`;
- digital preset ids appear through imported `DIGITAL_MARKETING_OUTPUT_TARGETS`;
- Studio receives `printOutputTargets` as props;
- Studio does not import `@/lib/print/client` nor any `_shared/print/cloudprinter` path;
- generation request uses `selectedOutputTarget.nativeFormat`;
- prompt summary includes target exact pixels and ratio;
- exact output download calls `renderMarketingOutputBlob`.

- [ ] **Step 2: Verify RED in CI/local**

Run: `pnpm vitest run src/test/marketing-studio-output-targets.test.ts`
Expected: FAIL on missing destination/props.

- [ ] **Step 3: Load print targets in shell**

Use React Query + `getPrintCatalog(restaurantId)` only when not in Commercial Demo. Convert returned products with `buildPrintMarketingOutputTargets` and pass to core.

- [ ] **Step 4: Implement destination and exact target selection**

Default to digital. When switching to Print, select first compatible hydrated target for the chosen marketing tool. If none exists, show a non-destructive message and keep generation available in Digital.

Replace the old mixed print/digital format selector as the authoritative generation target; keep tool choice for semantic content only.

- [ ] **Step 5: Use exact target in prompt + post-process result**

OpenAI request continues to send `format: selectedOutputTarget.nativeFormat`. Add sanitized `outputTarget` metadata to `TokImageGenerationRequest` for traceability, but the Edge Function must not trust it for billing/security.

After generation, allow `Télécharger <width>×<height>` and display actual target / native bucket / upscale classification.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run src/test/marketing-studio-output-targets.test.ts src/test/photo-studio-persistence.test.ts src/test/marketing-print-contract.test.ts src/test/tok-ai-tools.test.ts`
Commit: `feat(marketing): séparer sorties digitales et Cloudprinter`

---

### Task 5: Préparer le raster exact avant le BAT Print

**Files:**
- Modify: `src/lib/print/document.ts`
- Modify: `src/lib/print/preflight.ts`
- Modify: `src/components/dashboard/marketing-print/PrintComposerDialog.tsx`
- Create: `src/lib/print/rendering.ts`
- Test: `src/test/marketing-print-rendering.test.ts`

**Interfaces:**
- Produces: `buildPrintRenderingPlan(asset, product, category)`
- `MarketingPrintDocument.rendering?` records target/source dimensions and factor.

- [ ] **Step 1: Write failing tests**

Assert rendering plan:
- uses bleed from `PrintProductSpec`, not constant 3;
- sets target DPI according to category;
- blocks factor > 2.5;
- uses open-sheet width/height for folded product;
- planned background pixel dimensions equal exact target pixels.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/test/marketing-print-rendering.test.ts`
Expected: FAIL, helper missing.

- [ ] **Step 3: Add document rendering metadata and preflight warnings**

Server/client preflight still calculates DPI from actual background dimensions. Add consistency checks/warnings for rendering metadata; never let metadata override actual pixel checks.

- [ ] **Step 4: Prepare exact raster during `createExport`**

Flow:
1. calculate plan;
2. block >2.5 before any upload;
3. call `renderMarketingOutputBlob` with exact Print target;
4. upload prepared PNG to a restaurant-owned `print-renders/` path in the existing safe image bucket;
5. build the `MarketingPrintDocument` with exact raster URL/dimensions + rendering metadata;
6. rerun `runPrintPreflight` against the real prepared document;
7. create server export only if ready.

Do not delete the prepared raster before the export is durable.

- [ ] **Step 5: Update UX**

Show:
- finished mm;
- spread/open mm for folded products;
- bleed and safe margin;
- target DPI;
- exact pixels;
- native source pixels;
- upscale factor and warning/block state.

- [ ] **Step 6: Verify and commit**

Run: `pnpm vitest run src/test/marketing-print-rendering.test.ts src/test/marketing-print-contract.test.ts`
Commit: `feat(print): préparer le raster exact avant BAT`

---

### Task 6: Validation intégrale et préparation de PR

**Files:**
- Update tests/docs only if verification reveals a real contract gap.

- [ ] **Step 1: Run targeted suite**

```bash
pnpm vitest run \
  src/test/cloudprinter-product-geometry.test.ts \
  src/test/marketing-output-geometry.test.ts \
  src/test/marketing-image-output.test.ts \
  src/test/marketing-studio-output-targets.test.ts \
  src/test/marketing-print-rendering.test.ts \
  src/test/marketing-print-contract.test.ts \
  src/test/photo-studio-persistence.test.ts \
  src/test/tok-ai-tools.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run release gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all PASS.

- [ ] **Step 3: Inspect final diff**

Confirm:
- no `.env`/secret;
- no `sk_`/provider credential;
- no historical migration edited;
- no automatic provider activation;
- core Marketing Studio does not call Cloudprinter;
- Cloudprinter active mapping with invalid geometry is fail-closed.

- [ ] **Step 4: Open/update PR**

PR title: `feat(marketing): sorties exactes Cloudprinter et réseaux sociaux`

Keep PR unmerged until explicit user instruction. Include CI evidence and the observed production mapping anomaly (`flyer-a4` -> folded A4) as an operational note, not an automatic data mutation.

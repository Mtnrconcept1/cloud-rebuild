# Dashboard restaurateur - commandes anti-gaspi et ventes flash - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make anti-gaspi and ventes flash orders clearly visible in the restaurateur `DashboardCommandes`, and make those same sources explicitly visible in restaurateur accounting, both in overview and in uninvoiced inflow detail.

**Architecture:** First verify whether `get_restaurant_orders_dashboard` already returns anti-gaspi and flash-sale orders. Then add a dedicated dashboard-only order-type helper so operational presentation does not drift from accounting classification. Finally wire the helper into `DashboardCommandes`, and extend the restaurateur accounting hook + inflow page with source-level uninvoiced detail.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase RPC/queries, shadcn/ui (`Accordion`, `Badge`, `Card`), Vitest, Vite.

---

## File Structure

**New files:**
- `src/lib/dashboardOrderTypes.ts` - classify dashboard orders into `classic`, `anti_gaspi`, `flash_sales`
- `src/test/dashboard-order-types.test.ts` - unit tests for dashboard order type detection

**Modified files:**
- `src/pages/dashboard/DashboardCommandes.tsx` - add per-day summaries and badges for anti-gaspi / ventes flash
- `src/pages/dashboard/dashboardFacturesShared.ts` - expose uninvoiced inflow amounts by source
- `src/pages/dashboard/DashboardFactures.tsx` - ensure the home wording stays explicit about anti-gaspi / ventes flash as distinct sources
- `src/pages/dashboard/DashboardFacturesInflow.tsx` - add operational `Encours par source` detail
- Optional only if needed after verification: RPC source backing `get_restaurant_orders_dashboard`

---

### Task 1: Verify the dashboard orders source includes special orders

**Files:**
- Inspect source of `get_restaurant_orders_dashboard`
- Modify only if anti-gaspi / flash-sale orders are missing from the source

- [ ] **Step 1: Locate the source**

Find where `get_restaurant_orders_dashboard` is defined or documented.

Run:

```bash
rg -n "get_restaurant_orders_dashboard" src supabase scripts
```

Expected:
- either a migration / SQL definition
- or clear evidence that the RPC is external and cannot be adjusted locally

- [ ] **Step 2: Verify expected inclusion rules**

Confirm whether orders having one of the following metadata shapes are returned:

- `metadata.is_anti_waste === true`
- `metadata.anti_waste_offer_id`
- `metadata.has_flash_sale === true`
- `metadata.is_flash_sale === true`
- `metadata.flash_sale_id`
- `metadata.feature === "anti-gaspi"`
- `metadata.feature === "ventes-flash"`

If the RPC already includes them:
- document that UI-only work is sufficient

If the RPC excludes them:
- patch the source so those orders are included

- [ ] **Step 3: Validate the source conclusion**

Expected outcome:
- clear yes/no answer whether backend change is required before UI work

---

### Task 2: Add a dedicated dashboard order-type helper

**Files:**
- Create: `src/lib/dashboardOrderTypes.ts`
- Create: `src/test/dashboard-order-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  classifyDashboardOrderType,
  getDashboardOrderTypeMeta,
} from "@/lib/dashboardOrderTypes";

describe("classifyDashboardOrderType", () => {
  it("classifies anti-gaspi orders first", () => {
    expect(classifyDashboardOrderType({
      metadata: { is_anti_waste: true, feature: "anti-gaspi" },
    })).toBe("anti_gaspi");
  });

  it("classifies flash sale orders second", () => {
    expect(classifyDashboardOrderType({
      metadata: { has_flash_sale: true, feature: "ventes-flash" },
    })).toBe("flash_sales");
  });

  it("falls back to classic for standard orders", () => {
    expect(classifyDashboardOrderType({
      metadata: { type: "delivery" },
    })).toBe("classic");
  });
});

describe("getDashboardOrderTypeMeta", () => {
  it("returns a visible badge label for anti-gaspi", () => {
    expect(getDashboardOrderTypeMeta("anti_gaspi").label).toBe("Anti-gaspi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/test/dashboard-order-types.test.ts
```

Expected:
- fail because helper does not exist yet, or environment `spawn EPERM`

- [ ] **Step 3: Implement the helper**

The helper should:

- classify into exactly one of:
  - `classic`
  - `anti_gaspi`
  - `flash_sales`
- use metadata only
- prioritize anti-gaspi before flash-sales
- expose display metadata:
  - label
  - badge class
  - card accent class

- [ ] **Step 4: Run validation**

Run:

```bash
npx eslint src/lib/dashboardOrderTypes.ts src/test/dashboard-order-types.test.ts
```

Expected:
- ESLint PASS

---

### Task 3: Surface anti-gaspi and flash-sale orders in `DashboardCommandes`

**Files:**
- Modify: `src/pages/dashboard/DashboardCommandes.tsx`
- Use: `src/lib/dashboardOrderTypes.ts`

- [ ] **Step 1: Add per-day type summaries**

For each grouped day, compute:

- `classicCount`, `classicRevenue`
- `antiGaspiCount`, `antiGaspiRevenue`
- `flashSalesCount`, `flashSalesRevenue`

Display these summaries inside the expanded day block before the order cards.

Target UI:

```tsx
<div className="grid gap-3 md:grid-cols-3">
  <Card>Classiques</Card>
  <Card>Anti-gaspi</Card>
  <Card>Ventes flash</Card>
</div>
```

- [ ] **Step 2: Add badges and visual accents to special orders**

Each order card should:

- keep the current layout and status controls
- add a badge for:
  - `Anti-gaspi`
  - `Vente flash`
- add a subtle border/background accent matching the type

Do not badge classic orders.

- [ ] **Step 3: Keep chronological reading intact**

Do not split into tabs or separate accordions.

Requirements:

- keep current day accordion behavior
- keep one chronological list of orders
- insert the summary above the list, not around it

- [ ] **Step 4: Run validation**

Run:

```bash
npx eslint src/pages/dashboard/DashboardCommandes.tsx src/lib/dashboardOrderTypes.ts
npm run build
```

Expected:
- ESLint PASS
- production build PASS

---

### Task 4: Extend restaurateur accounting inflow detail by source

**Files:**
- Modify: `src/pages/dashboard/dashboardFacturesShared.ts`
- Modify: `src/pages/dashboard/DashboardFacturesInflow.tsx`
- Modify: `src/pages/dashboard/DashboardFactures.tsx`

- [ ] **Step 1: Expose uninvoiced restaurant share by source**

In `useDashboardFacturesData`, ensure the hook returns:

- `uninvoicedRestaurantShareBySource.orders`
- `uninvoicedRestaurantShareBySource.anti_gaspi`
- `uninvoicedRestaurantShareBySource.flash_sales`
- plus the already-existing other sources for symmetry

These values must reflect uninvoiced `90%` restaurant share, not TOK `10%`.

- [ ] **Step 2: Add `Encours par source` block to inflow page**

Under the existing inflow summary cards, add a block that renders all source rows, including zero values.

At minimum the UI must clearly show:

- `Commandes`
- `Anti-gaspi`
- `Ventes flash`

Target shape:

```tsx
<Card>
  <CardHeader>Encours par source</CardHeader>
  <CardContent className="space-y-3">
    {rows.map((row) => ...)}
  </CardContent>
</Card>
```

- [ ] **Step 3: Keep home wording explicit**

On `DashboardFactures.tsx`, confirm the home page still communicates that:

- `Anti-gaspi` and `Ventes flash` are distinct sources
- they are not buried inside generic `Commandes`

If needed, tighten the copy only. Do not redesign the page again.

- [ ] **Step 4: Run validation**

Run:

```bash
npx eslint src/pages/dashboard/dashboardFacturesShared.ts src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx
npm run build
```

Expected:
- ESLint PASS
- production build PASS

---

### Task 5: Final verification

**Files:**
- No new files expected

- [ ] **Step 1: Run targeted lint**

Run:

```bash
npx eslint src/lib/dashboardOrderTypes.ts src/test/dashboard-order-types.test.ts src/pages/dashboard/DashboardCommandes.tsx src/pages/dashboard/dashboardFacturesShared.ts src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx
```

Expected:
- PASS

- [ ] **Step 2: Run final build**

Run:

```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 3: Manual verification**

Check in browser:

```text
1. A restaurant day containing anti-gaspi orders shows them in DashboardCommandes.
2. A restaurant day containing flash-sale orders shows them in DashboardCommandes.
3. Anti-gaspi orders have an explicit badge.
4. Flash-sale orders have an explicit badge.
5. Each day displays summary counts/revenue by type.
6. Orders remain in a single chronological list.
7. Dashboard compta home still shows Anti-gaspi and Ventes flash as distinct sources.
8. Dashboard compta inflow shows an Encours par source block.
9. Anti-gaspi appears as its own row in that block.
10. Ventes flash appears as its own row in that block.
```

- [ ] **Step 4: Note residual risk if RPC could not be inspected**

If the RPC source cannot be verified locally, record that as the main residual risk:

- UI will be correct only if `get_restaurant_orders_dashboard` already returns those orders

---

## Self-Review

### Spec coverage

- anti-gaspi visible in dashboard commandes: covered by Task 3
- ventes flash visible in dashboard commandes: covered by Task 3
- both in the same list and better separated within each day: covered by Task 3
- explicit accounting visibility in restaurateur compta: covered by Task 4
- source verification at the RPC layer: covered by Task 1

### Placeholder scan

- no TODO/TBD placeholders remain
- conditional backend adjustment is explicitly scoped behind verification

### Scope check

- focused enough for one implementation pass
- no admin work, no payment logic changes, no schema migration bundled in


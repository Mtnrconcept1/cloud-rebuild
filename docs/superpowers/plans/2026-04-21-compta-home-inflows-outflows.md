# Compta Home + Inflows/Outflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split accounting into a homepage plus two operational screens (`Entrees d'argent`, `Sorties d'argent`) for both admin and restaurateur, while surfacing TOK's 10% commissions by source and keeping inflows/outflows strictly separated.

**Architecture:** Add two shared pure helpers first: one to classify commission-bearing payments into exactly one source bucket, and one to aggregate those buckets into `inflow` / `outflow` summaries reusable by admin and restaurateur pages. Then reshape routes and pages so `/admin/compta` and `/dashboard/factures` become accounting homepages, with dedicated inflow/outflow pages fed by the same helper logic.

**Tech Stack:** React 18, TypeScript, TanStack Query, React Router, shadcn/ui (`Card`, `Button`, `Tabs`, `Table`), Vitest, Vite.

---

## File Structure

**New files:**
- `src/lib/comptaCommissionSources.ts` - classify 10% commission sources for orders and reservations
- `src/lib/comptaFlow.ts` - build inflow/outflow summaries for TOK and restaurateurs
- `src/test/compta-commission-sources.test.ts` - unit tests for source classification
- `src/test/compta-flow.test.ts` - unit tests for inflow/outflow summaries
- `src/pages/admin/AdminComptaInflow.tsx` - admin screen for money entering TOK
- `src/pages/admin/AdminComptaOutflow.tsx` - admin screen for money leaving TOK
- `src/pages/dashboard/DashboardFacturesInflow.tsx` - restaurateur screen for money entering the restaurant
- `src/pages/dashboard/DashboardFacturesOutflow.tsx` - restaurateur screen for money leaving the restaurant

**Modified files:**
- `src/pages/admin/AdminCompta.tsx` - turn current page into admin accounting home
- `src/pages/dashboard/DashboardFactures.tsx` - turn current page into restaurateur accounting home
- `src/App.tsx` - add new admin and dashboard accounting routes
- `src/pages/admin/AdminHome.tsx` - keep the admin shortcut pointing to the accounting home
- `src/components/DashboardLayout.tsx` - keep the sidebar pointing to the restaurateur accounting home

---

### Task 1: Add shared commission-source classifier

**Files:**
- Create: `src/lib/comptaCommissionSources.ts`
- Test: `src/test/compta-commission-sources.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  classifyOrderCommissionSource,
  classifyReservationCommissionSource,
  type CommissionSource,
} from "@/lib/comptaCommissionSources";

describe("classifyOrderCommissionSource", () => {
  it("classifies takeaway and delivery orders as classic orders by default", () => {
    expect(classifyOrderCommissionSource({
      metadata: { type: "delivery" },
      payment_status: "paid",
    })).toBe("orders");
  });

  it("classifies flash sale orders before generic orders", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "ventes-flash", has_flash_sale: true },
      payment_status: "paid",
    })).toBe("flash_sales");
  });

  it("classifies anti-gaspi orders before generic orders", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "anti-gaspi", has_anti_gaspi: true },
      payment_status: "captured",
    })).toBe("anti_gaspi");
  });

  it("classifies chef's table orders explicitly", () => {
    expect(classifyOrderCommissionSource({
      metadata: { feature: "chefs_table" },
      payment_status: "paid",
    })).toBe("chefs_table");
  });
});

describe("classifyReservationCommissionSource", () => {
  it("classifies zero-attente reservations separately from other paid reservations", () => {
    expect(classifyReservationCommissionSource({
      feature: "zero-attente",
      total_amount: 58,
      status: "confirmed",
    })).toBe("zero_attente");
  });

  it("classifies chef's table reservations separately", () => {
    expect(classifyReservationCommissionSource({
      feature: "chefs_table",
      total_amount: 120,
      status: "confirmed",
    })).toBe("chefs_table");
  });

  it("returns null for unpaid classic reservations that should not generate a 10 percent bucket", () => {
    expect(classifyReservationCommissionSource({
      feature: null,
      total_amount: 0,
      status: "pending",
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/compta-commission-sources.test.ts`
Expected: FAIL with `Cannot find module '@/lib/comptaCommissionSources'`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type CommissionSource =
  | "orders"
  | "zero_attente"
  | "chefs_table"
  | "flash_sales"
  | "anti_gaspi";

type OrderLike = {
  payment_status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type ReservationLike = {
  feature?: string | null;
  total_amount?: number | string | null;
  status?: string | null;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPaidStatus(status: unknown) {
  const normalized = normalize(status);
  return normalized === "paid" || normalized === "captured";
}

export function classifyOrderCommissionSource(order: OrderLike): CommissionSource | null {
  if (!isPaidStatus(order.payment_status)) return null;

  const meta = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
    ? order.metadata
    : {};

  const feature = normalize(meta.feature);
  const type = normalize(meta.type);
  const hasFlashSale = Boolean(meta.has_flash_sale || meta.is_flash_sale || meta.flash_sale_id);
  const hasAntiGaspi = Boolean(meta.has_anti_gaspi || meta.anti_gaspi_id);

  if (feature === "ventes-flash" || feature === "ventes_flash" || feature === "flash_sale" || hasFlashSale) {
    return "flash_sales";
  }

  if (feature === "anti-gaspi" || feature === "zero-gaspi" || hasAntiGaspi) {
    return "anti_gaspi";
  }

  if (feature === "chefs_table" || feature === "table-chef" || feature === "chefs-table") {
    return "chefs_table";
  }

  if (feature === "zero-attente") {
    return "zero_attente";
  }

  if (type === "delivery" || type === "takeaway" || type === "pickup" || type === "") {
    return "orders";
  }

  return "orders";
}

export function classifyReservationCommissionSource(reservation: ReservationLike): CommissionSource | null {
  const totalAmount = Number(reservation.total_amount || 0);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const feature = normalize(reservation.feature);

  if (feature === "zero-attente") return "zero_attente";
  if (feature === "chefs_table" || feature === "table-chef" || feature === "chefs-table") return "chefs_table";

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/compta-commission-sources.test.ts`
Expected: PASS with 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comptaCommissionSources.ts src/test/compta-commission-sources.test.ts
git commit -m "feat: add accounting commission source classifier"
```

### Task 2: Add shared inflow/outflow summary helper

**Files:**
- Create: `src/lib/comptaFlow.ts`
- Test: `src/test/compta-flow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  buildTokAccountingSummary,
  buildRestaurantAccountingSummary,
} from "@/lib/comptaFlow";

describe("buildTokAccountingSummary", () => {
  it("separates commission inflows, reservation fee inflows, and payout outflows", () => {
    const summary = buildTokAccountingSummary({
      commissionBases: {
        orders: 100,
        zero_attente: 80,
        chefs_table: 50,
        flash_sales: 20,
        anti_gaspi: 10,
      },
      reservationFeeInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
    });

    expect(summary.inflow.totalCommissions).toBe(26);
    expect(summary.inflow.bySource.zero_attente).toBe(8);
    expect(summary.inflow.reservationFeesOutstanding).toBe(15);
    expect(summary.outflow.payoutsOutstanding).toBe(90);
    expect(summary.outflow.payoutsPaid).toBe(60);
  });
});

describe("buildRestaurantAccountingSummary", () => {
  it("inverts the same flows for the restaurant point of view", () => {
    const summary = buildRestaurantAccountingSummary({
      commissionBases: {
        orders: 100,
        zero_attente: 80,
        chefs_table: 50,
        flash_sales: 20,
        anti_gaspi: 10,
      },
      reservationFeeInvoices: {
        actionable: [{ amount_ttc: 15 }],
        history: [{ amount_ttc: 5 }],
      },
      payoutInvoices: {
        actionable: [{ amount_ttc: 90 }],
        history: [{ amount_ttc: 60 }],
      },
    });

    expect(summary.inflow.receivableFromTok).toBe(90);
    expect(summary.inflow.bySource.orders).toBe(90);
    expect(summary.outflow.payableToTok).toBe(15);
    expect(summary.outflow.alreadyPaidToTok).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/compta-flow.test.ts`
Expected: FAIL with `Cannot find module '@/lib/comptaFlow'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CommissionSource } from "@/lib/comptaCommissionSources";

type MoneyLike = { amount_ttc?: number | string | null };
type InvoiceBuckets<T extends MoneyLike> = { actionable: T[]; history: T[] };
type CommissionBases = Record<CommissionSource, number>;

const COMMISSION_RATE = 0.1;
const PAYOUT_RATE = 0.9;

function toAmount(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumInvoices(invoices: readonly MoneyLike[]) {
  return invoices.reduce((sum, invoice) => sum + toAmount(invoice.amount_ttc), 0);
}

function buildCommissionBySource(commissionBases: CommissionBases, rate: number) {
  return Object.fromEntries(
    Object.entries(commissionBases).map(([key, amount]) => [key, Number(amount || 0) * rate]),
  ) as Record<CommissionSource, number>;
}

export function buildTokAccountingSummary(input: {
  commissionBases: CommissionBases;
  reservationFeeInvoices: InvoiceBuckets<MoneyLike>;
  payoutInvoices: InvoiceBuckets<MoneyLike>;
}) {
  const bySource = buildCommissionBySource(input.commissionBases, COMMISSION_RATE);
  const totalCommissions = Object.values(bySource).reduce((sum, amount) => sum + amount, 0);

  return {
    inflow: {
      bySource,
      totalCommissions,
      reservationFeesOutstanding: sumInvoices(input.reservationFeeInvoices.actionable),
      reservationFeesCollected: sumInvoices(input.reservationFeeInvoices.history),
    },
    outflow: {
      payoutsOutstanding: sumInvoices(input.payoutInvoices.actionable),
      payoutsPaid: sumInvoices(input.payoutInvoices.history),
    },
  };
}

export function buildRestaurantAccountingSummary(input: {
  commissionBases: CommissionBases;
  reservationFeeInvoices: InvoiceBuckets<MoneyLike>;
  payoutInvoices: InvoiceBuckets<MoneyLike>;
}) {
  const bySource = Object.fromEntries(
    Object.entries(input.commissionBases).map(([key, amount]) => [key, Number(amount || 0) * PAYOUT_RATE]),
  ) as Record<CommissionSource, number>;

  return {
    inflow: {
      bySource,
      receivableFromTok: sumInvoices(input.payoutInvoices.actionable),
      receivedFromTok: sumInvoices(input.payoutInvoices.history),
    },
    outflow: {
      payableToTok: sumInvoices(input.reservationFeeInvoices.actionable),
      alreadyPaidToTok: sumInvoices(input.reservationFeeInvoices.history),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/compta-flow.test.ts`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comptaFlow.ts src/test/compta-flow.test.ts
git commit -m "feat: add accounting inflow outflow summary helpers"
```

### Task 3: Add admin accounting routes and turn `AdminCompta` into the accounting home

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/admin/AdminCompta.tsx`
- Create: `src/pages/admin/AdminComptaInflow.tsx`
- Create: `src/pages/admin/AdminComptaOutflow.tsx`
- Modify: `src/pages/admin/AdminHome.tsx`

- [ ] **Step 1: Add the lazy imports and routes in `App.tsx`**

Add imports:

```ts
const AdminCompta = lazy(() => import("./pages/admin/AdminCompta"));
const AdminComptaInflow = lazy(() => import("./pages/admin/AdminComptaInflow"));
const AdminComptaOutflow = lazy(() => import("./pages/admin/AdminComptaOutflow"));
const DashboardFactures = lazy(() => import("./pages/dashboard/DashboardFactures"));
const DashboardFacturesInflow = lazy(() => import("./pages/dashboard/DashboardFacturesInflow"));
const DashboardFacturesOutflow = lazy(() => import("./pages/dashboard/DashboardFacturesOutflow"));
```

Add routes:

```tsx
<Route path="/admin/compta" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin"><AdminCompta /></FeatureSwitch></ProtectedRoute>} />
<Route path="/admin/compta/entrees" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaInflow /></FeatureSwitch></ProtectedRoute>} />
<Route path="/admin/compta/sorties" element={<ProtectedRoute requiredRole="admin"><FeatureSwitch enabled={adminComptaEnabled} fallback="/admin/compta"><AdminComptaOutflow /></FeatureSwitch></ProtectedRoute>} />
<Route path="/dashboard/factures/entrees" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesInflow /></FeatureSwitch></DashboardRoute>} />
<Route path="/dashboard/factures/sorties" element={<DashboardRoute><FeatureSwitch enabled={dashboardFacturesEnabled} fallback="/dashboard/factures"><DashboardFacturesOutflow /></FeatureSwitch></DashboardRoute>} />
```

- [ ] **Step 2: Create `AdminComptaInflow.tsx`**

Use the same `orders`, `reservationHistory`, and `reservation_fees` invoice queries already present in `AdminCompta.tsx`, then compute the source buckets before rendering:

```ts
const commissionBases = useMemo(() => {
  const initial = { orders: 0, zero_attente: 0, chefs_table: 0, flash_sales: 0, anti_gaspi: 0 };

  orders.forEach((order) => {
    const source = classifyOrderCommissionSource(order);
    if (!source) return;
    const gross = Number(order.total_amount || 0) + Number((order.metadata as Record<string, unknown> | null)?.points_discount_amount || 0);
    initial[source] += gross;
  });

  reservationHistory.forEach((reservation) => {
    const source = classifyReservationCommissionSource({
      feature: reservation.status === "confirmed" ? reservation.status : reservation.status,
      total_amount: 0,
      status: reservation.status,
    });
    if (!source) return;
  });

  return initial;
}, [orders, reservationHistory]);
```

Render the page with:

```tsx
<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">Commissions 10%</p><p className="text-3xl font-bold">{summary.inflow.totalCommissions.toFixed(2)} CHF</p></CardContent></Card>
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">Frais de reservation a encaisser</p><p className="text-3xl font-bold">{summary.inflow.reservationFeesOutstanding.toFixed(2)} CHF</p></CardContent></Card>
</div>
```

Then add a table or cards listing each commission source:

```tsx
{Object.entries(summary.inflow.bySource).map(([source, amount]) => (
  <Card key={source}>
    <CardContent className="py-5">
      <p className="text-sm text-muted-foreground">{SOURCE_LABELS[source as CommissionSource]}</p>
      <p className="text-2xl font-bold">{amount.toFixed(2)} CHF</p>
    </CardContent>
  </Card>
))}
```

- [ ] **Step 3: Create `AdminComptaOutflow.tsx`**

Reuse the current payout invoice query and summary:

```tsx
<div className="grid gap-4 md:grid-cols-3">
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">A reverser</p><p className="text-3xl font-bold">{summary.outflow.payoutsOutstanding.toFixed(2)} CHF</p></CardContent></Card>
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">Deja reverse</p><p className="text-3xl font-bold">{summary.outflow.payoutsPaid.toFixed(2)} CHF</p></CardContent></Card>
</div>
```

Under that, render the actionable and history payout invoice tables already present in `AdminCompta.tsx`.

- [ ] **Step 4: Turn `AdminCompta.tsx` into the accounting home**

Replace the current detailed-first layout with:

```tsx
<div className="space-y-8">
  <section className="grid gap-4 xl:grid-cols-4">
    <Card>...</Card> {/* total encaisse TOK */}
    <Card>...</Card> {/* commissions 10% */}
    <Card>...</Card> {/* frais de reservation */}
    <Card>...</Card> {/* net encaisse */}
  </section>

  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    {/* cards for orders, zero_attente, chefs_table, flash_sales, anti_gaspi */}
  </section>

  <section className="grid gap-6 md:grid-cols-2">
    <Button asChild size="lg" className="h-28 text-lg font-semibold"><Link to="/admin/compta/sorties">Factures faites aux restaurateurs</Link></Button>
    <Button asChild size="lg" variant="outline" className="h-28 text-lg font-semibold"><Link to="/admin/compta/entrees">Factures recues des restaurateurs</Link></Button>
  </section>
</div>
```

Keep this page free of long historical tables.

- [ ] **Step 5: Keep the existing admin shortcut stable**

Ensure `AdminHome.tsx` still links to `/admin/compta`:

```ts
{
  title: "Comptabilite",
  description: "Gerer les reversements et les parts TOK.",
  href: "/admin/compta",
}
```

- [ ] **Step 6: Run validation**

Run:

```bash
npx eslint src/lib/comptaCommissionSources.ts src/lib/comptaFlow.ts src/pages/admin/AdminCompta.tsx src/pages/admin/AdminComptaInflow.tsx src/pages/admin/AdminComptaOutflow.tsx src/App.tsx src/pages/admin/AdminHome.tsx
npm run build
```

Expected:
- ESLint PASS
- Vite build PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/comptaCommissionSources.ts src/lib/comptaFlow.ts src/pages/admin/AdminCompta.tsx src/pages/admin/AdminComptaInflow.tsx src/pages/admin/AdminComptaOutflow.tsx src/App.tsx src/pages/admin/AdminHome.tsx
git commit -m "feat: split admin accounting into home inflows and outflows"
```

### Task 4: Add restaurateur accounting routes and turn `DashboardFactures` into the accounting home

**Files:**
- Modify: `src/pages/dashboard/DashboardFactures.tsx`
- Create: `src/pages/dashboard/DashboardFacturesInflow.tsx`
- Create: `src/pages/dashboard/DashboardFacturesOutflow.tsx`
- Modify: `src/components/DashboardLayout.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `DashboardFacturesInflow.tsx`**

Reuse the current restaurant invoice and uninvoiced queries from `DashboardFactures.tsx`, but render only incoming money for the restaurateur:

```tsx
<div className="grid gap-4 xl:grid-cols-4">
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">A recevoir de TOK</p><p className="text-3xl font-bold">{summary.inflow.receivableFromTok.toFixed(2)} CHF</p></CardContent></Card>
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">Deja recu</p><p className="text-3xl font-bold">{summary.inflow.receivedFromTok.toFixed(2)} CHF</p></CardContent></Card>
</div>
```

Then add one card per source:

```tsx
{Object.entries(summary.inflow.bySource).map(([source, amount]) => (
  <Card key={source}>
    <CardContent className="py-5">
      <p className="text-sm text-muted-foreground">{SOURCE_LABELS[source as CommissionSource]}</p>
      <p className="text-2xl font-bold">{amount.toFixed(2)} CHF</p>
    </CardContent>
  </Card>
))}
```

Below that, render only payout invoices receivable from TOK.

- [ ] **Step 2: Create `DashboardFacturesOutflow.tsx`**

Reuse the current TOK fee invoice query and show only the restaurant's outgoing obligations:

```tsx
<div className="grid gap-4 xl:grid-cols-3">
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">A payer a TOK</p><p className="text-3xl font-bold">{summary.outflow.payableToTok.toFixed(2)} CHF</p></CardContent></Card>
  <Card><CardContent className="py-6"><p className="text-sm text-muted-foreground">Deja paye a TOK</p><p className="text-3xl font-bold">{summary.outflow.alreadyPaidToTok.toFixed(2)} CHF</p></CardContent></Card>
</div>
```

Below that, render only reservation-fee / TOK invoices payable by the restaurant.

- [ ] **Step 3: Turn `DashboardFactures.tsx` into the accounting home**

Replace the current mixed list-first experience with a homepage:

```tsx
<div className="space-y-8">
  <section className="grid gap-4 xl:grid-cols-4">
    <Card>...</Card> {/* a recevoir de TOK */}
    <Card>...</Card> {/* a payer a TOK */}
    <Card>...</Card> {/* net */}
    <Card>...</Card> {/* commissions 10% + frais fixes separated in subtitle */}
  </section>

  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    {/* 90 percent by source: orders, zero_attente, chefs_table, flash_sales, anti_gaspi */}
  </section>

  <section className="grid gap-6 md:grid-cols-2">
    <Button asChild size="lg" className="h-28 text-lg font-semibold"><Link to="/dashboard/factures/sorties">Factures faites a TOK</Link></Button>
    <Button asChild size="lg" variant="outline" className="h-28 text-lg font-semibold"><Link to="/dashboard/factures/entrees">Factures recues de TOK</Link></Button>
  </section>
</div>
```

Do not leave the current long invoice list on the homepage.

- [ ] **Step 4: Keep the dashboard sidebar stable**

Ensure `DashboardLayout.tsx` still points to the accounting home:

```ts
{ to: "/dashboard/factures", label: "Factures", icon: ReceiptText, feature: "dashboard-factures" }
```

- [ ] **Step 5: Run validation**

Run:

```bash
npx eslint src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx src/pages/dashboard/DashboardFacturesOutflow.tsx src/components/DashboardLayout.tsx src/App.tsx
npm run build
```

Expected:
- ESLint PASS
- Vite build PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx src/pages/dashboard/DashboardFacturesOutflow.tsx src/components/DashboardLayout.tsx src/App.tsx
git commit -m "feat: split restaurateur accounting into home inflows and outflows"
```

### Task 5: Final consistency pass and manual verification

**Files:**
- Modify: none expected
- Test: `src/test/compta-commission-sources.test.ts`
- Test: `src/test/compta-flow.test.ts`

- [ ] **Step 1: Run the helper test suite**

Run:

```bash
npx vitest run src/test/compta-commission-sources.test.ts src/test/compta-flow.test.ts
```

Expected: PASS with all accounting helper tests green.

- [ ] **Step 2: Run final lint and build**

Run:

```bash
npx eslint src/lib/comptaCommissionSources.ts src/lib/comptaFlow.ts src/pages/admin/AdminCompta.tsx src/pages/admin/AdminComptaInflow.tsx src/pages/admin/AdminComptaOutflow.tsx src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx src/pages/dashboard/DashboardFacturesOutflow.tsx src/App.tsx
npm run build
```

Expected:
- ESLint PASS
- build PASS

- [ ] **Step 3: Run manual verification**

Check in browser:

```text
1. /admin/compta starts on a summary page, not on long tables.
2. /admin/compta shows 10 percent broken down by orders, Zero Attente, Chef's Table, ventes flash, anti-gaspi.
3. The two large admin buttons open two distinct routes: /admin/compta/entrees and /admin/compta/sorties.
4. /admin/compta/entrees contains only money entering TOK.
5. /admin/compta/sorties contains only money leaving TOK.
6. /dashboard/factures starts on a summary page, not on long invoice lists.
7. The two large restaurateur buttons open /dashboard/factures/entrees and /dashboard/factures/sorties.
8. /dashboard/factures/entrees shows only money receivable from TOK.
9. /dashboard/factures/sorties shows only money payable to TOK.
10. The same paid event is classified once and only once across admin and restaurateur views.
```

- [ ] **Step 4: Capture final diff scope**

Run:

```bash
git diff --stat
```

Expected: only accounting helper files, tests, routes, and the six accounting pages changed.

- [ ] **Step 5: Commit final polish if needed**

```bash
git add src/lib/comptaCommissionSources.ts src/lib/comptaFlow.ts src/test/compta-commission-sources.test.ts src/test/compta-flow.test.ts src/pages/admin/AdminCompta.tsx src/pages/admin/AdminComptaInflow.tsx src/pages/admin/AdminComptaOutflow.tsx src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardFacturesInflow.tsx src/pages/dashboard/DashboardFacturesOutflow.tsx src/App.tsx src/components/DashboardLayout.tsx src/pages/admin/AdminHome.tsx
git commit -m "chore: finalize accounting home inflow outflow split"
```

---

## Self-Review

### Spec coverage

- accounting home for admin: covered by Task 3
- accounting home for restaurateur: covered by Task 4
- two operational screens per role: covered by Tasks 3 and 4
- 10% by source: covered by Tasks 1 and 2
- strict inflow/outflow separation: covered by Tasks 2, 3, and 4
- shared classification logic between admin and restaurateur: covered by Tasks 1 and 2

### Placeholder scan

- no `TODO`, `TBD`, or "implement later" placeholders remain
- every code-changing task includes concrete code or route snippets
- all commands include expected outcomes

### Type consistency

- source helper names are consistent: `classifyOrderCommissionSource`, `classifyReservationCommissionSource`
- summary helper names are consistent: `buildTokAccountingSummary`, `buildRestaurantAccountingSummary`
- page names and routes are consistent across admin and restaurateur flows

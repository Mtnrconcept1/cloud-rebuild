# Dashboard Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve dashboard readability by moving paid invoices into a dedicated history view and grouping reservations and orders by day with the current day expanded by default.

**Architecture:** Keep the current Supabase queries and business rules intact. Extract two pure front-end helpers first: one to split invoice lists into actionable vs paid history, and one to group date-based records into exclusive day accordions with deterministic default-open behavior. Then apply those helpers to the restaurateur pages and finally to `AdminCompta`.

**Tech Stack:** React 18, TypeScript, TanStack Query, shadcn/ui (`Tabs`, `Accordion`, `Card`, `Table`), Vite, Vitest.

---

## File Structure

**New files:**
- `src/lib/dashboardInvoices.ts` - shared invoice filtering helpers for restaurateur/admin views
- `src/lib/dashboardGrouping.ts` - shared day-grouping + default-open helpers
- `src/test/dashboard-invoices.test.ts` - unit tests for invoice split logic
- `src/test/dashboard-grouping.test.ts` - unit tests for day-grouping logic

**Modified files:**
- `src/pages/dashboard/DashboardFactures.tsx` - split actionable invoices vs paid history
- `src/pages/dashboard/DashboardReservations.tsx` - exclusive day accordion for reservations
- `src/pages/dashboard/DashboardCommandes.tsx` - exclusive day accordion for orders
- `src/pages/admin/AdminCompta.tsx` - invoice history tabs + day-grouped reservations/orders

---

### Task 1: Add shared invoice split helper

**Files:**
- Create: `src/lib/dashboardInvoices.ts`
- Test: `src/test/dashboard-invoices.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";

const INVOICES = [
  { id: "pending-1", status: "pending", amount_ttc: 25 },
  { id: "draft-1", status: "draft", amount_ttc: 10 },
  { id: "overdue-1", status: "overdue", amount_ttc: 18 },
  { id: "paid-1", status: "paid", amount_ttc: 40 },
  { id: "paid-2", status: "PAID", amount_ttc: 12 },
] as const;

describe("splitInvoicesByPaymentState", () => {
  it("keeps only unpaid invoices in actionable and moves paid invoices to history", () => {
    expect(splitInvoicesByPaymentState(INVOICES)).toEqual({
      actionable: [
        { id: "pending-1", status: "pending", amount_ttc: 25 },
        { id: "draft-1", status: "draft", amount_ttc: 10 },
        { id: "overdue-1", status: "overdue", amount_ttc: 18 },
      ],
      history: [
        { id: "paid-1", status: "paid", amount_ttc: 40 },
        { id: "paid-2", status: "PAID", amount_ttc: 12 },
      ],
    });
  });

  it("treats missing statuses as actionable", () => {
    expect(splitInvoicesByPaymentState([{ id: "x", status: null }])).toEqual({
      actionable: [{ id: "x", status: null }],
      history: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/dashboard-invoices.test.ts`
Expected: FAIL with `Cannot find module '@/lib/dashboardInvoices'`.

- [ ] **Step 3: Write minimal implementation**

```ts
type InvoiceLike = {
  status?: string | null;
};

export function isInvoicePaid(status: string | null | undefined) {
  return String(status || "").toLowerCase() === "paid";
}

export function splitInvoicesByPaymentState<T extends InvoiceLike>(invoices: readonly T[]) {
  return invoices.reduce(
    (acc, invoice) => {
      if (isInvoicePaid(invoice.status)) {
        acc.history.push(invoice);
      } else {
        acc.actionable.push(invoice);
      }
      return acc;
    },
    { actionable: [] as T[], history: [] as T[] },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/dashboard-invoices.test.ts`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardInvoices.ts src/test/dashboard-invoices.test.ts
git commit -m "feat: add dashboard invoice split helpers"
```

### Task 2: Add shared day-grouping helper

**Files:**
- Create: `src/lib/dashboardGrouping.ts`
- Test: `src/test/dashboard-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { getDefaultOpenDayKey, groupItemsByDay } from "@/lib/dashboardGrouping";

describe("groupItemsByDay", () => {
  it("groups records by yyyy-mm-dd key in ascending order", () => {
    const grouped = groupItemsByDay(
      [
        { id: "b", dateKey: "2026-04-22" },
        { id: "a", dateKey: "2026-04-21" },
        { id: "c", dateKey: "2026-04-21" },
      ],
      (item) => item.dateKey,
    );

    expect(grouped.map((group) => ({
      dateKey: group.dateKey,
      ids: group.items.map((item) => item.id),
    }))).toEqual([
      { dateKey: "2026-04-21", ids: ["a", "c"] },
      { dateKey: "2026-04-22", ids: ["b"] },
    ]);
  });
});

describe("getDefaultOpenDayKey", () => {
  it("opens the current day when present", () => {
    expect(getDefaultOpenDayKey(["2026-04-20", "2026-04-21", "2026-04-22"], "2026-04-21")).toBe("2026-04-21");
  });

  it("falls back to the first visible day when the current day is absent", () => {
    expect(getDefaultOpenDayKey(["2026-04-22", "2026-04-23"], "2026-04-21")).toBe("2026-04-22");
  });

  it("returns null for an empty list", () => {
    expect(getDefaultOpenDayKey([], "2026-04-21")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/dashboard-grouping.test.ts`
Expected: FAIL with `Cannot find module '@/lib/dashboardGrouping'`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type DayGroup<T> = {
  dateKey: string;
  items: T[];
};

export function groupItemsByDay<T>(items: readonly T[], getDateKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const dateKey = getDateKey(item);
    grouped.set(dateKey, [...(grouped.get(dateKey) || []), item]);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right, "fr"))
    .map(([dateKey, groupedItems]) => ({ dateKey, items: groupedItems satisfies T[] }));
}

export function getDefaultOpenDayKey(dateKeys: readonly string[], currentDateKey: string) {
  if (dateKeys.includes(currentDateKey)) return currentDateKey;
  return dateKeys[0] || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/dashboard-grouping.test.ts`
Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardGrouping.ts src/test/dashboard-grouping.test.ts
git commit -m "feat: add dashboard day grouping helpers"
```

### Task 3: Move paid restaurateur invoices into history

**Files:**
- Modify: `src/pages/dashboard/DashboardFactures.tsx`
- Test: `src/test/dashboard-invoices.test.ts`

- [ ] **Step 1: Extend the failing helper test with typed payout/reservation-fee examples**

```ts
it("works for both payout and reservation fee invoice lists", () => {
  const payoutInvoices = [
    { id: "p1", status: "pending", invoice_type: "payout" },
    { id: "p2", status: "paid", invoice_type: "payout" },
  ];
  const tokFeeInvoices = [
    { id: "t1", status: "overdue", invoice_type: "reservation_fees" },
    { id: "t2", status: "paid", invoice_type: "reservation_fees" },
  ];

  expect(splitInvoicesByPaymentState(payoutInvoices)).toEqual({
    actionable: [{ id: "p1", status: "pending", invoice_type: "payout" }],
    history: [{ id: "p2", status: "paid", invoice_type: "payout" }],
  });

  expect(splitInvoicesByPaymentState(tokFeeInvoices)).toEqual({
    actionable: [{ id: "t1", status: "overdue", invoice_type: "reservation_fees" }],
    history: [{ id: "t2", status: "paid", invoice_type: "reservation_fees" }],
  });
});
```

- [ ] **Step 2: Run test to verify it still passes and protects the refactor**

Run: `npx vitest run src/test/dashboard-invoices.test.ts`
Expected: PASS with 3 tests passing.

- [ ] **Step 3: Refactor `DashboardFactures.tsx` to use actionable/history tabs**

```ts
import { splitInvoicesByPaymentState } from "@/lib/dashboardInvoices";

const payoutInvoiceGroups = useMemo(
  () => splitInvoicesByPaymentState(payoutInvoices),
  [payoutInvoices],
);
const tokFeeInvoiceGroups = useMemo(
  () => splitInvoicesByPaymentState(tokFeeInvoices),
  [tokFeeInvoices],
);
```

Replace the invoice area with nested tabs:

```tsx
<Tabs defaultValue="actionable" className="space-y-4">
  <TabsList className="grid w-full max-w-md grid-cols-2">
    <TabsTrigger value="actionable">
      A traiter ({payoutInvoiceGroups.actionable.length + tokFeeInvoiceGroups.actionable.length})
    </TabsTrigger>
    <TabsTrigger value="history">
      Historique des factures ({payoutInvoiceGroups.history.length + tokFeeInvoiceGroups.history.length})
    </TabsTrigger>
  </TabsList>

  <TabsContent value="actionable" className="space-y-6">
    {payoutInvoiceGroups.actionable.map((invoice) => (
      <InvoiceCard key={invoice.id} invoice={invoice} isAdmin={isAdmin} onPreview={setPreviewInvoice} onMarkPaid={markInvoicePaid} />
    ))}
    {tokFeeInvoiceGroups.actionable.map((invoice) => (
      <InvoiceCard key={invoice.id} invoice={invoice} isAdmin={isAdmin} onPreview={setPreviewInvoice} onMarkPaid={markInvoicePaid} />
    ))}
  </TabsContent>

  <TabsContent value="history" className="space-y-6">
    {payoutInvoiceGroups.history.map((invoice) => (
      <InvoiceCard key={invoice.id} invoice={invoice} isAdmin={isAdmin} onPreview={setPreviewInvoice} onMarkPaid={markInvoicePaid} />
    ))}
    {tokFeeInvoiceGroups.history.map((invoice) => (
      <InvoiceCard key={invoice.id} invoice={invoice} isAdmin={isAdmin} onPreview={setPreviewInvoice} onMarkPaid={markInvoicePaid} />
    ))}
  </TabsContent>
</Tabs>
```

Keep the KPI cards unchanged so only the list readability changes.

- [ ] **Step 4: Run targeted validation**

Run: `npm run lint:release`
Expected: PASS; no ESLint errors in `DashboardFactures.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/DashboardFactures.tsx src/lib/dashboardInvoices.ts src/test/dashboard-invoices.test.ts
git commit -m "feat: split dashboard invoices into actionable and history views"
```

### Task 4: Group restaurateur reservations by day in an exclusive accordion

**Files:**
- Modify: `src/pages/dashboard/DashboardReservations.tsx`
- Modify: `src/lib/dashboardGrouping.ts`
- Test: `src/test/dashboard-grouping.test.ts`

- [ ] **Step 1: Extend the failing grouping test for state preservation**

```ts
import { resolveOpenDayKey } from "@/lib/dashboardGrouping";

it("keeps the current open key when it is still visible after filtering", () => {
  expect(resolveOpenDayKey({
    visibleDateKeys: ["2026-04-21", "2026-04-22"],
    currentDateKey: "2026-04-21",
    previousOpenDayKey: "2026-04-22",
  })).toBe("2026-04-22");
});

it("falls back to current day when the previous open key disappears", () => {
  expect(resolveOpenDayKey({
    visibleDateKeys: ["2026-04-21", "2026-04-22"],
    currentDateKey: "2026-04-21",
    previousOpenDayKey: "2026-04-23",
  })).toBe("2026-04-21");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/dashboard-grouping.test.ts`
Expected: FAIL with `resolveOpenDayKey is not exported`.

- [ ] **Step 3: Implement the helper and refactor the page**

Helper:

```ts
export function resolveOpenDayKey(input: {
  visibleDateKeys: readonly string[];
  currentDateKey: string;
  previousOpenDayKey: string | null;
}) {
  const { visibleDateKeys, currentDateKey, previousOpenDayKey } = input;
  if (previousOpenDayKey && visibleDateKeys.includes(previousOpenDayKey)) return previousOpenDayKey;
  return getDefaultOpenDayKey(visibleDateKeys, currentDateKey);
}
```

Page state:

```ts
const [openDayKey, setOpenDayKey] = useState<string | null>(null);

useEffect(() => {
  const visibleDateKeys = groupedReservations.map((group) => group.dateKey);
  setOpenDayKey((current) =>
    resolveOpenDayKey({
      visibleDateKeys,
      currentDateKey: referenceDate,
      previousOpenDayKey: current,
    }),
  );
}, [groupedReservations, referenceDate]);
```

Page rendering:

```tsx
<Accordion type="single" collapsible value={openDayKey ?? undefined} onValueChange={(value) => setOpenDayKey(value || null)} className="space-y-4">
  {groupedReservations.map((dateGroup) => (
    <AccordionItem key={dateGroup.dateKey} value={dateGroup.dateKey} className="rounded-xl border bg-muted/10 px-0">
      <AccordionTrigger className="px-4 py-4 hover:no-underline">
        <div className="text-left">
          <p className="text-sm font-semibold capitalize">{dateGroup.dateLabel}</p>
          <p className="text-xs text-muted-foreground">
            {dateGroup.reservationCount} reservation(s) - {dateGroup.totalGuests} couverts
          </p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {/* existing hour groups and reservation cards stay here */}
      </AccordionContent>
    </AccordionItem>
  ))}
</Accordion>
```

- [ ] **Step 4: Run validation**

Run: `npx vitest run src/test/dashboard-grouping.test.ts && npm run lint:release`
Expected: PASS; day-grouping tests green and no ESLint error in `DashboardReservations.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardGrouping.ts src/test/dashboard-grouping.test.ts src/pages/dashboard/DashboardReservations.tsx
git commit -m "feat: group dashboard reservations by day accordion"
```

### Task 5: Group restaurateur orders by day in an exclusive accordion

**Files:**
- Modify: `src/pages/dashboard/DashboardCommandes.tsx`
- Modify: `src/lib/dashboardGrouping.ts`
- Test: `src/test/dashboard-grouping.test.ts`

- [ ] **Step 1: Add a failing order-grouping test**

```ts
it("supports grouping timestamp-based records by a derived day key", () => {
  const grouped = groupItemsByDay(
    [
      { id: "o1", created_at: "2026-04-21T09:00:00.000Z" },
      { id: "o2", created_at: "2026-04-21T18:30:00.000Z" },
      { id: "o3", created_at: "2026-04-22T08:00:00.000Z" },
    ],
    (item) => item.created_at.slice(0, 10),
  );

  expect(grouped.map((group) => [group.dateKey, group.items.length])).toEqual([
    ["2026-04-21", 2],
    ["2026-04-22", 1],
  ]);
});
```

- [ ] **Step 2: Run test to verify the baseline still protects the refactor**

Run: `npx vitest run src/test/dashboard-grouping.test.ts`
Expected: PASS.

- [ ] **Step 3: Refactor `DashboardCommandes.tsx` to group orders by day**

Add page state:

```ts
const [openDayKey, setOpenDayKey] = useState<string | null>(null);
```

Create grouped orders:

```ts
const groupedOrders = useMemo(() => {
  const sortedOrders = [...filteredOrders].sort((left, right) => left.created_at.localeCompare(right.created_at, "fr"));
  return groupItemsByDay(sortedOrders, (order) => order.created_at.slice(0, 10)).map((group) => ({
    ...group,
    revenue: group.items.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
  }));
}, [filteredOrders]);
```

Resolve default-open day with the same `useEffect` pattern as reservations, then render:

```tsx
<Accordion type="single" collapsible value={openDayKey ?? undefined} onValueChange={(value) => setOpenDayKey(value || null)} className="space-y-4">
  {groupedOrders.map((dayGroup) => (
    <AccordionItem key={dayGroup.dateKey} value={dayGroup.dateKey} className="rounded-xl border bg-card">
      <AccordionTrigger className="px-5 py-4 hover:no-underline">
        <div className="text-left">
          <p className="text-sm font-semibold">{formatDashboardDateHeading(dayGroup.dateKey)}</p>
          <p className="text-xs text-muted-foreground">
            {dayGroup.items.length} commande(s) - {dayGroup.revenue.toFixed(2)} CHF
          </p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 px-5 pb-5">
        {/* move the existing order cards here unchanged */}
      </AccordionContent>
    </AccordionItem>
  ))}
</Accordion>
```

- [ ] **Step 4: Run validation**

Run: `npx vitest run src/test/dashboard-grouping.test.ts && npm run lint:release`
Expected: PASS; orders now render under day sections without ESLint regressions.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/DashboardCommandes.tsx src/lib/dashboardGrouping.ts src/test/dashboard-grouping.test.ts
git commit -m "feat: group dashboard orders by day accordion"
```

### Task 6: Apply the same readability pattern to `AdminCompta`

**Files:**
- Modify: `src/pages/admin/AdminCompta.tsx`
- Modify: `src/lib/dashboardInvoices.ts`
- Modify: `src/lib/dashboardGrouping.ts`
- Test: `src/test/dashboard-invoices.test.ts`
- Test: `src/test/dashboard-grouping.test.ts`

- [ ] **Step 1: Add failing admin-oriented helper tests**

```ts
it("splits admin payout invoices and tok-fee invoices the same way as restaurateur invoices", () => {
  const invoices = [
    { id: "a1", status: "pending", invoice_type: "payout" },
    { id: "a2", status: "paid", invoice_type: "reservation_fees" },
  ];

  expect(splitInvoicesByPaymentState(invoices).actionable.map((invoice) => invoice.id)).toEqual(["a1"]);
  expect(splitInvoicesByPaymentState(invoices).history.map((invoice) => invoice.id)).toEqual(["a2"]);
});

it("resolves the first visible admin day when no current-day group exists", () => {
  expect(resolveOpenDayKey({
    visibleDateKeys: ["2026-04-10", "2026-04-11"],
    currentDateKey: "2026-04-21",
    previousOpenDayKey: null,
  })).toBe("2026-04-10");
});
```

- [ ] **Step 2: Run tests to verify they pass before the UI refactor**

Run: `npx vitest run src/test/dashboard-invoices.test.ts src/test/dashboard-grouping.test.ts`
Expected: PASS.

- [ ] **Step 3: Refactor `AdminCompta.tsx`**

Invoice sections:

```ts
const payoutInvoiceGroups = useMemo(() => splitInvoicesByPaymentState(payoutInvoices), [payoutInvoices]);
const tokFeeInvoiceGroups = useMemo(() => splitInvoicesByPaymentState(tokFeeInvoices), [tokFeeInvoices]);
```

Render each invoice section with:

```tsx
<Tabs defaultValue="actionable" className="w-full">
  <TabsList>
    <TabsTrigger value="actionable">A traiter</TabsTrigger>
    <TabsTrigger value="history">Historique des factures</TabsTrigger>
  </TabsList>
  <TabsContent value="actionable">{/* current invoice table but only actionable rows */}</TabsContent>
  <TabsContent value="history">{/* same table but only paid rows */}</TabsContent>
</Tabs>
```

Reservations section:

```ts
const reservationGroups = useMemo(
  () => groupItemsByDay(reservationHistory, (row) => row.reservation_date),
  [reservationHistory],
);
```

Orders section:

```ts
const orderGroups = useMemo(
  () => groupItemsByDay(standardOrders, (order) => order.created_at.slice(0, 10)),
  [standardOrders],
);
```

Render both with the same exclusive `Accordion` pattern used in the restaurateur pages. Keep tables inside the expanded content rather than converting admin rows into cards.

- [ ] **Step 4: Run validation**

Run: `npx vitest run src/test/dashboard-invoices.test.ts src/test/dashboard-grouping.test.ts && npm run lint:release`
Expected: PASS; `AdminCompta.tsx` compiles cleanly and helper tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminCompta.tsx src/lib/dashboardInvoices.ts src/lib/dashboardGrouping.ts src/test/dashboard-invoices.test.ts src/test/dashboard-grouping.test.ts
git commit -m "feat: improve admin invoice, reservation, and order readability"
```

### Task 7: Final regression pass

**Files:**
- Modify: none expected
- Test: `src/test/dashboard-invoices.test.ts`
- Test: `src/test/dashboard-grouping.test.ts`

- [ ] **Step 1: Run targeted automated checks**

Run:

```bash
npx vitest run src/test/dashboard-invoices.test.ts src/test/dashboard-grouping.test.ts
npm run lint:release
```

Expected:
- all dashboard helper tests PASS
- ESLint PASS

- [ ] **Step 2: Run manual verification**

Check in browser:

```text
1. Dashboard factures restaurateur: seules les factures non payees sont visibles dans "A traiter".
2. Dashboard factures restaurateur: les factures paid sont visibles dans "Historique des factures".
3. Dashboard reservations: le jour actuel est ouvert au chargement et un clic ouvre un jour en fermant les autres.
4. Dashboard commandes: meme comportement que reservations.
5. AdminCompta reversements: l'onglet principal ne montre pas les factures paid.
6. AdminCompta reservations: affichage groupe par jour avec un seul jour ouvert.
7. AdminCompta commandes: affichage groupe par jour avec un seul jour ouvert.
```

- [ ] **Step 3: Fix any regression found**

If a regression appears, patch the smallest responsible file only:

```bash
git add <fixed-files>
git commit -m "fix: address dashboard readability regression"
```

- [ ] **Step 4: Prepare final diff summary**

Capture:

```bash
git diff --stat HEAD~1..HEAD
```

Expected: only the helper files, tests, and the four dashboard/admin pages changed.

- [ ] **Step 5: Commit final polish if needed**

```bash
git add src/pages/dashboard/DashboardFactures.tsx src/pages/dashboard/DashboardReservations.tsx src/pages/dashboard/DashboardCommandes.tsx src/pages/admin/AdminCompta.tsx src/lib/dashboardInvoices.ts src/lib/dashboardGrouping.ts src/test/dashboard-invoices.test.ts src/test/dashboard-grouping.test.ts
git commit -m "chore: finalize dashboard readability improvements"
```

---

## Self-Review

### Spec coverage

- Factures `A traiter` / `Historique des factures`: covered by Tasks 1, 3, and 6
- Reservations grouped by day with current day open: covered by Tasks 2, 4, and 6
- Orders grouped by day with current day open: covered by Tasks 2, 5, and 6
- Admin + restaurateur parity: covered by Tasks 3, 4, 5, and 6

### Placeholder scan

- No `TODO`, `TBD`, or "implement later" placeholders remain
- Each code-changing task includes concrete code snippets and exact commands

### Type consistency

- Invoice helper names are consistent: `isInvoicePaid`, `splitInvoicesByPaymentState`
- Grouping helper names are consistent: `groupItemsByDay`, `getDefaultOpenDayKey`, `resolveOpenDayKey`
- The same helpers are referenced in both restaurateur and admin tasks

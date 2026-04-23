# Invoice Line Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show full per-line invoice details on every accounting invoice in admin and restaurateur dashboards, with reservations and commands visible inside an accordion and totals tied to database-backed invoice lines.

**Architecture:** Add a new Supabase RPC for `payout` invoice lines and reuse the existing reservation-fee RPC for `reservation_fees`. Normalize both line shapes in shared frontend hooks, then render them through a reusable accordion/table component used by the four accounting invoice screens so admin and restaurateur see the same detail from the same source of truth.

**Tech Stack:** Supabase Postgres RPCs and migrations, React 18, TypeScript, TanStack Query, Vite, ESLint, Vitest.

---

## File Structure

**Create:**
- `supabase/migrations/<timestamp>_get_payout_invoice_lines.sql` - SQL RPC exposing normalized line details for payout invoices
- `src/components/invoices/InvoiceDetailAccordion.tsx` - reusable accordion that lazily loads and renders invoice details
- `src/components/invoices/InvoiceLineTable.tsx` - reusable line table with sections, subtotals, total, and optional rounding delta
- `src/test/invoice-line-details.test.ts` - targeted unit tests for line normalization and totals

**Modify:**
- `src/pages/admin/adminComptaShared.ts` - add invoice detail types, query helpers, and line normalization for admin screens
- `src/pages/dashboard/dashboardFacturesShared.ts` - add invoice detail types, query helpers, and line normalization for restaurateur screens
- `src/pages/admin/AdminComptaInflow.tsx` - wire reservation-fee invoice detail accordion
- `src/pages/admin/AdminComptaOutflow.tsx` - wire payout invoice detail accordion
- `src/pages/dashboard/DashboardFacturesInflow.tsx` - wire payout invoice detail accordion
- `src/pages/dashboard/DashboardFacturesOutflow.tsx` - wire reservation-fee invoice detail accordion

**Reference files to inspect while implementing:**
- `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql` - existing reservation fee detail RPC
- `supabase/migrations/20260420120000_security_and_invoice_hardening.sql` - current payout invoice generation logic
- `src/lib/comptaCommissionSources.ts` - source classification rules to mirror for payout line source labels

---

### Task 1: Add the payout invoice detail RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_get_payout_invoice_lines.sql`
- Reference: `supabase/migrations/20260422170000_split_reservation_fee_invoice_link.sql`
- Reference: `supabase/migrations/20260420120000_security_and_invoice_hardening.sql`

- [ ] **Step 1: Create the migration file with the local Supabase CLI**

Run:

```powershell
& .\.tmp\supabase-cli\supabase.exe migration new get_payout_invoice_lines --workdir "C:\Users\Pc\cloud-rebuild-recovered"
```

Expected:
- a new file appears under `supabase/migrations/`

- [ ] **Step 2: Write `public.get_payout_invoice_lines(p_invoice_id uuid)`**

The function must:
- load the invoice row
- reject unknown invoices with `invoice_not_found`
- authorize only `service_role`, admin, or restaurant owner
- reject non-payout invoices or return only rows linked by `restaurant_invoice_id = p_invoice_id`
- return normalized rows for both `orders` and `reservations`

Return columns:

```sql
line_id uuid,
line_type text,
source text,
reference text,
label text,
occurred_at timestamptz,
gross_amount numeric,
rate_applied numeric,
invoiced_amount numeric
```

Source mapping must stay coherent with current accounting logic:
- `orders`
- `zero_attente`
- `chefs_table`
- `flash_sales`
- `anti_gaspi`

- [ ] **Step 3: Make payout amounts match invoice logic**

For each returned row:
- reservation gross = `total_amount`
- order gross = `total_amount + points_discount_amount` when present in metadata
- `rate_applied = 0.90`
- `invoiced_amount = ROUND(gross_amount * 0.90, 2)`

Keep the SQL deterministic and explicit rather than reusing frontend classification.

- [ ] **Step 4: Grant and lock down execution**

The migration must include:

```sql
REVOKE EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payout_invoice_lines(uuid) TO service_role;
```

- [ ] **Step 5: Dry-run the migration**

Run:

```powershell
& .\.tmp\supabase-cli\supabase.exe db push --dry-run --include-all --workdir "C:\Users\Pc\cloud-rebuild-recovered"
```

Expected:
- the new migration is listed
- no SQL syntax error

---

### Task 2: Add shared invoice detail types and data loaders

**Files:**
- Modify: `src/pages/admin/adminComptaShared.ts`
- Modify: `src/pages/dashboard/dashboardFacturesShared.ts`

- [ ] **Step 1: Add normalized invoice detail types**

Create shared frontend types in each accounting shared file for:

```ts
type InvoiceDetailLineType = "order" | "reservation";
type InvoiceDetailSource = "orders" | "zero_attente" | "chefs_table" | "flash_sales" | "anti_gaspi";

type PayoutInvoiceDetailLine = {
  lineId: string;
  lineType: InvoiceDetailLineType;
  source: InvoiceDetailSource;
  reference: string;
  label: string;
  occurredAt: string;
  grossAmount: number;
  rateApplied: number;
  invoicedAmount: number;
};

type ReservationFeeInvoiceDetailLine = {
  reservationId: string;
  reservationDate: string;
  reservationTime: string;
  partySize: number;
  status: string;
  cancelledBy: string | null;
  cancellationReasonCode: string | null;
  billingFeeChf: number;
};
```

- [ ] **Step 2: Add query helpers for invoice detail**

In both shared files, add React Query helpers that:
- call `supabase.rpc("get_payout_invoice_lines", { p_invoice_id })` for payout invoices
- call `supabase.rpc("get_reservation_fee_invoice_lines", { p_invoice_id })` for reservation-fee invoices
- normalize numeric fields with existing `toAmount` helpers

- [ ] **Step 3: Add total helpers**

Add helpers that compute:
- reservation section subtotal
- order section subtotal
- invoice lines total
- optional rounding delta versus `invoice.amount_ttc`

These helpers should be pure and testable.

- [ ] **Step 4: Add lightweight source presentation metadata**

Add a mapping for source badge labels and styles:
- `orders` => `Commande`
- `zero_attente` => `Zero attente`
- `chefs_table` => `Chef's Table`
- `flash_sales` => `Vente flash`
- `anti_gaspi` => `Anti-gaspi`

Keep styling logic outside the page files.

- [ ] **Step 5: Validate shared files**

Run:

```powershell
npx eslint src\pages\admin\adminComptaShared.ts src\pages\dashboard\dashboardFacturesShared.ts
```

Expected:
- ESLint PASS

---

### Task 3: Build reusable invoice detail UI components

**Files:**
- Create: `src/components/invoices/InvoiceDetailAccordion.tsx`
- Create: `src/components/invoices/InvoiceLineTable.tsx`

- [ ] **Step 1: Build `InvoiceLineTable.tsx`**

This component should accept normalized data and render:
- optional section title
- row columns
- subtotal
- total footer
- optional rounding delta message

Required payout columns:
- source badge
- label
- date/heure
- montant brut
- taux
- montant facture

Required reservation-fee columns:
- date
- heure
- couverts
- statut
- montant

- [ ] **Step 2: Build `InvoiceDetailAccordion.tsx`**

This component should:
- receive `invoiceId`, `invoiceType`, `invoiceAmountTtc`
- show button `Voir le detail`
- lazy-load lines only when opened
- show `Chargement du detail...`
- show explicit RPC error state
- show `Aucune ligne sur cette facture.` if empty

It must render:
- `Reservations` section
- `Commandes` section

for payout invoices, and:
- `Reservations facturees`

for reservation-fee invoices.

- [ ] **Step 3: Keep the component role-agnostic**

The component must not know whether it is used by admin or restaurateur pages.
Pass loader hooks or normalized data adapters through props so the same component works on all four screens.

- [ ] **Step 4: Validate component files**

Run:

```powershell
npx eslint src\components\invoices\InvoiceDetailAccordion.tsx src\components\invoices\InvoiceLineTable.tsx
```

Expected:
- ESLint PASS

---

### Task 4: Integrate detail accordions into admin invoice tables

**Files:**
- Modify: `src/pages/admin/AdminComptaInflow.tsx`
- Modify: `src/pages/admin/AdminComptaOutflow.tsx`

- [ ] **Step 1: Replace the local invoice table row rendering with expandable rows**

Keep the existing invoice table columns unchanged, then add:
- a `Detail` column or action zone with `Voir le detail`
- an extra table row under the invoice row when expanded

The expanded row should span the full table width and host `InvoiceDetailAccordion`.

- [ ] **Step 2: Wire admin inflow to reservation-fee detail**

On `AdminComptaInflow.tsx`:
- only use the reservation-fee RPC
- show all linked reservations
- preserve existing `Marquer payee`

- [ ] **Step 3: Wire admin outflow to payout detail**

On `AdminComptaOutflow.tsx`:
- use the new payout RPC
- show reservations first, commandes second
- preserve existing `Marquer payee`

- [ ] **Step 4: Validate admin pages**

Run:

```powershell
npx eslint src\pages\admin\AdminComptaInflow.tsx src\pages\admin\AdminComptaOutflow.tsx
```

Expected:
- ESLint PASS

---

### Task 5: Integrate detail accordions into restaurateur invoice tables

**Files:**
- Modify: `src/pages/dashboard/DashboardFacturesInflow.tsx`
- Modify: `src/pages/dashboard/DashboardFacturesOutflow.tsx`

- [ ] **Step 1: Mirror admin table expansion behavior**

Keep the existing table layout and PDF actions, then add:
- `Voir le detail`
- expandable row under each invoice

- [ ] **Step 2: Wire restaurateur inflow to payout detail**

On `DashboardFacturesInflow.tsx`:
- use payout line detail
- show both reservations and commandes
- preserve existing `PDF` and `Marquer payee`

- [ ] **Step 3: Wire restaurateur outflow to reservation-fee detail**

On `DashboardFacturesOutflow.tsx`:
- use reservation-fee line detail
- preserve existing `PDF` and `Marquer payee`

- [ ] **Step 4: Validate restaurateur pages**

Run:

```powershell
npx eslint src\pages\dashboard\DashboardFacturesInflow.tsx src\pages\dashboard\DashboardFacturesOutflow.tsx
```

Expected:
- ESLint PASS

---

### Task 6: Add focused tests for normalization and totals

**Files:**
- Create: `src/test/invoice-line-details.test.ts`
- Modify if needed: `src/pages/admin/adminComptaShared.ts`
- Modify if needed: `src/pages/dashboard/dashboardFacturesShared.ts`

- [ ] **Step 1: Test payout subtotal and total helpers**

Cover at minimum:
- one payout invoice with one reservation and one order
- split subtotals by section
- overall total
- rounding delta detection

- [ ] **Step 2: Test reservation-fee total helpers**

Cover at minimum:
- multiple reservation lines
- total equals sum of `billingFeeChf`

- [ ] **Step 3: Test source label normalization**

Cover:
- `orders`
- `zero_attente`
- `chefs_table`
- `flash_sales`
- `anti_gaspi`

- [ ] **Step 4: Run the focused test file**

Run:

```powershell
npx vitest run src/test/invoice-line-details.test.ts
```

Expected:
- PASS

If the environment still blocks Vitest with `spawn EPERM`, record that explicitly and fall back to lint + build verification.

---

### Task 7: Full validation and regression check

**Files:**
- all modified files

- [ ] **Step 1: Run targeted lint**

Run:

```powershell
npx eslint src\components\invoices\InvoiceDetailAccordion.tsx src\components\invoices\InvoiceLineTable.tsx src\pages\admin\adminComptaShared.ts src\pages\dashboard\dashboardFacturesShared.ts src\pages\admin\AdminComptaInflow.tsx src\pages\admin\AdminComptaOutflow.tsx src\pages\dashboard\DashboardFacturesInflow.tsx src\pages\dashboard\DashboardFacturesOutflow.tsx src\test\invoice-line-details.test.ts
```

Expected:
- ESLint PASS

- [ ] **Step 2: Run build**

Run:

```powershell
npm run build
```

Expected:
- Vite production build succeeds

- [ ] **Step 3: Push database migration**

Run:

```powershell
& .\.tmp\supabase-cli\supabase.exe db push --include-all --workdir "C:\Users\Pc\cloud-rebuild-recovered"
```

Expected:
- migration applied successfully

- [ ] **Step 4: Manual accounting verification**

Verify in browser:
- admin inflow: a `reservation_fees` invoice opens and lists all included reservations
- admin outflow: a `payout` invoice opens and lists reservations + commandes with 90% amounts
- restaurateur inflow: same payout invoice shows the same lines
- restaurateur outflow: same reservation-fee invoice shows the same reservations

Check that:
- totals match invoice TTC or show a clear rounding delta
- empty state is readable
- actions like `Marquer payee` still work

---

## Spec Coverage Checklist

- full detail on every emitted/received invoice: covered by Tasks 2 to 5
- reservations and commands both visible: covered by Tasks 1, 3, 4, and 5
- accordion interaction: covered by Task 3 and integration tasks
- exact line billed amount, not only gross amount: covered by Tasks 1 and 2
- same detail on admin and restaurateur sides: covered by shared SQL source of truth and Tasks 2, 4, 5

## Notes

- Do not rebuild payout line logic directly from page-level data when the SQL RPC can be queried instead.
- Keep lazy loading per invoice row to avoid prefetching all invoice details on accounting pages.
- Keep all wording in French in the UI components to match the existing dashboards.

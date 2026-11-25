# Design Specification: Debt Payment Budgets, Budget Breakdown, Android & Web UI Polish, Whole-System Bug Fixes, and Systematic Indonesian Copy

**Date:** 2026-11-25  
**Target Repository:** Keuanganku (React 19, TypeScript, Vite, Zustand, Capacitor 8 Android APK)

---

## 1. Intent & Why

Keuanganku is an offline-first personal finance and double-entry accounting application delivered as both a web app and a Capacitor Android APK. Currently:

1. **Budgets only track expense accounts (`type === 'expense'`).** Users who allocate monthly cash flow to paying down loans or payables cannot set monthly caps for debt repayments (`payable_pay` principal + interest), because principal repayment debits a liability account rather than an expense account.
2. **Budget cards lack drill-down inspection.** Tapping a budget card immediately opens the limit-edit modal instead of showing what transactions and journal entries produced the current month's realization.
3. **Android edge-to-edge rendering and mobile touch interaction have structural CSS/native defects.** With `targetSdkVersion = 36` on Android 15/16, the system status bar overlaps the sticky topbar, scrolled content bleeds behind a semi-transparent topbar whose `backdrop-filter` is stripped on touch devices, `:hover` states stick after tap on mobile buttons and cards, and touch-device input controls (`AutoComplete`, `AmountInput`, `Select`) misfire or lose selections.
4. **Cross-cutting functional bugs and copy inconsistencies** exist across accounting periods, transaction filtering/sign display, expression parsing, Excel export, overlay/keyboard focus handling, and Indonesian terminology.

This specification defines a cohesive, root-cause design covering all five areas while preserving full double-entry accounting invariants and backward compatibility with existing stored user data (`neraca.data`, `neraca.prefs`).

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Support **debt payment budgets** (`Anggaran pembayaran hutang`) at two granularities: **aggregate** (`Semua pembayaran hutang`) and **per active payable** (`Per hutang aktif`), measuring monthly cash outflow (**principal + interest**) with spending-limit status semantics (`Aman`, `Waspada`, `Melebihi`).
- Make every budget card (expense or debt payment) open an interactive **Budget Breakdown Sheet** displaying hero metrics, pace marker, active-month 3-month average, reconciled itemized transactions/journal entries (tappable to edit), and quick actions (`Ubah batas`, pre-filled `Catat pengeluaran` / `Bayar hutang`, and link to Transactions/Ledger).
- Resolve Android status-bar overlap, scrolled topbar text bleed, sticky touch hover states, typography weight scatter, contrast bugs, and bottom-bar clearance at their architectural root causes.
- Fix all verified accounting, input-parsing, form, overlay/focus, navigation, dashboard, and Excel export defects without patching symptoms.
- Establish a single, consistent, concise Indonesian UI vocabulary across all pages, dialogs, shortcuts, and settings, removing any personal placeholder names.

### Non-Goals
- Multi-currency support, cloud sync, or server backends.
- Changing the `neraca.data` / `neraca.prefs` localStorage key names or breaking existing JSON backups.
- Redesigning the double-entry journal engine's core accounting treatment of debt principal (principal repayment remains a liability reduction on the Balance Sheet, never an Income Statement expense).
- Adding new icon glyphs to `src/lib/glyphs.tsx` that require regenerating the custom icon font subset (`hb-subset`); all UI reuses glyphs already present in `src/lib/glyphs.tsx`.

### Anti-Goals
- **Double-counting** debt principal as an Income Statement expense in Profit & Loss or inflating total budgeted limits when both an aggregate debt budget and per-debt budgets coexist.
- **Unreconciled breakdown lists** where the sum of displayed items in the breakdown sheet disagrees with the actual figure shown on the budget card.
- **Symptom patches** such as `!important` cascade overrides on topbar backgrounds, arbitrary magic `padding-top` pixel values for Android status bars, or hardcoded workarounds for individual broken controls.
- **Data loss or silent corruption** when upgrading existing stored `Budget` entries or deleting parent debt transactions.

---

## 3. Constraints

1. **Backward compatibility:** Existing persisted `Budget` records (`{ id, categoryId, amount, createdAt }`) and older JSON backups must load and normalize seamlessly with zero user intervention.
2. **Double-entry integrity:** `checkIntegrity(data)` must pass with balanced debits and credits; `budgetReport` must keep `JUMLAH BEBAN` equal to total Income Statement expenses for the period and keep Excel `SUBTOTAL`/`SUM` formula metadata accurate.
3. **Offline parity (Web & Android APK):** Every UI fix, safe-area inset, keyboard/touch interaction, and copy adjustment must work identically in desktop browsers, mobile web, and Capacitor Android WebView (`targetSdkVersion = 36`).
4. **Icon subset constraint:** Only glyphs exported by `src/lib/glyphs.tsx` (and valid icon names in `src/lib/icons.tsx`) may be used unless the Flaticon subset font is rebuilt via `npm run uicons`.
5. **Privacy mode:** Monetary values in new UI surfaces and fixed tooltips must respect `hideAmounts` (`.money-val` blur and no unmasked monetary figures in native `title` tooltips when privacy mode is active).

---

## 4. Approaches Considered

### Approach 1 — Unified Backward-Compatible `Budget` Model + Dedicated `src/accounting/budgets.ts` + Capacitor 8 `SystemBars` Insets *(Selected)*
- Extend `Budget` with optional `kind?: 'expense' | 'debt'` and optional `debtId?: string` (omitted `kind` defaults to `'expense'`).
- Extract budget calculation, breakdown reconciliation, de-duplicated totals, and 3-month active averaging into a dedicated pure module `src/accounting/budgets.ts` (re-exporting public types/functions from `src/accounting/reports.ts` for compatibility).
- Handle Android edge-to-edge safe areas via Capacitor 8's built-in `SystemBars` plugin (`insetsHandling: 'css'` in `capacitor.config.ts`, exposing `--safe-area-inset-*` alongside standard `env(safe-area-inset-*)`, plus `SystemBars.setStyle()` synced from `useThemeSync()`), paired with root-level CSS token fixes (`--glass: var(--canvas)` on touch/mobile, `@media (hover: hover)` gating).
- **Tradeoffs:** Clean single source of truth across Budgets page, Breakdown Sheet, Dashboard widgets, Insights, Reminders, Reports, Integrity check, and Excel export, with zero custom Java inset listeners that could conflict with Capacitor 8's built-in `SystemBars` or Android IME resizing. Slightly broader initial module design than ad-hoc page helpers, which pays off immediately in testability and zero drift across surfaces.

### Approach 2 — Separate `debtBudgets: DebtBudget[]` Collection on `AppData`
- Keep `budgets: Budget[]` strictly for expense accounts and store debt budgets in a second top-level array `debtBudgets`.
- **Tradeoffs:** Avoids optional fields on `Budget`, but duplicates normalization, undo/redo actions, backup schema validation, reminders, insights, dashboard KPI aggregation, and UI sorting logic across two parallel arrays.

### Approach 3 — Synthetic Expense Shadow Account for Debt Payments
- Create a hidden/virtual expense account representing debt repayments so existing expense-only budget code works unchanged.
- **Tradeoffs:** Violates double-entry accounting semantics (risks leaking balance-sheet principal repayment into expense reports, category breakdowns, or trial balance). Rejected immediately against accounting anti-goals.

**Decision:** **Approach 1** was selected because it preserves strict double-entry integrity, keeps backup/store structures unified and backward-compatible, and centralizes all budget + breakdown math in one testable domain module.

---

## 5. Detailed Design

### Pillar 1: Debt Payment Budgets & Budget Domain Module

#### 5.1.1 Data Model (`src/accounting/types.ts`)
Extend `Budget` while keeping legacy records valid without migration:

```ts
export type BudgetKind = 'expense' | 'debt';

export interface Budget {
  id: string;
  /** Default 'expense' when omitted (backward compatibility with stored data). */
  kind?: BudgetKind;
  /** Required for kind === 'expense' (or omitted). */
  categoryId?: string;
  /** Optional for kind === 'debt': Transaction.id of a payable_new; omitted means aggregate ("Semua pembayaran hutang"). */
  debtId?: string;
  amount: number;
  createdAt: number;
}

export type BudgetTarget =
  | { kind: 'expense'; categoryId: string }
  | { kind: 'debt'; debtId?: string };
```

Helper `budgetKind(b: Pick<Budget, 'kind'>): BudgetKind` returns `b.kind === 'debt' ? 'debt' : 'expense'`.  
Helper `budgetTargetKey(b: Pick<Budget, 'kind' | 'categoryId' | 'debtId'>): string` returns:
- `expense:${b.categoryId}` for expense budgets
- `debt:${b.debtId || 'all'}` for debt payment budgets

#### 5.1.2 Store & Normalization (`src/store/data.ts`)
- **`normalizeData`:**
  - Keep any budget with `amount > 0` where either `(kind === 'expense' && typeof categoryId === 'string' && categoryId)` OR `(kind === 'debt' && (debtId === undefined || (typeof debtId === 'string' && debtId.length > 0)))`.
  - Deduplicate by `budgetTargetKey(b)` keeping `'last'`.
  - Preserve legacy shape for expense budgets (normalize `kind: 'debt'` only for debt budgets; omit `debtId` when empty string; omit `categoryId` on debt budgets).
- **`upsertBudget`:**
  - Support both `upsertBudget(target: BudgetTarget, amount: number)` and backward-compatible `upsertBudget(categoryId: string, amount: number)` (string overload maps to `{ kind: 'expense', categoryId }`).
  - Matches existing budget by `budgetTargetKey`, updates `amount: round2(amount)` or creates a new `Budget` record in one `commit('Simpan anggaran', ...)`.
- **Cascading delete (`deleteTransactions`):**
  - When a `payable_new` transaction is deleted, remove any debt budget referencing `debtId` in that deleted set inside the **same `commit()`** so Undo restores the debt, its payments, and its linked budget atomically.
- **`accountUsage` & `deleteAccount`:**
  - Only count/filter expense budgets matching `categoryId === id` (`budgetKind(b) === 'expense'`).

#### 5.1.3 Dedicated Domain Module (`src/accounting/budgets.ts`)
Re-exported from `src/accounting/reports.ts` so existing imports continue working.

**Core Types:**
```ts
export type BudgetStatusCode = 'safe' | 'warn' | 'over';

export interface BudgetLineBase {
  budgetId: string;
  key: string;             // budgetTargetKey
  kind: BudgetKind;
  label: string;           // account.name | 'Semua pembayaran hutang' | contact (or contact · desc)
  sublabel?: string;       // e.g., debt description or 'Semua hutang & pinjaman'
  icon: string;            // account.icon | 'handshake'
  color: string;           // account.color | 'var(--tone-payable)'
  sortCode: string;        // account.code for expense | '9-0000' (aggregate) or '9-<date>-<ref>' (specific)
  budget: number;
  actual: number;
  variance: number;        // round2(budget - actual)
  used: number;            // budget ? actual / budget : 0
}

export interface ExpenseBudgetLine extends BudgetLineBase {
  kind: 'expense';
  categoryId: string;
  account: Account;
}

export interface DebtBudgetLine extends BudgetLineBase {
  kind: 'debt';
  debtId?: string;           // undefined => aggregate ("Semua pembayaran hutang")
  debt?: DebtInfo;           // present when debtId is set
  isCreditPurchase: boolean; // true when debt origin has counter === 'category'
  isPaidOff: boolean;        // true when specific debt has remaining <= 0.005 as of actualTo
  /** false when a specific debt was already paid off before `from` and had zero activity in [from, actualTo] */
  activeInPeriod: boolean;
}

export type BudgetLine = ExpenseBudgetLine | DebtBudgetLine;
```

**Actual Calculation Rules (User-Confirmed & Accounting-Reconciled):**
1. **Expense Budget (`kind: 'expense'`):**
   - `actual = round2(act.d - act.c)` from journal entries on `categoryId` in `[from, actualTo]`, identical to existing behavior.
   - `budget = round2(bg.amount * prorateMonths(from, to))`.
2. **Per-Debt Budget (`kind: 'debt', debtId`):**
   - Origin transaction must exist and have `type === 'payable_new'`.
   - **Pre-origination periods *(designer call)*:** If `origin.date > to` (the viewed period ended before this debt existed), `budgetVsActual` omits this per-debt budget line completely. For multi-month periods spanning origination (`from < origin.date <= to`), prorate `budget` starting from `startOfMonth(origin.date)` rather than charging budget for months before the debt existed.
   - **`actual` *(designer call for non-cash wallet funding)*:** Sum of `principal + interest` (`amt + interest`, i.e., the credit to `tx.accountId` / sum of debt + interest debits) across all journalized `payable_pay` entries in `[from, actualTo]` whose `tx.parentId === debtId`, regardless of which wallet subtype (`cash`, `bank`, `ewallet`, `investment`, `credit_card`) funded the payment. This keeps debt budgets 100% consistent with `Hutang & Piutang` payment records.
   - **Paid-off lifecycle *(designer call)*:** Compute `debtInfos(b.data, actualTo)` for `isPaidOff` (`remaining <= 0.005`) and `debtInfos(b.data, addDays(from, -1))` to detect debts already paid off *before* the period began:
     - If paid off before `from` AND `actual === 0` in `[from, actualTo]`, set `activeInPeriod = false` (card remains visible on `/anggaran` with a `Lunas` badge and one-tap remove option, but is **excluded** from `budgetSummary` totals, Dashboard `budgetLeft` KPI, `BudgetsWidget`, and `budgetReport` so paid-off debts never inflate `Sisa anggaran` or `Sisa per hari`).
     - In the payoff month itself (or any month with `actual > 0`), `activeInPeriod = true` and the line counts normally. For multi-month `budgetReport` ranges extending past the payoff month, prorate only through `endOfMonth(lastPayment)`.
   - `isCreditPurchase`: `origin.counter === 'category'`.
   - **Labeling *(designer call)*:** If the same contact has multiple payables in `data.transactions`, display `${contact} — ${description}` when `description` is present so cards are distinguishable; otherwise `label = contact || 'Hutang'` and `sublabel = description || formatDate(origin.date)`.
3. **Aggregate Debt Payment Budget (`kind: 'debt', debtId: undefined` — `"Semua pembayaran hutang"`):**
   - Always has `activeInPeriod = true`.
   - Counts every journal entry in `[from, actualTo]` that represents a debt repayment:
     - All journalized `payable_pay` entries: full `principal + interest` (`amt + interest`) regardless of funding wallet subtype.
     - Any non-`payable_pay` transfer or manual journal entry where a funding wallet account (`WALLET_SUBTYPES`, excluding `credit_card` when paying a `credit_card`) has net credit (`walletOut > 0`) **and** a debt liability account with subtype in `{'payable', 'loan', 'long_term_liability'}` is debited (`debtDebit > 0`): counts `Math.min(walletOut, debtDebit + interestDebitInSameEntry)`.
   - **Excluded:**
     - Credit card bill payments (`cash` → `credit_card`): purchases were already recognized as expenses when swiped (`credit_card` is not in debt liability subtypes).
     - Standalone `expense` transactions to `Beban Bunga` (`SYS.interestExpense`) that do not debit a liability account: those belong to the `Beban Bunga` expense category so they are never double-counted between Expense and Debt Payment budgets.
   - **Credit-purchase debts (`payable_new` with `counter === 'category'`):** Payments (`payable_pay`) toward these debts ARE included in debt payment actuals because money is leaving a wallet to settle the liability, and both the budget form and breakdown sheet display a clear informational note explaining that the expense was already recognized upon credit purchase while this budget monitors repayment cash outflow *(user may override to exclude credit-purchase debts if desired)*.
4. **Status Semantics (User-Confirmed):**
   - Both expense budgets and debt payment budgets use **spending-limit status indicators**:
     - `used > 1` → `Melebihi` (`tone: 'neg'`, `Flame`, `var(--neg)`)
     - `used > Math.max(0.85, pace + 0.1)` → `Waspada` (`tone: 'warn'`, `TriangleAlert`, `var(--warn)`)
     - Otherwise → `Aman` (`tone: 'pos'`, `CircleCheck`, line color)
5. **De-Duplicated Summary (`budgetSummary(lines)`):**
   - Only includes lines where `line.kind === 'expense' || line.activeInPeriod`.
   - Expense subtotal: sum of `budget` and `actual` across all `kind === 'expense'` lines.
   - Debt subtotal:
     - If an aggregate debt budget (`debtId === undefined`) exists: `debtBudget = aggregate.budget`, `debtActual = aggregate.actual` (so specific per-debt budgets nested inside the aggregate are **not** double-counted in the grand total). If the sum of active specific per-debt budgets exceeds the aggregate budget, expose `specificExceedsAggregate: boolean` so the UI can show a subtle hint.
     - Otherwise (only specific per-debt budgets): sum `budget` and `actual` across active specific debt lines (mutually exclusive `debtId`s).
   - Combined hero totals: `totalBudget = expenseBudget + debtBudget`, `totalActual = expenseActual + debtActual`, `remaining = totalBudget - totalActual`, `overCount = activeLines.filter(l => l.used > 1).length`.
6. **Active-Month 3-Month Historical Average (`budgetThreeMonthAverage(b, target, month)`):**
   - Examines the 3 complete calendar months immediately preceding `month` (`month - 3`, `month - 2`, `month - 1`).
   - Computes actual for each of those 3 months using the exact same actual-calculation rule as `budgetVsActual`.
   - Divides the sum by the count of **active months** (months with `actual > 0.005`) rather than blindly dividing by 3, returning `{ average, activeMonths }`. Returns `{ average: 0, activeMonths: 0 }` when no history exists.
   - UI displays `"Rata-rata 3 bulan terakhir"` when `activeMonths === 3`, or `"Rata-rata ${activeMonths} bulan aktif terakhir"` when `activeMonths < 3`.
7. **Reconciled Breakdown (`budgetBreakdown(b, line, from, actualTo)`):**
   - Returns `BudgetBreakdownItem[]` sorted newest-first (`date` desc, then `sort` desc):
     ```ts
     export interface BudgetBreakdownItem {
       id: string;
       date: string;
       ref: string;
       title: string;
       subtitle: string;        // wallet name, contact, or split detail (e.g. "Pokok Rp X · Bunga Rp Y")
       amount: number;          // signed contribution to line.actual (+ increases actual, - refund/reversal)
       principal?: number;      // for debt payments
       interest?: number;       // for debt payments
       isRefund?: boolean;      // negative contribution on expense budget
       tx?: Transaction;        // present for user transactions (click opens editTx); omitted for auto depreciation/disposal
       source: EntrySource;
     }
     ```
   - **Invariant (verified by unit tests):** `round2(items.reduce((s, x) => s + x.amount, 0)) === line.actual` for every expense budget (including refunds, credit purchases, transfer fees on `SYS.bankFee`, loan interest on `SYS.interestExpense`, manual journals, depreciation, and disposal losses) and every debt payment budget (aggregate or specific).

#### 5.1.4 Integration with Reports, Integrity, Insights, Reminders, Dashboard, and Excel
- **`budgetReport(b, p, entityName)` (`src/accounting/reports.ts`):**
  - Expense section (`ANGGARAN PENGELUARAN` + `TANPA ANGGARAN` → `JUMLAH BEBAN`) preserves exact Income Statement expense total and Excel formula references (`st-b`, `st-u`, `t-all`).
  - Fix existing bug: add `accountId: x.a.id` on unbudgeted `uRows` so clicking unbudgeted rows in Reports navigates to the Ledger.
  - When debt payment budgets exist, append a blank separator and section `ANGGARAN PEMBAYARAN HUTANG` listing each debt budget line (`d-all`, `d-<debtId>`) and subtotal `Jumlah Pembayaran Hutang Beranggaran` (de-duplicated when both aggregate and specific exist, with explicit report note clarifying that debt principal is a balance-sheet cash outflow and excluded from `JUMLAH BEBAN`).
- **`checkIntegrity(data)` (`src/accounting/integrity.ts`):**
  - For expense budgets: warn with specific category name/ID if account is missing or no longer `type === 'expense'` (`code: 'budget-account'`).
  - For debt budgets with `debtId`: warn with clear message if the referenced `payable_new` transaction is missing or not a payable (`code: 'budget-debt'`).
- **`buildInsights` (`src/accounting/insights.ts`) & `computeReminders` (`src/hooks/useReminders.ts`):**
  - Both already call `budgetVsActual(b, from, monthEnd, to)` — update them to use `line.key`, `line.label`, `line.icon` so over-limit and high-pace warnings automatically cover debt payment budgets too.
- **Dashboard (`src/components/dashboard/core.tsx`):**
  - `KpiWidget` (`budgetLeft`): uses `budgetSummary(lines)` so combined remaining budget and `over` count never double-count aggregate + specific debt budgets.
  - `BudgetsWidget`: uses `line.key`, `line.label`, `line.icon`, `line.color`, `line.sortCode`, and shows a subtle type hint (`Hutang`) when rendering debt payment budget rows. Update empty-state and subtitle wording from `"kategori"` to `"anggaran"` when debt budgets are present.

---

### Pillar 2: Budgets Page & Budget Breakdown Sheet

#### 5.2.1 Budgets Page (`src/pages/Budgets.tsx`)
- **Date Synchronization & Future-Period Fix:**
  - Pass `actualTo = isCur ? today : to` into `budgetVsActual(b, from, to, actualTo)` and into `unbudgeted` calculation, matching Dashboard, Insights, and Reminders.
  - Replace hardcoded `'Periode selesai'` when `!isCur` with:
    - `month > today.slice(0, 7)` → `'Periode mendatang'` (and `pace = 0`, `daysLeft = 0`)
    - `month < today.slice(0, 7)` → `'Periode selesai'` (and `pace = 1`, `daysLeft = 0`)
- **Structured Layout (2 Budget Sections + Goals + Unbudgeted):**
  - **Hero Summary Card (`.budget-hero`):** Shows combined de-duplicated budget vs actual from `budgetSummary(lines)`. When both expense and debt budgets exist, displays a compact single-line breakdown beneath the main text (`Pengeluaran Rp X · Pembayaran hutang Rp Y`). Uses CSS classes instead of inline `style` font overrides.
  - **Section 1 — Anggaran pengeluaran:** Grid of expense budget cards (plus inline section header count/total when debt budgets also exist).
  - **Section 2 — Anggaran pembayaran hutang:** Shown whenever at least one debt payment budget exists (with a quick `+ Tambah` or accessible directly from the top `Tambah anggaran` button). Each card clearly distinguishes aggregate (`Semua pembayaran hutang`) vs specific payable (`contact`, optional description sublabel, and `Lunas` badge if paid off). If specific debt budgets exceed an aggregate cap, shows a subtle inline info note.
  - **Section 3 — Target tabungan** and **Section 4 — Pengeluaran tanpa anggaran** remain below, with clean section spacing.
- **Card Visual Refinement & Click Behavior:**
  - Tapping a budget card (`stretch-trigger`) opens **`BudgetBreakdownSheet`** (no longer opens `BudgetModal` directly).
  - Card `...` menu contains: `Lihat rincian`, `Ubah batas`, separator, `Hapus anggaran`.
  - Clean vertical hierarchy inside `.budget-card`: category/debt title (`line-height: 1.3`, `font-weight: 600`) with `margin-bottom: 6px` breathing room above the status `<Badge>` (`Aman` / `Waspada` / `Melebihi`), consistent `font-weight` tokens, and `pointer-events` properly isolated on `.row-front`.

#### 5.2.2 Budget Breakdown Sheet (`src/components/budgets/BudgetBreakdownSheet.tsx`)
Built on the existing `Sheet` primitive (`width={500}`, matching `Debts.tsx`):
- **Header (`.dsh-head`):** `IconTile` + title (`line.label`) + subtitle (`formatMonth(month)` or `1–DD Mon YYYY` for current month) + Close button (`X`).
- **Hero Summary (`.dsh-hero`):**
  - Status `<Badge>` (`Aman` / `Waspada` / `Melebihi`), plus `Lunas` badge when applicable.
  - Big realized amount (`formatMoney(line.actual)`) + `"dari ${formatMoney(line.budget)}"`.
  - `<Progress>` bar with `pace` marker.
  - 3-column summary grid (`.dsh-grid`):
    1. `Sisa` / `Melebihi` (`Math.abs(line.variance)`)
    2. `Terpakai` (`formatPercent(line.used, 0)`)
    3. `Rata-rata 3 bln` (or `Rata-rata N bln` when fewer active months; `—` if none)
  - For specific debt budgets: compact link row showing remaining debt principal (`Sisa pokok hutang Rp X`) linking to `/hutang-piutang`.
  - For credit-purchase debt budgets (`isCreditPurchase`): subtle `.note-box` explaining accrual vs cash-outflow tracking.
- **Itemized Breakdown (`Rincian transaksi` / `Rincian pembayaran`):**
  - Displays all `BudgetBreakdownItem` rows for `[from, actualTo]` with date, title, subtitle (wallet / principal+interest split), and signed amount (refunds highlighted in positive/green with `Pengembalian dana` tag).
  - Tapping any transaction-backed item calls `editTx(item.tx)` directly (the breakdown updates reactively after edit).
  - Non-transaction system entries (depreciation, asset disposal) show a clear system badge (`Otomatis`) and link to `/aset`.
  - Empty state when no entries exist in the period.
  - Link button at end of list: `Lihat di Transaksi` (`/transaksi?kategori=<id>&bulan=<month>` for expense; `/transaksi?jenis=debt_payment&bulan=<month>` for aggregate debt; `/transaksi?jenis=debt_payment&induk=<debtId>&bulan=<month>` for specific per-debt budgets) and (in accountant mode) `Buka Buku Besar` for expense accounts.
- **Sticky Sheet Footer (`.dsh-foot`):**
  - Secondary button: `Ubah batas` → closes sheet (or transitions cleanly) and opens `BudgetModal` pre-filled for this budget.
  - Primary button:
    - Expense budget: `Catat pengeluaran` → `openTx({ type: 'expense', categoryId: line.categoryId })`
    - Active specific debt budget: `Bayar hutang` → `openTx({ type: 'payable_pay', parentId: line.debtId, amount: line.debt.remaining })`
    - Aggregate debt budget: `Bayar hutang` → `openTx({ type: 'payable_pay' })`
    - Paid-off specific debt budget: omits `Bayar hutang` and keeps `Ubah batas` + `Hapus anggaran`.

#### 5.2.3 Budget Create/Edit Modal (`BudgetModal` in `src/pages/Budgets.tsx`)
- Adds a top `<Segmented>` selector when creating a new budget: `Pengeluaran` vs `Pembayaran hutang` (locked/read-only when editing an existing budget).
- When `Pengeluaran`: existing searchable category `<Select>` (`useCategoryOptions('expense')`).
- When `Pembayaran hutang`: searchable `<Select>` (`usePayableBudgetOptions`) with:
  - First option: `Semua pembayaran hutang` (value `'__all__'`, description `"Seluruh cicilan pokok & bunga hutang bulanan"`).
  - Followed by open payables from `useOpenDebtOptions('payable')` (plus the currently edited `debtId` even if paid off), flagging credit-purchase origin in the helper note when selected.
- Monthly limit `<AmountInput>` + smart suggestion button using `budgetThreeMonthAverage()` (active-month denominator instead of fixed `/ 3`).

---

### Pillar 3: Android Edge-to-Edge Insets, Mobile/Web UI Polish & Typography System

#### 5.3.1 Android Native Insets & Status Bar Contrast (`capacitor.config.ts`, `src/hooks/useApp.ts`, `MainActivity.java`, `android/app/build.gradle`)
1. **Capacitor 8 Built-in `SystemBars` Configuration (`capacitor.config.ts`):**
   - Rely on Capacitor 8's built-in core `SystemBars` plugin (`@capacitor/core` 8.6.2) instead of attaching a competing custom `OnApplyWindowInsetsListener` in `MainActivity.java` (preventing plugin-name collisions, double padding, or broken IME/keyboard resize handling).
   - Explicitly declare `plugins: { SystemBars: { insetsHandling: 'css' } }` in `capacitor.config.ts` so Capacitor injects `--safe-area-inset-top`, `--safe-area-inset-bottom`, `--safe-area-inset-left`, and `--safe-area-inset-right` on all Android WebViews alongside standard `env(safe-area-inset-*)` (paired with `viewport-fit=cover` already present in `index.html`).
2. **Dynamic Status Bar & Navigation Bar Icon Contrast (`src/hooks/useApp.ts`, `MainActivity.java`):**
   - In `useThemeSync()`, whenever the resolved app theme changes and `Capacitor.isNativePlatform()` is true, call Capacitor 8's built-in `SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })` (verifying exact enum polarity against `@capacitor/core` type definitions during build so light app theme gets dark status-bar icons on `#F5F5F7` and dark app theme gets light icons on `#0B0C0A`).
   - In `MainActivity.java`, keep cold-start status bar icon contrast aligned with system night mode without replacing Capacitor's WebView window-insets listener.
3. **Version Sync (`android/app/build.gradle`):**
   - Update `versionName "1.0"` to `"1.4.0"` to match `package.json`.

#### 5.3.2 Safe-Area Token System & Scrolled Topbar Solid Surface (`tokens.css`, `base.css`, `layout.css`, `ui.css`)
- Define canonical safe-area tokens in `src/styles/tokens.css` combining native CSS `env()` and Capacitor 8 `SystemBars` injected `--safe-area-inset-*` custom properties:
  ```css
  --safe-top: max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px));
  --safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px));
  --safe-left: max(env(safe-area-inset-left, 0px), var(--safe-area-inset-left, 0px));
  --safe-right: max(env(safe-area-inset-right, 0px), var(--safe-area-inset-right, 0px));
  ```
- Apply `--safe-top` consistently to every top-anchored surface:
  - `.topbar`: `padding-top: var(--safe-top); height: calc(var(--topbar-h) + var(--safe-top));`
  - Sticky elements below topbar (`.tx-day-head`, `.dash-editbar`, `.cal-side`, sticky table headers): offset by `calc(var(--topbar-h) + var(--safe-top))`.
  - Full-height overlays: `.sidebar` (drawer on ≤960px), `.sheet` (`.dsh-head`), `.modal-dialog` (on mobile full-screen sheet/modal), `.palette-dialog`, `.toast-stack` top/bottom offsets.
- Apply `--safe-bottom` consistently to `.tabbar`, `.page` bottom padding (ensuring the last budget card and its actions clear the floating `+` FAB comfortably — minimum `calc(var(--tabbar-h, 64px) + 28px + var(--safe-bottom))`), `.dsh-foot`, and `.modal-foot`.
- **Root-cause fix for scrolled topbar ghost text bleed (`base.css`):**
  - Inside `@media (pointer: coarse), (max-width: 960px)`, set `:root { --glass: var(--canvas); }` (matching `:root[data-perf='lite']`) instead of setting `.topbar::before { background: var(--canvas); }` (which was silently overridden by `layout.css` imported later in `main.tsx`). Now `.topbar.scrolled::before` renders at 100% solid `var(--canvas)` with zero text bleed behind it on mobile and Android.

#### 5.3.3 Touch Hover Gating & CSS Cleanup (`layout.css`, `ui.css`, `pages.css`, `widgets.css`, `dashboard.css`)
- Wrap pointer-only `:hover` background/transform rules (`.tb-btn:hover`, `.budget-card:hover`, `.tx-row:hover`, `.wallet-card:hover`, `.debt-row:hover`, `.mini-row:hover`, `.sb-item:hover`, `.btn:hover`, `.icon-btn:hover`, etc.) inside `@media (hover: hover)` so touch taps never leave stuck gray circles or lifted cards on Android/iOS, while preserving `:active` tactile feedback and `:focus-visible` rings.
- Replace undefined `var(--ring)` in `layout.css:740` with `var(--focus-ring)`.
- Remove duplicate CSS properties/dead selectors:
  - `ui.css:238-242` duplicate `color` and `!important` on `.field-label .opt`.
  - `pages.css:304-308` duplicate `width` on `.mini-row`.
  - `dashboard.css:439-444` fix dead `.segmented` selector to `.seg`.
- Fix `index.html:84-91` `.intro-name` missing `font-family` (use system sans stack matching `--font-sans` so intro never flashes serif).

#### 5.3.4 Typography Scale & Icon Picker Polish
- Standardize font weights across all stylesheets to a strict 4-step scale matching Inter / system font cuts:
  - `400` (regular body), `500` (medium labels/buttons/tabs), `600` (semibold headings/card titles/numbers), `700` (bold totals/strong emphasis).
  - Replace scattered intermediate weights (`520`, `540`, `560`, `580`, `590`, `620`, `640`, `650`, `660`, `680`, `750`, `760`) with the nearest canonical step (`500`, `600`, or `700`).
- Remove inline `style={{ fontSize, fontWeight }}` in `Budgets.tsx` and move to semantic classes in `pages.css`.
- Fix `Pickers.tsx:68` selected icon contrast (add `color: '#fff'` or contrast-safe tint when selected so dark icons don't vanish on dark swatch fills) and replace broken `'party'` icon ID with `'party-popper'` in `Pickers.tsx:46` / `icons.tsx:88`.

---

### Pillar 4: Whole-System Root-Cause Bug Fixes

All bugs below are verified against source files and fixed at root cause with regression tests:

#### 5.4.1 Accounting, Reports & Export
1. **`src/accounting/periods.ts` (`previousPeriod`):** Fix Q1 (`Jan 1 – Mar 31`) comparison so it compares against Q4 of the previous year (`Oct 1 – Dec 31`) instead of Q1 of the previous year; preserve full-year and arbitrary-range fallbacks.
2. **`src/accounting/goals.ts` (`goalProgress`):** Deduplicate `goal.accountIds` before summing balances; mark status `'unlinked'` when all configured `accountIds` refer to missing accounts; treat `target <= 0` safely instead of reporting `'done'`.
3. **`src/components/tx/txDisplay.ts` (`txFlow`) & `src/pages/Transactions.tsx`:**
   - Fix `txFlow` for refunds (`income` to expense account reduces expense; `expense` to revenue account reduces income) and credit purchases/sales (`payable_new` / `receivable_new` with `counter === 'category'` reflect expense/income accurately).
   - Fix `Transactions.tsx` category filter to also match `payable_pay.interest` (for `SYS.interestExpense`), `transfer.fee` (for `SYS.bankFee`), and manual journal lines referencing the filtered category.
   - Add granular debt-payment drill-down filter support in `Transactions.tsx` *(designer call)*: parse `?jenis=debt_payment` and optional `&induk=<debtId>` (alongside `?bulan=<month>`), matching the exact shared predicate from `src/accounting/budgets.ts` (all `payable_pay` for that `debtId`, or all debt-payment transactions matching the aggregate budget when `&induk` is omitted), surfaced as a removable filter chip in `.active-filters` (`Jenis: Pembayaran hutang ×`, `Hutang: <contact> ×`) and integrated into `hasFilter` / `clearFilters`.
4. **`src/export/excel.ts`:**
   - `writeTransactions`: use `defaultDescription(t, ctx)` fallback when `t.description` is empty; classify `transfer.fee` as cash outflow rather than neutral.
   - `writeClosing`: preserve `l.name` / `l.code` fallback when `accountId` is absent.
   - `writeAssets`: append `otherRows` *before* `fitColumns` and fix empty-state message when non-depreciable/other assets exist.
   - `writeJournal`: align balance tolerance to `< 0.005` (`isZero`) instead of `< 1`.
   - `exportPackage`: normalize `'1900-01-01'` / `'2999-12-31'` sentinels before displaying subtitle dates.
   - `writeTable`: handle formula-object cells in `SUBTOTAL` generation without silently skipping them.

#### 5.4.2 Input & Form Controls
5. **`src/lib/amount.ts` & `src/components/ui/AmountInput.tsx`:**
   - Reject division by zero (`100+50/0` returns `null`/invalid instead of `100`), reject malformed trailing/consecutive tokens (`100++200`, `100)500`, unmatched parentheses), and support unary `+`.
   - Guard `amountToDisplay` against scientific notation (`v >= 1e21`) so it never throws `TypeError`.
   - Fix `normalizePasted` for strings with 3+ decimal digits (`1,250,000.500` → `1250000,50`, `1250.500` → `1250,50`).
   - **Decimal vs thousands-separator key rule *(designer call)*:** Preserve Indonesian standard throughout `AmountInput` (matching `ShortcutsDialog.tsx` `"Koma untuk desimal"`): `,` is the sole decimal key while typed `.` remains an ignored thousands separator so manually typing `50.000` can never silently turn into `Rp 50`; pasted English-format decimals (`1250.50`) continue to auto-convert via `normalizePasted`.
   - In `AmountInput.tsx`: skip `el.select()` on focus on coarse/touch pointers (prevents Android Cut/Copy/Paste toolbar popup and focus jumps while keeping select-all on desktop); make `scale()` (`k`/`r`/`j`) a no-op when the preceding number is `0` so it never wipes `"0"` to empty.
6. **`src/components/ui/AutoComplete.tsx`:**
   - Prevent premature popover unmount on touch tap (use `onPointerDown` `e.preventDefault()` on option rows or handle selection before blur unmount) so tapping suggestions works reliably on Android/iOS.
   - Hide `"↑↓ lalu ↵"` keyboard hint on coarse/touch pointers (`@media (hover: none)`).
7. **`src/components/ui/Select.tsx`:**
   - Ensure keyboard navigation works when `searchable` is true even on touch-capable laptops (bind `onKeyDown` on the list container as well as search input); fix `Tab` on empty filtered list so focus is never trapped; ensure `Shift+Tab` moves focus backward cleanly.
8. **`src/components/ui/DatePicker.tsx`:**
   - Keep `focused` date and `aria-activedescendant` synchronized when navigating previous/next month.
   - Move `+30 hari` quick chip to `clearable` pickers (due dates) rather than `!clearable` (transaction dates).
   - Use `useToday()` instead of stale `todayISO()` module evaluation.
   - Add proper ARIA `role="row"` and `role="gridcell"` structure inside the calendar grid.
9. **`src/components/ui/Segmented.tsx`:**
   - Guard against empty `options` array and ensure when `value` doesn't match any option, the first option remains focusable (`tabIndex={0}`).
10. **`src/components/ui/PeriodPicker.tsx`:**
    - Suppress duplicate `"Tahun buku berjalan"` option when `fiscalYearStartMonth === 1` (identical to `"Tahun ini"`).
    - Add keyboard navigation and initial focus management in the preset popover.

#### 5.4.3 Dialogs, Feedback, Focus & Navigation
11. **`src/components/ui/Confirm.tsx`:**
    - When `tone === 'danger'`, auto-focus the **Cancel** button (not the destructive red Confirm button) and prevent Enter from accidentally confirming destruction.
    - Retain the last rendered `ConfirmOpts` during exit animation so the modal does not flash empty for 200ms while closing.
12. **`src/components/ui/Toasts.tsx`:**
    - Replace 60fps `requestAnimationFrame` timeout loop with pause-aware `setTimeout` + CSS progress animation; delay `hidePopover()` until after exit animation finishes so toasts animate out smoothly.
13. **`src/components/ui/Tooltip.tsx`:**
    - Render the accepted `kbd` prop when provided; skip hover tooltip opening on touch-only pointers; auto-close tooltip when child becomes disabled or unmounted.
14. **`src/lib/layers.ts`, `src/lib/focus.ts`, `src/components/ui/SlidePill.tsx`:**
    - `layers.ts`: ignore `Escape` while `isImeComposing(e)` is true.
    - `focus.ts`: account for `.modal-head` / `.modal-foot` height and `.dsh-body` scroll container inside `<Sheet>` in `ensureInModalViewport`.
    - `SlidePill.tsx`: clean up module-level `Map` entries on unmount so `useId()` keys never accumulate indefinitely.
15. **`src/app/hotkeys.ts`, `src/pages/Transactions.tsx`, `src/app/NativeBack.tsx`, `src/components/ui/ErrorBoundary.tsx`:**
    - Resolve `/` hotkey conflict on `/transaksi` (either let `/transaksi` own `/` when on that route or consistently open Command Palette while keeping `Ctrl/Cmd+K` global — **proposal:** `/` focuses local page search on `/transaksi` without also opening Command Palette, and opens Command Palette elsewhere; enforce `!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey` consistently on single-letter shortcuts so `Shift+N`/`Shift+H` don't misfire).
    - Register `useLayer` for Dashboard Customize mode and `<Intro />` so Android hardware Back exits Customize mode or skips Intro instead of minimizing the app.
    - `ErrorBoundary.tsx`: handle corrupted JSON in emergency backup download safely (catch parse errors, export raw string fallback if unparseable, never report `{ data: null }` as success, and attach `.catch()` to `saveFile`).

#### 5.4.4 Pages & Dashboard
16. **`src/pages/Wallets.tsx` (`ReconcileModal`):** When the user changes the reconciliation date and hasn't manually edited `actual` yet, keep `actual` synchronized with the newly calculated `book` balance.
17. **`src/pages/CalendarPage.tsx`:** Add proper dependency array to the `keydown` `useEffect` so it doesn't re-register listeners on every render.
18. **`src/app/dashboardLayout.ts`, `src/components/dashboard/common.tsx`, `src/components/dashboard/Customize.tsx`:**
    - `sanitizeLayout`: deduplicate `r.kpi` entries; `isLegacyDefault`: check array lengths before element comparison.
    - `Delta` (`common.tsx`): check `unit === 'points'` threshold (`< 0.0005`) before `isZero` (`< 0.005`); suppress raw monetary values in `title` tooltip when `hideAmounts` (privacy mode) is enabled.
    - `useWidgetDrag` (`Customize.tsx`): track active `e.pointerId` and ignore secondary touch pointers during drag.

---

### Pillar 5: Systematic Indonesian Copy, Terminology & Personal-Name Cleanup

#### 5.5.1 Canonical UI Glossary (Applied Consistently Across All User-Facing Surfaces)
| Concept | Standard Indonesian Term | Replaces / Unifies |
| --- | --- | --- |
| Sidebar navigation | **Bilah sisi** | `sidebar`, mixed `bilah sisi`/`sidebar` |
| Input field | **Kolom** | `field` |
| Dashboard panel/card | **Panel** | `widget` (in user-facing copy; code identifiers stay domain-clear) |
| Digital wallet | **Dompet digital** | `e-wallet` |
| Cashback / expense reversal | **Pengembalian dana** | `refund` |
| Reset action | **Atur ulang** | `Reset` |
| Storage location (Web/APK) | **Perangkat ini** (or contextual `peramban` only on web downloads) | `browser` / `peramban` in APK-visible copy |
| Variance | **Selisih** | `Varians` |
| Fixed asset register | **Daftar aset** | `Register aset` |
| Description field | **Keterangan** | `Deskripsi` (in `AccountModal.tsx`) |
| Errors / problems | **Masalah** (or **Kesalahan** for validation) | `galat` in casual UI text |
| Low-end device hint | **Perangkat dengan memori terbatas** | `HP spek rendah` |
| Wallets page & actions | Page: **Dompet & Rekening**, CTA: **Tambah dompet**, Modal: **Tambah dompet** | Mismatched `Tambah akun` / `Tambah Dompet` |
| Debt spelling | **Hutang** | Preserved consistently across entire app |
| Double-entry explanation | **Pembukuan berpasangan** | `double-entry` in user-facing text |

#### 5.5.2 Specific Copy & Neutrality Fixes
- **`src/pages/Settings.tsx:423`:** Replace the personal name placeholder on the profile name input with neutral `"Nama lengkap"`.
- **`src/app/settings.ts:7`:** Align the `Preferensi` section description with its actual controls (move mention of `"privasi nominal"` to `Tampilan`, where `hideAmounts` lives).
- **`src/components/ui/Pickers.tsx:65-66`:** Map every icon option to a clean Indonesian `aria-label`/`title` instead of exposing raw English glyph slugs (`wallet`, `shopping-bag`, `party-popper`, etc.).
- **Sentence casing & punctuation:** Unify button labels, modal titles, section subtitles, empty states, and confirmation dialogs to concise sentence case (`Tambah dompet`, `Ubah anggaran`, `Hapus anggaran`) without redundant double phrasing.
- **Sample data (`src/store/sample.ts`):** Retain realistic Indonesian bank and digital-wallet demo accounts in sample fixtures, while keeping all UI code, comments, and schemas free of personal names or non-project references.

---

## 6. Decisions Summary: User-Confirmed vs Designer Calls

### User-Confirmed Decisions
- Debt payment budgets support **both** aggregate (`Semua pembayaran hutang`) and per-active-debt (`Per hutang aktif`) budgets.
- Debt payment realization measures **principal + interest** (`payable_pay` cash outflow).
- Debt payment budgets use **spending-limit status indicators** (`Aman`, `Waspada`, `Melebihi`).
- Clicking any budget card opens a **Breakdown Sheet** showing itemized transactions/payments and quick actions.
- Architecture follows **Approach 1** (unified backward-compatible `Budget` model + dedicated `src/accounting/budgets.ts` + Capacitor 8 `SystemBars` safe-area insets + whole-system fixes).
- Realistic Indonesian bank/digital-wallet names in sample data are kept; personal names and non-project references are removed.

### Designer Calls (Open for User Override Before Implementation)
1. **Credit-purchase debts (`payable_new` with `counter === 'category'`):** Included in debt payment budget actuals (monitoring cash outflow) with an informational note in the setup modal and breakdown sheet explaining that the expense was already recognized when purchased on credit.
2. **Aggregate + per-debt de-duplication:** When both `Semua pembayaran hutang` and one or more per-debt budgets exist, Hero summary totals and Dashboard `budgetLeft` KPI use the aggregate figure for the debt portion (never double-counting nested per-debt limits/actuals), while individual cards still track and alert independently.
3. **Paid-off & pre-origination per-debt lifecycle:** Specific per-debt budgets are omitted for periods ending before the debt's origination date; once paid off in a prior month with zero activity in the viewed month, the card stays visible on `/anggaran` with a `Lunas` badge and quick remove option, while being excluded from Hero totals (`Sisa anggaran`, `Sisa per hari`), Dashboard KPI, and `budgetReport` so paid-off debts never inflate available budget.
4. **Non-cash wallet debt payments (`investment` / `credit_card`):** Any journalized `payable_pay` transaction counts its full `principal + interest` toward debt payment budgets regardless of which wallet funded it, staying 100% consistent with `Hutang & Piutang`.
5. **Android safe areas via Capacitor 8 built-in `SystemBars`:** Uses `@capacitor/core` 8.6.2's built-in `SystemBars` (`insetsHandling: 'css'` + `SystemBars.setStyle()`) instead of a custom Java inset listener, preventing double padding or IME resize conflicts.
6. **`AmountInput` `.` key rule:** Keeps `,` as the sole decimal key and treats typed `.` as an ignored thousands separator so manually typing `50.000` never accidentally turns into `Rp 50` (pasted English decimals like `1250.50` still auto-convert).
7. **Transactions drill-down for debt budgets:** Adds a removable `?jenis=debt_payment` (and optional `&induk=<debtId>`) filter chip in `Transactions.tsx` using the shared matcher from `budgets.ts` so `Lihat di Transaksi` matches the Breakdown Sheet 1:1.
8. **`/` hotkey behavior:** Focuses local search on `/transaksi` (without simultaneously opening Command Palette) and opens Command Palette on all other routes; `Ctrl/Cmd+K` always opens Command Palette globally.
9. **Breakdown Sheet `Bayar hutang` pre-fill:** For an active per-debt budget, pre-fills `parentId` and `amount = remaining` (matching `Debts.tsx`'s `Bayar` button); for an aggregate debt budget, opens `payable_pay` ready to pick which debt to pay.
10. **Canonical UI glossary:** Standardizes on `Bilah sisi`, `Dompet digital`, `Pengembalian dana`, `Panel`, `Atur ulang`, `Selisih`, `Daftar aset`, `Keterangan`, and `Perangkat ini`.

---

## 7. What Is Left to the Builder

- Exact internal helper decomposition inside `src/accounting/budgets.ts` and `src/components/budgets/BudgetBreakdownSheet.tsx`.
- Exact cold-start status bar icon contrast initialization inside `MainActivity.java` alongside Capacitor 8's built-in `SystemBars` plugin (verified against `@capacitor/core` 8.6.2 type definitions so light/dark icon polarity is accurate on Android 10–16).
- Exact spacing/padding fine-tuning within existing CSS token steps (`--radius-*`, `--fs-*`, `--dur-*`) and layout breakpoints (`640px`, `760px`, `960px`).
- Exact Vitest test file grouping and fixtures for regression coverage.

---

## 8. Verification & Hygiene Audit Strategy

1. **Automated Unit & Regression Tests (`npm test`):**
   - `src/accounting/__tests__/budgets.test.ts`: expense budgets, aggregate debt budgets, per-debt budgets, credit-card exclusion, credit-purchase debt note & actuals, de-duplicated summary totals, active-month 3-month average, breakdown-to-actual sum equality (including refunds, transfer fees, loan interest, manual journals, depreciation, and debt payments), paid-off & cascading-delete behavior, and backward-compatible `normalizeData`.
   - `src/accounting/__tests__/regression.test.ts` & targeted tests for `amount.ts`, `periods.ts` (Q1 → prior Q4), `goals.ts`, `txDisplay.ts`, `integrity.ts`, `excel.ts`, and `dashboardLayout.ts`.
2. **Type Check & Production Build:**
   - `npm run check` (`tsc --noEmit` + lint/checks) and `npm run build` must succeed with zero errors.
   - Verify Android project Gradle configuration syntax and Java compilation readiness (if Android SDK/Gradle is present, run Gradle compile check; otherwise verify Java imports/signatures rigorously against Capacitor 8 & AndroidX dependencies in `android/app/build.gradle`).
3. **Interactive Visual & Responsive Verification:**
   - Verify web desktop (light & dark themes) and mobile viewport (~390px touch simulation) for Budgets page, Breakdown Sheet, BudgetModal (both Expense and Debt Payment modes), scrolled Topbar solidity, touch hover non-stickiness, and typography hierarchy.
4. **Mandatory Pre-Completion Hygiene Audit:**
   - Run grep audit across all modified/created files verifying zero personal names, zero AI/agent/model names, zero session/phase/batch leakage, and zero local absolute paths.

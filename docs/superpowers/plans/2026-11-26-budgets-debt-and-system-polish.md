# Debt Payment Budgets, Breakdown Sheet, Android/Web UI Polish & System Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add aggregate and per-debt monthly debt payment budgets with interactive reconciled breakdown sheets, fix Android edge-to-edge safe-area/topbar/hover/typography defects, resolve 18 verified cross-system bugs, standardize Indonesian UI copy, and sync the Android Capacitor build.

**Architecture:** Extend `Budget` backward-compatibly (`kind?: 'expense' | 'debt'`, optional `debtId`) and extract all budget math, breakdown reconciliation, active-month 3-month averaging, and de-duplicated totals into a dedicated pure module `src/accounting/budgets.ts`. Pair that with Capacitor 8's built-in `SystemBars` (`insetsHandling: 'css'` + `SystemBars.setStyle`) for Android safe areas and root-level CSS token/hover/typography fixes.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Zustand 5, Framer Motion 13, Recharts 3, ExcelJS 4, Vitest 5, Capacitor 8 (`@capacitor/core` 8.6.2, `@capacitor/android` 8.6.2).

**Spec:** `docs/superpowers/specs/2026-11-25-budgets-debt-and-system-polish-design.md`

## Global Constraints
- Keep `neraca.data` and `neraca.prefs` storage keys and existing `Budget` records (`{ id, categoryId, amount, createdAt }`) 100% backward compatible.
- Preserve double-entry invariants: `checkIntegrity` balanced, `budgetReport` `JUMLAH BEBAN` equals Income Statement expenses.
- Use only existing glyphs from `src/lib/glyphs.tsx` (do not add glyphs requiring `hb-subset` rebuild; `node scripts/uicons.mjs --check` must pass).
- Respect privacy mode (`hideAmounts`) on all monetary displays and tooltips (`.money-val`, no raw monetary amounts in `title` when hidden).
- Keep all repository code, comments, and docs free of personal names, non-project references, local absolute paths, and chat/session artifacts.

## Review Focus
1. **Aggregate + specific debt budget coexistence:** When both `Semua pembayaran hutang` and a per-debt budget exist, `budgetSummary` must never double-count limits or actuals in Hero totals or Dashboard `budgetLeft` KPI (`Task 2`).
2. **Pre-origination & post-payoff per-debt budget lifecycle:** A specific debt budget must be omitted for periods ending before `origin.date` and excluded from `budgetSummary` / Dashboard KPI / `budgetReport` in months after payoff with zero activity (`Task 2`).
3. **Breakdown-to-actual sum reconciliation:** Sum of signed items returned by `budgetBreakdown` must equal `line.actual` to the rupiah across refunds, credit purchases, transfer fees, loan interest, manual journals, depreciation, and `payable_pay` funded from any wallet subtype (`Task 2`).
4. **Indonesian numeric input safety:** Typing `50.000` with dots in `AmountInput` must stay `50.000` (not `50,00`), divide-by-zero (`100+50/0`) and malformed tokens (`100++200`) must return `null`, and `amountToDisplay(1e21)` must not throw (`Task 4`).
5. **Android Capacitor 8 `SystemBars` non-collision:** Use built-in `SystemBars` (`insetsHandling: 'css'`, `initialViewportFitValueHint: 'cover'`, `SystemBars.setStyle`) without attaching a competing `OnApplyWindowInsetsListener` in `MainActivity.java`, while combining `env(safe-area-inset-*)` and `var(--safe-area-inset-*)` in CSS (`Task 6`).

---

### Task 1: Budget Data Model, Normalization & Store Actions

**Files:**
- Modify: `src/accounting/types.ts`
- Modify: `src/store/data.ts`
- Create: `src/accounting/__tests__/budgets.test.ts`

**Interfaces:**
- Produces in `src/accounting/types.ts`:
  - `export type BudgetKind = 'expense' | 'debt';`
  - `export interface Budget { id: string; kind?: BudgetKind; categoryId?: string; debtId?: string; amount: number; createdAt: number; }`
  - `export type BudgetTarget = { kind: 'expense'; categoryId: string } | { kind: 'debt'; debtId?: string };`
- Produces in `src/store/data.ts`:
  - `export function budgetKind(b: Pick<Budget, 'kind'>): BudgetKind`
  - `export function budgetTargetKey(b: Pick<Budget, 'kind' | 'categoryId' | 'debtId'>): string`
  - `export function upsertBudget(target: string | BudgetTarget, amount: number): string`

- [ ] **Step 1: Write failing tests in `src/accounting/__tests__/budgets.test.ts`**
  Cover:
  - `normalizeData` preserves legacy `{ id, categoryId, amount, createdAt }` budgets, accepts `{ kind: 'debt', amount }` (aggregate) and `{ kind: 'debt', debtId, amount }` (specific), deduplicates by target key keeping last, and drops `amount <= 0` or expense budget with empty `categoryId`.
  - `upsertBudget` accepts both legacy string `categoryId` and `BudgetTarget` (expense, aggregate debt, specific debt) and updates existing targets in place.
  - `deleteTransactions([payableId])` cascades deletion of any debt budget with `debtId === payableId` in the same undoable snapshot, and `undo()` restores both.
  - `accountUsage(accId)` ignores debt budgets and `deleteAccount(accId)` leaves debt budgets intact.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/accounting/__tests__/budgets.test.ts`
  Expected: FAIL (missing `budgetKind` / `budgetTargetKey` / debt budget normalization).

- [ ] **Step 3: Implement `Budget` model & store updates**
  Update `src/accounting/types.ts` and `src/store/data.ts` (`budgetKind`, `budgetTargetKey`, `normalizeData`, `upsertBudget`, `deleteTransactions`, `accountUsage`, `deleteAccount`).

- [ ] **Step 4: Run test suite to verify pass**
  Run: `npm run check`
  Expected: PASS (0 type errors, all tests passing).

- [ ] **Step 5: Commit**
  ```bash
  git add src/accounting/types.ts src/store/data.ts src/accounting/__tests__/budgets.test.ts
  git commit -m "feat: perluas model anggaran untuk kategori pembayaran hutang"
  ```

---

### Task 2: Budget Domain Engine (`src/accounting/budgets.ts`) & System Consumers

**Files:**
- Create: `src/accounting/budgets.ts`
- Modify: `src/accounting/reports.ts`
- Modify: `src/accounting/integrity.ts`
- Modify: `src/accounting/insights.ts`
- Modify: `src/hooks/useReminders.ts`
- Modify: `src/components/dashboard/core.tsx`
- Modify: `src/accounting/__tests__/budgets.test.ts`

**Interfaces:**
- Consumes: `Budget`, `BudgetTarget`, `budgetKind`, `budgetTargetKey` from Task 1; `Books`, `activity`, `debtInfos` from `src/accounting/reports.ts`.
- Produces in `src/accounting/budgets.ts` (re-exported from `src/accounting/reports.ts`):
  - `ExpenseBudgetLine`, `DebtBudgetLine`, `BudgetLine`, `BudgetSummary`, `BudgetBreakdownItem`, `BudgetStatusCode`
  - `budgetVsActual(b: Books, from: string, to: string, actualTo?: string): BudgetLine[]`
  - `budgetSummary(lines: BudgetLine[]): BudgetSummary`
  - `budgetThreeMonthAverage(b: Books, target: BudgetTarget, month: string): { average: number; activeMonths: number }`
  - `budgetBreakdown(b: Books, line: BudgetLine, from: string, actualTo: string): BudgetBreakdownItem[]`
  - `matchesDebtPaymentBudget(b: Books, tx: Transaction, debtId?: string): boolean`
  - `budgetStatus(used: number, pace: number): BudgetStatusCode`

- [ ] **Step 1: Add failing tests in `src/accounting/__tests__/budgets.test.ts`**
  Cover all Review Focus items #1–#3 plus:
  - Expense & debt payment `budgetVsActual` (aggregate + specific per-debt + `payable_pay` principal+interest from bank/investment/credit_card wallets + direct loan transfer/journal + credit-card bill transfer excluded + standalone `Beban Bunga` expense excluded from debt budget).
  - Pre-origination omission (`to < origin.date`), origination-month proration, post-payoff zero-activity `activeInPeriod = false` excluded from `budgetSummary` & `budgetReport`, payoff-month activity `activeInPeriod = true`.
  - De-duplicated `budgetSummary` when aggregate + specific debt budgets coexist, plus `specificExceedsAggregate`.
  - `budgetThreeMonthAverage` divides by active months (`1`, `2`, `3`), returns `0` when inactive.
  - `budgetBreakdown` sum === `line.actual` across regular expense, refund (`income` → expense), credit purchase (`payable_new(category)`), `transfer.fee` on `SYS.bankFee`, `payable_pay.interest` on `SYS.interestExpense`, manual journal, asset depreciation, and debt payments.
  - `budgetReport` keeps `JUMLAH BEBAN` reconciled with Income Statement, sets `accountId` on unbudgeted `uRows`, and appends `ANGGARAN PEMBAYARAN HUTANG` section when debt budgets exist.
  - `checkIntegrity` reports specific names/refs for invalid expense (`budget-account`) and orphaned debt (`budget-debt`) budgets.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/accounting/__tests__/budgets.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/accounting/budgets.ts` and wire `reports.ts`, `integrity.ts`, `insights.ts`, `useReminders.ts`, `dashboard/core.tsx`**

- [ ] **Step 4: Run full check**
  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/accounting/budgets.ts src/accounting/reports.ts src/accounting/integrity.ts src/accounting/insights.ts src/hooks/useReminders.ts src/components/dashboard/core.tsx src/accounting/__tests__/budgets.test.ts
  git commit -m "feat: tambahkan mesin anggaran pembayaran hutang, rincian, dan integrasi laporan"
  ```

---

### Task 3: Budgets Page, Breakdown Sheet & Budget Modal

**Files:**
- Modify: `src/components/forms/options.ts`
- Create: `src/components/budgets/BudgetBreakdownSheet.tsx`
- Modify: `src/pages/Budgets.tsx`

**Interfaces:**
- Consumes: `budgetVsActual`, `budgetSummary`, `budgetBreakdown`, `budgetThreeMonthAverage`, `budgetStatus`, `BudgetLine`, `BudgetTarget` from Task 2; `upsertBudget`, `deleteBudget` from Task 1.
- Produces:
  - `usePayableBudgetOptions(includeDebtId?: string): SelectOption[]` in `src/components/forms/options.ts`
  - `BudgetBreakdownSheet` component in `src/components/budgets/BudgetBreakdownSheet.tsx`

- [ ] **Step 1: Add `usePayableBudgetOptions` to `src/components/forms/options.ts`**
  Returns `'__all__'` (`Semua pembayaran hutang`) followed by active payables from `useOpenDebtOptions('payable', includeDebtId)`.

- [ ] **Step 2: Build `src/components/budgets/BudgetBreakdownSheet.tsx`**
  Uses `Sheet` (`width={500}`): header with `IconTile` + period subtitle, `.dsh-hero` with status badge (`Aman`/`Waspada`/`Melebihi` + `Lunas`), progress + pace marker, 3-column summary (`Sisa`/`Melebihi`, `Terpakai`, `Rata-rata N bln`), optional credit-purchase `.note-box`, optional remaining-debt link for per-debt budgets, itemized breakdown list (`editTx` on tap, `Otomatis` badge linking `/aset` for depreciation/disposal), `Lihat di Transaksi` & `Buka Buku Besar` links, and sticky footer (`Ubah batas` + pre-filled `Catat pengeluaran` / `Bayar hutang`).

- [ ] **Step 3: Update `src/pages/Budgets.tsx`**
  - Sync `actualTo = isCur ? today : to` for `budgetVsActual` and `unbudgeted`.
  - Fix future-month label (`month > today.slice(0, 7)` → `'Periode mendatang'`, `pace = 0`).
  - Hero uses `budgetSummary(lines)` with expense/debt split note when both exist; remove inline `style` font sizes/weights.
  - Render separate **Anggaran pengeluaran** and **Anggaran pembayaran hutang** sections; tapping any card opens `BudgetBreakdownSheet`; `...` menu offers `Lihat rincian`, `Ubah batas`, `Hapus anggaran`.
  - Update `BudgetModal` with `<Segmented>` kind picker (`Pengeluaran` / `Pembayaran hutang`) for new budgets and `budgetThreeMonthAverage()` suggestion.

- [ ] **Step 4: Run full check**
  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/forms/options.ts src/components/budgets/BudgetBreakdownSheet.tsx src/pages/Budgets.tsx
  git commit -m "feat: tambahkan panel rincian anggaran dan formulir anggaran pembayaran hutang"
  ```

---

### Task 4: Whole-System Accounting, Parser, Transaction Filter & Export Bug Fixes

**Files:**
- Modify: `src/accounting/periods.ts`
- Modify: `src/accounting/goals.ts`
- Modify: `src/lib/amount.ts`
- Modify: `src/components/tx/txDisplay.ts`
- Modify: `src/pages/Transactions.tsx`
- Modify: `src/export/excel.ts`
- Modify: `src/app/dashboardLayout.ts`
- Modify: `src/lib/__tests__/amount.test.ts`
- Create: `src/accounting/__tests__/system-fixes.test.ts`

- [ ] **Step 1: Write failing regression tests**
  - `src/lib/__tests__/amount.test.ts`: divide-by-zero (`100+50/0` → `null`), consecutive/malformed tokens (`100++200`, `100)500`, `(100+20`), unary `+` (`+500`), `amountToDisplay(1e21)` safe (no throw), `normalizePasted('1,250,000.500')` → `'1250000,50'`, `normalizePasted('1250.500')` → `'1250,50'`, Indonesian dot typing stays thousands (`sanitizeAmount('50.000') === '50000'`).
  - `src/accounting/__tests__/system-fixes.test.ts`:
    - `previousPeriod` Q1 (`2026-01-01`..`2026-03-31`) → Q4 prior year (`2025-10-01`..`2025-12-31`).
    - `goalProgress` deduplicates `accountIds`, returns `'unlinked'` when all IDs missing, does not return `'done'` for `target <= 0`.
    - `txFlow` reduces expense on refund (`income` → expense), reduces income on revenue refund (`expense` → revenue), reflects credit purchase/sale (`payable_new`/`receivable_new` with `counter === 'category'`).
    - `sanitizeLayout` deduplicates `kpi`; `isLegacyDefault` checks length.
    - `excel.ts`: `exportPackage` / `writeTransactions` / `writeClosing` / `writeAssets` / `writeJournal` / `writeTable` produce valid workbook with `defaultDescription`, transfer fee outflow, closing fallback, `otherRows`, sentinel date handling, and `SUBTOTAL` with formulas.

- [ ] **Step 2: Run tests to verify failure**
  Run: `npx vitest run src/lib/__tests__/amount.test.ts src/accounting/__tests__/system-fixes.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement all fixes in `periods.ts`, `goals.ts`, `amount.ts`, `txDisplay.ts`, `Transactions.tsx`, `excel.ts`, `dashboardLayout.ts`**
  Include `Transactions.tsx` category filter matching `payable_pay.interest` (`SYS.interestExpense`), `transfer.fee` (`SYS.bankFee`), and journal lines, plus `?jenis=debt_payment` & `&induk=<debtId>` removable filter chip using `matchesDebtPaymentBudget`.

- [ ] **Step 4: Run full check**
  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/accounting/periods.ts src/accounting/goals.ts src/lib/amount.ts src/components/tx/txDisplay.ts src/pages/Transactions.tsx src/export/excel.ts src/app/dashboardLayout.ts src/lib/__tests__/amount.test.ts src/accounting/__tests__/system-fixes.test.ts
  git commit -m "fix: perbaiki parser nominal, periode Q1, txFlow, filter transaksi, target tabungan, dan ekspor Excel"
  ```

---

### Task 5: Interactive Control, Overlay, Navigation & Page Bug Fixes

**Files:**
- Modify: `src/components/ui/AmountInput.tsx`
- Modify: `src/components/ui/AutoComplete.tsx`
- Modify: `src/components/ui/Select.tsx`
- Modify: `src/components/ui/DatePicker.tsx`
- Modify: `src/components/ui/Segmented.tsx`
- Modify: `src/components/ui/PeriodPicker.tsx`
- Modify: `src/components/ui/Confirm.tsx`
- Modify: `src/components/ui/Toasts.tsx`
- Modify: `src/components/ui/Tooltip.tsx`
- Modify: `src/components/ui/SlidePill.tsx`
- Modify: `src/components/ui/ErrorBoundary.tsx`
- Modify: `src/lib/layers.ts`
- Modify: `src/lib/focus.ts`
- Modify: `src/app/hotkeys.ts`
- Modify: `src/components/dashboard/common.tsx`
- Modify: `src/components/dashboard/Customize.tsx`
- Modify: `src/components/brand/Intro.tsx`
- Modify: `src/pages/Wallets.tsx`
- Modify: `src/pages/CalendarPage.tsx`
- Modify: `src/lib/__tests__/layers.test.ts`

- [ ] **Step 1: Add failing test in `src/lib/__tests__/layers.test.ts`**
  Verify `Escape` is ignored when `isComposing` / `keyCode === 229` during IME composition.

- [ ] **Step 2: Run test to verify failure**
  Run: `npx vitest run src/lib/__tests__/layers.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement all control, overlay, focus, hotkey, and page fixes**
  - `AmountInput.tsx`: skip `el.select()` on `(pointer: coarse)`; `scale()` no-ops when `v === 0`.
  - `AutoComplete.tsx`: `onPointerDown` `e.preventDefault()` on option rows so touch tap selects before blur unmounts popover; hide keyboard hint on `(hover: none)`.
  - `Select.tsx`: bind `onKeyDown` on list container as well as search input; allow `Tab` / `Shift+Tab` out of empty list cleanly.
  - `DatePicker.tsx`: sync `focused` + `aria-activedescendant` on month prev/next; move `+30 hari` chip to `clearable`; use `useToday()`; add `role="row"` / `role="gridcell"`.
  - `Segmented.tsx`: handle empty `options` and keep first option `tabIndex={0}` when `value` doesn't match.
  - `PeriodPicker.tsx`: omit duplicate `"Tahun buku berjalan"` when `fyStartMonth === 1`; add keyboard navigation & initial focus in popover.
  - `Confirm.tsx`: focus Cancel and block Enter confirmation when `tone === 'danger'`; keep last rendered options during exit transition.
  - `Toasts.tsx`: pause-aware timer replacing 60fps rAF loop; delay `hidePopover()` until exit animation completes.
  - `Tooltip.tsx`: render `kbd` when provided; guard touch pointers; close when child disabled/unmounted.
  - `SlidePill.tsx`: clean up module `Map` entry on unmount.
  - `ErrorBoundary.tsx`: safe emergency backup export on corrupted JSON + `.catch()` on `saveFile`.
  - `layers.ts`: `isImeComposing(e)` guard on `Escape`.
  - `focus.ts`: account for `.modal-head`, `.modal-foot`, and `.dsh-body`.
  - `hotkeys.ts` & `Transactions.tsx`: `/` focuses search on `/transaksi` without opening Command Palette; enforce `!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey` on plain shortcuts.
  - `Customize.tsx` & `Intro.tsx`: register `useLayer` for Android back button; track `e.pointerId` in `useWidgetDrag`.
  - `dashboard/common.tsx`: fix `Delta` `unit === 'points'` check before `isZero`; omit raw monetary tooltip when `hideAmounts` is active.
  - `Wallets.tsx`: sync `actual` with `book` in `ReconcileModal` on date change while untouched.
  - `CalendarPage.tsx`: add dependency array to `keydown` `useEffect`.

- [ ] **Step 4: Run full check**
  Run: `npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/components/ui/ src/lib/layers.ts src/lib/focus.ts src/app/hotkeys.ts src/components/dashboard/ src/components/brand/Intro.tsx src/pages/Wallets.tsx src/pages/CalendarPage.tsx src/lib/__tests__/layers.test.ts
  git commit -m "fix: perbaiki kontrol sentuh, fokus dialog, pintasan keyboard, dan bug halaman"
  ```

---

### Task 6: Android APK / Capacitor 8 `SystemBars`, Safe-Area CSS, Touch Hover & Typography Polish

**Files:**
- Modify: `capacitor.config.ts`
- Modify: `src/hooks/useApp.ts`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/res/values/styles.xml`
- Modify: `index.html`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/base.css`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/ui.css`
- Modify: `src/styles/pages.css`
- Modify: `src/styles/widgets.css`
- Modify: `src/styles/dashboard.css`
- Modify: `src/components/ui/Pickers.tsx`
- Modify: `src/lib/icons.tsx`

- [ ] **Step 1: Configure Capacitor 8 `SystemBars` & Android project**
  - `capacitor.config.ts`: add `plugins: { SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' } }`.
  - `src/hooks/useApp.ts`: in `useThemeSync()`, call `SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})` when `Capacitor.isNativePlatform()`.
  - `android/app/build.gradle`: bump `versionName "1.0"` → `"1.4.0"`.
  - `android/app/src/main/res/values/styles.xml`: set `android:windowBackground` to `@color/splash_bg` on `AppTheme.NoActionBar`.

- [ ] **Step 2: Apply root-cause CSS fixes & typography scale**
  - `tokens.css`: define `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right` using `max(env(safe-area-inset-*), var(--safe-area-inset-*, 0px))`.
  - `base.css`: inside `@media (pointer: coarse), (max-width: 960px)`, set `:root { --glass: var(--canvas); }` so scrolled `.topbar::before` is 100% solid.
  - `layout.css`, `ui.css`, `pages.css`: apply `--safe-top` / `--safe-bottom` to `.topbar`, sticky subheaders, `.sidebar` drawer, `.sheet` (`.dsh-head`, `.dsh-foot`), `.modal-dialog`, `.palette-dialog`, `.toast-stack`, `.tabbar`, and `.page` bottom padding.
  - Gate pointer-only `:hover` rules under `@media (hover: hover)` across `layout.css`, `ui.css`, `pages.css`, `widgets.css`, `dashboard.css`.
  - Fix `var(--ring)` → `var(--focus-ring)` (`layout.css`), remove duplicate rules (`ui.css`, `pages.css`), fix `.segmented` → `.seg` (`dashboard.css`), add sans `font-family` on `.intro-name` (`index.html`).
  - Normalize scattered font weights (`520..760`) to canonical `400 / 500 / 600 / 700` across all CSS files; add dedicated `.budget-card`, `.budget-section`, and `.budget-sheet` classes.
  - Fix `Pickers.tsx` selected icon contrast (`color: '#fff'`) and replace `'party'` with `'party-popper'` in `Pickers.tsx` and `icons.tsx`.

- [ ] **Step 3: Run full check & build**
  Run: `npm run check && npm run build`
  Expected: PASS (`uicons --check`, `tsc`, `vitest`, `vite build` exit 0).

- [ ] **Step 4: Commit**
  ```bash
  git add capacitor.config.ts src/hooks/useApp.ts android/ index.html src/styles/ src/components/ui/Pickers.tsx src/lib/icons.tsx
  git commit -m "fix: perbaiki safe-area Android, topbar solid, hover sentuh, dan tipografi"
  ```

---

### Task 7: Systematic Indonesian Copy Overhaul, Personal-Name Removal, Capacitor Sync & Final Audit

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/app/settings.ts`
- Modify: `src/components/ShortcutsDialog.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/components/ui/Pickers.tsx`
- Modify: `src/components/ui/ErrorBoundary.tsx`
- Modify: `src/components/forms/AccountModal.tsx`
- Modify: `src/components/forms/TransactionModal.tsx`
- Modify: `src/pages/Wallets.tsx`
- Modify: `src/pages/Assets.tsx`
- Modify: `src/app/nav.ts`
- Modify: `src/app/reports.ts`
- Modify: `src/components/dashboard/` (user-facing copy: `widget` → `panel`, `e-wallet` → `dompet digital`, `galat` → `masalah`)

- [ ] **Step 1: Apply canonical Indonesian glossary & remove personal placeholder**
  - Replace personal placeholder in `src/pages/Settings.tsx` with `"Nama lengkap"`.
  - Fix `src/app/settings.ts` `Preferensi` vs `Tampilan` descriptions.
  - Add Indonesian icon labels in `src/components/ui/Pickers.tsx`.
  - Standardize `Bilah sisi`, `Kolom`, `Panel`, `Dompet digital`, `Pengembalian dana`, `Atur ulang`, `Perangkat ini`, `Selisih`, `Daftar aset`, `Keterangan`, `Masalah`, `Perangkat dengan memori terbatas`, `Pembukuan berpasangan`, and `Tambah dompet`.

- [ ] **Step 2: Run full verification, production build, and Capacitor Android sync**
  Run: `npm run check && npm run build && npx cap sync android`
  Expected: All checks, tests, production build, and Capacitor Android asset/config sync pass with exit code 0.

- [ ] **Step 3: Run mandatory hygiene audit**
  Verify zero personal names, zero non-project references, zero local absolute paths, and zero chat/session leakage across all modified/created files in `src/`, `android/`, `capacitor.config.ts`, `index.html`, and `docs/`.

- [ ] **Step 4: Commit & push**
  ```bash
  git add -A
  git commit -m "refactor: seragamkan tata bahasa Indonesia dan bersihkan teks antarmuka"
  git push origin master
  ```

/*
 * Widget gabungan: beberapa widget yang saling melengkapi berbagi satu kartu bertab,
 * sehingga dasbor lebih pendek tanpa menghilangkan isinya.
 */
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChartColumnBig, ChartPie, Wallet, Gauge, HandCoins, type LucideIcon } from 'lucide-react';
import { EmbedProvider } from './common';
import { BudgetsWidget, CashflowWidget, CompositionWidget, DebtsWidget, WalletsWidget } from './core';
import type { WidgetProps } from './types';

interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
  node: ReactNode;
}

const storeKey = (id: string) => `keuanganku.tab.${id}`;

function readTab(id: string, tabs: TabDef[]) {
  try {
    const v = localStorage.getItem(storeKey(id));
    if (v && tabs.some((t) => t.key === v)) return v;
  } catch {
    /* penyimpanan tidak tersedia — pakai tab pertama */
  }
  return tabs[0].key;
}

/**
 * Semua panel dirender menumpuk di sel grid yang sama: tinggi kartu mengikuti panel tertinggi,
 * jadi berpindah tab tidak menggeser isi halaman di bawahnya.
 */
function TabbedCard({ id, tabs }: { id: string; tabs: TabDef[] }) {
  const [active, setActive] = useState(() => readTab(id, tabs));
  const uid = useId();
  const pick = (key: string) => {
    setActive(key);
    try {
      localStorage.setItem(storeKey(id), key);
    } catch {
      /* abaikan */
    }
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    pick(next.key);
    document.getElementById(`${uid}-tab-${next.key}`)?.focus();
  };
  return (
    <div className="card w-card w-tabbed">
      <div className="tabbed-bar">
        <div className="tabbed-list" role="tablist" aria-label="Tampilan kartu">
          {tabs.map((t, i) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`${uid}-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`${uid}-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                className={`tabbed-tab${on ? ' on' : ''}`}
                onClick={() => pick(t.key)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <t.icon aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <EmbedProvider value>
        <div className="tab-stack">
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <div
                key={t.key}
                role="tabpanel"
                id={`${uid}-panel-${t.key}`}
                aria-labelledby={`${uid}-tab-${t.key}`}
                className="tab-panel"
                data-active={on || undefined}
                inert={!on}
              >
                {t.node}
              </div>
            );
          })}
        </div>
      </EmbedProvider>
    </div>
  );
}

/** Arus kas (pendapatan & beban) dan komposisi kategori dalam satu kartu. */
export function FlowWidget(p: WidgetProps) {
  return (
    <TabbedCard
      id="flow"
      tabs={[
        { key: 'cashflow', label: 'Arus kas', icon: ChartColumnBig, node: <CashflowWidget {...p} /> },
        { key: 'composition', label: 'Komposisi', icon: ChartPie, node: <CompositionWidget {...p} /> },
      ]}
    />
  );
}

/** Dompet, anggaran, dan hutang-piutang dalam satu kartu. */
export function FinanceWidget(p: WidgetProps) {
  return (
    <TabbedCard
      id="finance"
      tabs={[
        { key: 'wallets', label: 'Dompet', icon: Wallet, node: <WalletsWidget {...p} /> },
        { key: 'budgets', label: 'Anggaran', icon: Gauge, node: <BudgetsWidget {...p} /> },
        { key: 'debts', label: 'Hutang', icon: HandCoins, node: <DebtsWidget /> },
      ]}
    />
  );
}

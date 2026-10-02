import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Tags, ListTree, Lock, Archive, TrendingUp, TrendingDown } from 'lucide-react';
import { useBooks, useToday } from '../hooks/useApp';
import { SUBTYPE_META, TYPE_LABEL, TYPE_ORDER, normalSide } from '../accounting/coa';
import { activity, displayBalances } from '../accounting/reports';
import type { Account } from '../accounting/types';
import { formatMoney, normalize, startOfMonth, endOfMonth } from '../lib/format';
import { PageHeader } from '../components/layout/Topbar';
import { Badge, Button, IconTile, TextInput, TableWrap } from '../components/ui/primitives';
import { Segmented } from '../components/ui/Segmented';
import { useAccountModal } from '../components/forms/AccountModal';

export default function Accounts() {
  const b = useBooks();
  const today = useToday();
  const nav = useNavigate();
  const modal = useAccountModal();
  const [tab, setTab] = useState<'categories' | 'coa'>('categories');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const monthAct = useMemo(() => activity(b, startOfMonth(today), endOfMonth(today)), [b, today]);
  const balOf = useMemo(() => displayBalances(b, today), [b, today]);
  // Pemakaian dihitung dari jurnal (termasuk jurnal manual, biaya admin, penyusutan, bunga) — bukan hanya field transaksi.
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of b.entries) for (const id of new Set(e.lines.map((l) => l.accountId))) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [b]);

  const match = (a: Account) => (!q || normalize(`${a.name} ${a.code} ${SUBTYPE_META[a.subtype].label}`).includes(normalize(q))) && (showArchived || !a.archived);

  const catSection = (type: 'revenue' | 'expense') => {
    const list = b.accounts.filter((a) => a.type === type && match(a));
    return (
      <section className="cat-section">
        <div className="wg-head">
          <h3 className="row" style={{ gap: 8 }}>
            {type === 'revenue' ? <TrendingUp size={17} className="pos" /> : <TrendingDown size={17} className="neg" />}
            {type === 'revenue' ? 'Kategori pendapatan' : 'Kategori beban'}
            <span className="muted" style={{ fontWeight: 500 }}>{list.length}</span>
          </h3>
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => modal.openNew('category', type === 'revenue' ? 'operating_revenue' : 'operating_expense')}>
            Tambah
          </Button>
        </div>
        <div className="cat-grid">
          {list.map((a, i) => {
            const x = monthAct.get(a.id);
            const v = x ? (type === 'revenue' ? x.c - x.d : x.d - x.c) : 0;
            return (
              <motion.button
                key={a.id}
                type="button"
                className={`card cat-tile${a.archived ? ' archived' : ''}`}
                onClick={() => modal.openEdit('category', a)}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: Math.min(i, 20) * 0.015 } }}
              >
                <IconTile icon={a.icon} color={a.color} />
                <span className="col grow" style={{ minWidth: 0, alignItems: 'flex-start' }}>
                  <span className="ct-name clamp-2">{a.name}</span>
                  <span className="ct-meta row" style={{ gap: 4 }}>
                    <span className="num">{a.code}</span>
                    {a.system && <Lock size={10} aria-label="Akun sistem" />}
                    <span>· {usage.get(a.id) ?? 0}× dipakai</span>
                    {a.archived && <span>· arsip</span>}
                  </span>
                </span>
                <span className="col ct-right" title="Realisasi bulan ini">
                  <span className={`num money-val ct-val${v ? '' : ' muted'}`}>{v ? formatMoney(v, { compact: true }) : '–'}</span>
                </span>
              </motion.button>
            );
          })}
          <button type="button" className="cat-tile add" onClick={() => modal.openNew('category', type === 'revenue' ? 'operating_revenue' : 'operating_expense')}>
            <Plus size={18} /> Kategori baru
          </button>
        </div>
      </section>
    );
  };

  return (
    <div>
      <PageHeader
        title="Bagan Akun & Kategori"
        subtitle="Struktur akun buku besar — kategori adalah akun pendapatan dan beban"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => (tab === 'categories' ? modal.openNew('category') : modal.openNew('account'))}>
            {tab === 'categories' ? 'Kategori baru' : 'Akun baru'}
          </Button>
        }
      />
      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'categories', label: 'Kategori', icon: Tags },
            { value: 'coa', label: 'Bagan akun lengkap', icon: ListTree },
          ]}
        />
        <div style={{ width: 280, maxWidth: '100%' }}>
          <TextInput value={q} onChange={setQ} icon={Search} placeholder="Cari nama atau kode akun…" clearable sunken />
        </div>
        <button type="button" className="chip" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
          <Archive /> Tampilkan arsip
        </button>
      </div>

      {tab === 'categories' ? (
        <>
          {catSection('expense')}
          {catSection('revenue')}
        </>
      ) : (
        <div className="card">
          <TableWrap label="Bagan akun">
            <table className="table coa-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Kode</th>
                  <th>Nama akun</th>
                  <th>Kelompok</th>
                  <th>Saldo normal</th>
                  <th className="r" title="Akun laba rugi: saldo tahun buku berjalan">Saldo per hari ini</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              {TYPE_ORDER.map((t) => {
                const list = b.accounts.filter((a) => a.type === t && match(a));
                if (!list.length) return null;
                return (
                  <tbody key={t}>
                    <tr className="tb-group">
                      <td colSpan={6}>
                        {t === 'asset' ? '1' : t === 'liability' ? '2' : t === 'equity' ? '3' : t === 'revenue' ? '4' : '5–7'} · {TYPE_LABEL[t].toUpperCase()}
                      </td>
                    </tr>
                    {list.map((a) => {
                      const v = balOf(a);
                      return (
                        <tr key={a.id} className={`clickable${a.archived ? ' archived' : ''}`} onClick={() => modal.openEdit(a.type === 'revenue' || a.type === 'expense' ? 'category' : ['cash', 'bank', 'ewallet', 'investment', 'credit_card'].includes(a.subtype) ? 'wallet' : 'account', a)}>
                          <td className="code">{a.code}</td>
                          <td>
                            <span className="row">
                              <IconTile icon={a.icon} color={a.color} size="xs" />
                              <span className="truncate">{a.name}</span>
                            </span>
                          </td>
                          <td className="muted">{SUBTYPE_META[a.subtype].label}</td>
                          <td>
                            <Badge tone={normalSide(a) === 'debit' ? 'info' : 'accent'}>{normalSide(a) === 'debit' ? 'Debit' : 'Kredit'}</Badge>
                          </td>
                          <td
                            className="r num money-val link-cell"
                            onClick={(e) => {
                              e.stopPropagation();
                              nav(`/buku-besar?akun=${a.id}`);
                            }}
                          >
                            {v ? formatMoney(v, { symbol: false }) : '–'}
                          </td>
                          <td>
                            <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                              {a.system && <Badge icon={Lock}>Sistem</Badge>}
                              {a.archived && <Badge>Arsip</Badge>}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </TableWrap>
        </div>
      )}
      {modal.node}
    </div>
  );
}

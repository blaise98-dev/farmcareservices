import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  getCowEconSummary, getCowEconFleet, getCowEconDetail,
  addCowCost, addCowRevenue, deleteCowCost, deleteCowRevenue, getCows,
} from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import {
  DonutChart, BarChart as EBar, HBarChart, LineChart as ELine,
  WaterfallChart, ChartCard, PALETTE,
} from '../components/ChartKit';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, X, Trash2,
  ChevronDown, ChevronRight, Filter, RefreshCw, BarChart2,
} from 'lucide-react';

// ─── Palettes ─────────────────────────────────────────────────────────────────
const COST_COLOR = {
  Feed: '#FF9800', Treatment: '#F44336', Medicine: '#E91E63',
  Vaccination: '#9C27B0', Labour: '#607D8B', Transport: '#795548',
  Equipment: '#5C6BC0', 'Veterinary Fee': '#00BCD4', Insemination: '#4DB6AC', Other: '#9E9E9E',
};
const REV_COLOR = {
  'Milk Sale': '#4CAF50', 'Offspring Sale': '#2196F3', 'Manure Sale': '#8BC34A',
  'Live Animal Sale': '#FF9800', Insurance: '#9C27B0', Subsidy: '#00BCD4', Other: '#607D8B',
};
const COST_PALETTE = Object.values(COST_COLOR);

const fmt = (n) => n != null ? Number(n).toLocaleString('en-RW') : '—';
const fmtK = (n) => n != null ? `${(Number(n) / 1000).toFixed(1)}K` : '—';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = '#1E4D7B', icon: Icon, trend }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        {Icon && <Icon size={18} color={color} />}
      </div>
      <span className="value" style={{ color }}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}


// ─── Fleet-level executive dashboard ─────────────────────────────────────────
function FleetDashboard({ fleet, summary, filterSex, filterBreed, filterStage, filteredSummary, p }) {
  const totalCosts    = filteredSummary.reduce((s, c) => s + Number(c.total_costs_rwf || 0), 0);
  const totalRevenues = filteredSummary.reduce((s, c) => s + Number(c.total_revenues_rwf || 0), 0);
  const netProfit     = totalRevenues - totalCosts;
  const roi           = totalCosts > 0 ? ((netProfit / totalCosts) * 100).toFixed(1) : 0;

  // Cost breakdown
  const costPie = (fleet.by_cost_cat || []).map(r => ({ name: r.cost_category, value: Number(r.total) }));
  const revPie  = (fleet.by_rev_cat  || []).map(r => ({ name: r.revenue_category, value: Number(r.total) }));

  // Monthly trend
  const monthly = (fleet.monthly || []).map(r => ({
    month: r.ym,
    Costs:     Number(r.costs     || 0),
    Revenues:  Number(r.revenues  || 0),
    Net:       Number(r.net       || 0),
  }));

  // Top profitable cows
  const topProfit = (fleet.top_profit || []).slice(0, 8).map(r => ({
    name: r.cow_name,
    profit: Number(r.net_profit || 0),
    fill: Number(r.net_profit) >= 0 ? '#4CAF50' : '#F44336',
  }));

  // Per-cow P&L scatter (bar chart sorted by profit)
  const perCow = [...filteredSummary]
    .sort((a, b) => Number(b.net_profit_rwf) - Number(a.net_profit_rwf))
    .slice(0, 15)
    .map(c => ({ name: c.cow_name, profit: Number(c.net_profit_rwf || 0), fill: Number(c.net_profit_rwf) >= 0 ? '#4CAF50' : '#F44336' }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Executive KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        <KPI label="Total Costs" value={`${fmtK(totalCosts)} RWF`} color="#F44336" icon={TrendingDown} sub="all registered costs" />
        <KPI label="Total Revenues" value={`${fmtK(totalRevenues)} RWF`} color="#4CAF50" icon={TrendingUp} sub="all recorded revenues" />
        <KPI label="Net Profit" value={`${fmtK(netProfit)} RWF`} color={netProfit >= 0 ? '#2E7D32' : '#c62828'} icon={DollarSign}
          sub={netProfit >= 0 ? 'In profit' : 'Running at loss'} />
        <KPI label="ROI" value={`${roi}%`} color={Number(roi) >= 0 ? '#1E4D7B' : '#c62828'} sub="return on investment" />
        <KPI label="Cows Tracked" value={filteredSummary.length} color="#9C27B0" sub="with economic data" />
        <KPI label="Avg Profit/Cow" value={filteredSummary.length ? `${fmtK(netProfit / filteredSummary.length)} RWF` : '—'}
          color={netProfit >= 0 ? '#00BCD4' : '#FF9800'} sub="per animal" />
      </div>

      {/* Monthly P&L trend */}
      {monthly.length > 0 && (
        <ChartCard title="📈 Monthly Costs vs Revenues" sub="Costs vs revenues and net profit over time (RWF)">
          <ELine data={monthly} xKey="month"
            series={[
              { key: 'Revenues', name: 'Revenues (RWF)', color: '#4CAF50' },
              { key: 'Costs',    name: 'Costs (RWF)',    color: '#F44336' },
              { key: 'Net',      name: 'Net Profit',     color: '#1E4D7B' },
            ]}
            area smooth height={260}
            markLine={[{ yAxis: 0, label: { formatter: () => 'Break-even', position: 'end' } }]}
          />
        </ChartCard>
      )}

      {/* Cost + Revenue donuts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="💸 Cost Breakdown by Category">
          <DonutChart data={costPie.map((d, i) => ({ ...d, color: COST_COLOR[d.name] || PALETTE[i % PALETTE.length] }))} height={240} />
        </ChartCard>
        <ChartCard title="💰 Revenue Breakdown by Source">
          <DonutChart data={revPie.map((d, i) => ({ ...d, color: REV_COLOR[d.name] || PALETTE[i % PALETTE.length] }))} height={240} />
        </ChartCard>
      </div>

      {/* Per-cow net profit */}
      {perCow.length > 0 && (
        <ChartCard title="🐄 Net Profit per Cow (top 15)" sub="Green = profitable · Red = loss-making">
          <HBarChart
            data={perCow.map(c => ({ name: c.name, value: c.profit }))}
            unit=" RWF" colorFn={(d) => Number(d.value) >= 0 ? '#4CAF50' : '#F44336'}
            height={Math.max(200, perCow.length * 38)}
          />
        </ChartCard>
      )}

      {/* Summary table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <SectionTitle title={`📋 Cow P&L Summary (${filteredSummary.length} cows)`} />
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cow</th><th>Breed</th><th>Stage</th><th>Total Costs</th>
                <th>Total Revenue</th><th>Feed Cost</th><th>Treatment Cost</th>
                <th>Milk Revenue</th><th>Net Profit</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map(c => {
                const net = Number(c.net_profit_rwf || 0);
                return (
                  <tr key={c.cow_id}>
                    <td style={{ fontWeight: 700 }}>{c.cow_name}</td>
                    <td style={{ fontSize: 12 }}>{c.breed}</td>
                    <td style={{ fontSize: 12 }}>{c.cow_stage || '—'}</td>
                    <td style={{ color: '#F44336', fontWeight: 600 }}>{fmt(c.total_costs_rwf)} RWF</td>
                    <td style={{ color: '#4CAF50', fontWeight: 600 }}>{fmt(c.total_revenues_rwf)} RWF</td>
                    <td style={{ fontSize: 12 }}>{fmt(c.feed_cost_rwf)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(c.treatment_cost_rwf)}</td>
                    <td style={{ fontSize: 12, color: '#4CAF50' }}>{fmt(c.milk_revenue_rwf)}</td>
                    <td style={{ fontWeight: 800, color: net >= 0 ? '#2E7D32' : '#c62828' }}>{fmt(net)} RWF</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: net >= 0 ? '#e8f5e9' : '#fde8e8',
                        color: net >= 0 ? '#2E7D32' : '#c62828' }}>
                        {net >= 0 ? '▲ Profit' : '▼ Loss'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Cow-level drill-down ─────────────────────────────────────────────────────
function CowDrillDown({ cowId, onClose, p }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [costForm, setCostForm]   = useState({ cost_date: '', cost_category: 'Feed', description: '', amount_rwf: '' });
  const [revForm, setRevForm]     = useState({ revenue_date: '', revenue_category: 'Milk Sale', description: '', amount_rwf: '', quantity: '', unit: '' });
  const [showCostForm, setShowCostForm] = useState(false);
  const [showRevForm,  setShowRevForm]  = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cow-econ-detail', cowId],
    queryFn: () => getCowEconDetail(cowId),
  });

  const costMut = useMutation({
    mutationFn: addCowCost,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cow-econ-detail', cowId] }); qc.invalidateQueries({ queryKey: ['cow-econ-summary'] }); setShowCostForm(false); setCostForm({ cost_date: '', cost_category: 'Feed', description: '', amount_rwf: '' }); },
  });
  const revMut = useMutation({
    mutationFn: addCowRevenue,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cow-econ-detail', cowId] }); qc.invalidateQueries({ queryKey: ['cow-econ-summary'] }); setShowRevForm(false); setRevForm({ revenue_date: '', revenue_category: 'Milk Sale', description: '', amount_rwf: '', quantity: '', unit: '' }); },
  });
  const delCostMut = useMutation({ mutationFn: deleteCowCost, onSuccess: () => qc.invalidateQueries({ queryKey: ['cow-econ-detail', cowId] }) });
  const delRevMut  = useMutation({ mutationFn: deleteCowRevenue, onSuccess: () => qc.invalidateQueries({ queryKey: ['cow-econ-detail', cowId] }) });

  if (isLoading) return <div className="spinner" style={{ padding: 40 }} />;
  if (!data) return null;

  const { cow, costs = [], revenues = [], milk_summary, timeline, cost_by_cat, rev_by_cat } = data;
  const totalCosts = costs.reduce((s, r) => s + Number(r.amount_rwf || 0), 0);
  const totalRevs  = revenues.reduce((s, r) => s + Number(r.amount_rwf || 0), 0);
  const milkRev    = Number(milk_summary?.est_revenue || 0);
  const net        = totalRevs + milkRev - totalCosts;

  const monthlyChart = (timeline || []).map(r => ({
    month: r.ym, Costs: Number(r.costs || 0), Revenues: Number(r.revenues || 0),
  }));

  const INPUT = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', maxHeight: '94vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🐄 {cow.cow_name} — Lifetime Economics</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, opacity: .8 }}>{cow.rfid_tag} · {cow.breed} · {cow.cow_stage} · {cow.age_months} months old</p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Total Costs', value: `${fmtK(totalCosts)} RWF`, color: '#F44336' },
            { label: 'Total Revenue', value: `${fmtK(totalRevs + milkRev)} RWF`, color: '#4CAF50' },
            { label: 'Milk Revenue', value: `${fmtK(milkRev)} RWF`, color: '#00BCD4' },
            { label: 'Net Profit', value: `${fmtK(net)} RWF`, color: net >= 0 ? '#2E7D32' : '#c62828' },
            { label: 'Milk Produced', value: `${Number(milk_summary?.total_liters || 0).toFixed(0)} L`, color: '#9C27B0' },
          ].map(k => (
            <div key={k.label} style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: k.color, marginTop: 3 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#f7f9fc' }}>
          {['overview', 'costs', 'revenues', 'timeline'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: activeTab === t ? 700 : 400, border: 'none', background: 'none',
                borderBottom: activeTab === t ? '2px solid #1E4D7B' : '2px solid transparent',
                color: activeTab === t ? '#1E4D7B' : 'var(--text-secondary)', cursor: 'pointer', textTransform: 'capitalize' }}>
              {t === 'overview' ? '📊 Overview' : t === 'costs' ? '💸 Costs' : t === 'revenues' ? '💰 Revenues' : '📅 Timeline'}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ChartCard title="Cost Categories" style={{ margin: 0 }}>
                  <DonutChart data={(cost_by_cat||[]).map((r,i) => ({ name: r.cost_category, value: Number(r.total), color: COST_COLOR[r.cost_category] || PALETTE[i%PALETTE.length] }))} height={200} />
                </ChartCard>
                <ChartCard title="Revenue Sources" style={{ margin: 0 }}>
                  <DonutChart data={(rev_by_cat||[]).map((r,i) => ({ name: r.revenue_category, value: Number(r.total), color: REV_COLOR[r.revenue_category] || PALETTE[i%PALETTE.length] }))} height={200} />
                </ChartCard>
              </div>
              {monthlyChart.length > 0 && (
                <ChartCard title="Monthly Costs vs Revenues" style={{ margin: 0 }}>
                  <EBar data={monthlyChart} xKey="month"
                    series={[{ key: 'Revenues', name: 'Revenue (RWF)', color: '#4CAF50' }, { key: 'Costs', name: 'Costs (RWF)', color: '#F44336' }]}
                    height={200} />
                </ChartCard>
              )}
            </div>
          )}

          {/* Costs tab */}
          {activeTab === 'costs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {p.isFarmer || p.isVet || p.isAdmin ? (
                <div>
                  <button onClick={() => setShowCostForm(f => !f)} className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <Plus size={14} /> Record Cost
                  </button>
                  {showCostForm && (
                    <div style={{ background: '#f7f9fc', borderRadius: 10, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Date</label>
                        <input type="date" value={costForm.cost_date} onChange={e => setCostForm(f => ({ ...f, cost_date: e.target.value }))} style={INPUT} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Category</label>
                        <select value={costForm.cost_category} onChange={e => setCostForm(f => ({ ...f, cost_category: e.target.value }))} style={INPUT}>
                          {['Feed','Treatment','Medicine','Vaccination','Labour','Transport','Equipment','Veterinary Fee','Insemination','Other'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Amount (RWF)</label>
                        <input type="number" value={costForm.amount_rwf} onChange={e => setCostForm(f => ({ ...f, amount_rwf: e.target.value }))} placeholder="0" style={INPUT} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Description</label>
                        <input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="optional" style={INPUT} />
                      </div>
                      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                        <button onClick={() => costMut.mutate({ ...costForm, cow_id: cowId, amount_rwf: Number(costForm.amount_rwf) })}
                          disabled={!costForm.cost_date || !costForm.amount_rwf || costMut.isPending}
                          className="btn btn-primary" style={{ fontSize: 12 }}>
                          {costMut.isPending ? 'Saving…' : 'Save Cost'}
                        </button>
                        <button onClick={() => setShowCostForm(false)} className="btn" style={{ fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <table className="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (RWF)</th><th>By</th><th></th></tr></thead>
                <tbody>
                  {costs.map(r => (
                    <tr key={r.cost_id}>
                      <td style={{ fontSize: 12 }}>{r.cost_date ? format(new Date(r.cost_date), 'MMM d, yyyy') : '—'}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${COST_COLOR[r.cost_category] || '#999'}20`, color: COST_COLOR[r.cost_category] || '#666' }}>{r.cost_category}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.description || '—'}</td>
                      <td style={{ fontWeight: 700, color: '#F44336' }}>{fmt(r.amount_rwf)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.recorded_by}</td>
                      <td><button onClick={() => { if (window.confirm('Delete?')) delCostMut.mutate(r.cost_id); }}
                        className="btn btn-ghost" style={{ padding: '3px 8px', color: '#c62828', fontSize: 11 }}>
                        <Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                  {costs.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No cost records yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Revenues tab */}
          {activeTab === 'revenues' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {p.isFarmer || p.isAdmin ? (
                <div>
                  <button onClick={() => setShowRevForm(f => !f)} className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, background: '#4CAF50', border: 'none' }}>
                    <Plus size={14} /> Record Revenue
                  </button>
                  {showRevForm && (
                    <div style={{ background: '#f7f9fc', borderRadius: 10, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Date</label>
                        <input type="date" value={revForm.revenue_date} onChange={e => setRevForm(f => ({ ...f, revenue_date: e.target.value }))} style={INPUT} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Category</label>
                        <select value={revForm.revenue_category} onChange={e => setRevForm(f => ({ ...f, revenue_category: e.target.value }))} style={INPUT}>
                          {['Milk Sale','Offspring Sale','Manure Sale','Live Animal Sale','Insurance','Subsidy','Other'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Amount (RWF)</label>
                        <input type="number" value={revForm.amount_rwf} onChange={e => setRevForm(f => ({ ...f, amount_rwf: e.target.value }))} placeholder="0" style={INPUT} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Description</label>
                        <input value={revForm.description} onChange={e => setRevForm(f => ({ ...f, description: e.target.value }))} placeholder="optional" style={INPUT} />
                      </div>
                      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                        <button onClick={() => revMut.mutate({ ...revForm, cow_id: cowId, amount_rwf: Number(revForm.amount_rwf) })}
                          disabled={!revForm.revenue_date || !revForm.amount_rwf || revMut.isPending}
                          className="btn btn-primary" style={{ fontSize: 12, background: '#4CAF50', border: 'none' }}>
                          {revMut.isPending ? 'Saving…' : 'Save Revenue'}
                        </button>
                        <button onClick={() => setShowRevForm(false)} className="btn" style={{ fontSize: 12 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <table className="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount (RWF)</th><th>By</th><th></th></tr></thead>
                <tbody>
                  {revenues.map(r => (
                    <tr key={r.revenue_id}>
                      <td style={{ fontSize: 12 }}>{r.revenue_date ? format(new Date(r.revenue_date), 'MMM d, yyyy') : '—'}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${REV_COLOR[r.revenue_category] || '#999'}20`, color: REV_COLOR[r.revenue_category] || '#666' }}>{r.revenue_category}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.description || '—'}</td>
                      <td style={{ fontWeight: 700, color: '#4CAF50' }}>{fmt(r.amount_rwf)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.recorded_by}</td>
                      <td><button onClick={() => { if (window.confirm('Delete?')) delRevMut.mutate(r.revenue_id); }}
                        className="btn btn-ghost" style={{ padding: '3px 8px', color: '#c62828', fontSize: 11 }}>
                        <Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                  {revenues.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>No revenue records yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Timeline tab */}
          {activeTab === 'timeline' && (
            <div>
              {monthlyChart.length > 0 ? (
                <ChartCard title="Monthly Cash Flow" sub="Costs vs revenues over this cow's lifetime" style={{ margin: 0 }}>
                  <ELine data={monthlyChart} xKey="month"
                    series={[{ key: 'Revenues', name: 'Revenue (RWF)', color: '#4CAF50' }, { key: 'Costs', name: 'Costs (RWF)', color: '#F44336' }]}
                    area smooth height={300}
                    markLine={[{ yAxis: 0, label: { formatter: () => 'Break-even', position: 'end' } }]}
                  />
                </ChartCard>
              ) : (
                <div className="empty-state">No timeline data yet. Record costs and revenues to see the trend.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CowEconomics() {
  const p  = usePermissions();
  const qc = useQueryClient();

  const { data: summary = [], isLoading: sumLoading, refetch } = useQuery({ queryKey: ['cow-econ-summary'], queryFn: getCowEconSummary });
  const { data: fleet = {}, isLoading: fleetLoading } = useQuery({ queryKey: ['cow-econ-fleet'], queryFn: getCowEconFleet });

  const [selectedCow, setSelectedCow] = useState(null);
  const [fBreed,    setFBreed]    = useState('All');
  const [fStage,    setFStage]    = useState('All');
  const [fSex,      setFSex]      = useState('All');
  const [fProfit,   setFProfit]   = useState('All');  // All | Profit | Loss
  const [sortBy,    setSortBy]    = useState('net_desc');
  const [search,    setSearch]    = useState('');

  const allBreeds = useMemo(() => [...new Set(summary.map(c => c.breed).filter(Boolean))].sort(), [summary]);
  const allStages = useMemo(() => [...new Set(summary.map(c => c.cow_stage).filter(Boolean))].sort(), [summary]);

  const filteredSummary = useMemo(() => {
    let rows = [...summary];
    if (fBreed !== 'All') rows = rows.filter(c => c.breed === fBreed);
    if (fStage !== 'All') rows = rows.filter(c => c.cow_stage === fStage);
    if (fSex   !== 'All') rows = rows.filter(c => c.sex === fSex);
    if (fProfit === 'Profit') rows = rows.filter(c => Number(c.net_profit_rwf) >= 0);
    if (fProfit === 'Loss')   rows = rows.filter(c => Number(c.net_profit_rwf) < 0);
    if (search) rows = rows.filter(c => c.cow_name?.toLowerCase().includes(search.toLowerCase()) || c.rfid_tag?.includes(search));
    if (sortBy === 'net_desc') rows.sort((a, b) => Number(b.net_profit_rwf) - Number(a.net_profit_rwf));
    if (sortBy === 'net_asc')  rows.sort((a, b) => Number(a.net_profit_rwf) - Number(b.net_profit_rwf));
    if (sortBy === 'cost_desc') rows.sort((a, b) => Number(b.total_costs_rwf) - Number(a.total_costs_rwf));
    if (sortBy === 'rev_desc')  rows.sort((a, b) => Number(b.total_revenues_rwf) - Number(a.total_revenues_rwf));
    return rows;
  }, [summary, fBreed, fStage, fSex, fProfit, search, sortBy]);

  if (sumLoading || fleetLoading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '18px 24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DollarSign size={24} />
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              {p.isVet ? 'Treatment Economics' : 'Cow Economics'}
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: .8 }}>
            {p.isVet
              ? 'Medicine costs, procedures & veterinary revenues per cow'
              : 'Lifetime costs, revenues & profitability per cow — from registration to sale/death'}
          </p>
        </div>
        <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter + sort bar */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cow name / RFID…"
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, width: 200 }} />
          </div>
          {[
            { label: 'Breed', value: fBreed, set: setFBreed, opts: ['All', ...allBreeds] },
            { label: 'Stage', value: fStage, set: setFStage, opts: ['All', ...allStages] },
            { label: 'Sex',   value: fSex,   set: setFSex,   opts: ['All', 'Female', 'Male'] },
            { label: 'P&L',   value: fProfit, set: setFProfit, opts: ['All', 'Profit', 'Loss'] },
          ].map(({ label, value, set, opts }) => (
            <div key={label}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
              <select value={value} onChange={e => set(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 3 }}>Sort by</div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: '#fff' }}>
              <option value="net_desc">Net Profit ↓</option>
              <option value="net_asc">Net Profit ↑</option>
              <option value="cost_desc">Highest Cost</option>
              <option value="rev_desc">Highest Revenue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fleet executive dashboard */}
      <FleetDashboard fleet={fleet} summary={summary} filteredSummary={filteredSummary} p={p}
        filterSex={fSex} filterBreed={fBreed} filterStage={fStage} />

      {/* Cow cards grid — click to drill down */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>🐄 Click a cow to view its full P&L breakdown</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {filteredSummary.map(c => {
            const net    = Number(c.net_profit_rwf || 0);
            const profit = net >= 0;
            return (
              <div key={c.cow_id} onClick={() => setSelectedCow(c.cow_id)}
                style={{ padding: '14px 16px', borderRadius: 12, border: `2px solid ${profit ? '#4CAF5044' : '#F4433644'}`,
                  background: profit ? '#f9fff9' : '#fff9f9', cursor: 'pointer', transition: 'box-shadow .2s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{c.cow_name}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: profit ? '#e8f5e9' : '#fde8e8', color: profit ? '#2E7D32' : '#c62828' }}>
                    {profit ? '▲ Profit' : '▼ Loss'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>{c.rfid_tag} · {c.breed} · {c.cow_stage}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={{ fontSize: 11 }}><span style={{ color: '#F44336', fontWeight: 600 }}>Costs:</span> {fmtK(c.total_costs_rwf)} RWF</div>
                  <div style={{ fontSize: 11 }}><span style={{ color: '#4CAF50', fontWeight: 600 }}>Revenue:</span> {fmtK(c.total_revenues_rwf)} RWF</div>
                </div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 15, color: profit ? '#2E7D32' : '#c62828' }}>
                  Net: {fmtK(net)} RWF
                </div>
                <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: '#e0e0e0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: profit ? '#4CAF50' : '#F44336',
                    width: `${Math.min(100, c.total_revenues_rwf > 0 ? (c.total_revenues_rwf / (c.total_costs_rwf + c.total_revenues_rwf || 1)) * 100 : 0)}%` }} />
                </div>
              </div>
            );
          })}
          {filteredSummary.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              No cows match your filters.
            </div>
          )}
        </div>
      </div>

      {/* Drill-down modal */}
      {selectedCow && <CowDrillDown cowId={selectedCow} onClose={() => setSelectedCow(null)} p={p} />}
    </div>
  );
}

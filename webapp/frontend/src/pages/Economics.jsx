import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getComponents, getComponentsByCategory, getMilkRevenue, getEconomicsSummary } from '../lib/api';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, LabelList,
} from 'recharts';
import { format } from 'date-fns';

const CAT_COLOR = {
  Controller: '#1E4D7B', Sensor: '#4CAF50', Actuator: '#FF9800',
  Power: '#F44336', Network: '#00BCD4', Other: '#9E9E9E',
};

export default function Economics() {
  const [price, setPrice] = useState(400);
  const [catFilter, setCatFilter] = useState('All');

  const { data: components = [] } = useQuery({ queryKey: ['components'], queryFn: getComponents });
  const { data: byCat = [] } = useQuery({ queryKey: ['by-category'], queryFn: getComponentsByCategory });
  const { data: econSummary } = useQuery({ queryKey: ['economics-summary'], queryFn: getEconomicsSummary });
  const { data: revenue } = useQuery({ queryKey: ['milk-revenue', price], queryFn: () => getMilkRevenue(price) });

  // Derived from economics summary (all from DB)
  const farm = econSummary?.farm || {};
  const totalRwf = Number(econSummary?.total_cost_rwf || 0);
  const componentCount = Number(econSummary?.component_count || 0);
  const operationalCount = Number(econSummary?.operational_components || 0);
  const milk30dLiters = Number(econSummary?.milk_30d_liters || 0);
  const avgLitersPerSession = Number(econSummary?.avg_liters_per_session || 0);

  // Revenue uses user-adjustable price applied client-side
  const monthlRevenue = milk30dLiters * price;

  // Pie data (skip the ROLLUP null row)
  const pieData = byCat.filter(r => r.category).map(r => ({
    name: r.category, value: Number(r.total_cost_rwf), fill: CAT_COLOR[r.category] || '#999',
  }));

  const revenueChart = (revenue?.daily || []).map(r => ({
    date: r.milk_date ? format(new Date(r.milk_date), 'MMM d') : '',
    liters: Number(r.total_liters).toFixed(1),
    revenue: Number(r.revenue_rwf).toFixed(0),
  })).reverse();

  const filtered = catFilter === 'All' ? components : components.filter(c => c.category === catFilter);
  const cats = [...new Set(components.map(c => c.category))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Farm info banner — from DB */}
      {farm.farm_name && (
        <div style={{
          background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)',
          borderRadius: 12, padding: '14px 20px', color: '#fff',
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>🐄 {farm.farm_name}</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>
              {farm.location} &nbsp;·&nbsp; Est. {farm.established_year} &nbsp;·&nbsp; {farm.total_area_hectares} ha
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ opacity: .7 }}>Operational Components</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{operationalCount} / {componentCount}</div>
          </div>
        </div>
      )}

      {/* KPI cards — all values from DB */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
        {[
          {
            label: 'Total System Cost', color: '#1E4D7B',
            val: totalRwf > 0 ? `${(totalRwf / 1_000_000).toFixed(2)}M RWF` : '--',
            sub: `${componentCount} components (${operationalCount} operational)`,
          },
          {
            label: '30-Day Milk Revenue', color: '#4CAF50',
            val: monthlRevenue > 0 ? `${(monthlRevenue / 1000).toFixed(0)}K RWF` : '--',
            sub: `@ ${price} RWF/L · ${milk30dLiters.toFixed(0)} L produced`,
          },
          {
            label: 'ROI Progress', color: '#00BCD4',
            val: totalRwf > 0 && monthlRevenue > 0 ? `${((monthlRevenue / totalRwf) * 100).toFixed(2)}%` : '--',
            sub: 'monthly revenue vs capital cost',
          },
          {
            label: 'Avg Yield / Session', color: '#FF9800',
            val: avgLitersPerSession > 0 ? `${avgLitersPerSession.toFixed(1)} L` : '--',
            sub: `${farm.location || '--'} · ${farm.farm_name || ''}`,
          },
        ].map(({ label, val, sub, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color, fontSize: 20 }}>{val}</span>
            <span className="sub">{sub}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>💰 Cost by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData} cx="50%" cy="50%"
                outerRadius={80} innerRadius={35}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} RWF`]} />
              <Legend iconSize={10} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>💰 30-Day Milk Revenue</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Price/L:</span>
              <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))}
                style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>RWF</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueChart}>
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4CAF50" stopOpacity={.3} />
                  <stop offset="100%" stopColor="#4CAF50" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} RWF`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#4CAF50" fill="url(#rg)" strokeWidth={2} name="Revenue RWF" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category cost breakdown bar chart */}
      <div className="card">
        <div className="section-header">
          <h2>📦 Cost Breakdown by Category</h2>
          <span style={{ fontSize: 13, fontWeight: 700 }}>TOTAL: {totalRwf.toLocaleString()} RWF</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={byCat.filter(r => r.category).map(r => ({
              category: r.category,
              cost: Number(r.total_cost_rwf),
              units: r.total_units,
              fill: CAT_COLOR[r.category] || '#999',
            }))}
            layout="vertical"
            margin={{ top: 4, right: 80, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} unit=" RWF" />
            <YAxis dataKey="category" type="category" tick={{ fontSize: 12, fontWeight: 600 }} width={90} />
            <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} RWF`, 'Total Cost']} />
            <Bar dataKey="cost" name="Cost (RWF)" radius={[0, 6, 6, 0]}>
              <LabelList dataKey="cost" position="right" style={{ fontSize: 11, fontWeight: 700 }} formatter={v => `${(v / 1000).toFixed(0)}K`} />
              {byCat.filter(r => r.category).map((r, i) => (
                <Cell key={i} fill={CAT_COLOR[r.category] || '#999'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Components table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>🔧 IoT Components Inventory</h2>
          {['All', ...cats].map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className="btn"
              style={{
                padding: '4px 10px', fontSize: 11,
                background: catFilter === c ? (CAT_COLOR[c] || '#1E4D7B') : 'var(--bg)',
                color: catFilter === c ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>{c}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Component</th><th>Category</th><th>Qty</th><th>Unit Price (RWF)</th><th>Total Cost (RWF)</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.component_id}>
                  <td style={{ fontWeight: 600 }}>{c.component_name}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${CAT_COLOR[c.category] || '#999'}22`, color: CAT_COLOR[c.category] || '#333', fontWeight: 600 }}>
                      {c.category}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.quantity}</td>
                  <td style={{ fontFamily: 'monospace' }}>{Number(c.unit_price_rwf).toLocaleString()}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1E4D7B' }}>{Number(c.total_cost_rwf).toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-${c.status === 'Operational' ? 'healthy' : c.status === 'Faulty' ? 'critical' : 'warning'}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

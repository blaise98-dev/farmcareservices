import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMilkDailySummary, getTopProducers, getTodaySessions, addMilkRecord, getCows } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import RoleGuard from '../components/RoleGuard';
import { BarChart as EBar, HBarChart, ChartCard } from '../components/ChartKit';
import { Plus, Droplets, Lock } from 'lucide-react';
import { format } from 'date-fns';

export default function Milk() {
  const p = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    cow_id: '', milk_amount_liters: '', milking_session: 'Morning', milk_quality: 'Normal',
    milk_sold_liters: '', milk_consumed_liters: '', milk_calves_liters: '', milk_lost_liters: '',
    price_per_liter_rwf: 400, entry_date: '',
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const qc = useQueryClient();

  const { data: daily = [] } = useQuery({ queryKey: ['milk-daily'], queryFn: () => getMilkDailySummary(14) });
  const { data: top = [] } = useQuery({ queryKey: ['top-producers'], queryFn: getTopProducers });
  const { data: sessions = [] } = useQuery({ queryKey: ['today-sessions'], queryFn: getTodaySessions });
  const { data: cows = [] } = useQuery({ queryKey: ['cows'], queryFn: getCows });

  const mutation = useMutation({
    mutationFn: addMilkRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milk-daily'] });
      qc.invalidateQueries({ queryKey: ['today-sessions'] });
      qc.invalidateQueries({ queryKey: ['top-producers'] });
      setShowForm(false);
      setForm({ cow_id: '', milk_amount_liters: '', milking_session: 'Morning', milk_quality: 'Normal', milk_sold_liters: '', milk_consumed_liters: '', milk_calves_liters: '', milk_lost_liters: '', price_per_liter_rwf: 400, entry_date: '' });
    },
  });

  // Chart: daily total per day (summed across cows)
  const byDate = daily.reduce((acc, r) => {
    const d = r.milk_date ? format(new Date(r.milk_date), 'MMM d') : '';
    if (!acc[d]) acc[d] = { date: d, morning: 0, evening: 0, total: 0 };
    acc[d].morning += Number(r.morning_milk || 0);
    acc[d].evening += Number(r.evening_milk || 0);
    acc[d].total += Number(r.total_daily_milk || 0);
    return acc;
  }, {});
  const chartData = Object.values(byDate).reverse();

  const totalToday = sessions.reduce((s, r) => s + Number(r.total_liters || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Session summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        <div className="stat-card" style={{ borderLeftColor: '#00BCD4' }}>
          <span className="label">Total Today</span>
          <span className="value" style={{ color: '#00BCD4' }}>{totalToday.toFixed(1)} L</span>
          <span className="sub">all milking sessions</span>
        </div>
        {sessions.map(s => (
          <div key={s.milking_session} className="stat-card" style={{ borderLeftColor: s.milking_session === 'Morning' ? '#FF9800' : '#9C27B0' }}>
            <span className="label">{s.milking_session} Session</span>
            <span className="value" style={{ color: s.milking_session === 'Morning' ? '#FF9800' : '#9C27B0' }}>
              {Number(s.total_liters).toFixed(1)} L
            </span>
            <span className="sub">{s.cows_milked} cows · avg {Number(s.avg_liters).toFixed(1)} L</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🥛 14-Day Milk Production" sub="Stacked morning / evening sessions">
          <EBar
            data={chartData} xKey="date"
            series={[{ key: 'morning', name: 'Morning', color: '#FF9800' }, { key: 'evening', name: 'Evening', color: '#9C27B0' }]}
            stacked unit=" L" height={240}
          />
        </ChartCard>

        <ChartCard title="🏆 Top 5 Producers" sub="7-day cumulative milk output">
          <HBarChart
            data={top.slice(0, 5).map((c, i) => ({ name: c.cow_name, value: Number(Number(c.total_weekly_milk).toFixed(1)) }))}
            unit=" L" height={240}
            colorFn={(_, i) => ['#FFD700','#C0C0C0','#CD7F32','#4CAF50','#00BCD4'][i]}
          />
        </ChartCard>
      </div>

      {/* Per-cow daily table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>📋 Daily Records per Cow</h2>
          <RoleGuard
            allowed={p.canLogMilk}
            fallback={
              <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={13} /> Logging restricted to Admin/Farmer
              </span>
            }
          >
            <button className="btn btn-primary" onClick={() => setShowForm(t => !t)}>
              <Plus size={14} /> Record Milk
            </button>
          </RoleGuard>
        </div>

        {/* Form — only shown if allowed */}
        {showForm && p.canLogMilk && (
          <div style={{ padding: '16px 20px', background: '#f7f9fc', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cow</label>
              <select value={form.cow_id} onChange={e => setForm(f => ({ ...f, cow_id: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
                <option value="">Select cow…</option>
                {cows.filter(c => c.lactating).map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Total (L)</label>
              <input type="number" step="0.1" value={form.milk_amount_liters}
                onChange={e => setForm(f => ({ ...f, milk_amount_liters: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 90 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Session</label>
              <select value={form.milking_session} onChange={e => setForm(f => ({ ...f, milking_session: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
                <option>Morning</option><option>Evening</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Quality</label>
              <select value={form.milk_quality} onChange={e => setForm(f => ({ ...f, milk_quality: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}>
                <option>Excellent</option><option>Good</option><option>Normal</option><option>Poor</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Price (RWF/L)</label>
              <input type="number" step="1" value={form.price_per_liter_rwf} onChange={e => setForm(f => ({ ...f, price_per_liter_rwf: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
            </div>
            {/* Breakdown toggle */}
            <div style={{ width: '100%', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowBreakdown(v => !v)} style={{ fontSize: 11, padding: '3px 10px', marginBottom: showBreakdown ? 10 : 0 }}>
                {showBreakdown ? '▲ Hide' : '▼ Show'} Breakdown (Sold / Consumed / Calves / Lost)
              </button>
              {showBreakdown && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[['Sold (L)', 'milk_sold_liters'], ['Consumed (L)', 'milk_consumed_liters'], ['Calves (L)', 'milk_calves_liters'], ['Lost (L)', 'milk_lost_liters']].map(([lbl, key]) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{lbl}</label>
                      <input type="number" step="0.1" min="0" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 80 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button className="btn btn-primary" disabled={mutation.isPending || !form.cow_id || !form.milk_amount_liters}
                onClick={() => mutation.mutate({ ...form, cow_id: Number(form.cow_id), milk_amount_liters: Number(form.milk_amount_liters), milk_sold_liters: Number(form.milk_sold_liters || 0), milk_consumed_liters: Number(form.milk_consumed_liters || 0), milk_calves_liters: Number(form.milk_calves_liters || 0), milk_lost_liters: Number(form.milk_lost_liters || 0), price_per_liter_rwf: Number(form.price_per_liter_rwf || 400) })}>
                {mutation.isPending ? 'Saving…' : 'Save Record'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Cow</th><th>Date</th><th>Morning (L)</th><th>Evening (L)</th><th>Daily Total</th></tr>
            </thead>
            <tbody>
              {daily.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.cow_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.milk_date ? format(new Date(r.milk_date), 'MMM d, yyyy') : ''}</td>
                  <td style={{ color: '#FF9800', fontWeight: 600 }}>{Number(r.morning_milk).toFixed(1)}</td>
                  <td style={{ color: '#9C27B0', fontWeight: 600 }}>{Number(r.evening_milk).toFixed(1)}</td>
                  <td style={{ fontWeight: 700, color: '#00BCD4' }}>{Number(r.total_daily_milk).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {daily.length === 0 && <div className="empty-state"><Droplets size={40} /><span>No milk records found</span></div>}
        </div>
      </div>
    </div>
  );
}

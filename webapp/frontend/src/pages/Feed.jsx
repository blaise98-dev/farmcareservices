import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeedDailySummary, getWaterToday, addFeedRecord, getCows, getGroups, getMethaneSummary } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import RoleGuard from '../components/RoleGuard';
import { BarChart as EBar, HBarChart, ChartCard } from '../components/ChartKit';
import { Plus, Leaf, Lock, Wind } from 'lucide-react';
import { format } from 'date-fns';

// Feed types with their methane impact classification
const FEED_TYPES = [
  // Increases methane
  { label: 'Low-quality mature grass',    value: 'Low-quality mature grass',    impact: 'Increases' },
  { label: 'Dry standing grass',          value: 'Dry standing grass',          impact: 'Increases' },
  { label: 'Poor-quality hay',            value: 'Poor-quality hay',            impact: 'Increases' },
  { label: 'Maize stover',                value: 'Maize stover',                impact: 'Increases' },
  { label: 'Rice straw',                  value: 'Rice straw',                  impact: 'Increases' },
  { label: 'Wheat straw',                 value: 'Wheat straw',                 impact: 'Increases' },
  { label: 'Sorghum stover',              value: 'Sorghum stover',              impact: 'Increases' },
  { label: 'Very mature forage',          value: 'Very mature forage',          impact: 'Increases' },
  { label: 'Untreated cereal straw',      value: 'Untreated cereal straw',      impact: 'Increases' },
  { label: 'Low-quality natural pasture', value: 'Low-quality natural pasture', impact: 'Increases' },
  // Reduces methane
  { label: 'Young Napier grass',          value: 'Young Napier grass',          impact: 'Reduces' },
  { label: 'Brachiaria grass',            value: 'Brachiaria grass',            impact: 'Reduces' },
  { label: 'Improved pasture',            value: 'Improved pasture',            impact: 'Reduces' },
  { label: 'Lucerne (Alfalfa)',           value: 'Lucerne (Alfalfa)',           impact: 'Reduces' },
  { label: 'Desmodium',                   value: 'Desmodium',                   impact: 'Reduces' },
  { label: 'Lablab',                      value: 'Lablab',                      impact: 'Reduces' },
  { label: 'Calliandra',                  value: 'Calliandra',                  impact: 'Reduces' },
  { label: 'Leucaena',                    value: 'Leucaena',                    impact: 'Reduces' },
  { label: 'Maize grain',                 value: 'Maize grain',                 impact: 'Reduces' },
  { label: 'Barley',                      value: 'Barley',                      impact: 'Reduces' },
  { label: 'Wheat bran',                  value: 'Wheat bran',                  impact: 'Reduces' },
  { label: 'Molasses',                    value: 'Molasses',                    impact: 'Reduces' },
  { label: 'Maize silage',                value: 'Maize silage',                impact: 'Reduces' },
  { label: 'Sorghum silage',              value: 'Sorghum silage',              impact: 'Reduces' },
  { label: 'Sugar graze silage',          value: 'Sugar graze silage',          impact: 'Reduces' },
  // Neutral / mixed
  { label: 'Mixed Feed (TMR)',            value: 'Mixed Feed',                  impact: 'Neutral' },
  { label: 'Hay (good quality)',          value: 'Hay',                         impact: 'Neutral' },
  { label: 'Concentrate',                 value: 'Concentrate',                 impact: 'Neutral' },
];

const IMPACT_COLOR  = { Increases: '#c62828', Reduces: '#2E7D32', Neutral: '#607D8B' };
const IMPACT_BG     = { Increases: '#fde8e8', Reduces: '#e8f5e9', Neutral: '#f5f5f5' };

const EMPTY_FORM = { cow_id: '', group_id: '', feed_amount_kg: '', feed_type: 'Mixed Feed', methane_impact: 'Neutral', entry_date: '', prescription_notes: '' };

export default function Feed() {
  const p = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedMode, setFeedMode] = useState('cow');
  const qc = useQueryClient();

  const { data: feedSummary = []  } = useQuery({ queryKey: ['feed-daily'],     queryFn: getFeedDailySummary });
  const { data: waterToday = []   } = useQuery({ queryKey: ['water-today'],    queryFn: getWaterToday });
  const { data: cows = []         } = useQuery({ queryKey: ['cows'],           queryFn: getCows });
  const { data: groups = []       } = useQuery({ queryKey: ['groups'],         queryFn: getGroups });
  const { data: methaneSummary = [] } = useQuery({ queryKey: ['methane-summary'], queryFn: getMethaneSummary });

  const selectedFeedType = FEED_TYPES.find(f => f.value === form.feed_type);

  const mutation = useMutation({
    mutationFn: addFeedRecord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed-daily'] });
      qc.invalidateQueries({ queryKey: ['methane-summary'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
    },
  });

  // Today's total feed
  const today = format(new Date(), 'MMM d');
  const todayFeed = feedSummary.filter(r => r.feed_date && format(new Date(r.feed_date), 'MMM d') === today);
  const totalFeedToday = todayFeed.reduce((s, r) => s + Number(r.total_kg || 0), 0);

  // Chart data: daily totals
  const byDate = feedSummary.reduce((acc, r) => {
    const d = r.feed_date ? format(new Date(r.feed_date), 'MMM d') : '';
    if (!acc[d]) acc[d] = { date: d, total: 0 };
    acc[d].total += Number(r.total_kg || 0);
    return acc;
  }, {});
  const chartData = Object.values(byDate).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        <div className="stat-card" style={{ borderLeftColor: '#4CAF50' }}>
          <span className="label">Feed Today</span>
          <span className="value" style={{ color: '#4CAF50' }}>{totalFeedToday.toFixed(1)} kg</span>
          <span className="sub">total dispensed</span>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#00BCD4' }}>
          <span className="label">Water Today</span>
          <span className="value" style={{ color: '#00BCD4' }}>
            {waterToday.reduce((s, r) => s + Number(r.total_liters || 0), 0).toFixed(0)} L
          </span>
          <span className="sub">across all cows</span>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#FF9800' }}>
          <span className="label">Avg Feed / Cow</span>
          <span className="value" style={{ color: '#FF9800' }}>
            {todayFeed.length ? (totalFeedToday / todayFeed.length).toFixed(1) : '--'} kg
          </span>
          <span className="sub">per cow today</span>
        </div>
        <div className="stat-card" style={{ borderLeftColor: '#9C27B0' }}>
          <span className="label">Cows Fed Today</span>
          <span className="value" style={{ color: '#9C27B0' }}>{todayFeed.length}</span>
          <span className="sub">dispensed by IoT</span>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🌿 Daily Feed Totals" sub="Total feed dispensed per day (kg)">
          <EBar data={chartData} xKey="date"
            series={[{ key: 'total', name: 'Feed (kg)', color: '#4CAF50' }]}
            unit=" kg" showLabel height={240} />
        </ChartCard>

        <ChartCard title="💧 Water Intake Today" sub="Per-cow consumption — threshold 30 L">
          <HBarChart
            data={waterToday.map(w => ({ name: w.cow_name, value: Number(Number(w.total_liters).toFixed(0)) }))}
            unit=" L" height={240}
            colorFn={(d) => Number(d.value) < 30 ? '#F44336' : '#00BCD4'}
          />
        </ChartCard>
      </div>

      {/* Methane Impact Summary */}
      {methaneSummary.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wind size={16} color="#607D8B" /> Methane Impact by Cow (last 30 days)
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            % of diet from high-methane feeds — target below 30% to reduce farm emissions
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {methaneSummary.map(r => {
              const pct = Number(r.high_methane_pct || 0);
              const color = pct > 60 ? '#c62828' : pct > 30 ? '#FF9800' : '#2E7D32';
              return (
                <div key={r.cow_id} style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${color}33`, background: `${color}08` }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.cow_name}</div>
                  <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: '#e0e0e0', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, color, fontWeight: 700 }}>{pct.toFixed(1)}% high-methane feed</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Total: {Number(r.total_kg).toFixed(1)} kg · High: {Number(r.high_methane_kg).toFixed(1)} kg
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed Records Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>📋 Feed Records (7 days)</h2>
          <RoleGuard
            allowed={p.canLogFeed}
            fallback={
              <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={13} /> Logging restricted to Admin/Farmer
              </span>
            }
          >
            <button className="btn btn-primary" onClick={() => setShowForm(t => !t)}>
              <Plus size={14} /> Record Feeding
            </button>
          </RoleGuard>
        </div>

        {showForm && p.canLogFeed && (
          <div style={{ padding: '16px 20px', background: '#f7f9fc', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Feed mode toggle */}
            <div style={{ width: '100%', display: 'flex', gap: 8 }}>
              {['cow', 'group'].map(m => (
                <button key={m} type="button" className="btn"
                  onClick={() => { setFeedMode(m); setForm(f => ({ ...f, cow_id: '', group_id: '' })); }}
                  style={{ padding: '5px 14px', fontSize: 12, background: feedMode === m ? '#4CAF50' : 'var(--bg)', color: feedMode === m ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {m === 'cow' ? '🐄 Per Cow' : '👥 Group Feed'}
                </button>
              ))}
            </div>
            {feedMode === 'cow' ? (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cow</label>
                <select value={form.cow_id} onChange={e => setForm(f => ({ ...f, cow_id: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
                  <option value="">Select cow…</option>
                  {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Group</label>
                <select value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 140 }}>
                  <option value="">Select group…</option>
                  {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Amount (kg)</label>
              <input type="number" step="0.1" value={form.feed_amount_kg}
                onChange={e => setForm(f => ({ ...f, feed_amount_kg: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 100 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Feed Type</label>
              <select value={form.feed_type}
                onChange={e => {
                  const ft = FEED_TYPES.find(f => f.value === e.target.value);
                  setForm(f => ({ ...f, feed_type: e.target.value, methane_impact: ft?.impact || 'Neutral' }));
                }}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff', minWidth: 200 }}>
                <optgroup label="Increases Methane Emissions">
                  {FEED_TYPES.filter(f => f.impact === 'Increases').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </optgroup>
                <optgroup label="Reduces Methane Emissions">
                  {FEED_TYPES.filter(f => f.impact === 'Reduces').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </optgroup>
                <optgroup label="Neutral / Mixed">
                  {FEED_TYPES.filter(f => f.impact === 'Neutral').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </optgroup>
              </select>
            </div>
            {/* Methane impact indicator — appears after feed type is chosen */}
            {form.feed_type && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: IMPACT_BG[form.methane_impact], border: `1px solid ${IMPACT_COLOR[form.methane_impact]}44` }}>
                <Wind size={14} color={IMPACT_COLOR[form.methane_impact]} />
                <span style={{ fontSize: 12, fontWeight: 700, color: IMPACT_COLOR[form.methane_impact] }}>
                  Methane Impact: {form.methane_impact}
                </span>
                {form.methane_impact === 'Increases' && <span style={{ fontSize: 11, color: '#c62828' }}>— consider substituting with legumes or silage</span>}
                {form.methane_impact === 'Reduces'   && <span style={{ fontSize: 11, color: '#2E7D32' }}>— good choice for emission reduction</span>}
              </div>
            )}
            {p.isVet && (
              <div style={{ flexBasis: '100%' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9C27B0', display: 'block', marginBottom: 4 }}>Prescription Notes (Vet)</label>
                <input value={form.prescription_notes} onChange={e => setForm(f => ({ ...f, prescription_notes: e.target.value }))}
                  placeholder="Nutrition prescription notes…"
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #9C27B0', fontSize: 13, width: 340 }} />
              </div>
            )}
            <button className="btn btn-primary"
              disabled={mutation.isPending || (!form.cow_id && !form.group_id) || !form.feed_amount_kg}
              onClick={() => mutation.mutate({ ...form, cow_id: form.cow_id ? Number(form.cow_id) : null, group_id: form.group_id ? Number(form.group_id) : null, feed_amount_kg: Number(form.feed_amount_kg) })}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Cow</th><th>Date</th><th>Feed Type</th><th>Feed (kg)</th><th>Daily Total (kg)</th><th>Methane</th></tr>
            </thead>
            <tbody>
              {feedSummary.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.cow_name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.feed_date ? format(new Date(r.feed_date), 'MMM d, yyyy') : ''}</td>
                  <td style={{ fontSize: 12 }}>{r.feed_type || '—'}</td>
                  <td>{Number(r.avg_kg).toFixed(1)}</td>
                  <td style={{ fontWeight: 700, color: '#4CAF50' }}>{Number(r.total_kg).toFixed(1)}</td>
                  <td>
                    {r.methane_impact ? (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: IMPACT_BG[r.methane_impact], color: IMPACT_COLOR[r.methane_impact] }}>
                        {r.methane_impact}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {feedSummary.length === 0 && <div className="empty-state"><Leaf size={40} /><span>No feed records found</span></div>}
        </div>
      </div>
    </div>
  );
}

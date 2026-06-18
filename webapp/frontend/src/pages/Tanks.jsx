import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTanks, getTankHistory, addTankReading, createTank } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, X, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { LineChart as ELine, GaugeChart, ChartCard } from '../components/ChartKit';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const TYPE_COLOR = { Water: '#00BCD4', Milk: '#FF9800', Chemical: '#9C27B0', Other: '#607D8B' };

export default function Tanks() {
  const [selectedTank, setSelectedTank] = useState(null);
  const [showReading, setShowReading]   = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [readingForm, setReadingForm]   = useState({ tank_id: '', level_liters: '', action: 'Reading', notes: '' });
  const [createForm, setCreateForm]     = useState({ tank_name: '', tank_type: 'Water', capacity_liters: '', current_level_liters: 0, min_level_liters: '', location: '' });
  const [err, setErr] = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();
  const canWrite = p.isAdmin || p.isTechnician;

  const { data: tanks = []   } = useQuery({ queryKey: ['tanks'],                     queryFn: getTanks });
  const { data: history = []  } = useQuery({ queryKey: ['tank-history', selectedTank?.tank_id], queryFn: () => getTankHistory(selectedTank.tank_id), enabled: !!selectedTank });

  const readingMut = useMutation({
    mutationFn: addTankReading,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tanks'] }); qc.invalidateQueries({ queryKey: ['tank-history', selectedTank?.tank_id] }); setShowReading(false); setReadingForm({ tank_id: '', level_liters: '', action: 'Reading', notes: '' }); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const createMut = useMutation({
    mutationFn: createTank,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tanks'] }); setShowCreate(false); setCreateForm({ tank_name: '', tank_type: 'Water', capacity_liters: '', current_level_liters: 0, min_level_liters: '', location: '' }); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });

  const histChart = [...history].reverse().map(h => ({
    time: h.recorded_at ? format(new Date(h.recorded_at), 'MMM d HH:mm') : '',
    level: Number(h.level_liters).toFixed(0),
    action: h.action,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0277BD,#00BCD4)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🚰 Tanks & Water Systems</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Monitor water and milk tank levels in real-time</div>
        </div>
        {canWrite && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => { setShowReading(true); setErr(''); }} style={{ background: '#fff', color: '#0277BD', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13 }}>
              <Plus size={14} /> Log Reading
            </button>
            <button className="btn" onClick={() => { setShowCreate(true); setErr(''); }} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 13 }}>
              <Plus size={14} /> New Tank
            </button>
          </div>
        )}
      </div>

      {/* Tank cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {tanks.map(t => {
          const fillPct = Math.min(100, Number(t.fill_pct || 0));
          const color = TYPE_COLOR[t.tank_type] || '#00BCD4';
          const isLow = t.is_low;
          return (
            <div key={t.tank_id}
              onClick={() => setSelectedTank(t)}
              style={{ padding: '18px 20px', borderRadius: 12, border: `2px solid ${selectedTank?.tank_id === t.tank_id ? color : isLow ? '#F44336' : 'var(--border)'}`, cursor: 'pointer', background: '#fff', transition: 'all .2s', boxShadow: selectedTank?.tank_id === t.tank_id ? `0 4px 20px ${color}33` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{t.tank_name}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${color}22`, color, fontWeight: 600 }}>{t.tank_type}</span>
              </div>
              {isLow && <div style={{ fontSize: 11, color: '#F44336', fontWeight: 700, marginBottom: 8 }}>⚠ LEVEL LOW</div>}
              <div style={{ fontSize: 28, fontWeight: 900, color, marginBottom: 8 }}>{fillPct.toFixed(0)}%</div>
              <div className="gauge-bar" style={{ height: 12, borderRadius: 6 }}>
                <div style={{ height: '100%', width: `${fillPct}%`, background: isLow ? '#F44336' : color, borderRadius: 6, transition: 'width .5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{Number(t.current_level_liters).toFixed(0)} L</span>
                <span style={{ color: 'var(--text-secondary)' }}>/ {Number(t.capacity_liters).toFixed(0)} L</span>
              </div>
              {t.location && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>📍 {t.location}</div>}
            </div>
          );
        })}
        {tanks.length === 0 && <div className="empty-state"><Droplets size={40} /><span>No tanks configured</span></div>}
      </div>

      {/* Tank history chart */}
      {selectedTank && histChart.length > 0 && (
        <ChartCard title={`📈 ${selectedTank.tank_name} — Level History`} sub="Tank level readings over time">
          <ELine data={histChart} xKey="time"
            series={[{ key: 'level', name: 'Level (L)', color: '#00BCD4' }]}
            area smooth height={220} unit=" L"
          />
        </ChartCard>
      )}

      {/* Reading history table */}
      {selectedTank && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>📋 {selectedTank.tank_name} — Recent Readings</h2>
          </div>
          <table className="data-table">
            <thead><tr><th>Level (L)</th><th>Action</th><th>Notes</th><th>By</th><th>Time</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.reading_id}>
                  <td style={{ fontWeight: 700, color: '#00BCD4' }}>{Number(h.level_liters).toFixed(0)} L</td>
                  <td><span className={`badge badge-${h.action === 'Refill' ? 'healthy' : 'normal'}`}>{h.action}</span></td>
                  <td style={{ fontSize: 12 }}>{h.notes || '—'}</td>
                  <td style={{ fontSize: 12 }}>{h.recorded_by || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.recorded_at ? format(new Date(h.recorded_at), 'MMM d HH:mm') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Reading Modal */}
      {showReading && canWrite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#0277BD,#00BCD4)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🚰 Log Tank Reading</h2>
              <button onClick={() => setShowReading(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!readingForm.tank_id || !readingForm.level_liters) { setErr('Tank and level are required'); return; } readingMut.mutate({ ...readingForm, tank_id: Number(readingForm.tank_id), level_liters: Number(readingForm.level_liters) }); }}
              style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Tank *</label>
                <select style={INPUT} value={readingForm.tank_id} onChange={e => setReadingForm(f => ({ ...f, tank_id: e.target.value }))} required>
                  <option value="">Select tank…</option>
                  {tanks.map(t => <option key={t.tank_id} value={t.tank_id}>{t.tank_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Level (L) *</label><input type="number" step="0.1" min="0" style={INPUT} value={readingForm.level_liters} onChange={e => setReadingForm(f => ({ ...f, level_liters: e.target.value }))} required /></div>
                <div>
                  <label style={LABEL}>Action</label>
                  <select style={INPUT} value={readingForm.action} onChange={e => setReadingForm(f => ({ ...f, action: e.target.value }))}>
                    <option>Reading</option><option>Refill</option><option>Drain</option>
                  </select>
                </div>
              </div>
              <div><label style={LABEL}>Notes</label><input style={INPUT} value={readingForm.notes} onChange={e => setReadingForm(f => ({ ...f, notes: e.target.value }))} /></div>
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowReading(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13 }} disabled={readingMut.isPending}>Save Reading</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

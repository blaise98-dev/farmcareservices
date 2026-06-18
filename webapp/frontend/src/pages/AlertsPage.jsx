import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRealtime } from '../context/RealtimeContext';
import { getAlerts, resolveAlert, createAlert, getSmsLogs, getAlertStats, getCows } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { HBarChart, ChartCard } from '../components/ChartKit';
import { CheckCircle, AlertTriangle, MessageSquare, Plus, X } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const SEV_CONFIG = {
  Emergency: { color: '#b71c1c', bg: '#fde8e8' },
  Critical:  { color: '#c62828', bg: '#fde8e8' },
  Warning:   { color: '#e65100', bg: '#fff8e1' },
  Info:      { color: '#1565c0', bg: '#e3f2fd' },
};

const ALERT_TYPES = ['Temperature','Air Quality','Health','Feed','Water','Milk','System'];

export default function AlertsPage() {
  const p = usePermissions();
  const [tab, setTab] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ alert_type: 'System', cow_id: '', severity: 'Warning', message: '' });
  const [createErr, setCreateErr] = useState('');
  const { notifications } = useRealtime();
  const qc = useQueryClient();

  const { data: activeAlerts = [], isLoading } = useQuery({
    queryKey: ['alerts', false], queryFn: () => getAlerts(false), refetchInterval: 15000,
  });
  const { data: resolvedAlerts = [] } = useQuery({
    queryKey: ['alerts', true], queryFn: () => getAlerts(true), enabled: tab === 'resolved',
  });
  const { data: smsLogs = [] } = useQuery({
    queryKey: ['sms-logs'], queryFn: getSmsLogs, enabled: tab === 'sms',
  });
  const { data: stats = [] } = useQuery({ queryKey: ['alert-stats'], queryFn: getAlertStats });

  const { data: cows = [] } = useQuery({ queryKey: ['cows'], queryFn: getCows });

  const resolveMut = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
  const createMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      setShowCreate(false);
      setCreateForm({ alert_type: 'System', cow_id: '', severity: 'Warning', message: '' });
      setCreateErr('');
    },
    onError: (e) => setCreateErr(e.response?.data?.detail || 'Failed to create alert'),
  });

  const TYPE_COLOR = {
    Temperature: '#FF9800', 'Air Quality': '#9C27B0', Health: '#F44336',
    Feed: '#4CAF50', Water: '#00BCD4', Milk: '#2196F3', System: '#607D8B',
  };

  const statChart = stats.reduce((acc, r) => {
    const key = r.alert_type;
    if (!acc[key]) acc[key] = { type: key, total: 0, Warning: 0, Critical: 0, Info: 0, Emergency: 0 };
    acc[key][r.severity] = (acc[key][r.severity] || 0) + r.cnt;
    acc[key].total += r.cnt;
    return acc;
  }, {});
  const chartData = Object.values(statChart);

  const alerts = tab === 'resolved' ? resolvedAlerts : activeAlerts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
        {[
          { label: 'Active Alerts', val: activeAlerts.length, color: activeAlerts.length > 0 ? '#F44336' : '#4CAF50' },
          { label: 'Critical / Emergency', val: activeAlerts.filter(a => ['Critical','Emergency'].includes(a.severity)).length, color: '#c62828' },
          { label: 'Warnings', val: activeAlerts.filter(a => a.severity === 'Warning').length, color: '#e65100' },
          { label: 'SMS Sent', val: activeAlerts.filter(a => a.is_sent_sms).length, color: '#1E4D7B' },
        ].map(({ label, val, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Stats chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="📊 Alerts by Type" sub="Last 7 days — by category">
          <HBarChart
            data={chartData.map(d => ({ name: d.type, value: d.total }))}
            colorFn={(d) => TYPE_COLOR[d.name] || '#1E4D7B'}
            height={220}
          />
        </ChartCard>

        {/* Live notifications feed */}
        <div className="card">
          <div className="section-header">
            <h2>📡 Real-time Feed</h2>
            <span className="live-dot red" />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notifications.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: 16, textAlign: 'center' }}>No live events yet…</div>
              : notifications.map(n => (
                <div key={n.id} style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  background: SEV_CONFIG[n.severity]?.bg || '#f0f0f0',
                  borderLeft: `3px solid ${SEV_CONFIG[n.severity]?.color || '#999'}`,
                }}>
                  <div style={{ fontWeight: 700, color: SEV_CONFIG[n.severity]?.color }}>{n.severity} — {n.alert_type}</div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{n.message}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Create Alert button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setCreateErr(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
          <Plus size={14} /> Create Alert
        </button>
      </div>

      {/* Alert list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { id: 'active', label: '🚨 Active', count: activeAlerts.length },
            { id: 'resolved', label: '✅ Resolved' },
            { id: 'sms', label: '📱 SMS Log' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="btn"
              style={{
                padding: '6px 14px', fontSize: 13,
                background: tab === t.id ? '#1E4D7B' : 'var(--bg)',
                color: tab === t.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>
              {t.label}
              {t.count > 0 && <span style={{ background: '#F44336', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, marginLeft: 4 }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'sms' ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Phone</th><th>Message</th><th>Status</th><th>Alert Type</th><th>Severity</th><th>Created</th></tr></thead>
              <tbody>
                {smsLogs.map(s => (
                  <tr key={s.sms_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.recipient_phone}</td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{s.message_content}</td>
                    <td><span className={`badge badge-${s.status === 'Delivered' ? 'healthy' : s.status === 'Pending' ? 'warning' : 'critical'}`}>{s.status}</span></td>
                    <td style={{ color: TYPE_COLOR[s.alert_type] || '#333', fontWeight: 600, fontSize: 12 }}>{s.alert_type}</td>
                    <td><span style={{ color: SEV_CONFIG[s.severity]?.color, fontWeight: 700, fontSize: 12 }}>{s.severity}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.created_at ? format(new Date(s.created_at), 'MMM d HH:mm') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {smsLogs.length === 0 && <div className="empty-state"><MessageSquare size={40} /><span>No SMS logs</span></div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isLoading && <div className="spinner" />}
            {alerts.length === 0 && !isLoading && (
              <div className="empty-state"><CheckCircle size={40} /><span>{tab === 'resolved' ? 'No resolved alerts yet' : 'No active alerts — farm is healthy! 🎉'}</span></div>
            )}
            {alerts.map(a => {
              const cfg = SEV_CONFIG[a.severity] || { color: '#999', bg: '#f0f0f0' };
              return (
                <div key={a.alert_id} style={{
                  display: 'flex', gap: 14, padding: '14px 20px',
                  borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start',
                  background: a.is_resolved ? '#fafafa' : '#fff',
                }}>
                  <AlertTriangle size={18} color={cfg.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: cfg.color }}>{a.severity}</span>
                      <span style={{
                        fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 600,
                        background: `${TYPE_COLOR[a.alert_type] || '#999'}22`, color: TYPE_COLOR[a.alert_type] || '#333'
                      }}>{a.alert_type}</span>
                      {a.cow_name && <span style={{ fontSize: 12, color: '#1E4D7B', fontWeight: 600 }}>🐄 {a.cow_name}</span>}
                      {a.is_sent_sms && <span style={{ fontSize: 11, color: '#4CAF50' }}>📱 SMS sent</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{a.message}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {a.created_at ? formatDistanceToNow(new Date(a.created_at), { addSuffix: true }) : ''}
                    </div>
                  </div>
                  {!a.is_resolved && p.canResolveAlert && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
                      disabled={resolveMut.isPending}
                      onClick={() => resolveMut.mutate(a.alert_id)}
                    >
                      <CheckCircle size={12} /> Resolve
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Alert Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#c62828,#e53935)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🚨 Create Alert</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!createForm.message.trim()) { setCreateErr('Message is required'); return; } createMut.mutate({ ...createForm, cow_id: createForm.cow_id ? Number(createForm.cow_id) : null }); }}
              style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Alert Type</label>
                  <select style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    value={createForm.alert_type} onChange={e => setCreateForm(f => ({ ...f, alert_type: e.target.value }))}>
                    {ALERT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Severity</label>
                  <select style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    value={createForm.severity} onChange={e => setCreateForm(f => ({ ...f, severity: e.target.value }))}>
                    <option>Info</option><option>Warning</option><option>Critical</option><option>Emergency</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Related Cow (optional)</label>
                <select style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  value={createForm.cow_id} onChange={e => setCreateForm(f => ({ ...f, cow_id: e.target.value }))}>
                  <option value="">None — farm-wide</option>
                  {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5 }}>Message *</label>
                <textarea
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', height: 80, resize: 'vertical', boxSizing: 'border-box' }}
                  value={createForm.message} onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Describe the alert…" required />
              </div>
              {createErr && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {createErr}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={createMut.isPending} style={{ padding: '9px 22px', fontSize: 13, background: '#c62828', border: 'none' }}>
                  {createMut.isPending ? 'Creating…' : 'Create Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

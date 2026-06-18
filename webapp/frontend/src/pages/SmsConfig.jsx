import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSmsSubscribers, addSmsSubscriber, updateSmsSubscriber, deleteSmsSubscriber, getSmsHistory } from '../lib/api';
import { Plus, X, Trash2, ToggleLeft, ToggleRight, MessageSquare, Phone } from 'lucide-react';
import { format } from 'date-fns';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

const SEV_COLOR = { Info: '#1565c0', Warning: '#e65100', Critical: '#c62828', Emergency: '#b71c1c' };
const STATUS_COLOR = { Sent: '#4CAF50', Delivered: '#2E7D32', Pending: '#FF9800', Failed: '#F44336' };

const EMPTY_FORM = { phone_number: '', full_name: '', min_severity: 'Critical', alert_types: 'All', is_active: true };
const ALERT_TYPES = ['All', 'Temperature', 'Health', 'Air Quality', 'Feed', 'Water', 'Milk', 'System'];

export default function SmsConfig() {
  const [tab, setTab]           = useState('subscribers');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [err, setErr]           = useState('');
  const [alertTypeSelection, setAlertTypeSelection] = useState(['All']);
  const qc = useQueryClient();

  const { data: subscribers = [] } = useQuery({ queryKey: ['sms-subscribers'],  queryFn: getSmsSubscribers });
  const { data: history = []     } = useQuery({ queryKey: ['sms-history'],      queryFn: () => getSmsHistory(100), enabled: tab === 'logs' });

  const addMut = useMutation({
    mutationFn: addSmsSubscriber,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sms-subscribers'] }); setShowModal(false); setForm(EMPTY_FORM); setAlertTypeSelection(['All']); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed to add subscriber'),
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, val }) => updateSmsSubscriber(id, { is_active: val }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-subscribers'] }),
  });
  const deleteMut = useMutation({
    mutationFn: deleteSmsSubscriber,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sms-subscribers'] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.phone_number.trim()) { setErr('Phone number is required'); return; }
    const alertTypes = alertTypeSelection.includes('All') ? 'All' : alertTypeSelection.join(',');
    addMut.mutate({ ...form, alert_types: alertTypes });
  };

  const toggleType = (t) => {
    if (t === 'All') { setAlertTypeSelection(['All']); return; }
    setAlertTypeSelection(prev => {
      const without = prev.filter(x => x !== 'All' && x !== t);
      return prev.includes(t) ? (without.length ? without : ['All']) : [...without, t];
    });
  };

  const activeCount = subscribers.filter(s => s.is_active).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📱 SMS Alert Configuration</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Manage who receives SMS alerts and for which severity levels</div>
        </div>
        <button className="btn" onClick={() => { setShowModal(true); setErr(''); setForm(EMPTY_FORM); setAlertTypeSelection(['All']); }}
          style={{ background: '#4CAF50', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 16px' }}>
          <Plus size={14} /> Add Subscriber
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
        {[
          { label: 'Total Subscribers', val: subscribers.length, color: '#1E4D7B' },
          { label: 'Active',            val: activeCount,        color: '#4CAF50' },
          { label: 'Inactive',          val: subscribers.length - activeCount, color: '#9E9E9E' },
        ].map(({ label, val, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ id: 'subscribers', label: '📋 Subscribers' }, { id: 'logs', label: '📨 SMS History' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="btn"
            style={{ padding: '8px 18px', fontSize: 13, background: tab === t.id ? '#1E4D7B' : 'var(--bg)', color: tab === t.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: tab === t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Subscribers table */}
      {tab === 'subscribers' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Phone</th><th>Name</th><th>Min Severity</th><th>Alert Types</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {subscribers.map(s => (
                <tr key={s.subscriber_id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.phone_number}</td>
                  <td>{s.full_name || '—'}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${SEV_COLOR[s.min_severity] || '#999'}22`, color: SEV_COLOR[s.min_severity] || '#333', fontWeight: 700 }}>
                      {s.min_severity}+
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.alert_types}</td>
                  <td>
                    <span className={`badge badge-${s.is_active ? 'healthy' : 'critical'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: s.is_active ? '#c62828' : '#2E7D32', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => toggleMut.mutate({ id: s.subscriber_id, val: !s.is_active })}
                        disabled={toggleMut.isPending}>
                        {s.is_active ? <><ToggleRight size={12} /> Deactivate</> : <><ToggleLeft size={12} /> Activate</>}
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#c62828' }}
                        onClick={() => { if (window.confirm(`Remove ${s.phone_number}?`)) deleteMut.mutate(s.subscriber_id); }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {subscribers.length === 0 && <div className="empty-state"><Phone size={40} /><span>No SMS subscribers configured</span></div>}
        </div>
      )}

      {/* SMS History */}
      {tab === 'logs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>📨 Recent SMS Log</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Phone</th><th>Message</th><th>Alert Type</th><th>Severity</th><th>Status</th><th>Sent</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.sms_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{h.recipient_phone}</td>
                    <td style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.message_content}</td>
                    <td style={{ fontSize: 12 }}>{h.alert_type || '—'}</td>
                    <td>
                      {h.severity && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: `${SEV_COLOR[h.severity] || '#999'}22`, color: SEV_COLOR[h.severity] || '#333', fontWeight: 700 }}>{h.severity}</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${STATUS_COLOR[h.status] || '#999'}22`, color: STATUS_COLOR[h.status] || '#333', fontWeight: 700 }}>{h.status}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.created_at ? format(new Date(h.created_at), 'MMM d HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && <div className="empty-state"><MessageSquare size={40} /><span>No SMS history</span></div>}
          </div>
        </div>
      )}

      {/* Add Subscriber Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>📱 Add SMS Subscriber</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>Phone Number * (include country code)</label>
                  <input style={INPUT} value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="+250 7XX XXX XXX" required />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>Full Name</label>
                  <input style={INPUT} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jean Pierre" />
                </div>
                <div>
                  <label style={LABEL}>Minimum Severity</label>
                  <select style={INPUT} value={form.min_severity} onChange={e => setForm(f => ({ ...f, min_severity: e.target.value }))}>
                    <option>Info</option><option>Warning</option><option>Critical</option><option>Emergency</option>
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Receive this severity and above
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <label style={{ ...LABEL, marginBottom: 10 }}>Active</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 18, height: 18, accentColor: '#4CAF50' }} />
                    <span style={{ fontWeight: 600, color: form.is_active ? '#4CAF50' : '#999' }}>{form.is_active ? 'Yes — enabled' : 'No — disabled'}</span>
                  </label>
                </div>
              </div>
              <div>
                <label style={LABEL}>Alert Types to Receive</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {ALERT_TYPES.map(t => (
                    <button type="button" key={t} onClick={() => toggleType(t)}
                      style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1px solid ${alertTypeSelection.includes(t) ? '#1E4D7B' : 'var(--border)'}`, background: alertTypeSelection.includes(t) ? '#1E4D7B' : 'var(--bg)', color: alertTypeSelection.includes(t) ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addMut.isPending} style={{ padding: '9px 22px', fontSize: 13 }}>
                  {addMut.isPending ? 'Saving…' : 'Add Subscriber'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

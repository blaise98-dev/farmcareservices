import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllFeedback, getMyFeedback, submitFeedback, replyFeedback, deleteFeedback } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { MessageSquare, Send, X, Trash2, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
const STATUS_COLOR = { New: '#FF9800', InReview: '#00BCD4', Resolved: '#4CAF50', Closed: '#9E9E9E' };
const CAT_COLOR    = { Bug: '#F44336', FeatureRequest: '#9C27B0', General: '#1E4D7B', Complaint: '#FF5722', Compliment: '#4CAF50' };
const CATS = ['Bug','FeatureRequest','General','Complaint','Compliment'];
const EMPTY = { category: 'General', subject: '', message: '', rating: 0 };

function StarRating({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1,2,3,4,5].map(n => (
        <button type="button" key={n} onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 22, color: n <= value ? '#FFD700' : '#ddd' }}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [tab, setTab]           = useState('submit');
  const [form, setForm]         = useState(EMPTY);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [err, setErr]           = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();

  const { data: allFeedback = [] } = useQuery({ queryKey: ['all-feedback'],  queryFn: getAllFeedback, enabled: p.isAdmin && tab === 'admin' });
  const { data: myFeedback = []  } = useQuery({ queryKey: ['my-feedback'],   queryFn: getMyFeedback,  enabled: tab === 'mine' });

  const submitMut = useMutation({
    mutationFn: submitFeedback,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-feedback'] }); setForm(EMPTY); setErr(''); setTab('mine'); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed to submit'),
  });
  const replyMut = useMutation({
    mutationFn: ({ id, body }) => replyFeedback(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-feedback'] }); setReplyTarget(null); setReplyText(''); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteFeedback,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-feedback'] }),
  });

  const fmt = (d) => d ? format(new Date(d), 'MMM d, yyyy HH:mm') : '—';

  const TABS = [
    { id: 'submit', label: '✏️ Submit Feedback' },
    { id: 'mine',   label: '📬 My Feedback' },
    ...(p.isAdmin ? [{ id: 'admin', label: '🛡 Admin Review' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '14px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>💬 Feedback</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Share suggestions, report bugs, or contact support</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="btn"
            style={{ padding: '8px 18px', fontSize: 13, background: tab === t.id ? '#1E4D7B' : 'var(--bg)', color: tab === t.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: tab === t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Submit form */}
      {tab === 'submit' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} /> Submit Feedback
          </h2>
          <form onSubmit={e => { e.preventDefault(); if (!form.subject.trim() || !form.message.trim()) { setErr('Subject and message are required'); return; } submitMut.mutate({ ...form, rating: form.rating || null }); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={LABEL}>Category</label>
              <select style={INPUT} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={LABEL}>Subject *</label><input style={INPUT} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief summary…" required /></div>
            <div><label style={LABEL}>Message *</label><textarea style={{ ...INPUT, height: 100 }} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Describe your feedback in detail…" required /></div>
            <div>
              <label style={LABEL}>Rating (optional)</label>
              <StarRating value={form.rating} onChange={r => setForm(f => ({ ...f, rating: r }))} />
            </div>
            {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
            <button type="submit" className="btn btn-primary" disabled={submitMut.isPending} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px' }}>
              <Send size={14} /> {submitMut.isPending ? 'Sending…' : 'Send Feedback'}
            </button>
          </form>
        </div>
      )}

      {/* My feedback */}
      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {myFeedback.length === 0 && <div className="empty-state"><MessageSquare size={40} /><span>No feedback submitted yet</span></div>}
          {myFeedback.map(f => (
            <div key={f.feedback_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{f.subject}</span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${CAT_COLOR[f.category] || '#999'}22`, color: CAT_COLOR[f.category] || '#333', fontWeight: 600 }}>{f.category}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${STATUS_COLOR[f.status] || '#999'}22`, color: STATUS_COLOR[f.status] || '#333', fontWeight: 600 }}>{f.status}</span>
                  </div>
                </div>
                {f.rating && <div style={{ color: '#FFD700', fontSize: 16 }}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</div>}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text)' }}>{f.message}</p>
              {f.admin_reply && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#e8eef7', borderRadius: 8, borderLeft: '3px solid #1E4D7B' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E4D7B', marginBottom: 4 }}>ADMIN REPLY</div>
                  <p style={{ fontSize: 13, margin: 0 }}>{f.admin_reply}</p>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{fmt(f.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Admin review */}
      {tab === 'admin' && p.isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {['New','InReview','Resolved'].map(s => (
              <div key={s} className="stat-card" style={{ borderLeftColor: STATUS_COLOR[s] }}>
                <span className="label">{s}</span>
                <span className="value" style={{ color: STATUS_COLOR[s] }}>{allFeedback.filter(f => f.status === s).length}</span>
              </div>
            ))}
          </div>
          {allFeedback.length === 0 && <div className="empty-state"><MessageSquare size={40} /><span>No feedback submissions</span></div>}
          {allFeedback.map(f => (
            <div key={f.feedback_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{f.subject}</span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${CAT_COLOR[f.category] || '#999'}22`, color: CAT_COLOR[f.category] || '#333', fontWeight: 600 }}>{f.category}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${STATUS_COLOR[f.status] || '#999'}22`, color: STATUS_COLOR[f.status] || '#333', fontWeight: 600 }}>{f.status}</span>
                    {f.full_name && <span style={{ fontSize: 11, color: '#1E4D7B', fontWeight: 600 }}>👤 {f.full_name} ({f.role})</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {f.status === 'New' && (
                    <button className="btn btn-ghost" onClick={() => setReplyTarget(f)} style={{ fontSize: 11, padding: '4px 10px', color: '#1E4D7B' }}>
                      <MessageSquare size={12} /> Reply
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: '#c62828' }}
                    onClick={() => { if (window.confirm('Delete this feedback?')) deleteMut.mutate(f.feedback_id); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 13 }}>{f.message}</p>
              {f.rating && <div style={{ color: '#FFD700', fontSize: 14 }}>{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</div>}
              {f.admin_reply && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, borderLeft: '3px solid #4CAF50', fontSize: 12 }}>
                  <strong>Your reply:</strong> {f.admin_reply}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>{fmt(f.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Modal */}
      {replyTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>💬 Reply to Feedback</h2>
              <button onClick={() => setReplyTarget(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#f7f9fc', borderRadius: 8, fontSize: 13 }}>
                <strong>{replyTarget.subject}</strong><br />
                <span style={{ color: 'var(--text-secondary)' }}>{replyTarget.message}</span>
              </div>
              <div><label style={LABEL}>Your Reply *</label><textarea style={{ ...INPUT, height: 100 }} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write your response…" /></div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setReplyTarget(null)} style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button className="btn btn-primary" disabled={!replyText.trim() || replyMut.isPending} onClick={() => replyMut.mutate({ id: replyTarget.feedback_id, body: { admin_reply: replyText, status: 'Resolved' } })} style={{ padding: '9px 22px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> Send Reply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

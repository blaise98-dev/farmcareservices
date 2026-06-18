import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getReproduction, getReproSummary, addReproRecord, deleteReproRecord,
  getTreatments, addTreatment, completeTreatment,
  getVaccinations, getVaccinationsDue, addVaccination,
  getBCS, addBCS,
  getCows, createAlert, getVets, getVetReports, resolveAlert,
} from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { format } from 'date-fns';
import { Plus, X, Baby, HeartPulse, Syringe, CheckCircle, AlertTriangle, Bell, Lock } from 'lucide-react';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

const TABS = ['Reproduction', 'Treatments', 'Vaccinations', 'BCS'];

const EMPTY_REPRO = { cow_id: '', calving_date: '', calf_sex: '', calf_weight_kg: '', insemination_date: '', insemination_method: 'AI', expected_calving_date: '', pregnancy_confirmed: false, notes: '' };
const EMPTY_TREAT = { cow_id: '', treatment_date: '', diagnosis: '', drug_name: '', dose: '', duration_days: 1, notes: '', follow_up_date: '' };
const EMPTY_VAX   = { cow_id: '', vaccine_name: '', vaccination_date: '', next_due_date: '', batch_number: '', notes: '' };
const EMPTY_BCS   = { cow_id: '', score: '', notes: '' };

function BCSBar({ score }) {
  const pct = ((score - 1) / 4) * 100;
  const color = score < 2 ? '#F44336' : score < 2.5 ? '#FF5722' : score < 3 ? '#FF9800' : score <= 3.75 ? '#4CAF50' : '#FF9800';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="gauge-bar" style={{ flex: 1, height: 10 }}>
        <div className="gauge-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontWeight: 800, fontSize: 16, color, minWidth: 30 }}>{Number(score).toFixed(1)}</span>
    </div>
  );
}

function StatCard({ label, value, color, sub }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <span className="label">{label}</span>
      <span className="value" style={{ color }}>{value ?? '--'}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export default function Reproduction() {
  const [tab, setTab]           = useState('Reproduction');
  const [showModal, setShowModal] = useState(false);
  const [err, setErr]           = useState('');
  const [reproForm, setReproForm] = useState(EMPTY_REPRO);
  const [treatForm, setTreatForm] = useState(EMPTY_TREAT);
  const [vaxForm, setVaxForm]   = useState(EMPTY_VAX);
  const p  = usePermissions();
  const qc = useQueryClient();

  const { data: records = []   } = useQuery({ queryKey: ['reproduction'],      queryFn: getReproduction });
  const { data: summary        } = useQuery({ queryKey: ['repro-summary'],     queryFn: getReproSummary });
  const { data: treatments = [] } = useQuery({ queryKey: ['treatments'],       queryFn: getTreatments,      enabled: tab === 'Treatments' });
  const { data: vaccinations = [] } = useQuery({ queryKey: ['vaccinations'],   queryFn: getVaccinations,    enabled: tab === 'Vaccinations' });
  const { data: dueSoon = []   } = useQuery({ queryKey: ['vax-due'],           queryFn: getVaccinationsDue, enabled: tab === 'Vaccinations' });
  const { data: bcsRecords = [] } = useQuery({ queryKey: ['bcs'],              queryFn: getBCS,             enabled: tab === 'BCS' });
  const { data: cows = []      } = useQuery({ queryKey: ['cows'],              queryFn: getCows });

  const [bcsForm, setBcsForm] = useState(EMPTY_BCS);
  const [notifyForm, setNotifyForm] = useState({ cow_id: '', vet_id: '', message: '', severity: 'Warning' });
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyOk, setNotifyOk] = useState('');

  const canWrite = p.isVet;

  const { data: vets = [] } = useQuery({ queryKey: ['vets'], queryFn: getVets });
  const { data: vetReports = [] } = useQuery({
    queryKey: ['vet-reports'],
    queryFn: getVetReports,
    enabled: p.isVet || p.isAdmin,
  });

  const notifyMut = useMutation({
    mutationFn: (body) => createAlert(body),
    onSuccess: () => {
      setNotifyOk('Veterinarian has been notified!');
      setTimeout(() => { setNotifyOpen(false); setNotifyOk(''); setNotifyForm({ cow_id: '', vet_id: '', message: '', severity: 'Warning' }); }, 2000);
    },
    onError: (e) => setNotifyOk(e.response?.data?.detail || 'Failed to send notification'),
  });

  const reproMut = useMutation({
    mutationFn: addReproRecord,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reproduction'] }); setShowModal(false); setReproForm(EMPTY_REPRO); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const delReproMut = useMutation({
    mutationFn: deleteReproRecord,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reproduction'] }),
  });
  const treatMut = useMutation({
    mutationFn: addTreatment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['treatments'] }); setShowModal(false); setTreatForm(EMPTY_TREAT); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const completeMut = useMutation({
    mutationFn: completeTreatment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatments'] }),
  });
  const vaxMut = useMutation({
    mutationFn: addVaccination,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vaccinations'] }); setShowModal(false); setVaxForm(EMPTY_VAX); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const bcsMut = useMutation({
    mutationFn: addBCS,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bcs'] }); setShowModal(false); setBcsForm(EMPTY_BCS); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    if (tab === 'Reproduction') {
      if (!reproForm.cow_id) { setErr('Select a cow'); return; }
      reproMut.mutate({ ...reproForm, cow_id: Number(reproForm.cow_id), calf_weight_kg: reproForm.calf_weight_kg ? Number(reproForm.calf_weight_kg) : null });
    } else if (tab === 'Treatments') {
      if (!treatForm.cow_id || !treatForm.diagnosis || !treatForm.drug_name) { setErr('Cow, diagnosis and drug are required'); return; }
      treatMut.mutate({ ...treatForm, cow_id: Number(treatForm.cow_id), duration_days: Number(treatForm.duration_days) });
    } else if (tab === 'BCS') {
      if (!bcsForm.cow_id || !bcsForm.score) { setErr('Cow and score are required'); return; }
      if (Number(bcsForm.score) < 1 || Number(bcsForm.score) > 5) { setErr('Score must be 1.0–5.0'); return; }
      bcsMut.mutate({ cow_id: Number(bcsForm.cow_id), score: Number(bcsForm.score), notes: bcsForm.notes });
    } else {
      if (!vaxForm.cow_id || !vaxForm.vaccine_name || !vaxForm.vaccination_date) { setErr('Cow, vaccine and date are required'); return; }
      vaxMut.mutate({ ...vaxForm, cow_id: Number(vaxForm.cow_id) });
    }
  };

  const fmt = (d) => d ? format(new Date(d), 'MMM d, yyyy') : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#9C27B0,#ba68c8)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🐄 Reproduction & Health Records</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>
            {canWrite ? 'Veterinarian — full read/write access' : 'Read-only view — contact Veterinarian for health actions'}
          </div>
        </div>
        {p.canNotifyVet && (
          <button onClick={() => setNotifyOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#fff', color: '#9C27B0', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Bell size={15} /> Notify Veterinarian
          </button>
        )}
        {!canWrite && !p.canNotifyVet && (
          <span style={{ fontSize: 12, opacity: .8, display: 'flex', alignItems: 'center', gap: 6 }}><Lock size={13} /> Admin read-only</span>
        )}
      </div>

      {/* Notify Vet modal */}
      {notifyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#9C27B0,#ba68c8)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Notify Veterinarian</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, opacity: .8 }}>Report symptoms or conditions</p></div>
              <button onClick={() => setNotifyOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={LABEL}>Select Veterinarian *</label>
                  <select value={notifyForm.vet_id} onChange={e => setNotifyForm(f => ({ ...f, vet_id: e.target.value }))} style={INPUT}>
                    <option value="">— choose vet —</option>
                    {vets.map(v => <option key={v.user_id} value={v.user_id}>{v.full_name || v.username}</option>)}
                  </select>
                  {vets.length === 0 && <p style={{ fontSize: 11, color: '#c62828', margin: '4px 0 0' }}>No active veterinarians found</p>}
                </div>
                <div>
                  <label style={LABEL}>Urgency Level</label>
                  <select value={notifyForm.severity} onChange={e => setNotifyForm(f => ({ ...f, severity: e.target.value }))} style={INPUT}>
                    <option value="Info">Info — routine check</option>
                    <option value="Warning">Warning — needs attention</option>
                    <option value="Critical">Critical — urgent</option>
                    <option value="Emergency">Emergency — immediate</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={LABEL}>Affected Cow</label>
                <select value={notifyForm.cow_id} onChange={e => setNotifyForm(f => ({ ...f, cow_id: e.target.value }))} style={INPUT}>
                  <option value="">— choose cow (optional) —</option>
                  {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name} ({c.rfid_tag})</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Describe symptoms or condition *</label>
                <textarea value={notifyForm.message} onChange={e => setNotifyForm(f => ({ ...f, message: e.target.value }))}
                  rows={4} placeholder="e.g. Cow is limping, refusing to eat, high temperature since yesterday…"
                  style={{ ...INPUT, resize: 'vertical' }} />
              </div>
              {notifyOk && (
                <div style={{ padding: '10px 14px', borderRadius: 8,
                  background: notifyOk.includes('notified') ? '#e8f5e9' : '#fde8e8',
                  color: notifyOk.includes('notified') ? '#2E7D32' : '#c62828', fontSize: 13 }}>
                  {notifyOk.includes('notified') ? '✓' : '⚠'} {notifyOk}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setNotifyOpen(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button
                  disabled={!notifyForm.vet_id || !notifyForm.message.trim() || notifyMut.isPending}
                  onClick={() => notifyMut.mutate({
                    alert_type: 'Symptom Report',
                    cow_id: notifyForm.cow_id ? Number(notifyForm.cow_id) : undefined,
                    assigned_vet_id: Number(notifyForm.vet_id),
                    severity: notifyForm.severity,
                    message: notifyForm.message,
                  })}
                  className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13, background: '#9C27B0', border: 'none' }}>
                  {notifyMut.isPending ? 'Sending…' : 'Send to Vet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vet: Incoming symptom reports inbox */}
      {(p.isVet || p.isAdmin) && vetReports.length > 0 && (
        <div className="card" style={{ borderTop: '4px solid #9C27B0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Bell size={16} color="#9C27B0" />
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#9C27B0' }}>
              Incoming Symptom Reports ({vetReports.filter(r => !r.is_resolved).length} unresolved)
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {vetReports.map(r => {
              const sev = r.severity || 'Warning';
              const sevColor = { Emergency: '#b71c1c', Critical: '#c62828', Warning: '#e65100', Info: '#1565c0' }[sev] || '#666';
              return (
                <div key={r.alert_id} style={{ display: 'flex', gap: 14, padding: '12px 16px', borderRadius: 10, background: r.is_resolved ? '#f5f5f5' : `${sevColor}08`, border: `1px solid ${sevColor}33`, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${sevColor}22`, color: sevColor }}>{sev}</span>
                      {r.cow_name && <span style={{ fontSize: 12, fontWeight: 700, color: '#1E4D7B' }}>🐄 {r.cow_name}</span>}
                      {r.created_by && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>from {r.created_by}</span>}
                      <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{r.created_at ? format(new Date(r.created_at), 'MMM d, HH:mm') : ''}</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: '#333', lineHeight: 1.5 }}>{r.message}</p>
                  </div>
                  {!r.is_resolved && canWrite && (
                    <button onClick={() => { resolveAlert(r.alert_id).then(() => qc.invalidateQueries({ queryKey: ['vet-reports'] })); }}
                      style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#4CAF50', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={13} /> Mark Handled
                    </button>
                  )}
                  {r.is_resolved && <span style={{ fontSize: 11, color: '#4CAF50', fontWeight: 700, flexShrink: 0 }}>✓ Handled</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
        <StatCard label="Pregnant"         value={summary?.pregnant_count}    color="#9C27B0" sub="confirmed" />
        <StatCard label="Lactating"        value={summary?.lactating_count}   color="#00BCD4" sub="active" />
        <StatCard label="Dry Cows"         value={summary?.dry_count}         color="#FF9800" sub="dry period" />
        <StatCard label="Due in 30 days"   value={summary?.due_30d}           color="#F44336" sub="expected calving" />
        <StatCard label="Avg Days Lactation" value={summary?.avg_days_lactation ? Math.round(summary.avg_days_lactation) : '--'} color="#4CAF50" sub="current herd" />
        <StatCard label="Vaccinations Due" value={dueSoon.length}             color="#FF5722" sub="next 30 days" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="btn"
            style={{ padding: '8px 18px', fontSize: 13, background: tab === t ? '#9C27B0' : 'var(--bg)', color: tab === t ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: tab === t ? 700 : 400 }}>
            {t === 'Reproduction' ? '🐄' : t === 'Treatments' ? '💊' : '💉'} {t}
          </button>
        ))}
        {canWrite ? (
          <button className="btn btn-primary" onClick={() => { setShowModal(true); setErr(''); }}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Add {tab === 'Reproduction' ? 'Record' : tab === 'Treatments' ? 'Treatment' : tab === 'Vaccinations' ? 'Vaccination' : 'BCS'}
          </button>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lock size={13} /> Vet-only actions
          </span>
        )}
      </div>

      {/* ── Reproduction tab ── */}
      {tab === 'Reproduction' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr><th>Cow</th><th>Calving Date</th><th>Days Lactation</th><th>Insem. Date</th><th>Expected Calving</th><th>Days to Calving</th><th>Pregnancies</th><th>Confirmed</th>{canWrite && <th></th>}</tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.repro_id}>
                  <td><Link to={`/herd/${r.cow_id}`} style={{ fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>{r.cow_name}</Link></td>
                  <td>{fmt(r.calving_date)}</td>
                  <td>{r.days_in_lactation != null ? <span style={{ fontWeight: 700, color: '#00BCD4' }}>{r.days_in_lactation}d</span> : '—'}</td>
                  <td>{fmt(r.insemination_date)}<br /><span style={{ fontSize: 11, color: '#aaa' }}>{r.insemination_method}</span></td>
                  <td>{fmt(r.expected_calving_date)}</td>
                  <td>{r.days_to_calving != null ? <span style={{ fontWeight: 700, color: r.days_to_calving < 14 ? '#F44336' : r.days_to_calving < 30 ? '#FF9800' : '#4CAF50' }}>{r.days_to_calving}d</span> : '—'}</td>
                  <td style={{ fontWeight: 700 }}>{r.total_calvings}</td>
                  <td>{r.pregnancy_confirmed ? <span className="badge badge-healthy">Yes</span> : <span className="badge badge-warning">No</span>}</td>
                  {canWrite && (
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#c62828' }}
                        onClick={() => { if (window.confirm('Delete this record?')) delReproMut.mutate(r.repro_id); }}>
                        <X size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && <div className="empty-state"><Baby size={40} /><span>No reproduction records yet</span></div>}
        </div>
      )}

      {/* ── Treatments tab ── */}
      {tab === 'Treatments' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Cow</th><th>Date</th><th>Diagnosis</th><th>Drug</th><th>Dose</th><th>Days</th><th>Follow-up</th><th>Status</th>{canWrite && <th></th>}</tr></thead>
            <tbody>
              {treatments.map(t => (
                <tr key={t.treatment_id}>
                  <td><Link to={`/herd/${t.cow_id}`} style={{ fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>{t.cow_name}</Link></td>
                  <td>{fmt(t.treatment_date)}</td>
                  <td style={{ fontWeight: 600 }}>{t.diagnosis}</td>
                  <td style={{ color: '#9C27B0', fontWeight: 600 }}>{t.drug_name}</td>
                  <td style={{ fontSize: 12 }}>{t.dose || '—'}</td>
                  <td>{t.duration_days}d</td>
                  <td>{fmt(t.follow_up_date)}</td>
                  <td>
                    <span className={`badge badge-${t.is_completed ? 'healthy' : 'warning'}`}>
                      {t.is_completed ? 'Done' : 'Active'}
                    </span>
                  </td>
                  {canWrite && !t.is_completed && (
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#4CAF50' }}
                        onClick={() => completeMut.mutate(t.treatment_id)}>
                        <CheckCircle size={12} /> Complete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {treatments.length === 0 && <div className="empty-state"><HeartPulse size={40} /><span>No treatment records</span></div>}
        </div>
      )}

      {/* ── Vaccinations tab ── */}
      {tab === 'Vaccinations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dueSoon.length > 0 && (
            <div className="card" style={{ borderTop: '4px solid #F44336' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} color="#F44336" />
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Due in Next 30 Days</h2>
              </div>
              {dueSoon.map(v => (
                <div key={v.vax_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff8e1', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <span><strong>{v.cow_name}</strong> — {v.vaccine_name}</span>
                  <span style={{ color: v.days_until_due <= 7 ? '#F44336' : '#FF9800', fontWeight: 700 }}>Due in {v.days_until_due}d</span>
                </div>
              ))}
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead><tr><th>Cow</th><th>Vaccine</th><th>Date Given</th><th>Next Due</th><th>Batch #</th><th>By</th></tr></thead>
              <tbody>
                {vaccinations.map(v => (
                  <tr key={v.vax_id}>
                    <td><Link to={`/herd/${v.cow_id}`} style={{ fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>{v.cow_name}</Link></td>
                    <td style={{ fontWeight: 600 }}>{v.vaccine_name}</td>
                    <td>{fmt(v.vaccination_date)}</td>
                    <td style={{ color: '#FF9800', fontWeight: 600 }}>{fmt(v.next_due_date)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.batch_number || '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.administered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vaccinations.length === 0 && <div className="empty-state"><Syringe size={40} /><span>No vaccination records</span></div>}
          </div>
        </div>
      )}

      {/* ── BCS tab ── */}
      {tab === 'BCS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* BCS scale legend */}
          <div className="card" style={{ padding: '14px 20px' }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📏 BCS Scale Reference (1.0–5.0)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
              {[
                { score: '1.0–1.5', label: 'Emaciated',  color: '#F44336' },
                { score: '2.0–2.5', label: 'Thin',       color: '#FF5722' },
                { score: '3.0–3.5', label: 'Ideal',      color: '#4CAF50' },
                { score: '3.75',    label: 'Good',        color: '#FF9800' },
                { score: '4.5–5.0', label: 'Obese',      color: '#9C27B0' },
              ].map(({ score, label, color }) => (
                <div key={label} style={{ padding: '8px 12px', borderRadius: 8, background: `${color}11`, border: `1px solid ${color}44`, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color, fontSize: 15 }}>{score}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* BCS records table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>📊 Latest BCS per Cow</h2>
              {canWrite && (
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', background: '#9C27B0', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setShowModal(true); setErr(''); }}>
                  <Plus size={13} /> Record BCS
                </button>
              )}
            </div>
            <table className="data-table">
              <thead><tr><th>Cow</th><th>Health</th><th>BCS Score</th><th>Visual</th><th>Assessed By</th><th>Date</th><th>Notes</th></tr></thead>
              <tbody>
                {bcsRecords.map(b => (
                  <tr key={b.bcs_id}>
                    <td><Link to={`/herd/${b.cow_id}`} style={{ fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>{b.cow_name}</Link></td>
                    <td><span className={`badge badge-${(b.health_status || '').toLowerCase().replace(' ', '')}`}>{b.health_status}</span></td>
                    <td style={{ fontWeight: 800, fontSize: 18, color: b.score < 2.5 ? '#F44336' : b.score < 3 ? '#FF9800' : b.score <= 3.75 ? '#4CAF50' : '#FF9800' }}>{Number(b.score).toFixed(1)}</td>
                    <td style={{ minWidth: 140 }}><BCSBar score={b.score} /></td>
                    <td style={{ fontSize: 12 }}>{b.assessed_by || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.assessed_at ? format(new Date(b.assessed_at), 'MMM d, yyyy') : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bcsRecords.length === 0 && <div className="empty-state"><HeartPulse size={40} /><span>No BCS records yet</span></div>}
          </div>
        </div>
      )}

      {/* ── Add Modal ── */}
      {showModal && canWrite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#9C27B0,#ba68c8)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
                {tab === 'Reproduction' ? '🐄 Add Reproduction Record' : tab === 'Treatments' ? '💊 Add Treatment' : tab === 'BCS' ? '📏 Record BCS' : '💉 Add Vaccination'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Cow select — all tabs */}
              <div>
                <label style={LABEL}>Cow *</label>
                <select style={INPUT}
                  value={tab === 'Reproduction' ? reproForm.cow_id : tab === 'Treatments' ? treatForm.cow_id : vaxForm.cow_id}
                  onChange={e => {
                    const v = e.target.value;
                    if (tab === 'Reproduction') setReproForm(f => ({ ...f, cow_id: v }));
                    else if (tab === 'Treatments') setTreatForm(f => ({ ...f, cow_id: v }));
                    else setVaxForm(f => ({ ...f, cow_id: v }));
                  }}>
                  <option value="">Select cow…</option>
                  {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
                </select>
              </div>

              {/* Reproduction fields */}
              {tab === 'Reproduction' && (<>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={LABEL}>Calving Date</label><input type="date" style={INPUT} value={reproForm.calving_date} onChange={e => setReproForm(f => ({ ...f, calving_date: e.target.value }))} /></div>
                  <div><label style={LABEL}>Calf Sex</label>
                    <select style={INPUT} value={reproForm.calf_sex} onChange={e => setReproForm(f => ({ ...f, calf_sex: e.target.value }))}>
                      <option value="">Unknown</option><option>Male</option><option>Female</option>
                    </select>
                  </div>
                  <div><label style={LABEL}>Calf Weight (kg)</label><input type="number" step="0.1" style={INPUT} value={reproForm.calf_weight_kg} onChange={e => setReproForm(f => ({ ...f, calf_weight_kg: e.target.value }))} /></div>
                  <div><label style={LABEL}>Insemination Date</label><input type="date" style={INPUT} value={reproForm.insemination_date} onChange={e => setReproForm(f => ({ ...f, insemination_date: e.target.value }))} /></div>
                  <div><label style={LABEL}>Method</label>
                    <select style={INPUT} value={reproForm.insemination_method} onChange={e => setReproForm(f => ({ ...f, insemination_method: e.target.value }))}>
                      <option>AI</option><option>Natural</option>
                    </select>
                  </div>
                  <div><label style={LABEL}>Expected Calving</label><input type="date" style={INPUT} value={reproForm.expected_calving_date} onChange={e => setReproForm(f => ({ ...f, expected_calving_date: e.target.value }))} /></div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={reproForm.pregnancy_confirmed} onChange={e => setReproForm(f => ({ ...f, pregnancy_confirmed: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#9C27B0' }} />
                  <span style={{ fontWeight: 600 }}>Pregnancy confirmed</span>
                </label>
                <div><label style={LABEL}>Notes</label><textarea style={{ ...INPUT, height: 70 }} value={reproForm.notes} onChange={e => setReproForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </>)}

              {/* Treatment fields */}
              {tab === 'Treatments' && (<>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={LABEL}>Date *</label><input type="date" style={INPUT} value={treatForm.treatment_date} onChange={e => setTreatForm(f => ({ ...f, treatment_date: e.target.value }))} required /></div>
                  <div><label style={LABEL}>Duration (days)</label><input type="number" min="1" style={INPUT} value={treatForm.duration_days} onChange={e => setTreatForm(f => ({ ...f, duration_days: e.target.value }))} /></div>
                </div>
                <div><label style={LABEL}>Diagnosis *</label><input style={INPUT} value={treatForm.diagnosis} onChange={e => setTreatForm(f => ({ ...f, diagnosis: e.target.value }))} placeholder="e.g. Bovine respiratory disease" required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={LABEL}>Drug Name *</label><input style={INPUT} value={treatForm.drug_name} onChange={e => setTreatForm(f => ({ ...f, drug_name: e.target.value }))} placeholder="e.g. Oxytetracycline" required /></div>
                  <div><label style={LABEL}>Dose</label><input style={INPUT} value={treatForm.dose} onChange={e => setTreatForm(f => ({ ...f, dose: e.target.value }))} placeholder="e.g. 10 mg/kg IM" /></div>
                </div>
                <div><label style={LABEL}>Follow-up Date</label><input type="date" style={INPUT} value={treatForm.follow_up_date} onChange={e => setTreatForm(f => ({ ...f, follow_up_date: e.target.value }))} /></div>
                <div><label style={LABEL}>Notes</label><textarea style={{ ...INPUT, height: 60 }} value={treatForm.notes} onChange={e => setTreatForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </>)}

              {/* Vaccination fields */}
              {tab === 'Vaccinations' && (<>
                <div><label style={LABEL}>Vaccine Name *</label><input style={INPUT} value={vaxForm.vaccine_name} onChange={e => setVaxForm(f => ({ ...f, vaccine_name: e.target.value }))} placeholder="e.g. FMD Vaccine" required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={LABEL}>Date Given *</label><input type="date" style={INPUT} value={vaxForm.vaccination_date} onChange={e => setVaxForm(f => ({ ...f, vaccination_date: e.target.value }))} required /></div>
                  <div><label style={LABEL}>Next Due Date</label><input type="date" style={INPUT} value={vaxForm.next_due_date} onChange={e => setVaxForm(f => ({ ...f, next_due_date: e.target.value }))} /></div>
                  <div><label style={LABEL}>Batch Number</label><input style={INPUT} value={vaxForm.batch_number} onChange={e => setVaxForm(f => ({ ...f, batch_number: e.target.value }))} /></div>
                </div>
                <div><label style={LABEL}>Notes</label><textarea style={{ ...INPUT, height: 60 }} value={vaxForm.notes} onChange={e => setVaxForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </>)}

              {/* BCS fields */}
              {tab === 'BCS' && (<>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LABEL}>BCS Score * (1.0–5.0)</label>
                    <input type="number" step="0.5" min="1" max="5" style={INPUT} value={bcsForm.score}
                      onChange={e => setBcsForm(f => ({ ...f, score: e.target.value }))} placeholder="e.g. 3.5" required />
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                      1=Emaciated · 3.5=Ideal · 5=Obese
                    </div>
                  </div>
                  {bcsForm.score && (
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <BCSBar score={bcsForm.score} />
                    </div>
                  )}
                </div>
                <div><label style={LABEL}>Notes</label><textarea style={{ ...INPUT, height: 60 }} value={bcsForm.notes} onChange={e => setBcsForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </>)}

              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13, background: '#9C27B0', border: 'none' }}
                  disabled={reproMut.isPending || treatMut.isPending || vaxMut.isPending || bcsMut.isPending}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

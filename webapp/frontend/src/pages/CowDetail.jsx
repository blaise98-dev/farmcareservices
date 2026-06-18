import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCow, updateCow, getCowRepro, getCowTreatments } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import RoleGuard from '../components/RoleGuard';
import { ArrowLeft, Thermometer, Droplets, Activity, Save, Lock } from 'lucide-react';
import { LineChart as ELine, BarChart as EBar, ChartCard } from '../components/ChartKit';
import { format } from 'date-fns';

const HEALTH_COLOR = {
  Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0'
};
const TEMP_COLOR = { Normal: '#4CAF50', Elevated: '#FF9800', High: '#FF5722', Fever: '#F44336' };
const HEALTH_STATUSES = ['Healthy', 'Warning', 'Critical', 'Under Treatment'];

function FieldRow({ label, val, locked }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label} {locked && <Lock size={10} color="#aaa" title="Read-only for your role" />}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{val}</div>
    </div>
  );
}

export default function CowDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const p = usePermissions();
  const [detailTab, setDetailTab] = useState('overview');
  const { data, isLoading } = useQuery({ queryKey: ['cow', id], queryFn: () => getCow(id) });
  const { data: reproRecords = [] } = useQuery({ queryKey: ['cow-repro', id],       queryFn: () => getCowRepro(id),        enabled: detailTab === 'reproduction' });
  const { data: treatments = []   } = useQuery({ queryKey: ['cow-treatments', id],  queryFn: () => getCowTreatments(id),   enabled: detailTab === 'health' });

  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [editHealth, setEditHealth] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editLact, setEditLact]   = useState(null);

  if (isLoading) return <div className="spinner" />;
  if (!data) return <div className="empty-state"><span>Cow not found</span></div>;

  const { cow, temperatures = [], feedings = [], water_intake = [], milk_production = [], alerts = [], predictions = [] } = data;

  const tempData = [...temperatures].reverse().map(t => ({
    time: t.recorded_at ? format(new Date(t.recorded_at), 'HH:mm') : '',
    temp: Number(t.body_temp_celsius),
    status: t.status,
  }));

  const milkData = [...milk_production].reverse().map(m => ({
    time: m.recorded_at ? format(new Date(m.recorded_at), 'MMM d') : '',
    liters: Number(m.milk_amount_liters),
    session: m.milking_session,
  }));

  const feedData = [...feedings].reverse().map(f => ({
    date: f.recorded_at ? format(new Date(f.recorded_at), 'MMM d') : '',
    kg: Number(f.feed_amount_kg),
  }));

  const handleSave = async () => {
    const payload = {};
    if (editHealth && editHealth !== cow.health_status) payload.health_status = editHealth;
    if (editWeight && Number(editWeight) !== Number(cow.weight_kg)) payload.weight_kg = Number(editWeight);
    if (editLact !== null && editLact !== cow.lactating) payload.lactating = editLact;

    if (!Object.keys(payload).length) { setSaveMsg('No changes to save'); return; }

    setSaving(true);
    try {
      await updateCow(id, payload);
      setSaveMsg('Saved ✓');
      qc.invalidateQueries({ queryKey: ['cow', id] });
      qc.invalidateQueries({ queryKey: ['cows'] });
    } catch (e) {
      setSaveMsg(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const canEdit = p.canUpdateWeight || p.canUpdateHealthStatus || p.canUpdateLactation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back */}
      <Link to="/herd" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
        <ArrowLeft size={16} /> Back to Herd
      </Link>

      {/* Cow header */}
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: HEALTH_COLOR[cow.health_status] || '#999',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, flexShrink: 0,
        }}>🐄</div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>{cow.cow_name}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f0f0f0', padding: '2px 8px', borderRadius: 6 }}>{cow.rfid_tag}</span>
            <span className="badge" style={{ background: `${HEALTH_COLOR[cow.health_status]}22`, color: HEALTH_COLOR[cow.health_status] }}>{cow.health_status}</span>
            <span className="badge badge-normal">{cow.breed}</span>
            {cow.lactating
              ? <span className="badge badge-healthy">Lactating</span>
              : <span className="badge badge-warning">Dry</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minWidth: 260 }}>
          <FieldRow label="Age"             val={cow.age_months != null ? `${cow.age_months} months` : '--'} />
          <FieldRow label="Weight"          val={cow.weight_kg ? `${cow.weight_kg} kg` : '--'} locked={!p.canUpdateWeight} />
          <FieldRow label="Birth Date"      val={cow.birth_date ? format(new Date(cow.birth_date), 'MMM d, yyyy') : '--'} />
          <FieldRow label="Last Health Check" val={cow.last_health_check ? format(new Date(cow.last_health_check), 'MMM d') : 'N/A'} />
        </div>
      </div>

      {/* ── Edit panel — role-gated ── */}
      {canEdit && (
        <div className="card" style={{ border: '1px solid #e8f5e9', background: '#f9fff9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Save size={16} color="#4CAF50" />
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Update Cow Record</h2>
            <span style={{ fontSize: 11, color: '#4CAF50', marginLeft: 'auto' }}>
              Your role: <strong>{p.role}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Health status — Admin & Vet only */}
            <RoleGuard
              allowed={p.canUpdateHealthStatus}
              fallback={
                <div style={{ opacity: .5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Health Status <Lock size={10} />
                  </label>
                  <div style={{ padding: '8px 12px', background: '#f0f0f0', borderRadius: 8, fontSize: 13, color: '#999' }}>
                    {cow.health_status} (read-only)
                  </div>
                </div>
              }
            >
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Health Status
                </label>
                <select
                  value={editHealth || cow.health_status}
                  onChange={e => setEditHealth(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                >
                  {HEALTH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </RoleGuard>

            {/* Weight — Admin, Farmer, Vet */}
            <RoleGuard
              allowed={p.canUpdateWeight}
              fallback={
                <div style={{ opacity: .5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                    Weight (kg) <Lock size={10} />
                  </label>
                  <div style={{ padding: '8px 12px', background: '#f0f0f0', borderRadius: 8, fontSize: 13, color: '#999' }}>{cow.weight_kg || '--'}</div>
                </div>
              }
            >
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder={String(cow.weight_kg || '')}
                  value={editWeight}
                  onChange={e => setEditWeight(e.target.value)}
                  style={{ width: 110, padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </RoleGuard>

            {/* Lactating — Admin, Farmer, Vet */}
            <RoleGuard allowed={p.canUpdateLactation}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Lactating
                </label>
                <select
                  value={editLact !== null ? String(editLact) : String(!!cow.lactating)}
                  onChange={e => setEditLact(e.target.value === 'true')}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                >
                  <option value="true">Yes — Lactating</option>
                  <option value="false">No — Dry</option>
                </select>
              </div>
            </RoleGuard>

            <button
              onClick={handleSave} disabled={saving}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-end', height: 38 }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>

            {/* Retire cow — Admin only */}
            <RoleGuard allowed={p.canRetireCow}>
              <button
                onClick={async () => {
                  if (!window.confirm(`Retire ${cow.cow_name}? This will mark her as inactive.`)) return;
                  await updateCow(id, { is_active: false });
                  qc.invalidateQueries({ queryKey: ['cows'] });
                  window.history.back();
                }}
                className="btn btn-danger"
                style={{ alignSelf: 'flex-end', height: 38, marginLeft: 'auto' }}
              >
                🗑 Retire Cow
              </button>
            </RoleGuard>
          </div>

          {saveMsg && (
            <div style={{
              marginTop: 12, padding: '8px 14px', borderRadius: 8,
              background: saveMsg.includes('✓') ? '#e8f5e9' : '#fde8e8',
              color: saveMsg.includes('✓') ? '#2E7D32' : '#c62828',
              fontSize: 13, fontWeight: 600,
            }}>
              {saveMsg}
            </div>
          )}
        </div>
      )}

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { id: 'overview',      label: '📊 Overview' },
          { id: 'reproduction',  label: '🐣 Reproduction' },
          { id: 'health',        label: '💊 Treatments' },
        ].map(t => (
          <button key={t.id} onClick={() => setDetailTab(t.id)}
            className="btn"
            style={{ padding: '7px 16px', fontSize: 13, background: detailTab === t.id ? '#1E4D7B' : 'var(--bg)', color: detailTab === t.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: detailTab === t.id ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Reproduction tab */}
      {detailTab === 'reproduction' && (
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>🐣 Reproduction Records</h2>
          {reproRecords.length === 0
            ? <div className="empty-state"><span>No reproduction records — add via the Reproduction page</span></div>
            : reproRecords.map(r => (
              <div key={r.repro_id} style={{ padding: '12px', background: '#f7f9fc', borderRadius: 8, marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                {[
                  { label: 'Calving Date',      val: r.calving_date ? format(new Date(r.calving_date), 'MMM d, yyyy') : '—' },
                  { label: 'Days Lactation',     val: r.days_in_lactation != null ? `${r.days_in_lactation}d` : '—' },
                  { label: 'Insemination',       val: r.insemination_date ? format(new Date(r.insemination_date), 'MMM d, yyyy') : '—' },
                  { label: 'Expected Calving',   val: r.expected_calving_date ? format(new Date(r.expected_calving_date), 'MMM d, yyyy') : '—' },
                  { label: 'Days to Calving',    val: r.days_to_calving != null ? `${r.days_to_calving}d` : '—' },
                  { label: 'Pregnant',           val: r.pregnancy_confirmed ? 'Yes' : 'No' },
                  { label: 'Total Calvings',     val: r.total_calvings },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>
            ))
          }
          <Link to="/reproduction" style={{ fontSize: 12, color: '#9C27B0', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
            → Manage reproduction records
          </Link>
        </div>
      )}

      {/* Treatments tab */}
      {detailTab === 'health' && (
        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>💊 Treatment History</h2>
          {treatments.length === 0
            ? <div className="empty-state"><span>No treatment records</span></div>
            : (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Diagnosis</th><th>Drug</th><th>Dose</th><th>Days</th><th>Follow-up</th><th>Status</th></tr></thead>
                <tbody>
                  {treatments.map(t => (
                    <tr key={t.treatment_id}>
                      <td>{t.treatment_date ? format(new Date(t.treatment_date), 'MMM d, yyyy') : '—'}</td>
                      <td style={{ fontWeight: 600 }}>{t.diagnosis}</td>
                      <td style={{ color: '#9C27B0', fontWeight: 600 }}>{t.drug_name}</td>
                      <td style={{ fontSize: 12 }}>{t.dose || '—'}</td>
                      <td>{t.duration_days}d</td>
                      <td style={{ fontSize: 12 }}>{t.follow_up_date ? format(new Date(t.follow_up_date), 'MMM d') : '—'}</td>
                      <td><span className={`badge badge-${t.is_completed ? 'healthy' : 'warning'}`}>{t.is_completed ? 'Done' : 'Active'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
          <Link to="/reproduction" style={{ fontSize: 12, color: '#9C27B0', fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
            → Add treatments via Reproduction page
          </Link>
        </div>
      )}

      {/* Charts row — only shown on overview tab */}
      {detailTab === 'overview' && <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🌡 Body Temperature" sub="Recent readings — Elevated ≥39.5°C · Fever ≥40°C">
          <ELine data={tempData} xKey="time"
            series={[{ key: 'temp', name: 'Body Temp °C', color: '#FF9800' }]}
            smooth height={200} unit="°C"
            markLine={[{ yAxis: 39.5, label: { formatter: () => 'Elevated 39.5°C', position: 'end' } }, { yAxis: 40, label: { formatter: () => 'Fever 40°C', position: 'end' } }]}
          />
        </ChartCard>

        <ChartCard title="🥛 Milk Production" sub="Per-session records — last 14 entries">
          <EBar data={milkData} xKey="time"
            series={[{ key: 'liters', name: 'Milk (L)', color: '#00BCD4' }]}
            unit=" L" showLabel height={200} />
        </ChartCard>
      </div>

      {/* Feed + Water */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🌿 Feed Consumption" sub="kg per feeding event — last 10 records">
          <EBar data={feedData} xKey="date"
            series={[{ key: 'kg', name: 'Feed (kg)', color: '#4CAF50' }]}
            unit=" kg" height={200} />
        </ChartCard>

        <ChartCard title="💧 Water Intake" sub="Litres consumed per recorded session">
          {water_intake.length === 0
            ? <div className="empty-state" style={{ padding: 16 }}><span>No water records</span></div>
            : (
              <EBar
                data={water_intake.slice(0, 10).map(w => ({
                  time: w.recorded_at ? format(new Date(w.recorded_at), 'MMM d') : '',
                  liters: Number(w.water_intake_liters).toFixed(1),
                }))}
                xKey="time"
                series={[{ key: 'liters', name: 'Water (L)', color: '#00BCD4' }]}
                unit=" L" height={200} />
            )
          }
        </ChartCard>
      </div>

      {/* Predictions + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Predictions — only for roles that can see predictions */}
        {p.canViewPredictions ? (
          <div className="card">
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🤖 AI Predictions</h2>
            {predictions.length === 0
              ? <div className="empty-state"><Activity size={32} /><span>No predictions available</span></div>
              : predictions.map(pred => (
                <div key={pred.prediction_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f7f9fc', borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{pred.prediction_type}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {pred.prediction_date ? format(new Date(pred.prediction_date), 'MMM d') : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{Number(pred.predicted_value).toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: '#4CAF50' }}>{Number(pred.confidence_percent).toFixed(0)}% conf.</div>
                  </div>
                </div>
              ))
            }
          </div>
        ) : (
          <div className="card" style={{ opacity: .6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
            <Lock size={28} color="#aaa" />
            <p style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>Predictions not available for your role</p>
          </div>
        )}

        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🚨 Cow Alerts</h2>
          {alerts.length === 0
            ? <div className="empty-state" style={{ padding: 20 }}><span>No alerts for this cow</span></div>
            : alerts.map(a => (
              <div key={a.alert_id} style={{ padding: '10px', borderLeft: `3px solid ${a.severity === 'Critical' ? '#F44336' : '#FF9800'}`, background: '#f7f9fc', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{a.alert_type}</span>
                  <span className={`badge badge-${(a.severity || '').toLowerCase()}`}>{a.severity}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{a.message}</div>
              </div>
            ))
          }
        </div>
      </div>
      </>}
    </div>
  );
}

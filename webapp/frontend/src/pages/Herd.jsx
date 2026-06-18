import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCows, getHerdCounts, registerCow, updateCow, getNextRfid } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { Search, Plus, X, Beef, Info, Edit2, Filter, ChevronDown } from 'lucide-react';
import RwandaLocationFields from '../components/RwandaLocationFields';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── constants ────────────────────────────────────────────────────────────────
const HEALTH_COLOR = {
  Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0',
};
const BREED_COLOR = { Friesian: '#1E4D7B', Ayrshire: '#00BCD4', Jersey: '#FF9800' };
const SEX_COLOR   = { Female: '#E91E63', Male: '#1565c0' };

const COW_STAGES = [
  { value: 'Calf',          label: 'Calf',            sex: 'Both',   ageRange: 'Birth to ~6 months',            emoji: '🐣', color: '#00BCD4' },
  { value: 'Weaner',        label: 'Weaner',          sex: 'Both',   ageRange: '~6 to 12 months',               emoji: '🐮', color: '#26C6DA' },
  { value: 'Yearling',      label: 'Yearling',        sex: 'Both',   ageRange: '~1 to 2 years',                 emoji: '🐄', color: '#4DB6AC' },
  { value: 'Bull Calf',     label: 'Bull Calf',       sex: 'Male',   ageRange: 'Birth to ~1 year',              emoji: '🐂', color: '#78909C' },
  { value: 'Heifer',        label: 'Heifer',          sex: 'Female', ageRange: '~1 year until first calving',   emoji: '🐄', color: '#E91E63' },
  { value: 'Steer',         label: 'Steer',           sex: 'Male',   ageRange: 'Usually 1–3 years',             emoji: '🐂', color: '#5C6BC0' },
  { value: 'Bull',          label: 'Bull',            sex: 'Male',   ageRange: '~2 years and older',            emoji: '🐃', color: '#1E4D7B' },
  { value: 'Cow',           label: 'Cow',             sex: 'Female', ageRange: 'After first calving, 2+ years', emoji: '🐄', color: '#4CAF50' },
  { value: 'Dry Cow',       label: 'Dry Cow',         sex: 'Female', ageRange: 'Adult (dry period)',            emoji: '🐄', color: '#9C27B0' },
  { value: 'Lactating Cow', label: 'Lactating Cow',   sex: 'Female', ageRange: 'Adult (lactating)',             emoji: '🐄', color: '#2196F3' },
  { value: 'Senior Cow',    label: 'Senior/Aged Cow', sex: 'Female', ageRange: 'Usually 8–10+ years',          emoji: '🐄', color: '#FF9800' },
  { value: 'Senior Bull',   label: 'Senior Bull',     sex: 'Male',   ageRange: 'Usually 8–10+ years',          emoji: '🐃', color: '#FF5722' },
];
const STAGE_COLOR = Object.fromEntries(COW_STAGES.map(s => [s.value, s.color]));

const CAT_CONFIG = {
  Production: { color: '#4CAF50', emoji: '🐄' }, Heifers: { color: '#E91E63', emoji: '🐮' },
  Heifer: { color: '#E91E63', emoji: '🐮' },     Dry:     { color: '#9C27B0', emoji: '🐄' },
  Calves: { color: '#00BCD4', emoji: '🐣' },     Calf:    { color: '#00BCD4', emoji: '🐣' },
  Sick:   { color: '#F44336', emoji: '🤒' },     Fattening:{ color: '#1E4D7B', emoji: '🐂' },
  Sold:   { color: '#FF9800', emoji: '💰' },     Lost:    { color: '#607D8B', emoji: '💀' },
};

const EMPTY_LOCATION = { province: '', district: '', sector: '', cell: '', village: '' };
const BREED_CONCENTRATION_OPTIONS = ['25%', '50%', '75%', '87.5%', '100%'];

const EMPTY_FORM = {
  rfid_tag: '', cow_name: '', sex: 'Female', breed: 'Friesian',
  breed_type: 'Pure', breed_concentration: '100%', cow_stage: 'Cow',
  birth_date: '', weight_kg: '', lactating: true,
  cow_category: 'Production', mother_id: '',
};

// Available chart views
const CHART_OPTIONS = [
  { key: 'health',    label: 'Health Status',       icon: '🏥' },
  { key: 'stage',     label: 'Stage Distribution',  icon: '🐄' },
  { key: 'sex',       label: 'Sex Distribution',    icon: '♀♂'  },
  { key: 'breed',     label: 'Breed Breakdown',     icon: '🧬' },
];

function detectStage(birthDate, sex) {
  if (!birthDate) return sex === 'Male' ? 'Bull' : 'Cow';
  const months = Math.floor((Date.now() - new Date(birthDate)) / (1000 * 60 * 60 * 24 * 30.44));
  if (sex === 'Male') {
    if (months < 6)  return 'Calf';
    if (months < 12) return 'Bull Calf';
    if (months < 24) return months < 18 ? 'Weaner' : 'Yearling';
    if (months < 36) return 'Steer';
    return months >= 96 ? 'Senior Bull' : 'Bull';
  } else {
    if (months < 6)  return 'Calf';
    if (months < 12) return 'Weaner';
    if (months < 24) return 'Heifer';
    return months >= 96 ? 'Senior Cow' : 'Cow';
  }
}

// ─── shared form field styles ─────────────────────────────────────────────────
const LS = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--text-secondary)', textTransform: 'uppercase',
  letterSpacing: .5, marginBottom: 6,
};
const IS = {
  width: '100%', padding: '9px 12px',
  borderRadius: 8, border: '2px solid var(--border)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box',
};
const focus = e => e.target.style.borderColor = '#4CAF50';
const blur  = e => e.target.style.borderColor = 'var(--border)';

// ─── Cow form (shared by Register + Edit) ────────────────────────────────────
function CowForm({ form, location, cows, onFormChange, onLocationChange, rfidLoading, editMode }) {
  const stageInfo = COW_STAGES.find(s => s.value === form.cow_stage);
  return (
    <>
      {/* RFID + Name */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={LS}>{editMode ? 'RFID Tag' : 'RFID Tag * (auto-generated)'}</label>
          <input name="rfid_tag"
            value={rfidLoading ? 'Generating…' : form.rfid_tag}
            onChange={onFormChange} placeholder="RFID-001"
            readOnly={rfidLoading || editMode}
            style={{ ...IS, background: (rfidLoading || editMode) ? '#f5f5f5' : '#fff',
              color: (rfidLoading || editMode) ? 'var(--text-secondary)' : 'inherit' }}
            onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={LS}>Cow Name *</label>
          <input name="cow_name" value={form.cow_name} onChange={onFormChange}
            placeholder="e.g. Bella" style={IS} onFocus={focus} onBlur={blur} />
        </div>
      </div>

      {/* Breed + Breed Type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={LS}>Breed *</label>
          <select name="breed" value={form.breed} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
            <option value="Friesian">Friesian</option>
            <option value="Ayrshire">Ayrshire</option>
            <option value="Jersey">Jersey</option>
          </select>
        </div>
        <div>
          <label style={LS}>Breed Type</label>
          <select name="breed_type" value={form.breed_type} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
            <option value="Pure">Pure Breed</option>
            <option value="Cross">Cross Breed</option>
          </select>
        </div>
      </div>

      {form.breed_type === 'Cross' && (
        <div>
          <label style={LS}>Breed Concentration Level</label>
          <select name="breed_concentration" value={form.breed_concentration} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
            {BREED_CONCENTRATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {/* Sex + Birth Date */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={LS}>Sex *</label>
          <select name="sex" value={form.sex} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>
        <div>
          <label style={LS}>Birth Date *</label>
          <input type="date" name="birth_date" value={form.birth_date} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur} />
        </div>
      </div>

      {/* Stage — filtered by sex, auto-detected */}
      <div>
        <label style={{ ...LS, display: 'flex', alignItems: 'center', gap: 6 }}>
          Stage / Age Level
          {form.birth_date && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: `${STAGE_COLOR[form.cow_stage] || '#ccc'}22`,
              color: STAGE_COLOR[form.cow_stage] || '#666' }}>
              Auto-detected
            </span>
          )}
        </label>
        <select name="cow_stage" value={form.cow_stage} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
          {COW_STAGES.filter(s => s.sex === 'Both' || s.sex === form.sex).map(s => (
            <option key={s.value} value={s.value}>{s.emoji} {s.label} — {s.ageRange}</option>
          ))}
        </select>
        {stageInfo && (
          <div style={{ marginTop: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
            color: stageInfo.color, fontWeight: 600 }}>
            <Info size={12} /> {stageInfo.ageRange} · {stageInfo.sex === 'Both' ? 'Male or Female' : stageInfo.sex} only
          </div>
        )}
      </div>

      {/* Mother cow */}
      <div>
        <label style={LS}>Mother Cow (if offspring)</label>
        <select name="mother_id" value={form.mother_id || ''} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
          <option value="">— none / unknown —</option>
          {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name} ({c.rfid_tag})</option>)}
        </select>
      </div>

      {/* Category + Weight + Lactating */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={LS}>Category</label>
          <select name="cow_category" value={form.cow_category} onChange={onFormChange} style={IS} onFocus={focus} onBlur={blur}>
            <option value="Production">Production (Lactating)</option>
            <option value="Dry">Dry</option>
            <option value="Heifer">Heifer</option>
            <option value="Calf">Calf</option>
            <option value="Fattening">Fattening</option>
          </select>
        </div>
        <div>
          <label style={LS}>Weight (kg) *</label>
          <input type="number" step="0.1" min="0" name="weight_kg"
            value={form.weight_kg} onChange={onFormChange}
            placeholder="e.g. 450" style={IS} onFocus={focus} onBlur={blur} />
        </div>
      </div>

      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8 }}>
          <input type="checkbox" name="lactating" checked={form.lactating} onChange={onFormChange}
            style={{ width: 18, height: 18, accentColor: '#4CAF50', cursor: 'pointer' }} />
          <span style={{ fontWeight: 600, color: form.lactating ? '#4CAF50' : 'var(--text-secondary)' }}>
            {form.lactating ? 'Yes — Lactating' : 'No — Dry'}
          </span>
        </label>
      </div>

      {/* Location */}
      <div>
        <RwandaLocationFields location={location} onChange={onLocationChange} />
      </div>
    </>
  );
}

// ─── Dynamic Chart Panel ──────────────────────────────────────────────────────
function ChartPanel({ cows, counts, activeCharts, setActiveCharts }) {
  const visible = CHART_OPTIONS.filter(c => activeCharts.includes(c.key));

  const byStage = useMemo(() => {
    const m = {};
    cows.forEach(c => { const k = c.cow_stage || 'Unknown'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value, fill: STAGE_COLOR[name] || '#999' }));
  }, [cows]);

  const bySex = useMemo(() => {
    const f = cows.filter(c => c.sex !== 'Male').length;
    const m = cows.filter(c => c.sex === 'Male').length;
    return [{ name: 'Female', value: f, fill: '#E91E63' }, { name: 'Male', value: m, fill: '#1565c0' }].filter(d => d.value > 0);
  }, [cows]);

  const byBreed = useMemo(() => {
    const m = {};
    cows.forEach(c => { const k = c.breed || 'Unknown'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).map(([breed, cnt]) => ({ breed, count: cnt }));
  }, [cows]);

  const healthData = (counts?.by_health || []).map(r => ({
    name: r.health_status, value: r.cnt, fill: HEALTH_COLOR[r.health_status] || '#999',
  }));

  const renderChart = (key) => {
    if (key === 'health') return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={healthData} cx="50%" cy="50%" outerRadius={75} innerRadius={38} dataKey="value"
            label={({ name, value }) => `${value}`} labelLine={false}>
            {healthData.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [v + ' cows', n]} />
          <Legend iconSize={9} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
    if (key === 'stage') return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={byStage} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => [v + ' cows', 'Count']} />
          <Bar dataKey="value" name="Cows" radius={[4, 4, 0, 0]}>
            {byStage.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
    if (key === 'sex') return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={bySex} cx="50%" cy="50%" outerRadius={75} innerRadius={38} dataKey="value"
            label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
            {bySex.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [v + ' cows', n]} />
          <Legend iconSize={9} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
    if (key === 'breed') return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={byBreed} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="breed" tick={{ fontSize: 12, fontWeight: 600 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [v + ' cows', 'Count']} />
          <Bar dataKey="count" name="Cows" radius={[6, 6, 0, 0]}
            label={{ position: 'top', fontSize: 12, fontWeight: 800 }}>
            {byBreed.map(({ breed }, i) => <Cell key={i} fill={BREED_COLOR[breed] || '#999'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
    return null;
  };

  const toggle = (key) =>
    setActiveCharts(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Chart selector bar */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Filter size={13} /> Show charts:
          </span>
          {CHART_OPTIONS.map(({ key, label, icon }) => {
            const on = activeCharts.includes(key);
            return (
              <button key={key} onClick={() => toggle(key)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: on ? 700 : 400,
                  border: `1.5px solid ${on ? '#1E4D7B' : 'var(--border)'}`,
                  background: on ? '#1E4D7B' : '#fff',
                  color: on ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all .15s',
                }}>
                {icon} {label}
              </button>
            );
          })}
          {activeCharts.length > 0 && (
            <button onClick={() => setActiveCharts([])}
              style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', color: '#999', cursor: 'pointer' }}>
              Hide all
            </button>
          )}
          {activeCharts.length === 0 && (
            <button onClick={() => setActiveCharts(['health', 'breed'])}
              style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid #1E4D7B', background: '#fff', color: '#1E4D7B', cursor: 'pointer' }}>
              Show default
            </button>
          )}
        </div>
      </div>

      {/* Charts grid */}
      {visible.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: visible.length === 1 ? '1fr' : visible.length === 2 ? '1fr 1fr' : visible.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: 16,
        }}>
          {visible.map(({ key, label, icon }) => (
            <div key={key} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{icon} {label}</h2>
                <button onClick={() => toggle(key)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: '2px 4px', borderRadius: 4 }}
                  title="Hide chart">
                  <X size={14} />
                </button>
              </div>
              {renderChart(key)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Herd() {
  const [search, setSearch]         = useState('');
  const [filterHealth, setFilterHealth] = useState('All');
  const [filterSex,    setFilterSex]    = useState('All');
  const [filterStage,  setFilterStage]  = useState('All');
  const [filterBreed,  setFilterBreed]  = useState('All');
  const [showFilters,  setShowFilters]  = useState(false);
  const [activeCharts, setActiveCharts] = useState(['health', 'breed']);

  const [showModal,    setShowModal]    = useState(false);
  const [editCow,      setEditCow]      = useState(null);   // cow object being edited
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [location,     setLocation]     = useState(EMPTY_LOCATION);
  const [formErr,      setFormErr]      = useState('');
  const [rfidLoading,  setRfidLoading]  = useState(false);

  const p  = usePermissions();
  const qc = useQueryClient();

  const { data: cows = [], isLoading } = useQuery({ queryKey: ['cows'],        queryFn: getCows });
  const { data: counts }               = useQuery({ queryKey: ['herd-counts'], queryFn: getHerdCounts });

  // ── mutations ──────────────────────────────────────────────────────────────
  const registerMut = useMutation({
    mutationFn: registerCow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cows'] });
      qc.invalidateQueries({ queryKey: ['herd-counts'] });
      setShowModal(false); setForm(EMPTY_FORM); setLocation(EMPTY_LOCATION);
      setFormErr(''); setRfidLoading(false);
    },
    onError: (e) => setFormErr(e.response?.data?.detail || 'Registration failed.'),
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }) => updateCow(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cows'] });
      qc.invalidateQueries({ queryKey: ['herd-counts'] });
      setEditCow(null); setForm(EMPTY_FORM); setLocation(EMPTY_LOCATION); setFormErr('');
    },
    onError: (e) => setFormErr(e.response?.data?.detail || 'Update failed.'),
  });

  // ── filtering ──────────────────────────────────────────────────────────────
  const allStages = useMemo(() => [...new Set(cows.map(c => c.cow_stage).filter(Boolean))].sort(), [cows]);
  const allBreeds = useMemo(() => [...new Set(cows.map(c => c.breed).filter(Boolean))].sort(), [cows]);

  const filtered = useMemo(() => cows.filter(c => {
    if (search && !c.cow_name?.toLowerCase().includes(search.toLowerCase()) && !c.rfid_tag?.includes(search)) return false;
    if (filterHealth !== 'All' && c.health_status !== filterHealth) return false;
    if (filterSex    !== 'All' && c.sex !== filterSex) return false;
    if (filterStage  !== 'All' && c.cow_stage !== filterStage) return false;
    if (filterBreed  !== 'All' && c.breed !== filterBreed) return false;
    return true;
  }), [cows, search, filterHealth, filterSex, filterStage, filterBreed]);

  const activeFilterCount = [filterHealth, filterSex, filterStage, filterBreed].filter(f => f !== 'All').length;

  // ── form helpers ───────────────────────────────────────────────────────────
  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: type === 'checkbox' ? checked : value };
      if (name === 'birth_date' || name === 'sex') {
        const bd = name === 'birth_date' ? value : prev.birth_date;
        const sx = name === 'sex' ? value : prev.sex;
        if (bd) updated.cow_stage = detectStage(bd, sx);
      }
      return updated;
    });
  };

  const openRegister = async () => {
    setShowModal(true); setEditCow(null); setFormErr('');
    setForm(EMPTY_FORM); setLocation(EMPTY_LOCATION);
    setRfidLoading(true);
    try { const { rfid_tag } = await getNextRfid(); setForm(prev => ({ ...prev, rfid_tag })); } catch (_) {}
    setRfidLoading(false);
  };

  const openEdit = (cow) => {
    setEditCow(cow); setShowModal(true); setFormErr('');
    setForm({
      rfid_tag:           cow.rfid_tag        || '',
      cow_name:           cow.cow_name        || '',
      sex:                cow.sex             || 'Female',
      breed:              cow.breed           || 'Friesian',
      breed_type:         cow.breed_type      || 'Pure',
      breed_concentration:cow.breed_concentration || '100%',
      cow_stage:          cow.cow_stage       || 'Cow',
      birth_date:         cow.birth_date      || '',
      weight_kg:          cow.weight_kg       || '',
      lactating:          !!cow.lactating,
      cow_category:       cow.cow_category    || 'Production',
      mother_id:          cow.mother_id       || '',
    });
    setLocation({
      province: cow.province || '', district: cow.district || '',
      sector: cow.sector     || '', cell:     cow.cell_name || '',
      village: cow.village   || '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault(); setFormErr('');
    if (!form.cow_name.trim()) { setFormErr('Cow name is required'); return; }
    if (!form.birth_date)      { setFormErr('Birth date is required'); return; }
    if (!form.weight_kg || Number(form.weight_kg) <= 0) { setFormErr('Valid weight is required'); return; }

    const payload = {
      ...form,
      sex:       form.sex        || 'Female',
      weight_kg: Number(form.weight_kg),
      mother_id: form.mother_id  ? Number(form.mother_id) : undefined,
      province:  location.province  || undefined,
      district:  location.district  || undefined,
      sector:    location.sector    || undefined,
      cell_name: location.cell      || undefined,
      village:   location.village   || undefined,
    };

    if (editCow) {
      const { rfid_tag, ...updateFields } = payload;
      editMut.mutate({ id: editCow.cow_id, body: updateFields });
    } else {
      if (!form.rfid_tag.trim()) { setFormErr('RFID tag is required'); return; }
      registerMut.mutate(payload);
    }
  };

  // ── category summary tiles ─────────────────────────────────────────────────
  const catCounts = cows.reduce((acc, c) => {
    const cat = c.cow_category || 'Production'; acc[cat] = (acc[cat] || 0) + 1; return acc;
  }, {});
  const sickCount = cows.filter(c => c.health_status === 'Critical' || c.health_status === 'Warning').length;

  const isPending = editCow ? editMut.isPending : registerMut.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Category tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        {[
          { label: 'Production', count: catCounts.Production || 0, ...CAT_CONFIG.Production },
          { label: 'Heifers',    count: catCounts.Heifer     || 0, ...CAT_CONFIG.Heifers },
          { label: 'Dry',        count: catCounts.Dry        || 0, ...CAT_CONFIG.Dry },
          { label: 'Calves',     count: catCounts.Calf       || 0, ...CAT_CONFIG.Calves },
          { label: 'Sick',       count: sickCount,                  ...CAT_CONFIG.Sick },
          { label: 'Fattening',  count: catCounts.Fattening  || 0, ...CAT_CONFIG.Fattening },
        ].map(({ label, count, color, emoji }) => (
          <div key={label}
            onClick={() => setFilterHealth(label === 'Sick' ? (filterHealth === 'Warning' ? 'All' : 'Warning') : 'All')}
            style={{ padding: '16px 14px', borderRadius: 12, background: color, color: '#fff', cursor: 'pointer',
              position: 'relative', overflow: 'hidden', minHeight: 80 }}>
            <div style={{ fontSize: 26, fontWeight: 900, position: 'absolute', top: 8, right: 10, opacity: .25 }}>{emoji}</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{count}</div>
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, opacity: .9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Stat banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          { label: 'Present Herd', count: cows.length,           color: '#1E4D7B' },
          { label: 'Sold',         count: catCounts.Sold  || 0,  color: '#FF9800' },
          { label: 'Lost/Dead',    count: catCounts.Lost  || 0,  color: '#607D8B' },
        ].map(({ label, count, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Dynamic charts */}
      <ChartPanel cows={cows} counts={counts} activeCharts={activeCharts} setActiveCharts={setActiveCharts} />

      {/* Cow roster */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1, margin: 0 }}>🐄 Cow Roster
            {filtered.length !== cows.length && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                {filtered.length} of {cows.length}
              </span>
            )}
          </h2>

          {p.canRegisterCow && (
            <button onClick={openRegister} className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12 }}>
              <Plus size={13} /> Register Cow
            </button>
          )}

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg)', borderRadius: 8, padding: '6px 12px', border: '1px solid var(--border)' }}>
            <Search size={13} color="var(--text-secondary)" />
            <input placeholder="Search name or RFID…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, outline: 'none', width: 160 }} />
          </div>

          {/* Filter toggle button */}
          <button onClick={() => setShowFilters(f => !f)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12,
              borderRadius: 8, border: `1.5px solid ${activeFilterCount > 0 ? '#1E4D7B' : 'var(--border)'}`,
              background: activeFilterCount > 0 ? '#1E4D7B' : '#fff',
              color: activeFilterCount > 0 ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
            }}>
            <Filter size={13} />
            Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            <ChevronDown size={13} style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>

          {activeFilterCount > 0 && (
            <button onClick={() => { setFilterHealth('All'); setFilterSex('All'); setFilterStage('All'); setFilterBreed('All'); }}
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff8e1', color: '#c62828', cursor: 'pointer' }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Filter panel — collapsible */}
        {showFilters && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#f7f9fc', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            {[
              {
                label: 'Health Status',
                value: filterHealth, set: setFilterHealth,
                opts: ['All', 'Healthy', 'Warning', 'Critical', 'Under Treatment'],
                colorMap: { Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0' },
              },
              {
                label: 'Sex',
                value: filterSex, set: setFilterSex,
                opts: ['All', 'Female', 'Male'],
                colorMap: { Female: '#E91E63', Male: '#1565c0' },
              },
              {
                label: 'Stage',
                value: filterStage, set: setFilterStage,
                opts: ['All', ...allStages],
                colorMap: STAGE_COLOR,
              },
              {
                label: 'Breed',
                value: filterBreed, set: setFilterBreed,
                opts: ['All', ...allBreeds],
                colorMap: BREED_COLOR,
              },
            ].map(({ label, value, set, opts, colorMap }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {opts.map(opt => {
                    const active = value === opt;
                    const color  = opt !== 'All' ? (colorMap?.[opt] || '#1E4D7B') : '#1E4D7B';
                    return (
                      <button key={opt} onClick={() => set(active && opt !== 'All' ? 'All' : opt)}
                        style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 11,
                          fontWeight: active ? 700 : 400, cursor: 'pointer',
                          border: `1.5px solid ${active ? color : '#e0e0e0'}`,
                          background: active ? color : '#fff',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          transition: 'all .15s',
                        }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        {isLoading ? <div className="spinner" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>RFID</th><th>Name</th><th>Sex</th><th>Breed</th><th>Stage</th>
                  <th>Age</th><th>Weight</th><th>Health</th><th>Temp</th><th>Milk Today</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.cow_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.rfid_tag}</td>
                    <td style={{ fontWeight: 600 }}>{c.cow_name}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: c.sex === 'Male' ? '#e3f2fd' : '#fce4ec',
                        color: c.sex === 'Male' ? '#1565c0' : '#c2185b' }}>
                        {c.sex === 'Male' ? '♂' : '♀'} {c.sex}
                      </span>
                    </td>
                    <td style={{ color: BREED_COLOR[c.breed] || '#333', fontWeight: 500, fontSize: 12 }}>
                      {c.breed}{c.breed_concentration && c.breed_concentration !== '100%' ? ` (${c.breed_concentration})` : ''}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${STAGE_COLOR[c.cow_stage] || '#999'}20`,
                        color: STAGE_COLOR[c.cow_stage] || '#333' }}>
                        {c.cow_stage || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{c.age_months != null ? `${c.age_months} mo` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.weight_kg ? `${c.weight_kg} kg` : '—'}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${HEALTH_COLOR[c.health_status] || '#999'}22`,
                        color: HEALTH_COLOR[c.health_status] || '#333' }}>
                        {c.health_status}
                      </span>
                    </td>
                    <td>
                      {c.latest_temp != null
                        ? <span style={{ color: c.latest_temp > 40 ? '#F44336' : c.latest_temp > 39.5 ? '#FF9800' : '#4CAF50', fontWeight: 600, fontSize: 12 }}>
                            {Number(c.latest_temp).toFixed(1)}°C
                          </span>
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{c.today_milk != null ? `${Number(c.today_milk).toFixed(1)} L` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.canEditCow && (
                          <button onClick={() => openEdit(c)} className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: '#1E4D7B' }}>
                            <Edit2 size={12} /> Edit
                          </button>
                        )}
                        <Link to={`/herd/${c.cow_id}`}>
                          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>View →</button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty-state"><Beef size={40} /><span>No cows match your filters</span></div>
            )}
          </div>
        )}
      </div>

      {/* ── Register / Edit Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
            boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>
                  {editCow ? `✏️ Edit — ${editCow.cow_name}` : '🐄 Register New Cow'}
                </h2>
                <p style={{ fontSize: 11, opacity: .8, marginTop: 3, marginBottom: 0 }}>
                  {editCow ? `${editCow.rfid_tag} · Update cow details` : 'Add a new cow to the herd roster'}
                </p>
              </div>
              <button onClick={() => { setShowModal(false); setEditCow(null); setFormErr(''); }}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <CowForm
                form={form} location={location} cows={cows}
                onFormChange={handleFormChange} onLocationChange={setLocation}
                rfidLoading={rfidLoading} editMode={!!editCow}
              />

              {formErr && (
                <div style={{ color: '#c62828', fontSize: 13, padding: '10px 14px', background: '#fde8e8', borderRadius: 8 }}>
                  ⚠ {formErr}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button type="button" onClick={() => { setShowModal(false); setEditCow(null); setFormErr(''); }}
                  className="btn"
                  style={{ padding: '9px 20px', fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn btn-primary"
                  style={{ padding: '9px 24px', fontSize: 13 }}>
                  {isPending ? (editCow ? 'Saving…' : 'Registering…') : (editCow ? 'Save Changes' : 'Register Cow')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

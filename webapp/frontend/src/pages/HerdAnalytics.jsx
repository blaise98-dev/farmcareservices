import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHerdAnalytics } from '../lib/api';
import {
  DonutChart, BarChart as EBar, HBarChart, RadarChart as ERadar,
  TreemapChart, HeatmapChart, ScatterChart as EScatter, ChartCard,
  HEALTH_COLORS, BREED_COLORS, SEX_COLORS, STAGE_COLORS, PALETTE,
} from '../components/ChartKit';
import { BarChart2, Filter, RefreshCw } from 'lucide-react';

// Colour aliases imported from ChartKit: STAGE_COLORS, BREED_COLORS, HEALTH_COLORS, SEX_COLORS, PALETTE

// ─── helpers ──────────────────────────────────────────────────────────────────
const pct = (v, total) => total ? `${((v / total) * 100).toFixed(1)}%` : '0%';

function ChipSelect({ label, options, value, onChange, multi = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {['All', ...options].map(o => {
          const active = multi
            ? (value.includes(o) || (o === 'All' && value.length === 0))
            : value === o;
          return (
            <button key={o} onClick={() => {
              if (multi) {
                if (o === 'All') { onChange([]); return; }
                onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
              } else {
                onChange(o === value ? 'All' : o);
              }
            }}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 400,
                border: `1px solid ${active ? '#1E4D7B' : 'var(--border)'}`,
                background: active ? '#1E4D7B' : 'var(--bg)', color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color = '#1E4D7B' }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <span className="label">{label}</span>
      <span className="value" style={{ color }}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HerdAnalytics() {
  const { data: rawCows = [], isLoading, refetch } = useQuery({
    queryKey: ['herd-analytics'], queryFn: getHerdAnalytics, staleTime: 60000,
  });

  // ── filter state ──────────────────────────────────────────────────────────
  const [fSex,      setFSex]      = useState('All');
  const [fBreed,    setFBreed]    = useState('All');
  const [fHealth,   setFHealth]   = useState('All');
  const [fStages,   setFStages]   = useState([]);
  const [fProvince, setFProvince] = useState('All');
  const [fAgeMin,   setFAgeMin]   = useState('');
  const [fAgeMax,   setFAgeMax]   = useState('');
  const [fLactating,setFLactating]= useState('All');

  // ── derived options ───────────────────────────────────────────────────────
  const allBreeds    = useMemo(() => [...new Set(rawCows.map(c => c.breed).filter(Boolean))].sort(), [rawCows]);
  const allStages    = useMemo(() => [...new Set(rawCows.map(c => c.cow_stage).filter(Boolean))].sort(), [rawCows]);
  const allProvinces = useMemo(() => [...new Set(rawCows.map(c => c.province).filter(Boolean))].sort(), [rawCows]);

  // ── filtered cows ─────────────────────────────────────────────────────────
  const cows = useMemo(() => rawCows.filter(c => {
    if (fSex !== 'All' && c.sex !== fSex) return false;
    if (fBreed !== 'All' && c.breed !== fBreed) return false;
    if (fHealth !== 'All' && c.health_status !== fHealth) return false;
    if (fStages.length > 0 && !fStages.includes(c.cow_stage)) return false;
    if (fProvince !== 'All' && c.province !== fProvince) return false;
    if (fLactating !== 'All' && String(c.lactating ? 'Yes' : 'No') !== fLactating) return false;
    const age = Number(c.age_months || 0);
    if (fAgeMin && age < Number(fAgeMin)) return false;
    if (fAgeMax && age > Number(fAgeMax)) return false;
    return true;
  }), [rawCows, fSex, fBreed, fHealth, fStages, fProvince, fLactating, fAgeMin, fAgeMax]);

  const total = cows.length;

  // ── aggregations ──────────────────────────────────────────────────────────

  // Category (cow_stage) distribution
  const byStage = useMemo(() => {
    const map = {};
    cows.forEach(c => { const k = c.cow_stage || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [cows]);

  // Sex distribution
  const bySex = useMemo(() => {
    const f = cows.filter(c => c.sex !== 'Male').length;
    const m = cows.filter(c => c.sex === 'Male').length;
    return [{ name: 'Female', value: f }, { name: 'Male', value: m }].filter(d => d.value > 0);
  }, [cows]);

  // Sex × Stage matrix
  const stageSexMatrix = useMemo(() => {
    const stages = [...new Set(cows.map(c => c.cow_stage || 'Unknown'))].sort();
    return stages.map(stage => ({
      name: stage,
      Female: cows.filter(c => (c.cow_stage || 'Unknown') === stage && c.sex !== 'Male').length,
      Male:   cows.filter(c => (c.cow_stage || 'Unknown') === stage && c.sex === 'Male').length,
    }));
  }, [cows]);

  // Breed distribution
  const byBreed = useMemo(() => {
    const map = {};
    cows.forEach(c => { const k = c.breed || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [cows]);

  // Health distribution
  const byHealth = useMemo(() => {
    const map = {};
    cows.forEach(c => { const k = c.health_status || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [cows]);

  // Breed × Sex
  const breedSex = useMemo(() => {
    const breeds = [...new Set(cows.map(c => c.breed || 'Unknown'))].sort();
    return breeds.map(b => ({
      name: b,
      Female: cows.filter(c => (c.breed || 'Unknown') === b && c.sex !== 'Male').length,
      Male:   cows.filter(c => (c.breed || 'Unknown') === b && c.sex === 'Male').length,
    }));
  }, [cows]);

  // Age distribution buckets
  const byAgeGroup = useMemo(() => {
    const buckets = { '0–6 mo': 0, '7–12 mo': 0, '1–2 yr': 0, '2–4 yr': 0, '4–8 yr': 0, '8+ yr': 0 };
    cows.forEach(c => {
      const mo = Number(c.age_months || 0);
      if (mo <= 6) buckets['0–6 mo']++;
      else if (mo <= 12) buckets['7–12 mo']++;
      else if (mo <= 24) buckets['1–2 yr']++;
      else if (mo <= 48) buckets['2–4 yr']++;
      else if (mo <= 96) buckets['4–8 yr']++;
      else buckets['8+ yr']++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [cows]);

  // Province distribution
  const byProvince = useMemo(() => {
    const map = {};
    cows.forEach(c => { const k = c.province || 'Unknown'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [cows]);

  // Milk 30d — top producers
  const topMilk = useMemo(() =>
    [...cows].filter(c => c.milk_30d > 0)
      .sort((a, b) => b.milk_30d - a.milk_30d).slice(0, 10)
      .map(c => ({ name: c.cow_name, liters: Number(c.milk_30d).toFixed(0), stage: c.cow_stage })),
    [cows]);

  // Health × Stage heatmap data
  const healthStage = useMemo(() => {
    const stages = [...new Set(cows.map(c => c.cow_stage || 'Unknown'))];
    return stages.map(stage => {
      const obj = { name: stage };
      ['Healthy', 'Warning', 'Critical', 'Under Treatment'].forEach(h => {
        obj[h] = cows.filter(c => (c.cow_stage || 'Unknown') === stage && c.health_status === h).length;
      });
      return obj;
    });
  }, [cows]);

  // Radar: stage diversity
  const radarData = useMemo(() =>
    byStage.slice(0, 8).map(d => ({ subject: d.name, count: d.value })),
    [byStage]);

  // Weight distribution
  const byWeight = useMemo(() => {
    const buckets = { '<100 kg': 0, '100–200': 0, '200–350': 0, '350–500': 0, '500–600': 0, '600+ kg': 0 };
    cows.forEach(c => {
      const w = Number(c.weight_kg || 0);
      if (w < 100) buckets['<100 kg']++;
      else if (w < 200) buckets['100–200']++;
      else if (w < 350) buckets['200–350']++;
      else if (w < 500) buckets['350–500']++;
      else if (w < 600) buckets['500–600']++;
      else buckets['600+ kg']++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [cows]);

  // Breed concentration
  const byConcentration = useMemo(() => {
    const map = {};
    cows.forEach(c => { const k = c.breed_concentration || '100%'; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [cows]);

  const activeFilters = [fSex, fBreed, fHealth, fProvince, fLactating].filter(f => f !== 'All').length
    + fStages.length + (fAgeMin ? 1 : 0) + (fAgeMax ? 1 : 0);

  if (isLoading) return <div className="spinner" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '18px 24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart2 size={24} />
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Herd Analytics</h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, opacity: .8 }}>
            Dynamic multi-dimensional analysis · {total} cows {activeFilters > 0 ? `(${activeFilters} filter${activeFilters > 1 ? 's' : ''} active)` : ''}
          </p>
        </div>
        <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters panel */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Filter size={15} color="#1E4D7B" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Filters</span>
          {activeFilters > 0 && (
            <button onClick={() => { setFSex('All'); setFBreed('All'); setFHealth('All'); setFStages([]); setFProvince('All'); setFAgeMin(''); setFAgeMax(''); setFLactating('All'); }}
              style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff8e1', color: '#c62828', cursor: 'pointer', fontWeight: 700 }}>
              Clear all ({activeFilters})
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
          <ChipSelect label="Sex" options={['Female', 'Male']} value={fSex} onChange={setFSex} />
          <ChipSelect label="Breed" options={allBreeds} value={fBreed} onChange={setFBreed} />
          <ChipSelect label="Health Status" options={['Healthy', 'Warning', 'Critical', 'Under Treatment']} value={fHealth} onChange={setFHealth} />
          <ChipSelect label="Lactating" options={['Yes', 'No']} value={fLactating} onChange={setFLactating} />
          {allProvinces.length > 0 && <ChipSelect label="Province" options={allProvinces} value={fProvince} onChange={setFProvince} />}
          <ChipSelect label="Stage (multi)" options={allStages} value={fStages} onChange={setFStages} multi />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, display: 'block', marginBottom: 4 }}>Age Min (mo)</span>
              <input type="number" value={fAgeMin} onChange={e => setFAgeMin(e.target.value)} placeholder="0"
                style={{ width: 70, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
            </div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, display: 'block', marginBottom: 4 }}>Age Max (mo)</span>
              <input type="number" value={fAgeMax} onChange={e => setFAgeMax(e.target.value)} placeholder="∞"
                style={{ width: 70, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Total Cows" value={total} color="#1E4D7B" sub="in current filter" />
        <KpiCard label="Females" value={cows.filter(c => c.sex !== 'Male').length} color="#E91E63"
          sub={`${pct(cows.filter(c => c.sex !== 'Male').length, total)} of herd`} />
        <KpiCard label="Males" value={cows.filter(c => c.sex === 'Male').length} color="#1565c0"
          sub={`${pct(cows.filter(c => c.sex === 'Male').length, total)} of herd`} />
        <KpiCard label="Lactating" value={cows.filter(c => c.lactating).length} color="#2196F3"
          sub={`${pct(cows.filter(c => c.lactating).length, total)} of herd`} />
        <KpiCard label="Healthy" value={cows.filter(c => c.health_status === 'Healthy').length} color="#4CAF50"
          sub={`${pct(cows.filter(c => c.health_status === 'Healthy').length, total)} healthy`} />
        <KpiCard label="At Risk" value={cows.filter(c => ['Warning','Critical','Under Treatment'].includes(c.health_status)).length} color="#F44336"
          sub="Warning + Critical" />
        <KpiCard label="Avg Age" color="#FF9800"
          value={total ? `${(cows.reduce((s, c) => s + Number(c.age_months || 0), 0) / total).toFixed(0)} mo` : '--'}
          sub="across filtered herd" />
        <KpiCard label="Avg Weight" color="#9C27B0"
          value={total ? `${(cows.filter(c => c.weight_kg).reduce((s, c) => s + Number(c.weight_kg), 0) / cows.filter(c => c.weight_kg).length).toFixed(0)} kg` : '--'}
          sub="across filtered herd" />
      </div>

      {/* Row 1: Donut triptych */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        <ChartCard title="🐄 Category Distribution">
          <DonutChart data={byStage.map(d => ({ ...d, color: STAGE_COLORS[d.name] }))} centerValue={total} centerLabel="cows" height={240} />
        </ChartCard>
        <ChartCard title="♀♂ Sex Distribution">
          <DonutChart data={bySex.map(d => ({ ...d, color: SEX_COLORS[d.name] }))} height={240} />
        </ChartCard>
        <ChartCard title="🧬 Breed Distribution">
          <DonutChart data={byBreed.map(d => ({ ...d, color: BREED_COLORS[d.name] }))} height={240} />
        </ChartCard>
      </div>

      {/* Row 2: Stage × Sex grouped bar */}
      <ChartCard title="📊 Category × Sex Breakdown" sub="Number of animals per stage split by sex">
        <EBar data={stageSexMatrix} xKey="name"
          series={[{ key: 'Female', name: 'Female', color: '#E91E63' }, { key: 'Male', name: 'Male', color: '#1565c0' }]}
          stacked height={260} />
      </ChartCard>

      {/* Row 3: Health donut + Age bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="💊 Health Status Distribution">
          <DonutChart data={byHealth.map(d => ({ ...d, color: HEALTH_COLORS[d.name] }))} height={240} />
        </ChartCard>
        <ChartCard title="📅 Age Distribution" sub="Bucketed by months/years">
          <EBar data={byAgeGroup} xKey="name" series={[{ key: 'value', name: 'Cows', color: '#1E4D7B' }]} showLabel height={240} />
        </ChartCard>
      </div>

      {/* Row 4: Health × Stage heatmap */}
      {(() => {
        const stages = [...new Set(cows.map(c => c.cow_stage || 'Unknown'))];
        const heatData = [];
        stages.forEach(stage => {
          ['Healthy','Warning','Critical','Under Treatment'].forEach(h => {
            heatData.push([h, stage, cows.filter(c => (c.cow_stage||'Unknown')===stage && c.health_status===h).length]);
          });
        });
        return (
          <ChartCard title="🏥 Health × Stage Heatmap" sub="Number of cows at each health/stage intersection">
            <HeatmapChart xData={['Healthy','Warning','Critical','Under Treatment']} yData={stages} data={heatData} height={Math.max(200, stages.length * 40)} />
          </ChartCard>
        );
      })()}

      {/* Row 5: Breed × Sex + Weight */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🧬 Breed × Sex" sub="Sex distribution within each breed">
          <EBar data={breedSex} xKey="name"
            series={[{ key: 'Female', name: 'Female', color: '#E91E63' }, { key: 'Male', name: 'Male', color: '#1565c0' }]}
            height={240} />
        </ChartCard>
        <ChartCard title="⚖️ Weight Distribution" sub="Cow weight ranges across herd">
          <EBar data={byWeight} xKey="name" series={[{ key: 'value', name: 'Cows', color: '#4CAF50' }]} showLabel height={240} />
        </ChartCard>
      </div>

      {/* Row 6: Radar + Breed concentration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🕸 Stage Diversity Radar" sub="Coverage across top 8 stages">
          <ERadar
            indicators={radarData.map(d => ({ name: d.subject, max: Math.max(...radarData.map(r => r.count), 1) }))}
            series={[{ name: 'Count', values: radarData.map(d => d.count), color: '#1E4D7B' }]}
            height={280}
          />
        </ChartCard>
        <ChartCard title="🔬 Breed Concentration" sub="Cross-breed concentration distribution">
          <EBar data={byConcentration} xKey="name" series={[{ key: 'value', name: 'Cows', color: '#9C27B0' }]} showLabel height={280} />
        </ChartCard>
      </div>

      {/* Row 7: Treemap */}
      <ChartCard title="🗺 Category Treemap" sub="Size proportional to number of animals per stage">
        <TreemapChart data={byStage.map((d, i) => ({ name: d.name, value: d.value, color: STAGE_COLORS[d.name] || PALETTE[i % PALETTE.length] }))} height={280} />
      </ChartCard>

      {/* Row 8: Province + Top milk */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {byProvince.length > 0
          ? <ChartCard title="📍 Distribution by Province" sub="Registered cows per province">
              <HBarChart data={byProvince} unit=" cows" color="#00BCD4" height={Math.max(180, byProvince.length * 42)} />
            </ChartCard>
          : <div className="card"><p style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 16 }}>No location data available</p></div>
        }
        {topMilk.length > 0
          ? <ChartCard title="🥛 Top Milk Producers (30d)" sub="Total litres produced — last 30 days">
              <HBarChart data={topMilk.map(r => ({ name: r.name, value: Number(r.liters) }))} unit=" L" color="#2196F3" height={Math.max(180, topMilk.length * 42)} />
            </ChartCard>
          : <div className="card"><p style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 16 }}>No milk data in current filter</p></div>
        }
      </div>

      {/* Detail table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>📋 Cow Detail Table ({total})</h2>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>RFID</th><th>Name</th><th>Sex</th><th>Breed</th><th>Stage</th>
                <th>Age</th><th>Weight</th><th>Health</th><th>Lactating</th><th>Province</th><th>Milk 30d</th>
              </tr>
            </thead>
            <tbody>
              {cows.map(c => (
                <tr key={c.cow_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.rfid_tag}</td>
                  <td style={{ fontWeight: 600 }}>{c.cow_name}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: c.sex === 'Male' ? '#e3f2fd' : '#fce4ec',
                    color: c.sex === 'Male' ? '#1565c0' : '#c2185b' }}>{c.sex === 'Male' ? '♂' : '♀'} {c.sex}</span></td>
                  <td style={{ fontSize: 12 }}>{c.breed}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: `${STAGE_COLORS[c.cow_stage] || '#999'}20`, color: STAGE_COLORS[c.cow_stage] || '#333' }}>{c.cow_stage || '—'}</span></td>
                  <td style={{ fontSize: 12 }}>{c.age_months != null ? `${c.age_months} mo` : '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.weight_kg ? `${c.weight_kg} kg` : '—'}</td>
                  <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: `${HEALTH_COLORS[c.health_status] || '#999'}22`, color: HEALTH_COLORS[c.health_status] || '#333' }}>{c.health_status}</span></td>
                  <td style={{ fontSize: 12 }}>{c.lactating ? '✓ Yes' : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.province || '—'}</td>
                  <td style={{ fontSize: 12, fontWeight: 700, color: '#2196F3' }}>{c.milk_30d ? `${Number(c.milk_30d).toFixed(1)} L` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRealtime } from '../context/RealtimeContext';
import { getEnvHistory, getEnvDailyAvg, getCowTemperatures, addEnvReading } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { LineChart as ELine, BarChart as EBar, GaugeChart, ChartCard } from '../components/ChartKit';
import { Thermometer, Wind, Droplets, Activity, Plus, X } from 'lucide-react';
import { format } from 'date-fns';

const TEMP_COLOR = { Normal: '#4CAF50', Elevated: '#FF9800', High: '#FF5722', Fever: '#F44336', Low: '#2196F3' };

export default function Environment() {
  const { env: liveEnv } = useRealtime();
  const [hours, setHours] = useState(24);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ temperature_celsius: '', humidity_percent: '', air_quality_ppm: '', oxygen_percent: '' });
  const [addErr, setAddErr] = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();

  const addMut = useMutation({
    mutationFn: addEnvReading,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['env-history'] }); qc.invalidateQueries({ queryKey: ['env-daily'] }); setShowAdd(false); setAddForm({ temperature_celsius: '', humidity_percent: '', air_quality_ppm: '', oxygen_percent: '' }); setAddErr(''); },
    onError: (e) => setAddErr(e.response?.data?.detail || 'Failed'),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['env-history', hours], queryFn: () => getEnvHistory(hours),
  });
  const { data: dailyAvg = [] } = useQuery({ queryKey: ['env-daily'], queryFn: getEnvDailyAvg });
  const { data: cowTemps = [] } = useQuery({ queryKey: ['cow-temps'], queryFn: getCowTemperatures, refetchInterval: 15000 });

  const histChart = history.map(r => ({
    time: r.recorded_at ? format(new Date(r.recorded_at), 'HH:mm') : '',
    temp: Number(r.temperature_celsius).toFixed(1),
    hum: Number(r.humidity_percent).toFixed(1),
    aq: Number(r.air_quality_ppm || 0).toFixed(0),
    o2: Number(r.oxygen_percent || 0).toFixed(2),
  }));

  const env = liveEnv || (history.length ? history[history.length - 1] : {});

  const GAUGES = [
    { label: 'Temperature', icon: Thermometer, val: Number(env.temperature_celsius || 0).toFixed(1) + '°C', pct: Math.min(100, (Number(env.temperature_celsius || 0) / 45) * 100), color: '#FF9800', warn: env.temperature_celsius > 32, warnMsg: '> 32°C — High' },
    { label: 'Humidity', icon: Droplets, val: Number(env.humidity_percent || 0).toFixed(0) + '%', pct: Number(env.humidity_percent || 0), color: '#00BCD4', warn: env.humidity_percent < 50 || env.humidity_percent > 80, warnMsg: 'Out of 50–80% range' },
    { label: 'Air Quality', icon: Wind, val: Number(env.air_quality_ppm || 0).toFixed(0) + ' ppm', pct: Math.min(100, (Number(env.air_quality_ppm || 0) / 1000) * 100), color: env.air_quality_ppm > 600 ? '#F44336' : env.air_quality_ppm > 450 ? '#FF9800' : '#4CAF50', warn: env.air_quality_ppm > 600, warnMsg: '> 600 ppm — Ventilate' },
    { label: 'Oxygen Level', icon: Activity, val: Number(env.oxygen_percent || 0).toFixed(2) + '%', pct: Math.min(100, (Number(env.oxygen_percent || 0) / 25) * 100), color: '#9C27B0', warn: env.oxygen_percent < 19.5, warnMsg: '< 19.5% — Low O₂' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Add reading button — Admin & Technician */}
      {p.canAddEnvReading && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => { setShowAdd(true); setAddErr(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Plus size={14} /> Log Manual Reading
          </button>
        </div>
      )}

      {/* Live gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
        {GAUGES.map(({ label, icon: Icon, val, pct, color, warn, warnMsg }) => (
          <div key={label} className="card" style={{ borderTop: `4px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
              <Icon size={18} color={color} />
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, color, marginBottom: 12 }}>{val}</div>
            <div className="gauge-bar" style={{ marginBottom: 8 }}>
              <div className="gauge-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            {warn
              ? <span style={{ fontSize: 11, color: '#F44336', fontWeight: 700 }}>⚠ {warnMsg}</span>
              : <span style={{ fontSize: 11, color: '#4CAF50' }}>✓ Normal range</span>
            }
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <span className="live-dot" style={{ background: color }} />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Live sensor</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="card">
        <div className="section-header">
          <h2>📈 Environment History</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {[6, 12, 24, 48].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className="btn"
                style={{ padding: '4px 10px', fontSize: 11, background: hours === h ? '#1E4D7B' : 'var(--bg)', color: hours === h ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                {h}h
              </button>
            ))}
          </div>
        </div>
        <ELine data={histChart} xKey="time"
          series={[{ key: 'temp', name: 'Temp °C', color: '#FF9800' }, { key: 'hum', name: 'Humidity %', color: '#00BCD4' }]}
          area smooth height={260} unit=""
          markLine={[{ yAxis: 32, label: { formatter: () => 'Alert 32°C', position: 'end' } }]}
        />
      </div>

      {/* Air quality */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🌬 Air Quality Trend" sub="ppm — Alert ≥600 / Warn ≥450">
          <ELine data={histChart} xKey="time"
            series={[{ key: 'aq', name: 'Air Quality (ppm)', color: '#9C27B0' }]}
            smooth height={200} unit=" ppm"
            markLine={[{ yAxis: 600, label: { formatter: () => '600 ppm Alert', position: 'end' } }, { yAxis: 450, label: { formatter: () => '450 Warn', position: 'end' } }]}
          />
        </ChartCard>

        {/* Per-cow temperatures */}
        <div className="card" style={{ maxHeight: 280, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header"><h2>🌡 Cow Body Temps</h2></div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {cowTemps.map(c => (
              <div key={c.cow_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 80 }}>{c.cow_name}</span>
                <div style={{ flex: 1 }}>
                  <div className="gauge-bar">
                    <div className="gauge-bar-fill" style={{
                      width: `${Math.min(100, ((Number(c.body_temp_celsius || 38) - 36) / 6) * 100)}%`,
                      background: TEMP_COLOR[c.temp_status] || '#4CAF50',
                    }} />
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 50, textAlign: 'right', color: TEMP_COLOR[c.temp_status] || '#4CAF50' }}>
                  {c.body_temp_celsius ? `${Number(c.body_temp_celsius).toFixed(1)}°C` : '--'}
                </span>
                {c.temp_status && c.temp_status !== 'Normal' && (
                  <span className={`badge badge-${c.temp_status.toLowerCase()}`} style={{ fontSize: 9, padding: '2px 6px' }}>
                    {c.temp_status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Reading Modal */}
      {showAdd && p.canAddEnvReading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#E65100,#FF9800)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>📡 Log Manual Sensor Reading</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!addForm.temperature_celsius || !addForm.humidity_percent) { setAddErr('Temperature and humidity are required'); return; } addMut.mutate({ temperature_celsius: Number(addForm.temperature_celsius), humidity_percent: Number(addForm.humidity_percent), air_quality_ppm: addForm.air_quality_ppm ? Number(addForm.air_quality_ppm) : null, oxygen_percent: addForm.oxygen_percent ? Number(addForm.oxygen_percent) : null }); }}
              style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Temperature (°C) *', key: 'temperature_celsius', placeholder: 'e.g. 28.5' },
                  { label: 'Humidity (%) *',     key: 'humidity_percent',    placeholder: 'e.g. 65' },
                  { label: 'Air Quality (ppm)',  key: 'air_quality_ppm',     placeholder: 'e.g. 450' },
                  { label: 'Oxygen (%)',         key: 'oxygen_percent',      placeholder: 'e.g. 20.9' },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>{label}</label>
                    <input type="number" step="0.01" placeholder={placeholder}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      value={addForm[key]} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {addErr && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {addErr}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAdd(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addMut.isPending} style={{ padding: '9px 22px', fontSize: 13, background: '#E65100', border: 'none' }}>
                  {addMut.isPending ? 'Saving…' : 'Save Reading'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7-day averages table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>📊 7-Day Daily Averages</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>Avg Temp</th><th>Max Temp</th><th>Avg Humidity</th><th>Avg Air Quality</th><th>Max AQ</th><th>Avg Oxygen</th></tr>
            </thead>
            <tbody>
              {dailyAvg.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.reading_date ? format(new Date(r.reading_date), 'EEE, MMM d') : ''}</td>
                  <td>{Number(r.avg_temp).toFixed(1)}°C</td>
                  <td style={{ color: r.max_temp > 32 ? '#F44336' : 'inherit', fontWeight: r.max_temp > 32 ? 700 : 400 }}>{Number(r.max_temp).toFixed(1)}°C</td>
                  <td>{Number(r.avg_humidity).toFixed(1)}%</td>
                  <td>{Number(r.avg_air_quality).toFixed(0)} ppm</td>
                  <td style={{ color: r.max_aq > 600 ? '#F44336' : r.max_aq > 450 ? '#FF9800' : 'inherit', fontWeight: r.max_aq > 450 ? 700 : 400 }}>{Number(r.max_aq).toFixed(0)}</td>
                  <td>{Number(r.avg_oxygen).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

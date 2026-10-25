import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Droplets, Hash, Gauge, Ruler, Wifi, Save, XCircle, ClipboardList, Beef, FlaskConical } from 'lucide-react';
import { getMilkingLive, getMilkingSessions, getMilkingToday, milkingScan, milkingRecord, milkingCancel } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const fmtL = (v, d = 2) => (v == null ? '-' : `${Number(v).toFixed(d)} L`);

function duration(secs) {
  if (secs == null) return '-';
  const s = Math.round(Number(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Stat({ icon: Icon, color, value, label, sub }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <span className="label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={13} /> {label}</span>
      <span className="value" style={{ color }}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/** The 4 L container drawn as a filling jar. */
function ContainerGauge({ pct, capacity }) {
  const level = Math.max(0, Math.min(100, Number(pct) || 0));
  const marks = Array.from({ length: Math.max(1, Math.round(capacity || 4)) + 1 }, (_, i) => i);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, height: 190 }}>
      <div style={{ display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)', paddingBottom: 2 }}>
        {marks.map(m => <span key={m}>{m}L</span>)}
      </div>
      <div style={{ position: 'relative', width: 110, border: '3px solid #2E7D32', borderTop: 'none', borderRadius: '0 0 16px 16px', overflow: 'hidden', background: 'var(--surface-2)' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${level}%`, transition: 'height .6s ease',
          background: 'linear-gradient(180deg, #FFF8E1 0%, #FFF3C4 70%, #FFE082 100%)', borderTop: level > 0 ? '2px solid #4FC3F7' : 'none' }} />
        <span style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 800,
          background: 'var(--card)', borderRadius: 10, padding: '2px 8px', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>{level.toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default function Milking() {
  const p = usePermissions();
  const qc = useQueryClient();
  const [tag, setTag] = useState('');
  const [manualL, setManualL] = useState('');
  const [msg, setMsg] = useState(null);

  const { data: live, isLoading } = useQuery({ queryKey: ['milking-live'], queryFn: getMilkingLive, refetchInterval: 3000 });
  const { data: sessions = [] } = useQuery({ queryKey: ['milking-sessions'], queryFn: () => getMilkingSessions(20), refetchInterval: 10000 });
  const { data: today = [] } = useQuery({ queryKey: ['milking-today'], queryFn: getMilkingToday, refetchInterval: 10000 });

  const refresh = () => ['milking-live', 'milking-sessions', 'milking-today', 'milk-daily', 'today-sessions'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const errText = (e) => e?.response?.data?.detail || 'Something went wrong';

  const scanMut = useMutation({
    mutationFn: milkingScan,
    onSuccess: (r) => { setTag(''); refresh(); flash(true, `${r.cow_name} identified. Start milking into the container.`); },
    onError: (e) => flash(false, errText(e)),
  });
  const recordMut = useMutation({
    mutationFn: milkingRecord,
    onSuccess: (r) => { setManualL(''); refresh(); flash(true, `Saved ${Number(r.session.milk_liters).toFixed(2)} L for ${r.session.cow_name}.`); },
    onError: (e) => flash(false, errText(e)),
  });
  const cancelMut = useMutation({ mutationFn: milkingCancel, onSuccess: () => { refresh(); flash(true, 'Session cancelled.'); } });

  const reading = live?.reading || {};
  const isLive = !!live?.reading_is_live;
  const session = live?.active_session;
  const capacity = live?.container?.capacity_l || 4;
  const volume = isLive ? reading.volume_l : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-ink)', display: 'flex', alignItems: 'center', gap: 8 }}><Droplets size={20} /> Milking</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Live RFID scan and recording from {live?.device_label || 'the Milking Station'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        <Stat icon={Droplets} color="#2E7D32" value={fmtL(live?.today_total_l, 2)} label="Today's milk" />
        <Stat icon={Hash} color="#1E4D7B" value={live?.today_sessions ?? '-'} label="Sessions" sub="recorded today" />
        <Stat icon={Gauge} color="#E65100" value={isLive && reading.level_pct != null ? `${Number(reading.level_pct).toFixed(0)}%` : '-'} label="Container level" />
        <Stat icon={Ruler} color="#880E4F" value={isLive && reading.distance_cm != null ? `${Number(reading.distance_cm).toFixed(1)} cm` : '-'} label="Sensor reading"
          sub={isLive ? 'ultrasonic, from the rim' : 'no live reading'} />
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: msg.ok ? '#E8F5E9' : '#FFEBEE', color: msg.ok ? '#2E7D32' : '#C62828' }}>{msg.text}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* RFID scanner */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', display: 'flex', alignItems: 'center', gap: 6 }}><Wifi size={15} /> RFID Scanner</h3>
              <span title={live?.online ? 'Station online' : 'Station offline'}
                style={{ width: 10, height: 10, borderRadius: '50%', background: live?.online ? '#4CAF50' : '#FFB300' }} />
            </div>
            {p.canLogMilk ? (
              <form onSubmit={e => { e.preventDefault(); if (tag.trim()) scanMut.mutate(tag.trim()); }} style={{ display: 'flex', gap: 8 }}>
                <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Scan card or type UID…"
                  style={{ flex: 1, padding: '10px 12px', border: '2px solid var(--border)', borderRadius: 10, fontFamily: 'monospace', letterSpacing: 1, fontSize: 13 }} />
                <button className="btn btn-primary" disabled={scanMut.isPending || !tag.trim()}>Go</button>
              </form>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only farmers and admins can start a milking session.</div>
            )}
            <div style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: session ? '#2E7D32' : 'var(--text-secondary)' }}>
              {session
                ? <>Milking <b>{session.cow_name}</b> since {format(new Date(session.start_time), 'HH:mm:ss')}</>
                : 'Waiting for RFID scan…'}
            </div>
            {live?.last_scan && !live.last_scan.found && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#C62828', textAlign: 'center' }}>
                Last tag {live.last_scan.rfid_tag} is not registered to any cow
              </div>
            )}
          </div>

          {/* Container */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 12 }}>Milk Level ({capacity} L container)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ContainerGauge pct={isLive ? reading.level_pct : 0} capacity={capacity} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--green-ink)' }}>{volume != null ? `${Number(volume).toFixed(3)} L` : '-'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{volume != null ? `= ${Math.round(volume * 1000)} mL` : 'no live reading'}</div>
                {isLive && (reading.tds_ppm != null || reading.milk_temp_c != null) && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <FlaskConical size={13} />
                    {reading.tds_ppm != null && `TDS ${Number(reading.tds_ppm).toFixed(0)} ppm`}
                    {reading.tds_ppm != null && reading.milk_temp_c != null && ' · '}
                    {reading.milk_temp_c != null && `${Number(reading.milk_temp_c).toFixed(1)}°C`}
                  </div>
                )}
              </div>
            </div>
            {p.canLogMilk && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min="0" step="0.01" value={manualL} onChange={e => setManualL(e.target.value)}
                    placeholder="Litres (optional, else measured)"
                    style={{ flex: 1, padding: '9px 12px', border: '2px solid var(--border)', borderRadius: 10, fontSize: 13 }} />
                </div>
                <button className="btn btn-primary" disabled={!session || recordMut.isPending}
                  onClick={() => recordMut.mutate(manualL ? { volume_l: Number(manualL) } : {})}
                  style={{ justifyContent: 'center', padding: '12px' }}>
                  <Save size={15} /> {recordMut.isPending ? 'Saving…' : 'Record Milk'}
                </button>
                {session && (
                  <button className="btn btn-ghost" onClick={() => cancelMut.mutate()} style={{ justifyContent: 'center' }}>
                    <XCircle size={14} /> Cancel session
                  </button>
                )}
                {!session && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>Scan a cow's tag to enable recording</div>}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Today by cow */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Beef size={15} /> Registered Cows: Today</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Cow</th><th>RFID</th><th>Today (L)</th><th>Sessions</th></tr></thead>
                <tbody>
                  {today.map(c => (
                    <tr key={c.cow_id}>
                      <td style={{ fontWeight: 600 }}>{c.cow_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{c.rfid_tag || '-'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green-ink)' }}>{Number(c.today_l).toFixed(2)}</td>
                      <td>{c.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {today.length === 0 && <div className="empty-state"><Beef size={36} /><span>No lactating cows registered</span></div>}
            </div>
          </div>

          {/* Recent sessions */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={15} /> Recent Milking Sessions</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Cow</th><th>Milk (L)</th><th>Duration</th><th>Time</th><th>Recorded by</th></tr></thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.session_id}>
                      <td style={{ fontWeight: 600 }}>{s.cow_name || '-'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--green-ink)' }}>{Number(s.milk_liters).toFixed(3)}</td>
                      <td>{duration(s.duration_seconds)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{s.end_time ? format(new Date(s.end_time), 'MMM d, HH:mm:ss') : '-'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.recorded_by === 'milking_station' ? 'Station button' : (s.recorded_by || '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isLoading && sessions.length === 0 && <div className="empty-state"><Droplets size={36} /><span>No milking sessions recorded yet</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

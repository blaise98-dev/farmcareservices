import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { lastSeenText } from '../lib/lastSeen';
import { HeartPulse, AlertTriangle, Map as MapIcon, ShieldCheck, Save } from 'lucide-react';
import { getCowHealthOverview, getFieldSettings, updateFieldSettings } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

const LEVEL = {
  Normal:   { color: 'var(--green-ink)', bg: '#E8F5E9' },
  Watch:    { color: '#F9A825', bg: '#FFF8E1' },
  'At Risk':{ color: '#E65100', bg: '#FFF3E0' },
  Critical: { color: '#C62828', bg: '#FFEBEE' },
};

function RiskBadge({ risk }) {
  const s = LEVEL[risk?.level] || LEVEL.Normal;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>
      {risk?.level || 'Normal'} · {risk?.score ?? 0}
    </span>
  );
}

const fmt = (v, d = 0, unit = '') => (v == null ? '-' : `${Number(v).toFixed(d)}${unit}`);

function BoundaryForm({ settings, cows, onSaved }) {
  const [form, setForm] = useState({
    geofence_lat: settings.geofence_lat || '', geofence_lng: settings.geofence_lng || '', geofence_radius_m: settings.geofence_radius_m || '',
  });
  const [err, setErr] = useState('');
  const mut = useMutation({ mutationFn: updateFieldSettings, onSuccess: () => { setErr(''); onSaved(); }, onError: e => setErr(e.response?.data?.detail || 'Could not save') });
  const located = cows.filter(c => c.location);
  const input = { padding: '8px 10px', border: '2px solid var(--border)', borderRadius: 8, fontSize: 13, width: '100%' };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Farm boundary</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: 8 }}>
        <input style={input} placeholder="Centre latitude" value={form.geofence_lat} onChange={e => setForm(f => ({ ...f, geofence_lat: e.target.value }))} />
        <input style={input} placeholder="Centre longitude" value={form.geofence_lng} onChange={e => setForm(f => ({ ...f, geofence_lng: e.target.value }))} />
        <input style={input} placeholder="Radius (m)" value={form.geofence_radius_m} onChange={e => setForm(f => ({ ...f, geofence_radius_m: e.target.value }))} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {located.length > 0 && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => setForm(f => ({ ...f, geofence_lat: located[0].location.latitude.toFixed(6), geofence_lng: located[0].location.longitude.toFixed(6), geofence_radius_m: f.geofence_radius_m || '150' }))}>
            Use {located[0].cow_name}'s position as centre
          </button>
        )}
        <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={mut.isPending} onClick={() => mut.mutate(form)}>
          <Save size={13} /> Save boundary
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => mut.mutate({ geofence_lat: '', geofence_lng: '', geofence_radius_m: '' })}>
          Remove boundary
        </button>
      </div>
      {err && <div style={{ color: '#C62828', fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>A cow outside this circle raises a critical Location alert and an SMS to subscribers.</div>
    </div>
  );
}

export default function CowHealth() {
  const p = usePermissions();
  const qc = useQueryClient();
  const canEditBoundary = p.isAdmin || p.isTechnician;
  const { data, isLoading, isError } = useQuery({ queryKey: ['cow-health'], queryFn: getCowHealthOverview, refetchInterval: 10000 });
  const { data: settings } = useQuery({ queryKey: ['field-settings'], queryFn: getFieldSettings, enabled: canEditBoundary });

  const cows = data?.cows || [];
  const attention = data?.needs_attention || [];
  const boundary = data?.boundary;
  const located = cows.filter(c => c.location);
  const center = boundary ? [boundary.latitude, boundary.longitude]
    : located.length ? [located[0].location.latitude, located[0].location.longitude] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-ink)', display: 'flex', alignItems: 'center', gap: 8 }}><HeartPulse size={20} /> Cow Health &amp; Tracking</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Vitals and GPS tracking from the Health Collars</div>
        </div>
      </div>

      {/* Needs attention */}
      <div className="card" style={{ background: attention.length ? 'var(--tint-orange)' : undefined, border: attention.length ? '1px solid #FFCC80' : undefined }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: attention.length ? '#E65100' : '#2E7D32', display: 'flex', alignItems: 'center', gap: 8, marginBottom: attention.length ? 12 : 0 }}>
          {attention.length ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
          {attention.length ? `Needs Attention: ${attention.length} cow${attention.length > 1 ? 's' : ''}` : 'No cow needs attention right now'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {attention.map(c => (
            <div key={c.cow_id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--card)', borderRadius: 10, padding: '10px 14px' }}>
              <RiskBadge risk={c.risk} />
              <div style={{ flex: 1 }}>
                <Link to={`/app/herd/${c.cow_id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>{c.cow_name}</Link>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 6 }}>{c.rfid_tag}</span>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {c.risk.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Vitals table */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 12 }}>Live Vitals &amp; Disease Risk</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Cow</th><th>Body temp</th><th>Heart rate</th><th>SpO2</th><th>Motion</th><th>Risk</th><th>Last seen</th></tr></thead>
              <tbody>
                {cows.map(c => (
                  <tr key={c.cow_id}>
                    <td>
                      <Link to={`/app/herd/${c.cow_id}`} style={{ fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>{c.cow_name}</Link>
                      <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{c.device_id || '-'}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(c.body_temp_c, 1, '°C')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(c.heart_rate_bpm, 0, ' bpm')}</td>
                    <td>{fmt(c.spo2_pct, 0, '%')}</td>
                    <td>
                      {c.is_moving == null ? '-' : (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.is_moving ? '#E3F2FD' : '#ECEFF1', color: c.is_moving ? '#1565C0' : '#546E7A' }}>
                          {c.is_moving ? 'Moving' : 'Still'}
                        </span>
                      )}
                    </td>
                    <td><RiskBadge risk={c.risk} /></td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: c.online ? '#2E7D32' : 'var(--text-secondary)' }}>{c.online ? 'live' : lastSeenText(c.seconds_since_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && cows.length === 0 && <div className="empty-state"><HeartPulse size={36} /><span>No collar data in the last 7 days</span></div>}
            {isError && <div className="empty-state"><span>Could not load collar data</span></div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
            Risk is scored from clinical vital-sign ranges plus each cow's own 14-day baseline. It is not a diagnosis: it is an early-warning signal to go and check on her.
          </div>
        </div>

        {/* Map */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><MapIcon size={15} /> Live Location</h3>
          <div style={{ height: 320, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
            {center ? (
              <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {boundary && <Circle center={[boundary.latitude, boundary.longitude]} radius={boundary.radius_m}
                  pathOptions={{ color: 'var(--green-ink)', weight: 2, fillOpacity: 0.06, dashArray: '6 6' }} />}
                {located.map(c => {
                  const col = c.location.outside_boundary ? '#C62828' : (LEVEL[c.risk.level] || LEVEL.Normal).color;
                  return (
                    <CircleMarker key={c.cow_id} center={[c.location.latitude, c.location.longitude]} radius={10}
                      pathOptions={{ color: '#fff', weight: 3, fillColor: col, fillOpacity: 1 }}>
                      <Tooltip direction="top" offset={[0, -8]} permanent>{c.cow_name}</Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            ) : (
              <div className="empty-state" style={{ height: '100%' }}><MapIcon size={36} /><span>No GPS fix yet</span></div>
            )}
          </div>
          {located.some(c => c.location.distance_m != null) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              {located.map(c => c.location.distance_m != null && (
                <div key={c.cow_id}>{c.cow_name}: {c.location.distance_m} m from the centre{c.location.outside_boundary ? ' (outside)' : ''}</div>
              ))}
            </div>
          )}
          {canEditBoundary && settings && <BoundaryForm settings={settings} cows={cows} onSaved={() => {
            qc.invalidateQueries({ queryKey: ['cow-health'] }); qc.invalidateQueries({ queryKey: ['field-settings'] });
          }} />}
        </div>
      </div>
    </div>
  );
}

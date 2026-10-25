import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { lastSeenText } from '../lib/lastSeen';
import { Cpu, Power, Droplets, Wind, RotateCcw, ClipboardList, Bell, CloudRain, SlidersHorizontal, Save, Router, Send } from 'lucide-react';
import {
  getDeviceStatus, getControlLogs, sendDeviceCommand, logCalibration, getBarnLatest,
  getFieldSettings, updateFieldSettings, getFieldDevices, updateFieldDevice, getRecentCommands, getCows, getFarms,
} from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';

// The four actuators the barn node can switch (see arduinoscripts.txt). The
// node runs them automatically; ON/OFF overrides last 30 minutes, AUTO hands back.
const ACTUATORS = {
  WaterPump:   { icon: Droplets,  color: '#2196F3', label: 'Water Pump',  live: 'pump_status' },
  Fan:         { icon: Wind,      color: '#00BCD4', label: 'Cooling Fan', live: 'fan_status' },
  SprayNozzle: { icon: CloudRain, color: '#4CAF50', label: 'Water Spray', live: 'spray_status' },
  Buzzer:      { icon: Bell,      color: '#FF9800', label: 'Buzzer',      live: 'buzzer_status' },
};
const ACTION_COLOR = { ON: '#4CAF50', OFF: '#607D8B', AUTO: '#1E4D7B', SPEED_CHANGE: '#FF9800', ERROR: '#F44336' };

const SETTING_GROUPS = [
  { title: 'Milk container (Milking Station)', fields: [
    ['milk_container_capacity_l', 'Capacity (L)'], ['milk_container_empty_cm', 'Sensor reading when empty (cm)'], ['milk_container_full_cm', 'Sensor reading when full (cm)'],
    ['milk_tds_min_ppm', 'Milk TDS alert below (ppm, blank = off)'], ['milk_tds_max_ppm', 'Milk TDS alert above (ppm, blank = off)'],
  ] },
  { title: 'Barn (Barn Monitor)', fields: [
    ['tank_start_pct', 'Start pump below tank level (%)'], ['tank_stop_pct', 'Stop pump at tank level (%)'],
    ['barn_fan_on_c', 'Fan and spray on above (°C)'], ['barn_buzzer_on_c', 'Buzzer beeps above (°C)'], ['feed_low_kg', 'Low-feed alert below (kg)'],
  ] },
  { title: 'Cow temperature rules (Health Collar)', fields: [
    ['cow_hypothermia_c', 'Hypothermia at or below (°C)'], ['cow_temp_high_c', 'High temperature from (°C)'], ['cow_fever_c', 'Fever from (°C)'],
  ] },
];

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

function ActuatorCard({ type, isOn, latestLog, canControl, onCommand, loading }) {
  const cfg = ACTUATORS[type];
  const Icon = cfg.icon;
  return (
    <div className="card" style={{ borderTop: `4px solid ${cfg.color}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={cfg.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{cfg.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>live state from the barn node</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" style={{ background: isOn ? '#4CAF50' : '#9E9E9E' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: isOn ? '#4CAF50' : '#9E9E9E' }}>{isOn == null ? '-' : isOn ? 'ON' : 'OFF'}</span>
        </div>
      </div>
      {latestLog && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Last: {latestLog.trigger_reason} · {latestLog.recorded_at ? format(new Date(latestLog.recorded_at), 'MMM d HH:mm') : '-'}
        </div>
      )}
      {canControl && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <button className="btn" style={{ background: '#4CAF50', color: '#fff', border: 'none', padding: 8, justifyContent: 'center' }}
            disabled={loading} onClick={() => onCommand(type, 'ON')}><Power size={14} /> ON</button>
          <button className="btn" style={{ background: '#F44336', color: '#fff', border: 'none', padding: 8, justifyContent: 'center' }}
            disabled={loading} onClick={() => onCommand(type, 'OFF')}><Power size={14} /> OFF</button>
          <button className="btn" style={{ background: '#1E4D7B', color: '#fff', border: 'none', padding: 8, justifyContent: 'center' }}
            disabled={loading} onClick={() => onCommand(type, 'AUTO')}>AUTO</button>
        </div>
      )}
    </div>
  );
}

function FieldSettingsCard() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['field-settings'], queryFn: getFieldSettings });
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  const values = draft || settings || {};
  const mut = useMutation({
    mutationFn: updateFieldSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['field-settings'] }); setDraft(null); setMsg('Saved. Devices pick up the new values within 10 seconds.'); setTimeout(() => setMsg(''), 5000); },
    onError: (e) => setMsg(e.response?.data?.detail || 'Could not save'),
  });
  if (!settings) return null;
  const changed = draft ? Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== settings[k])) : {};

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <SlidersHorizontal size={16} color="#607D8B" />
        <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Field Settings</h2>
        <button className="btn btn-primary" disabled={!Object.keys(changed).length || mut.isPending} onClick={() => mut.mutate(changed)}>
          <Save size={14} /> Save changes
        </button>
      </div>
      {msg && <div style={{ fontSize: 12, marginBottom: 12, color: msg.startsWith('Saved') ? '#2E7D32' : '#C62828' }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
        {SETTING_GROUPS.map(g => (
          <div key={g.title}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{g.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {g.fields.map(([key, label]) => (
                <div key={key}>
                  <label style={LABEL}>{label}</label>
                  <input style={INPUT} value={values[key] ?? ''} inputMode="decimal"
                    onChange={e => setDraft({ ...(draft || settings), [key]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12 }}>
        Container calibration: read the station's sensor with the container empty, then full, and enter both. The farm boundary is set on the Cow Health page.
      </div>
    </div>
  );
}

function DevicesCard({ canEdit, isAdmin }) {
  const qc = useQueryClient();
  const { data: devices = [] } = useQuery({ queryKey: ['field-devices'], queryFn: getFieldDevices, refetchInterval: 15000 });
  const { data: farms = [] } = useQuery({ queryKey: ['farms'], queryFn: getFarms, enabled: isAdmin });
  const { data: cows = [] } = useQuery({ queryKey: ['cows'], queryFn: getCows, enabled: canEdit });
  const mut = useMutation({ mutationFn: ({ id, body }) => updateFieldDevice(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['field-devices'] }) });

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Router size={15} /><h2 style={{ fontSize: 15, fontWeight: 700 }}>Field Devices</h2>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Device ID</th>{isAdmin && <th>Farm</th>}<th>Role</th><th>Label</th><th>Worn by</th><th>Status</th><th>Last seen</th></tr></thead>
          <tbody>
            {devices.map(d => (
              <tr key={d.device_id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.device_id}</td>
                {isAdmin && (
                  <td>
                    <select value={d.farm_id ?? ''} aria-label={`Farm for ${d.device_id}`}
                      onChange={e => e.target.value && mut.mutate({ id: d.device_id, body: { farm_id: Number(e.target.value) } })}
                      style={{ ...INPUT, width: 'auto', padding: '4px 8px', color: d.farm_id ? undefined : '#E65100' }}>
                      {d.farm_id == null && <option value="">Unassigned</option>}
                      {farms.map(f => <option key={f.farm_id} value={f.farm_id}>{f.farm_name}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  {canEdit ? (
                    <select value={d.role} onChange={e => mut.mutate({ id: d.device_id, body: { role: e.target.value } })} style={{ ...INPUT, width: 'auto', padding: '4px 8px' }}>
                      <option value="milking">Milking Station</option><option value="barn">Barn Monitor</option><option value="collar">Health Collar</option>
                    </select>
                  ) : d.role}
                </td>
                <td>{d.label || '-'}</td>
                <td>
                  {d.role !== 'collar' ? <span style={{ color: 'var(--text-secondary)' }}>-</span> : canEdit ? (
                    <select value={d.cow_id ?? ''} onChange={e => mut.mutate({ id: d.device_id, body: e.target.value ? { cow_id: Number(e.target.value) } : { clear_cow: true } })}
                      style={{ ...INPUT, width: 'auto', padding: '4px 8px' }}>
                      <option value="">Not assigned</option>
                      {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
                    </select>
                  ) : (d.cow_name || 'Not assigned')}
                </td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: d.online ? '#E8F5E9' : '#FCE4EC', color: d.online ? '#2E7D32' : '#C2185B' }}>
                    {d.online ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.online ? 'live' : lastSeenText(d.seconds_since_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 && <div className="empty-state"><Router size={36} /><span>No devices have reported yet</span></div>}
      </div>
    </div>
  );
}

export default function IoTControl() {
  const p  = usePermissions();
  const qc = useQueryClient();
  const canControl = p.isAdmin || p.isTechnician;
  const [calDevice, setCalDevice] = useState('DHT11');
  const [calNotes, setCalNotes]   = useState('');
  const [cmdMsg, setCmdMsg]       = useState('');
  const [logFilter, setLogFilter] = useState('All');

  const { data: devices = [] } = useQuery({ queryKey: ['device-status'], queryFn: getDeviceStatus, refetchInterval: 10000 });
  const { data: logs = [], isLoading: logsLoading } = useQuery({ queryKey: ['control-logs'], queryFn: () => getControlLogs(200), refetchInterval: 15000 });
  const { data: barn } = useQuery({ queryKey: ['barn-latest'], queryFn: getBarnLatest, refetchInterval: 5000 });
  const { data: commands = [] } = useQuery({ queryKey: ['device-commands'], queryFn: () => getRecentCommands(15), refetchInterval: 5000, enabled: canControl });

  const commandMut = useMutation({
    mutationFn: sendDeviceCommand,
    onSuccess: (r, vars) => {
      ['device-status', 'control-logs', 'device-commands'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      setCmdMsg(r.queued_for_device
        ? `✓ ${ACTUATORS[vars.device_type]?.label || vars.device_type} → ${vars.action}. Sent to ${r.queued_for_device}; it applies on the next check-in (within 10 s).`
        : `✓ ${vars.device_type} → ${vars.action} logged. ${r.note || ''}`);
      setTimeout(() => setCmdMsg(''), 6000);
    },
    onError: (e) => setCmdMsg(`✗ ${e.response?.data?.detail || 'Command failed'}`),
  });
  const calMut = useMutation({
    mutationFn: logCalibration,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['control-logs'] }); setCalNotes(''); setCmdMsg('✓ Calibration logged'); setTimeout(() => setCmdMsg(''), 3000); },
  });

  const latestByDevice = devices.reduce((acc, d) => { acc[d.device_type] = d; return acc; }, {});
  const reading = barn?.reading || {};
  const types = Object.keys(ACTUATORS);
  const filteredLogs = logFilter === 'All' ? logs : logs.filter(l => l.device_type === logFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'linear-gradient(135deg,#E65100,#FF9800)', borderRadius: 12, padding: '14px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}><Cpu size={18} /> IoT Device Control</div>
        <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>
          The barn node runs the pump, fan, spray and buzzer automatically. ON and OFF override it for 30 minutes; AUTO hands control back.
          {barn && !barn.online && ' The barn node is offline, so commands wait until it reconnects.'}
        </div>
        {!canControl && (
          <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(255,255,255,.2)', borderRadius: 8, fontSize: 12 }}>
            ⚠ Read-only: device control requires Admin or Technician role
          </div>
        )}
      </div>

      {cmdMsg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: cmdMsg.startsWith('✓') ? '#e8f5e9' : '#fde8e8', color: cmdMsg.startsWith('✓') ? '#2E7D32' : '#c62828', fontWeight: 600, fontSize: 13 }}>
          {cmdMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {types.map(t => (
          <ActuatorCard key={t} type={t}
            isOn={reading[ACTUATORS[t].live] == null ? null : !!reading[ACTUATORS[t].live]}
            latestLog={latestByDevice[t]} canControl={canControl} loading={commandMut.isPending}
            onCommand={(type, action) => commandMut.mutate({ device_type: type, action, trigger_reason: 'Manual override' })} />
        ))}
      </div>

      {canControl && commands.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Send size={15} color="#607D8B" /><h2 style={{ fontSize: 15, fontWeight: 700 }}>Remote Commands</h2>
          </div>
          <table className="data-table">
            <thead><tr><th>Device</th><th>Switch</th><th>Command</th><th>By</th><th>Sent</th><th>Delivered</th></tr></thead>
            <tbody>
              {commands.map(c => (
                <tr key={c.command_id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.device_id}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.command_type}</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${ACTION_COLOR[c.command_value]}22`, color: ACTION_COLOR[c.command_value] }}>{c.command_value}</span></td>
                  <td style={{ fontSize: 12 }}>{c.created_by}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{format(new Date(c.created_at), 'MMM d HH:mm:ss')}</td>
                  <td style={{ fontSize: 12, color: c.is_executed ? '#2E7D32' : '#E65100' }}>{c.is_executed ? format(new Date(c.executed_at), 'HH:mm:ss') : 'waiting for device'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canControl && <FieldSettingsCard />}
      <DevicesCard canEdit={canControl} isAdmin={p.isAdmin} />

      {canControl && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <RotateCcw size={16} color="#607D8B" />
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Sensor Calibration Log</h2>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={LABEL}>Sensor</label>
              <select value={calDevice} onChange={e => setCalDevice(e.target.value)} style={{ ...INPUT, width: 'auto' }}>
                <option value="DHT11">DHT11 (barn temperature, humidity)</option>
                <option value="MQ5">MQ-5 (gas / smoke)</option>
                <option value="MQ135">MQ-135 (air quality)</option>
                <option value="LoadCell">Load cell (feed)</option>
                <option value="TankUltrasonic">Ultrasonic (water tank)</option>
                <option value="MilkUltrasonic">Ultrasonic (milk container)</option>
                <option value="TDS">TDS probe (milk)</option>
                <option value="RFID">RFID reader</option>
                <option value="Collar">Health Collar sensors</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={LABEL}>Notes</label>
              <input value={calNotes} onChange={e => setCalNotes(e.target.value)} placeholder="Calibration details…" style={INPUT} />
            </div>
            <button className="btn btn-primary" disabled={calMut.isPending} onClick={() => calMut.mutate({ device_type: calDevice, notes: calNotes })}>
              <RotateCcw size={14} /> Log Calibration
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={15} /> Control Log</h2>
          {['All', ...types].map(dt => (
            <button key={dt} onClick={() => setLogFilter(dt)} className="btn"
              style={{ padding: '4px 10px', fontSize: 11, background: logFilter === dt ? '#1E4D7B' : 'var(--bg)', color: logFilter === dt ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {dt === 'All' ? 'All' : ACTUATORS[dt].label}
            </button>
          ))}
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>#</th><th>Device</th><th>Action</th><th>Value</th><th>Trigger Reason</th><th>Time</th></tr></thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.log_id}>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.log_id}</td>
                  <td style={{ fontWeight: 600 }}>{ACTUATORS[l.device_type]?.label || l.device_type}{l.device_id ? ` #${l.device_id}` : ''}</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${ACTION_COLOR[l.action] || '#999'}22`, color: ACTION_COLOR[l.action] || '#333' }}>{l.action}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.value != null ? l.value : '-'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.trigger_reason || '-'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.recorded_at ? format(new Date(l.recorded_at), 'MMM d HH:mm') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logsLoading && <div className="skeleton" style={{ height: 100, width: '100%' }} />}
          {!logsLoading && filteredLogs.length === 0 && <div className="empty-state"><Cpu size={40} /><span>No control logs</span></div>}
        </div>
      </div>
    </div>
  );
}

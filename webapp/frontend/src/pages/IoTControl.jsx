import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeviceStatus, getControlLogs, sendDeviceCommand, logCalibration } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { format } from 'date-fns';
import { Cpu, Power, Zap, Droplets, Wind, Settings2, RotateCcw } from 'lucide-react';

const DEVICE_CONFIG = {
  Fan:         { icon: Wind,     color: '#00BCD4', label: 'Cooling Fan',    unit: '% speed', max: 100, steps: [0, 25, 50, 75, 100] },
  WaterPump:   { icon: Droplets, color: '#2196F3', label: 'Water Pump',     unit: null,      max: null, steps: null },
  FeedMotor:   { icon: Settings2,color: '#FF9800', label: 'Feed Motor',     unit: 'kg',      max: 20,  steps: null },
  SprayNozzle: { icon: Droplets, color: '#4CAF50', label: 'Spray Nozzle',   unit: '% flow',  max: 100, steps: [0, 25, 50, 75, 100] },
  Relay:       { icon: Zap,      color: '#9C27B0', label: 'Relay',          unit: null,      max: null, steps: null },
};

const SEVERITY_COLOR = { ON: '#4CAF50', OFF: '#607D8B', SPEED_CHANGE: '#FF9800', ERROR: '#F44336' };

function DeviceCard({ device, latestLog, onCommand, loading }) {
  const cfg = DEVICE_CONFIG[device] || { icon: Cpu, color: '#607D8B', label: device, unit: null, steps: null };
  const Icon = cfg.icon;
  const isOn = latestLog?.action === 'ON' || latestLog?.action === 'SPEED_CHANGE';
  const currentVal = latestLog?.value;

  return (
    <div className="card" style={{ borderTop: `4px solid ${cfg.color}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={cfg.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{cfg.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{device}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" style={{ background: isOn ? '#4CAF50' : '#9E9E9E' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: isOn ? '#4CAF50' : '#9E9E9E' }}>
            {isOn ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {currentVal != null && (
        <div style={{ fontSize: 26, fontWeight: 900, color: cfg.color, textAlign: 'center' }}>
          {currentVal}{cfg.unit ? ` ${cfg.unit}` : ''}
        </div>
      )}

      {latestLog && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Last: {latestLog.trigger_reason} · {latestLog.recorded_at ? format(new Date(latestLog.recorded_at), 'MMM d HH:mm') : '—'}
        </div>
      )}

      {/* Speed steps for Fan/Spray */}
      {cfg.steps && (
        <div style={{ display: 'flex', gap: 6 }}>
          {cfg.steps.map(s => (
            <button key={s} className="btn"
              style={{ flex: 1, padding: '6px 4px', fontSize: 11, background: currentVal === s && isOn ? cfg.color : 'var(--bg)', color: currentVal === s && isOn ? '#fff' : 'var(--text-secondary)', border: `1px solid ${cfg.color}44` }}
              disabled={loading}
              onClick={() => onCommand(device, null, s === 0 ? 'OFF' : 'SPEED_CHANGE', s === 0 ? null : s)}>
              {s === 0 ? 'OFF' : `${s}%`}
            </button>
          ))}
        </div>
      )}

      {/* Simple ON/OFF for pump/relay/motor */}
      {!cfg.steps && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn"
            style={{ background: '#4CAF50', color: '#fff', border: 'none', padding: '8px' }}
            disabled={loading || isOn}
            onClick={() => onCommand(device, null, 'ON', null)}>
            <Power size={14} /> ON
          </button>
          <button className="btn"
            style={{ background: '#F44336', color: '#fff', border: 'none', padding: '8px' }}
            disabled={loading || !isOn}
            onClick={() => onCommand(device, null, 'OFF', null)}>
            <Power size={14} /> OFF
          </button>
        </div>
      )}
    </div>
  );
}

export default function IoTControl() {
  const p  = usePermissions();
  const qc = useQueryClient();
  const [calDevice, setCalDevice] = useState('Fan');
  const [calNotes, setCalNotes]   = useState('');
  const [cmdMsg, setCmdMsg]       = useState('');
  const [logFilter, setLogFilter] = useState('All');

  const { data: devices = []  } = useQuery({ queryKey: ['device-status'], queryFn: getDeviceStatus, refetchInterval: 10000 });
  const { data: logs = []     } = useQuery({ queryKey: ['control-logs'],  queryFn: () => getControlLogs(200), refetchInterval: 15000 });

  const commandMut = useMutation({
    mutationFn: sendDeviceCommand,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['device-status'] });
      qc.invalidateQueries({ queryKey: ['control-logs'] });
      setCmdMsg(`✓ ${vars.device_type} → ${vars.action}${vars.value != null ? ` @ ${vars.value}` : ''}`);
      setTimeout(() => setCmdMsg(''), 3000);
    },
    onError: (e) => setCmdMsg(`✗ ${e.response?.data?.detail || 'Command failed'}`),
  });
  const calMut = useMutation({
    mutationFn: logCalibration,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['control-logs'] });
      setCalNotes('');
      setCmdMsg('✓ Calibration logged');
      setTimeout(() => setCmdMsg(''), 3000);
    },
  });

  const sendCmd = (deviceType, deviceId, action, value) => {
    commandMut.mutate({ device_type: deviceType, device_id: deviceId, action, value, trigger_reason: 'Manual override' });
  };

  // Build last-state map per device type
  const latestByDevice = devices.reduce((acc, d) => {
    acc[d.device_type] = d;
    return acc;
  }, {});

  const filteredLogs = logFilter === 'All' ? logs : logs.filter(l => l.device_type === logFilter);

  const DEVICE_TYPES = Object.keys(DEVICE_CONFIG);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#E65100,#FF9800)', borderRadius: 12, padding: '14px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>⚙️ IoT Device Control</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>
          Manual override for fans, water pumps, feed motors and spray nozzles
        </div>
        {!p.isAdmin && !p.isTechnician && (
          <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(255,255,255,.2)', borderRadius: 8, fontSize: 12 }}>
            ⚠ Read-only — device control requires Admin or Technician role
          </div>
        )}
      </div>

      {/* Command feedback */}
      {cmdMsg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: cmdMsg.startsWith('✓') ? '#e8f5e9' : '#fde8e8', color: cmdMsg.startsWith('✓') ? '#2E7D32' : '#c62828', fontWeight: 600, fontSize: 13 }}>
          {cmdMsg}
        </div>
      )}

      {/* Device cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {DEVICE_TYPES.map(dt => (
          <DeviceCard
            key={dt}
            device={dt}
            latestLog={latestByDevice[dt]}
            onCommand={(p.isAdmin || p.isTechnician) ? sendCmd : () => {}}
            loading={commandMut.isPending}
          />
        ))}
      </div>

      {/* Sensor Calibration panel */}
      {(p.isAdmin || p.isTechnician) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <RotateCcw size={16} color="#607D8B" />
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Sensor Calibration Log</h2>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Device</label>
              <select value={calDevice} onChange={e => setCalDevice(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}>
                {DEVICE_TYPES.map(dt => <option key={dt}>{dt}</option>)}
                <option value="DHT22">DHT22 (Env Sensor)</option>
                <option value="RFID">RFID Reader</option>
                <option value="MilkMeter">Smart Milk Meter</option>
                <option value="LoadCell">Load Cell (Feed)</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>Notes</label>
              <input value={calNotes} onChange={e => setCalNotes(e.target.value)}
                placeholder="Calibration details…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <button className="btn btn-primary"
              disabled={calMut.isPending}
              onClick={() => calMut.mutate({ device_type: calDevice, notes: calNotes })}>
              <RotateCcw size={14} /> Log Calibration
            </button>
          </div>
        </div>
      )}

      {/* Control log table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>📋 Control Log</h2>
          {['All', ...DEVICE_TYPES].map(dt => (
            <button key={dt} onClick={() => setLogFilter(dt)}
              className="btn"
              style={{ padding: '4px 10px', fontSize: 11, background: logFilter === dt ? '#1E4D7B' : 'var(--bg)', color: logFilter === dt ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {dt}
            </button>
          ))}
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Device</th><th>Action</th><th>Value</th><th>Trigger Reason</th><th>Time</th></tr>
            </thead>
            <tbody>
              {filteredLogs.map(l => (
                <tr key={l.log_id}>
                  <td style={{ fontSize: 11, color: '#aaa' }}>{l.log_id}</td>
                  <td style={{ fontWeight: 600 }}>{l.device_type}{l.device_id ? ` #${l.device_id}` : ''}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${SEVERITY_COLOR[l.action] || '#999'}22`, color: SEVERITY_COLOR[l.action] || '#333' }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.value != null ? l.value : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.trigger_reason || '—'}</td>
                  <td style={{ fontSize: 11, color: '#aaa' }}>{l.recorded_at ? format(new Date(l.recorded_at), 'MMM d HH:mm') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLogs.length === 0 && <div className="empty-state"><Cpu size={40} /><span>No control logs</span></div>}
        </div>
      </div>
    </div>
  );
}

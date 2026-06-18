import { useQuery } from '@tanstack/react-query';
import { useRealtime } from '../context/RealtimeContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  getDashboardSummary, getRecentAlerts, getMilkTrend, getEnvTrend,
  getSystemLogs, getAdminUserActivity, getHerdHealthTrend,
  getCowTemperatures, getHealthRisks, getEconomicsSummary,
  getCowActivity, getHerdCounts,
} from '../lib/api';
import {
  LineChart as ELine, BarChart as EBar, DonutChart, HBarChart,
  GaugeChart, RadarChart as ERadar, ChartCard, HEALTH_COLORS, STAGE_COLORS, SEX_COLORS,
} from '../components/ChartKit';
import {
  AlertTriangle, CheckCircle, Thermometer, Droplets, Beef,
  Activity, Users, Cpu, HeartPulse, TrendingUp, Wind,
} from 'lucide-react';
import { format } from 'date-fns';

const fmt = (v, d = 1) => (v != null ? Number(v).toFixed(d) : '--');

const SEV_COLOR  = { Emergency: '#b71c1c', Critical: '#c62828', Warning: '#e65100', Info: '#1565c0' };
const HEALTH_COLOR = { Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0' };

// ─────────────────────────────────────────────────────────────────────────
//  Shared building blocks
// ─────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="label">{label}</span>
        <Icon size={18} color={color} />
      </div>
      <span className="value" style={{ color }}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function AlertList({ alerts }) {
  return (
    <div className="card" style={{ maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="section-header">
        <h2>🚨 Active Alerts</h2>
        {alerts.length > 0 && <span className="live-dot red" />}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {alerts.length === 0
          ? <div className="empty-state"><CheckCircle size={40} /><span>No active alerts 🎉</span></div>
          : alerts.map(a => (
            <div key={a.alert_id} style={{
              display: 'flex', gap: 10, padding: '10px 0',
              borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start',
            }}>
              <AlertTriangle size={16} color={SEV_COLOR[a.severity] || '#999'} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: SEV_COLOR[a.severity] }}>
                  {a.severity} — {a.alert_type}
                  {a.cow_name && <span style={{ color: '#1E4D7B', marginLeft: 6 }}>[{a.cow_name}]</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.message}
                </div>
              </div>
              <span style={{ fontSize: 10, color: '#aaa', flexShrink: 0 }}>
                {a.created_at ? format(new Date(a.created_at), 'HH:mm') : ''}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function MilkChart({ milkTrend }) {
  const data = milkTrend.map(r => ({
    date:   r.milk_date ? format(new Date(r.milk_date), 'MMM d') : '',
    liters: Number(r.total_liters).toFixed(1),
  }));
  return (
    <ChartCard title="🥛 Milk Production — 7 Days" action={<span className="live-dot teal" />}>
      <ELine data={data} xKey="date"
        series={[{ key: 'liters', name: 'Milk (L)', color: '#00BCD4' }]}
        area smooth height={220} unit=" L" />
    </ChartCard>
  );
}

function EnvChart({ envTrend }) {
  const data = envTrend.map(r => ({
    time:     `${r.r_date ? format(new Date(r.r_date), 'MMM d') : ''} ${r.r_hour}:00`,
    temp:     Number(r.avg_temp).toFixed(1),
    humidity: Number(r.avg_hum).toFixed(1),
  }));
  return (
    <ChartCard title="🌡 Environment — 24 Hours" action={<span className="live-dot" />}>
      <ELine data={data} xKey="time"
        series={[{ key: 'temp', name: 'Temp °C', color: '#FF9800' }, { key: 'humidity', name: 'Humidity %', color: '#00BCD4' }]}
        smooth height={220} />
    </ChartCard>
  );
}

function SensorGauge({ label, value, displayVal, color, warn, max = 100 }) {
  return (
    <div className="card" style={{ padding: '10px 8px' }}>
      <GaugeChart value={value} max={max} label={label} color={warn ? '#F44336' : color} height={160} />
      {warn
        ? <p style={{ fontSize: 10, color: '#F44336', fontWeight: 700, textAlign: 'center', margin: '4px 0 0' }}>⚠ Out of range</p>
        : <p style={{ fontSize: 10, color: '#4CAF50', textAlign: 'center', margin: '4px 0 0' }}>✓ Normal</p>}
    </div>
  );
}

function LiveSensors({ liveEnv }) {
  return (
    <div className="card">
      <div className="section-header">
        <h2>📡 Live Sensor Readings</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span className="live-dot" /> Real-time IoT feed
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <SensorGauge
          label="Temperature" color="#FF9800"
          value={Number(liveEnv.temperature_celsius || 0)} max={45}
          displayVal={fmt(liveEnv.temperature_celsius) + '°C'}
          warn={liveEnv.temperature_celsius > 32} warnMsg="> 32°C — High"
        />
        <SensorGauge
          label="Humidity" color="#00BCD4"
          value={Number(liveEnv.humidity_percent || 0)} max={100}
          displayVal={fmt(liveEnv.humidity_percent) + '%'}
          warn={liveEnv.humidity_percent < 50 || liveEnv.humidity_percent > 80}
          warnMsg="Out of 50–80%"
        />
        <SensorGauge
          label="Air Quality" color={liveEnv.air_quality_ppm > 600 ? '#F44336' : '#4CAF50'}
          value={Number(liveEnv.air_quality_ppm || 0)} max={1000}
          displayVal={fmt(liveEnv.air_quality_ppm, 0) + ' ppm'}
          warn={liveEnv.air_quality_ppm > 600} warnMsg="> 600 ppm"
        />
        <SensorGauge
          label="Oxygen" color="#9C27B0"
          value={Number(liveEnv.oxygen_percent || 0)} max={25}
          displayVal={fmt(liveEnv.oxygen_percent) + '%'}
          warn={liveEnv.oxygen_percent < 19.5} warnMsg="< 19.5% — Low O₂"
        />
      </div>
    </div>
  );
}

function SysLogsTable({ sysLogs }) {
  return (
    <div className="card" style={{ maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="section-header"><h2>⚙️ System Control Log</h2></div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <table className="data-table">
          <thead>
            <tr><th>Device</th><th>Action</th><th>Value</th><th>Reason</th><th>Time</th></tr>
          </thead>
          <tbody>
            {sysLogs.map(l => (
              <tr key={l.log_id}>
                <td><strong>{l.device_type}</strong> {l.device_id ? `#${l.device_id}` : ''}</td>
                <td><span className={`badge badge-${l.action === 'ON' ? 'healthy' : l.action === 'OFF' ? 'normal' : 'warning'}`}>{l.action}</span></td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{l.value != null ? l.value : '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.trigger_reason}</td>
                <td style={{ fontSize: 11, color: '#aaa' }}>{l.recorded_at ? format(new Date(l.recorded_at), 'HH:mm') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STAGE_COLOR = {
  'Calf': '#00BCD4', 'Weaner': '#26C6DA', 'Yearling': '#4DB6AC', 'Bull Calf': '#78909C',
  'Heifer': '#E91E63', 'Steer': '#5C6BC0', 'Bull': '#1E4D7B', 'Cow': '#4CAF50',
  'Dry Cow': '#9C27B0', 'Lactating Cow': '#2196F3', 'Senior Cow': '#FF9800', 'Senior Bull': '#FF5722',
};
const SEX_COLOR = { Female: '#E91E63', Male: '#1565c0' };

function HerdCompositionCharts({ counts }) {
  const byCat = (counts?.by_category || []).map(r => ({ name: r.cow_stage || 'Unknown', value: r.cnt }))
    .reduce((acc, r) => { const ex = acc.find(a => a.name === r.name); if (ex) ex.value += r.value; else acc.push({ ...r }); return acc; }, [])
    .sort((a, b) => b.value - a.value);

  const bySex = (counts?.by_sex || []).map(r => ({ name: r.sex || 'Female', value: r.cnt }));

  const stageGender = (counts?.by_category || []).reduce((acc, r) => {
    const stage = r.cow_stage || 'Unknown';
    const ex = acc.find(a => a.name === stage);
    if (ex) { if (r.sex === 'Male') ex.Male += r.cnt; else ex.Female += r.cnt; }
    else acc.push({ name: stage, Female: r.sex !== 'Male' ? r.cnt : 0, Male: r.sex === 'Male' ? r.cnt : 0 });
    return acc;
  }, []);

  if (!byCat.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
      <ChartCard title="🐄 Category Distribution">
        <DonutChart data={byCat.map((d,i) => ({ ...d, color: STAGE_COLORS[d.name] || '#999' }))} height={200} />
      </ChartCard>
      <ChartCard title="♀♂ Sex Distribution">
        <DonutChart data={bySex.map(d => ({ ...d, color: SEX_COLORS[d.name] }))} height={200} />
      </ChartCard>
      <ChartCard title="📊 Category × Sex">
        <EBar data={stageGender} xKey="name"
          series={[{ key: 'Female', name: 'Female', color: '#E91E63' }, { key: 'Male', name: 'Male', color: '#1565c0' }]}
          stacked height={200} />
      </ChartCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Role-specific dashboard sections
// ─────────────────────────────────────────────────────────────────────────

function FarmerDashboard({ summary, alerts, milkTrend, envTrend, liveEnv, alertsCount }) {
  const farm = summary?.farm || {};
  const herd = summary?.herd || {};
  const milkToday = summary?.milk_today || {};

  const { data: economics } = useQuery({ queryKey: ['economics-summary'], queryFn: getEconomicsSummary });
  const { data: counts }    = useQuery({ queryKey: ['herd-counts'],       queryFn: getHerdCounts });

  const STATS = [
    { label: 'My Cows',        value: herd.total_cows ?? '--',         icon: Beef,          color: '#1E4D7B', sub: `${herd.lactating_cows ?? 0} lactating` },
    { label: 'Healthy',        value: herd.healthy_cows ?? '--',       icon: CheckCircle,   color: '#4CAF50', sub: `${herd.warning_cows ?? 0} warning` },
    { label: 'Milk Today (L)', value: fmt(milkToday.total_liters, 1),  icon: Droplets,      color: '#00BCD4', sub: `${milkToday.sessions ?? 0} sessions` },
    { label: 'Active Alerts',  value: alertsCount,                     icon: AlertTriangle, color: alertsCount > 0 ? '#F44336' : '#4CAF50', sub: 'unresolved' },
    { label: '30d Milk (L)',   value: fmt(economics?.milk_30d_liters, 0), icon: TrendingUp, color: '#FF9800', sub: 'last 30 days' },
    { label: 'Barn Temp',      value: fmt(liveEnv.temperature_celsius) + '°C', icon: Thermometer, color: '#FF9800', sub: 'current ambient' },
  ];

  // Herd health pie from summary
  const herdPie = [
    { name: 'Healthy',          value: herd.healthy_cows || 0,   fill: '#4CAF50' },
    { name: 'Warning',          value: herd.warning_cows || 0,   fill: '#FF9800' },
    { name: 'Critical',         value: herd.critical_cows || 0,  fill: '#F44336' },
    { name: 'Under Treatment',  value: herd.treatment_cows || 0, fill: '#9C27B0' },
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {farm.farm_name && (
        <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🌾 {farm.farm_name}</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>{farm.location} · Est. {farm.established_year} · {farm.total_area_hectares} ha</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
        <ChartCard title="🐄 Herd Health">
          <DonutChart data={herdPie} centerValue={herdPie.reduce((s,d)=>s+d.value,0)} centerLabel="cows" height={220} />
        </ChartCard>
        <MilkChart milkTrend={milkTrend} />
      </div>

      <HerdCompositionCharts counts={counts} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AlertList alerts={alerts} />
        <EnvChart envTrend={envTrend} />
      </div>

      <LiveSensors liveEnv={liveEnv} />
    </div>
  );
}

function VetDashboard({ summary, alerts, liveEnv, alertsCount }) {
  const herd = summary?.herd || {};

  const { data: healthRisks = [] } = useQuery({ queryKey: ['health-risks'],    queryFn: getHealthRisks });
  const { data: cowTemps = [] }   = useQuery({ queryKey: ['cow-temps'],        queryFn: getCowTemperatures });
  const { data: herdHealth }      = useQuery({ queryKey: ['herd-health-trend'],queryFn: getHerdHealthTrend });
  const { data: envTrend = [] }   = useQuery({ queryKey: ['env-trend'],        queryFn: getEnvTrend });
  const { data: cowActivity = [] } = useQuery({ queryKey: ['cow-activity'],    queryFn: getCowActivity, refetchInterval: 30000 });

  const feverCows = cowTemps.filter(c => c.body_temp_celsius != null && Number(c.body_temp_celsius) > 39.5);
  const healthAlerts = alerts.filter(a => a.alert_type === 'Health' || a.alert_type === 'Temperature');

  const STATS = [
    { label: 'Total Cows',      value: herd.total_cows ?? '--',     icon: Beef,          color: '#1E4D7B', sub: `${herd.lactating_cows ?? 0} lactating` },
    { label: 'Healthy',         value: herd.healthy_cows ?? '--',   icon: CheckCircle,   color: '#4CAF50', sub: `${herd.warning_cows ?? 0} warning` },
    { label: 'Under Treatment', value: herd.treatment_cows ?? '--', icon: HeartPulse,    color: '#9C27B0', sub: 'active treatment' },
    { label: 'Critical',        value: herd.critical_cows ?? '--',  icon: AlertTriangle, color: '#F44336', sub: 'needs urgent care' },
    { label: 'Elevated Temp',   value: feverCows.length,            icon: Thermometer,   color: '#FF5722', sub: '> 39.5°C body temp' },
    { label: 'Health Risks',    value: healthRisks.length,          icon: Activity,      color: '#FF9800', sub: 'AI predicted risks' },
  ];

  // Body temp bar chart — top 12 cows by temp
  const tempChart = cowTemps
    .filter(c => c.body_temp_celsius != null)
    .slice(0, 12)
    .map(c => ({
      name: c.cow_name,
      temp: Number(c.body_temp_celsius).toFixed(1),
      fill: Number(c.body_temp_celsius) > 40 ? '#F44336' : Number(c.body_temp_celsius) > 39.5 ? '#FF9800' : '#4CAF50',
    }));

  // Risk bar chart
  const riskChart = healthRisks.map(r => ({
    name: r.cow_name,
    risk: Number(r.predicted_value).toFixed(0),
    fill: Number(r.predicted_value) >= 85 ? '#F44336' : Number(r.predicted_value) >= 70 ? '#FF9800' : '#4CAF50',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'linear-gradient(135deg,#9C27B0,#ba68c8)', borderRadius: 12, padding: '14px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>🩺 Veterinarian Dashboard</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Herd health monitoring — body temps, treatments, health risks</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Body temperature bar chart */}
      <div className="card">
        <div className="section-header"><h2>🌡 Body Temperatures per Cow</h2><span className="live-dot" /></div>
        {tempChart.length === 0
          ? <div className="empty-state"><Thermometer size={36} /><span>No temperature readings</span></div>
          : <HBarChart
              data={tempChart.map(c => ({ name: c.name, value: Number(c.temp) }))}
              unit="°C" colorFn={(d) => Number(d.value) > 40 ? '#F44336' : Number(d.value) > 39.5 ? '#FF9800' : '#4CAF50'}
              height={220}
            />
        }
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ChartCard title="🤖 AI Health Risk %" sub="Alert ≥85% · Warning ≥70%">
          {riskChart.length === 0
            ? <div className="empty-state"><CheckCircle size={36} /><span>No high-risk predictions</span></div>
            : <HBarChart
                data={riskChart.map(r => ({ name: r.name, value: Number(r.risk) }))}
                unit="%" colorFn={(d) => Number(d.value) >= 85 ? '#F44336' : Number(d.value) >= 70 ? '#FF9800' : '#4CAF50'}
                height={220}
              />
          }
        </ChartCard>

        {/* Health alerts */}
        <div className="card" style={{ maxHeight: 280, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">
            <h2>❤️ Health & Temp Alerts</h2>
            {healthAlerts.length > 0 && <span className="live-dot red" />}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {healthAlerts.length === 0
              ? <div className="empty-state"><CheckCircle size={36} /><span>No health alerts</span></div>
              : healthAlerts.map(a => (
                <div key={a.alert_id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} color={SEV_COLOR[a.severity] || '#999'} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: SEV_COLOR[a.severity] }}>
                      {a.severity} — {a.alert_type}
                      {a.cow_name && <span style={{ color: '#1E4D7B', marginLeft: 6 }}>[{a.cow_name}]</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <EnvChart envTrend={envTrend} />

      {/* Activity sensor per cow */}
      {cowActivity.length > 0 && (
        <div className="card">
          <div className="section-header"><h2>🏃 Activity Rate per Cow</h2><span className="live-dot" style={{ background: '#9C27B0' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>
            {cowActivity.map(c => {
              const actColor = c.activity_level === 'Low' ? '#F44336' : c.activity_level === 'High' ? '#FF9800' : '#4CAF50';
              return (
                <div key={c.cow_id} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${actColor}33`, background: `${actColor}08` }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cow_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: actColor }}>{c.activity_steps}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${actColor}22`, color: actColor }}>{c.activity_level}</span>
                  </div>
                  <div className="gauge-bar" style={{ marginTop: 6 }}>
                    <div className="gauge-bar-fill" style={{ width: `${Math.min(100, (c.activity_steps / 80) * 100)}%`, background: actColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDashboard({ summary, alerts, milkTrend, envTrend, liveEnv, alertsCount, sysLogs }) {
  const farm = summary?.farm || {};
  const herd = summary?.herd || {};
  const milkToday = summary?.milk_today || {};

  const { data: userActivity = [] } = useQuery({ queryKey: ['admin-user-activity'], queryFn: getAdminUserActivity });
  const { data: economics }         = useQuery({ queryKey: ['economics-summary'],    queryFn: getEconomicsSummary });
  const { data: counts }            = useQuery({ queryKey: ['herd-counts'],          queryFn: getHerdCounts });

  const activeUsers = userActivity.filter(u => u.is_active).length;
  const recentUsers = userActivity.filter(u => u.activity_status === 'Recent').length;

  const STATS = [
    { label: 'Total Cows',     value: herd.total_cows ?? '--',      icon: Beef,          color: '#1E4D7B', sub: `${herd.lactating_cows ?? 0} lactating` },
    { label: 'Healthy Cows',   value: herd.healthy_cows ?? '--',    icon: CheckCircle,   color: '#4CAF50', sub: `${herd.warning_cows ?? 0} warning` },
    { label: 'Milk Today (L)', value: fmt(milkToday.total_liters, 1), icon: Droplets,   color: '#00BCD4', sub: `${milkToday.sessions ?? 0} sessions` },
    { label: 'Active Alerts',  value: alertsCount,                  icon: AlertTriangle, color: alertsCount > 0 ? '#F44336' : '#4CAF50', sub: 'unresolved' },
    { label: 'Active Users',   value: activeUsers,                  icon: Users,         color: '#9C27B0', sub: `${recentUsers} logged in 7d` },
    { label: 'Barn Temp',      value: fmt(liveEnv.temperature_celsius) + '°C', icon: Thermometer, color: '#FF9800', sub: `${fmt(liveEnv.humidity_percent)}% humidity` },
    { label: '30d Revenue',    value: `${((economics?.milk_30d_liters || 0) * 400 / 1000).toFixed(1)}K RWF`, icon: TrendingUp, color: '#1E4D7B', sub: '@ 400 RWF/L' },
    { label: 'Components',     value: `${economics?.operational_components ?? '--'}/${economics?.component_count ?? '--'}`, icon: Cpu, color: '#607D8B', sub: 'operational' },
  ];

  // Herd health pie
  const herdPie = [
    { name: 'Healthy',         value: herd.healthy_cows || 0,   fill: '#4CAF50' },
    { name: 'Warning',         value: herd.warning_cows || 0,   fill: '#FF9800' },
    { name: 'Critical',        value: herd.critical_cows || 0,  fill: '#F44336' },
    { name: 'Under Treatment', value: herd.treatment_cows || 0, fill: '#9C27B0' },
  ].filter(d => d.value > 0);

  // User activity bar chart
  const roleChart = ['Admin', 'Farmer', 'Veterinarian', 'Technician'].map(role => ({
    role,
    active: userActivity.filter(u => u.role === role && u.is_active).length,
    inactive: userActivity.filter(u => u.role === role && !u.is_active).length,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {farm.farm_name && (
        <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: .3 }}>🛡 {farm.farm_name} — Admin Dashboard</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>{farm.location} · Est. {farm.established_year} · {farm.total_area_hectares} ha</div>
          </div>
          {summary?.avg_body_temp && (
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div style={{ fontSize: 11, opacity: .7 }}>Avg Body Temp Today</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(summary.avg_body_temp, 1)}°C</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 1fr', gap: 20 }}>
        <ChartCard title="🐄 Herd Health">
          <DonutChart data={herdPie.map(d => ({ name: d.name, value: d.value, color: d.fill }))}
            centerValue={herdPie.reduce((s,d)=>s+d.value,0)} centerLabel="cows" height={200} />
        </ChartCard>
        <MilkChart milkTrend={milkTrend} />
        <EnvChart envTrend={envTrend} />
      </div>

      <HerdCompositionCharts counts={counts} />

      <ChartCard title="👥 Users by Role" sub="Active vs inactive accounts">
        <EBar data={roleChart} xKey="role"
          series={[{ key: 'active', name: 'Active', color: '#4CAF50' }, { key: 'inactive', name: 'Inactive', color: '#e0e0e0' }]}
          stacked height={180} />
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <AlertList alerts={alerts} />
        <SysLogsTable sysLogs={sysLogs} />
      </div>

      <LiveSensors liveEnv={liveEnv} />
    </div>
  );
}

function TechnicianDashboard({ summary, liveEnv, sysLogs, envTrend }) {
  const { data: economics } = useQuery({ queryKey: ['economics-summary'], queryFn: getEconomicsSummary });

  const STATS = [
    { label: 'Barn Temp',   value: fmt(liveEnv.temperature_celsius) + '°C',  icon: Thermometer, color: '#FF9800', sub: `${fmt(liveEnv.humidity_percent)}% humidity` },
    { label: 'Air Quality', value: fmt(liveEnv.air_quality_ppm, 0) + ' ppm', icon: Wind,        color: liveEnv.air_quality_ppm > 600 ? '#F44336' : '#4CAF50', sub: liveEnv.air_quality_ppm > 600 ? 'ALERT — elevated' : 'Normal range' },
    { label: 'Oxygen',      value: fmt(liveEnv.oxygen_percent) + '%',          icon: Activity,    color: liveEnv.oxygen_percent < 19.5 ? '#F44336' : '#4CAF50', sub: liveEnv.oxygen_percent < 19.5 ? 'Low oxygen!' : 'Acceptable' },
    { label: 'Components',  value: `${economics?.operational_components ?? '--'}/${economics?.component_count ?? '--'}`, icon: Cpu, color: '#1E4D7B', sub: 'operational' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'linear-gradient(135deg,#E65100,#FF9800)', borderRadius: 12, padding: '14px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>⚙️ Technician Dashboard</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>IoT systems status, environment monitoring, component health</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <EnvChart envTrend={envTrend} />
      <LiveSensors liveEnv={liveEnv} />
      <SysLogsTable sysLogs={sysLogs} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Main Dashboard (role router)
// ─────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { env, alertsCount } = useRealtime();
  const p = usePermissions();

  const { data: summary }        = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });
  const { data: alerts = [] }    = useQuery({ queryKey: ['recent-alerts'],    queryFn: getRecentAlerts });
  const { data: milkTrend = [] } = useQuery({ queryKey: ['milk-trend'],       queryFn: getMilkTrend });
  const { data: envTrend = [] }  = useQuery({ queryKey: ['env-trend'],        queryFn: getEnvTrend });
  const { data: sysLogs = [] }   = useQuery({ queryKey: ['system-logs'],      queryFn: getSystemLogs });

  const liveEnv = env || summary?.environment || {};

  const shared = { summary, alerts, milkTrend, envTrend, liveEnv, alertsCount, sysLogs };

  if (p.isFarmer)     return <FarmerDashboard {...shared} />;
  if (p.isVet)        return <VetDashboard {...shared} />;
  if (p.isTechnician) return <TechnicianDashboard {...shared} />;
  return <AdminDashboard {...shared} />;
}

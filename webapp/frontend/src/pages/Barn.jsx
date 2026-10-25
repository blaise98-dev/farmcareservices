import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Home, Thermometer, Droplets, Waves, Wheat, Wind, ToggleRight, TrendingUp } from 'lucide-react';
import { getBarnLatest, getBarnHistory, getFeedIntake } from '../lib/api';
import { LineChart, BarChart, ChartCard } from '../components/ChartKit';
import PeriodSelect from '../components/PeriodSelect';
import { periodDays, periodLabel, timeLabeler } from '../lib/periods';

const num = (v, d = 1) => (v == null ? '-' : Number(v).toFixed(d));

function Tile({ icon: Icon, color, value, label }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="value" style={{ color, fontSize: 26 }}>{value}</span>
        <span className="label">{label}</span>
      </div>
    </div>
  );
}

function GasBox({ value, label }) {
  const v = Number(value);
  const color = value == null ? '#90A4AE' : v >= 80 ? '#C62828' : v >= 60 ? '#E65100' : '#1565C0';
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ border: `2px solid ${color}55`, background: `${color}12`, borderRadius: 12, padding: '14px 8px', fontSize: 24, fontWeight: 800, color }}>
        {value == null ? '-' : `${v.toFixed(0)}%`}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Switch({ label, on }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <span style={{ display: 'inline-block', minWidth: 48, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800,
        background: on ? '#E8F5E9' : '#ECEFF1', color: on ? '#2E7D32' : '#607D8B', border: `1px solid ${on ? '#A5D6A7' : '#CFD8DC'}` }}>
        {on ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

export default function Barn() {
  const [hours, setHours] = useState(24);
  const { data: latest } = useQuery({ queryKey: ['barn-latest'], queryFn: getBarnLatest, refetchInterval: 5000 });
  const { data: history = [], isLoading: hLoading, isError: hError } = useQuery({ queryKey: ['barn-history', hours], queryFn: () => getBarnHistory(hours), refetchInterval: 30000 });
  // Feed eaten is per day, so short periods still show the last whole days
  const feedDays = Math.max(periodDays(hours), hours ? 7 : 0);
  const { data: feed } = useQuery({ queryKey: ['feed-intake', feedDays], queryFn: () => getFeedIntake(feedDays), refetchInterval: 60000 });

  const r = latest?.reading || {};
  const label = timeLabeler(history);
  const trend = history.map(h => ({
    time: label(h.recorded_at),
    temperature: h.temperature, humidity: h.humidity, tank: h.tank_level, feed: h.feed_weight,
  }));
  const feedDaily = (feed?.daily || []).map(d => ({ day: format(new Date(`${d.day}T00:00:00`), feedDays === 0 || feedDays > 366 ? 'MMM d, yyyy' : 'MMM d'), eaten: d.eaten_kg }));
  const emptyNote = !hLoading && !hError && history.length === 0
    ? `No readings in this period${r.recorded_at ? `. The last one was on ${format(new Date(r.recorded_at), 'MMM d, yyyy HH:mm')}; choose a longer period or All time.` : '.'}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-ink)', display: 'flex', alignItems: 'center', gap: 8 }}><Home size={20} /> Barn / House Monitor</h2>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Environment monitor{r.recorded_at ? ` · last update ${format(new Date(r.recorded_at), 'MMM d, HH:mm:ss')}` : ' · no readings yet'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
        <Tile icon={Thermometer} color="#1565C0" value={r.temperature != null ? `${num(r.temperature)}°C` : '-'} label="Temperature" />
        <Tile icon={Droplets} color="#00838F" value={r.humidity != null ? `${num(r.humidity)}%` : '-'} label="Humidity" />
        <Tile icon={Waves} color="#2E7D32" value={r.tank_level != null ? `${num(r.tank_level)}%` : '-'} label="Water tank" />
        <Tile icon={Wheat} color="#E65100" value={r.feed_weight != null ? `${num(r.feed_weight, 2)} kg` : '-'} label="Feed weight" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Wind size={15} /> Air Quality</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <GasBox value={r.mq5_pct} label="MQ5 (Gas/Smoke)" />
              <GasBox value={r.mq135_pct} label="MQ135 (Air Quality)" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
              Readings are % of sensor range, not yet calibrated to ppm. Alerts at 60% (warning) and 80% (critical).
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><ToggleRight size={15} /> Controls Status</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Switch label="Pump" on={!!r.pump_status} />
              <Switch label="Fan" on={!!r.fan_status} />
              <Switch label="Spray" on={!!r.spray_status} />
              <Switch label="Buzzer" on={!!r.buzzer_status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 12 }}>
              {r.recorded_at ? `Last update: ${format(new Date(r.recorded_at), 'HH:mm:ss')}` : 'Waiting for the barn node'}
              {latest && !latest.online && r.recorded_at ? ' (device offline)' : ''}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Wheat size={15} /> Feed Eaten</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E65100' }}>{feed ? `${num(feed.today_kg, 2)} kg` : '-'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>today</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E65100' }}>{feed ? `${num(feed.month_kg, 1)} kg` : '-'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>this month</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>From drops in the feeder's load cell; refills are not counted.</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ChartCard
            title={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} /> Temperature</span>}
            sub={emptyNote || periodLabel(hours)} isLoading={hLoading} isError={hError} height={220}
            action={<PeriodSelect value={hours} onChange={setHours} />}>
            <LineChart data={trend} xKey="time" series={[{ key: 'temperature', name: 'Temperature', color: '#1565C0' }]} unit="°C" area scale height={220} />
          </ChartCard>
          <ChartCard title="Humidity & tank level" sub={`% · ${periodLabel(hours)}`} isLoading={hLoading} isError={hError} height={220}>
            <LineChart data={trend} xKey="time" series={[{ key: 'humidity', name: 'Humidity', color: '#00838F' }, { key: 'tank', name: 'Tank', color: 'var(--green-ink)' }]} unit="%" height={220} />
          </ChartCard>
          <ChartCard title="Feed eaten per day" sub={`kg · ${feedDays ? `last ${feedDays} days` : 'all time'}`} height={200}>
            <BarChart data={feedDaily} xKey="day" series={[{ key: 'eaten', name: 'Feed eaten', color: '#E65100' }]} unit=" kg" height={200} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

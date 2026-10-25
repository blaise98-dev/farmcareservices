import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getDeviceChips } from '../lib/api';
import { lastSeenText } from '../lib/lastSeen';

const CHIPS = [
  { role: 'milking', label: 'Milking',       path: '/app/milking' },
  { role: 'barn',    label: 'Barn',          path: '/app/barn' },
  { role: 'collar',  label: 'Health Collar', path: '/app/cow-health' },
];

/**
 * Online status of the three field devices. `variant="dark"` is for the green
 * app header; the default is for light page backgrounds.
 */
export default function DeviceStatusChips({ variant = 'light' }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['device-chips'], queryFn: getDeviceChips, refetchInterval: 15000 });
  if (!data) return null;
  const dark = variant === 'dark';

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CHIPS.map(c => {
        const s = data[c.role] || {};
        const on = !!s.online;
        return (
          <button key={c.role} onClick={() => navigate(c.path)}
            title={on ? `${c.label}: online` : `${c.label}: offline, last seen ${lastSeenText(s.seconds_since_seen)}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              border: `1px solid ${dark ? 'rgba(255,255,255,.35)' : (on ? '#A5D6A7' : '#F8BBD0')}`,
              background: dark ? 'rgba(0,0,0,.15)' : (on ? '#E8F5E9' : '#FCE4EC'),
              color: dark ? '#fff' : (on ? '#2E7D32' : '#C2185B'),
            }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#4CAF50' : '#E91E63',
              boxShadow: on ? '0 0 0 3px rgba(76,175,80,.25)' : 'none' }} />
            {c.label}
            <span style={{ fontWeight: 500, opacity: .8 }}>{on ? 'online' : 'offline'}</span>
          </button>
        );
      })}
    </div>
  );
}

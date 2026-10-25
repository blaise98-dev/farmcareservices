import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tractor } from 'lucide-react';
import { getFarms } from '../lib/api';
import { FARM_KEY, readKey, writeKey } from '../lib/storage';

/**
 * Admin-only farm switcher for the app header. The choice is sent with every
 * API request (X-Farm-Id); "All farms" shows every farm's data together.
 */
export default function FarmPicker() {
  const qc = useQueryClient();
  const [farm, setFarm] = useState(() => readKey(FARM_KEY) || '');
  const { data: farms = [] } = useQuery({ queryKey: ['farms'], queryFn: getFarms, staleTime: 60000 });
  if (farms.length < 2 && !farm) return null;

  const change = (v) => {
    writeKey(FARM_KEY, v || null);
    setFarm(v);
    qc.invalidateQueries();
  };

  return (
    <label title="Farm you are viewing" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.15)',
      borderRadius: 20, padding: '4px 10px', fontSize: 12, flexShrink: 0,
    }}>
      <Tractor size={14} />
      <select value={farm} onChange={e => change(e.target.value)} aria-label="Farm"
        style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 160 }}>
        <option value="" style={{ color: 'var(--text)', background: 'var(--card)' }}>All farms</option>
        {farms.map(f => (
          <option key={f.farm_id} value={String(f.farm_id)} style={{ color: 'var(--text)', background: 'var(--card)' }}>{f.farm_name}</option>
        ))}
      </select>
    </label>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tractor, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import { createFarm, getFarms, getUnassigned, updateFarm } from '../lib/api';
import { errorText } from '../lib/errors';

/**
 * Admin card on User Management: every farm with its users, cows and devices,
 * renaming a farm, a form to add one, and a warning for users and devices
 * with no farm yet.
 */
const EDIT_INPUT = { width: '100%', minWidth: 140, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' };

export default function FarmsCard() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [err, setErr] = useState('');
  const { data: farms = [], isError: farmsError, error: farmsErr } = useQuery({ queryKey: ['farms'], queryFn: getFarms });
  const { data: unassigned } = useQuery({ queryKey: ['farms-unassigned'], queryFn: getUnassigned, refetchInterval: 30000 });
  const add = useMutation({
    mutationFn: createFarm,
    onSuccess: () => { setName(''); setLocation(''); setErr(''); qc.invalidateQueries({ queryKey: ['farms'] }); },
    onError: e => setErr(e.response?.data?.detail || 'Could not add the farm'),
  });
  const [editing, setEditing] = useState(null);   // { farm_id, farm_name, location }
  const [editErr, setEditErr] = useState('');
  const rename = useMutation({
    mutationFn: ({ farm_id, ...body }) => updateFarm(farm_id, body),
    onSuccess: () => {
      setEditing(null); setEditErr('');
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: e => setEditErr(e.response?.data?.detail || 'Could not rename the farm'),
  });
  const saveEdit = () => {
    const name = editing.farm_name.trim();
    if (name.length < 2) { setEditErr('Farm name needs at least 2 characters'); return; }
    rename.mutate({ farm_id: editing.farm_id, farm_name: name, location: editing.location.trim() || null });
  };
  const waiting = (unassigned?.users?.length || 0) + (unassigned?.devices?.length || 0);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tractor size={18} color="#2E7D32" />
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Farms</h2>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
          Users see only their own farm's cows, milk, alerts and devices
        </span>
      </div>

      {waiting > 0 && (
        <div style={{ margin: '14px 20px 0', padding: '10px 14px', borderRadius: 10, background: 'var(--tint-amber)', color: '#E65100', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Not on any farm yet:{' '}
            {[...(unassigned.users || []).map(u => `@${u.username}`), ...(unassigned.devices || []).map(d => d.device_id)].join(', ')}.
            {' '}Users get a farm when you approve or edit them; devices under IoT Control.
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Farm</th><th>Location</th><th>Users</th><th>Cows</th><th>Devices</th><th /></tr></thead>
          <tbody>
            {farms.map(f => editing?.farm_id === f.farm_id ? (
              <tr key={f.farm_id}>
                <td>
                  <input value={editing.farm_name} onChange={e => setEditing(v => ({ ...v, farm_name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                    aria-label="Farm name" autoFocus style={EDIT_INPUT} />
                </td>
                <td>
                  <input value={editing.location} onChange={e => setEditing(v => ({ ...v, location: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                    aria-label="Location" placeholder="Sector, district" style={EDIT_INPUT} />
                </td>
                <td>{f.users}</td><td>{f.cows}</td><td>{f.devices}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={rename.isPending}
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Check size={12} /> {rename.isPending ? 'Saving…' : 'Save'}
                  </button>{' '}
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setEditErr(''); }}
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <X size={12} /> Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={f.farm_id}>
                <td style={{ fontWeight: 600 }}>{f.farm_name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.location || '-'}</td>
                <td>{f.users}</td><td>{f.cows}</td><td>{f.devices}</td>
                <td>
                  <button type="button" className="btn btn-ghost" title={`Rename ${f.farm_name}`}
                    onClick={() => { setEditing({ farm_id: f.farm_id, farm_name: f.farm_name || '', location: f.location || '' }); setEditErr(''); }}
                    style={{ padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Pencil size={12} /> Rename
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {farmsError && (
          <div role="alert" style={{ padding: '10px 20px', fontSize: 12.5, color: '#c62828' }}>
            Could not load the farms: {errorText(farmsErr, 'Loading')}
          </div>
        )}
        {editErr && <div style={{ padding: '8px 20px', fontSize: 12, color: '#c62828' }}>{editErr}</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); if (name.trim()) add.mutate({ farm_name: name.trim(), location: location.trim() || null }); }}
        style={{ display: 'flex', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New farm name" aria-label="New farm name"
          style={{ flex: '1 1 180px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (sector, district)" aria-label="Location"
          style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }} />
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || add.isPending}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
          <Plus size={14} /> Add farm
        </button>
        {err && <span style={{ fontSize: 12, color: '#c62828', width: '100%' }}>{err}</span>}
      </form>
    </div>
  );
}

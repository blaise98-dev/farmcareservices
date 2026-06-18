import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGroups, getGroupMembers, createGroup, addGroupMembers, removeGroupMember, deleteGroup, getCows } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { Link } from 'react-router-dom';
import { Plus, X, Users, Trash2, UserMinus } from 'lucide-react';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

const TYPE_COLOR = { Production: '#4CAF50', Dry: '#FF9800', Heifer: '#00BCD4', Calf: '#9C27B0', Fattening: '#1E4D7B', Custom: '#607D8B' };
const GROUP_TYPES = ['Production', 'Dry', 'Heifer', 'Calf', 'Fattening', 'Custom'];

export default function Groups() {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMember, setShowAddMember]   = useState(false);
  const [newGroupForm, setNewGroupForm]     = useState({ group_name: '', group_type: 'Custom', description: '' });
  const [selectedCowIds, setSelectedCowIds] = useState([]);
  const [err, setErr] = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();
  const canWrite = p.isAdmin || p.isFarmer;

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: getGroups });
  const { data: members = [] } = useQuery({ queryKey: ['group-members', selectedGroup?.group_id], queryFn: () => getGroupMembers(selectedGroup.group_id), enabled: !!selectedGroup });
  const { data: cows = []   } = useQuery({ queryKey: ['cows'], queryFn: getCows });

  const createMut = useMutation({
    mutationFn: createGroup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setShowCreateModal(false); setNewGroupForm({ group_name: '', group_type: 'Custom', description: '' }); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const addMembersMut = useMutation({
    mutationFn: ({ id, cowIds }) => addGroupMembers(id, cowIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group-members', selectedGroup?.group_id] }); qc.invalidateQueries({ queryKey: ['groups'] }); setShowAddMember(false); setSelectedCowIds([]); },
  });
  const removeMut = useMutation({
    mutationFn: ({ groupId, cowId }) => removeGroupMember(groupId, cowId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['group-members', selectedGroup?.group_id] }); qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setSelectedGroup(null); },
  });

  const memberCowIds = new Set(members.map(m => m.cow_id));
  const nonMembers = cows.filter(c => !memberCowIds.has(c.cow_id));

  const toggleCow = (id) => setSelectedCowIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>👥 Animal Groups</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Manage herd categories and group-based feeding</div>
        </div>
        {canWrite && (
          <button className="btn" onClick={() => { setShowCreateModal(true); setErr(''); }} style={{ background: '#4CAF50', color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <Plus size={14} /> New Group
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Group list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(g => (
            <div key={g.group_id}
              onClick={() => setSelectedGroup(g)}
              style={{ padding: '14px 16px', borderRadius: 12, cursor: 'pointer', border: `2px solid ${selectedGroup?.group_id === g.group_id ? TYPE_COLOR[g.group_type] || '#1E4D7B' : 'var(--border)'}`, background: selectedGroup?.group_id === g.group_id ? `${TYPE_COLOR[g.group_type] || '#1E4D7B'}11` : '#fff', transition: 'all .2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{g.group_name}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${TYPE_COLOR[g.group_type] || '#999'}22`, color: TYPE_COLOR[g.group_type] || '#333', fontWeight: 600 }}>{g.group_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.description || ''}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1E4D7B' }}>{g.member_count} cows</span>
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="empty-state"><Users size={32} /><span>No groups yet</span></div>}
        </div>

        {/* Group detail */}
        {selectedGroup ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{selectedGroup.group_name}</h2>
                <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, background: `${TYPE_COLOR[selectedGroup.group_type] || '#999'}22`, color: TYPE_COLOR[selectedGroup.group_type] || '#333', fontWeight: 600 }}>{selectedGroup.group_type}</span>
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => setShowAddMember(true)} style={{ fontSize: 12, padding: '6px 12px' }}><Plus size={12} /> Add Cows</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', color: '#c62828' }}
                    onClick={() => { if (window.confirm(`Delete group "${selectedGroup.group_name}"?`)) deleteMut.mutate(selectedGroup.group_id); }}>
                    <Trash2 size={12} /> Delete Group
                  </button>
                </div>
              )}
            </div>

            {members.length === 0
              ? <div className="empty-state"><Users size={32} /><span>No members in this group</span></div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Cow</th><th>Breed</th><th>Category</th><th>Health</th><th>Lactating</th><th>Weight</th>{canWrite && <th></th>}</tr></thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.cow_id}>
                          <td><Link to={`/herd/${m.cow_id}`} style={{ fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>{m.cow_name}</Link></td>
                          <td>{m.breed}</td>
                          <td><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: '#e3f2fd', color: '#1565c0', fontWeight: 600 }}>{m.cow_category}</span></td>
                          <td><span className={`badge badge-${(m.health_status || '').toLowerCase().replace(' ', '')}`}>{m.health_status}</span></td>
                          <td>{m.lactating ? '✓' : '—'}</td>
                          <td>{m.weight_kg ? `${m.weight_kg} kg` : '—'}</td>
                          {canWrite && (
                            <td>
                              <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#c62828' }}
                                onClick={() => removeMut.mutate({ groupId: selectedGroup.group_id, cowId: m.cow_id })}>
                                <UserMinus size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Users size={40} style={{ marginBottom: 12 }} />
              <p>Select a group to view its members</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && canWrite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>👥 Create New Group</h2>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); if (!newGroupForm.group_name.trim()) { setErr('Name required'); return; } createMut.mutate(newGroupForm); }}
              style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Group Name *</label><input style={INPUT} value={newGroupForm.group_name} onChange={e => setNewGroupForm(f => ({ ...f, group_name: e.target.value }))} placeholder="e.g. Lactating Herd A" required /></div>
              <div>
                <label style={LABEL}>Type</label>
                <select style={INPUT} value={newGroupForm.group_type} onChange={e => setNewGroupForm(f => ({ ...f, group_type: e.target.value }))}>
                  {GROUP_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={LABEL}>Description</label><input style={INPUT} value={newGroupForm.description} onChange={e => setNewGroupForm(f => ({ ...f, description: e.target.value }))} /></div>
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13 }} disabled={createMut.isPending}>Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMember && selectedGroup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Add Cows to {selectedGroup.group_name}</h2>
              <button onClick={() => { setShowAddMember(false); setSelectedCowIds([]); }} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              {nonMembers.length === 0
                ? <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>All cows are already in this group.</p>
                : nonMembers.map(c => (
                  <label key={c.cow_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', cursor: 'pointer', borderRadius: 8, background: selectedCowIds.includes(c.cow_id) ? '#e8eef7' : 'transparent' }}>
                    <input type="checkbox" checked={selectedCowIds.includes(c.cow_id)} onChange={() => toggleCow(c.cow_id)} style={{ width: 16, height: 16, accentColor: '#1E4D7B' }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{c.cow_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.breed} · {c.cow_category}</span>
                  </label>
                ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button className="btn" onClick={() => { setShowAddMember(false); setSelectedCowIds([]); }} style={{ padding: '8px 16px', fontSize: 13 }}>Cancel</button>
              <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}
                disabled={selectedCowIds.length === 0 || addMembersMut.isPending}
                onClick={() => addMembersMut.mutate({ id: selectedGroup.group_id, cowIds: selectedCowIds })}>
                Add {selectedCowIds.length > 0 ? `(${selectedCowIds.length})` : ''} Cows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

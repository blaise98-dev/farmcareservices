import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, deleteUser, adminResetPassword, getCows, getMilk, getFeed } from '../lib/api';
import { Users, Plus, X, ShieldCheck, ToggleLeft, ToggleRight, Edit2, Trash2, Key, Eye } from 'lucide-react';
import { format } from 'date-fns';
import RwandaLocationFields from '../components/RwandaLocationFields';

const ROLES = ['Admin', 'Farmer', 'Veterinarian', 'Technician'];

const ROLE_COLOR = {
  Admin: '#FFD700', Farmer: '#4CAF50', Veterinarian: '#9C27B0', Technician: '#FF9800',
};
const ROLE_BG = {
  Admin: '#fffde7', Farmer: '#e8f5e9', Veterinarian: '#f3e5f5', Technician: '#fff8e1',
};
const ROLE_DESC = {
  Admin:        'Full system access — all pages and actions',
  Farmer:       'Farm operations — herd, milk, feed, alerts, economics',
  Veterinarian: 'Health & medical — health status, predictions, feed prescriptions',
  Technician:   'IoT operations — dashboard, environment, economics (read-only)',
};

const EMPTY_LOCATION = { province: '', district: '', sector: '', cell: '', village: '' };

// ── Per-user activity drill-down (read-only, Admin only) ──────────────────────
function UserActivityPanel({ user, onClose }) {
  const { data: allCows = []  } = useQuery({ queryKey: ['cows'],        queryFn: getCows });
  const { data: milkRecs = []  } = useQuery({ queryKey: ['milk-7'],     queryFn: () => getMilk(7) });
  const { data: feedRecs = []  } = useQuery({ queryKey: ['feed-7'],     queryFn: () => getFeed(7) });

  const HEALTH_COLOR = { Healthy: '#4CAF50', Warning: '#FF9800', Critical: '#F44336', 'Under Treatment': '#9C27B0' };

  const tabs = ['Cows', 'Milk (7d)', 'Feed (7d)'];
  const [tab, setTab] = useState('Cows');

  const totalMilk  = milkRecs.reduce((s, r) => s + Number(r.milk_amount_liters || 0), 0);
  const totalFeed  = feedRecs.reduce((s, r) => s + Number(r.feed_amount_kg || 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{user.full_name || user.username}</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, opacity: .8 }}>
              {user.role} · @{user.username} · Read-only view
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Total Cows', value: allCows.length, color: '#1E4D7B' },
            { label: 'Milk (7d)',  value: `${totalMilk.toFixed(1)} L`, color: '#00BCD4' },
            { label: 'Feed (7d)',  value: `${totalFeed.toFixed(1)} kg`, color: '#4CAF50' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: '12px 20px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: '#f7f9fc' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: tab === t ? 700 : 500, border: 'none', background: 'none', borderBottom: tab === t ? '2px solid #1E4D7B' : '2px solid transparent', color: tab === t ? '#1E4D7B' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tab === 'Cows' && (
            <table className="data-table">
              <thead><tr><th>RFID</th><th>Name</th><th>Breed</th><th>Stage</th><th>Category</th><th>Health</th><th>Age</th><th>Weight</th></tr></thead>
              <tbody>
                {allCows.map(c => (
                  <tr key={c.cow_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.rfid_tag}</td>
                    <td style={{ fontWeight: 600 }}>{c.cow_name}</td>
                    <td>{c.breed}</td>
                    <td>{c.cow_stage || '—'}</td>
                    <td>{c.cow_category || '—'}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: `${HEALTH_COLOR[c.health_status] || '#999'}22`, color: HEALTH_COLOR[c.health_status] || '#333' }}>{c.health_status}</span></td>
                    <td>{c.age_months != null ? `${c.age_months} mo` : '—'}</td>
                    <td>{c.weight_kg ? `${c.weight_kg} kg` : '—'}</td>
                  </tr>
                ))}
                {allCows.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No cows registered</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'Milk (7d)' && (
            <table className="data-table">
              <thead><tr><th>Cow</th><th>Date</th><th>Session</th><th>Amount (L)</th><th>Quality</th></tr></thead>
              <tbody>
                {milkRecs.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.cow_name || r.cow_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.recorded_at ? format(new Date(r.recorded_at), 'MMM d') : '—'}</td>
                    <td>{r.milking_session}</td>
                    <td style={{ fontWeight: 700, color: '#00BCD4' }}>{Number(r.milk_amount_liters).toFixed(1)}</td>
                    <td>{r.milk_quality}</td>
                  </tr>
                ))}
                {milkRecs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No milk records</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'Feed (7d)' && (
            <table className="data-table">
              <thead><tr><th>Cow</th><th>Date</th><th>Feed Type</th><th>Amount (kg)</th><th>Methane Impact</th></tr></thead>
              <tbody>
                {feedRecs.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.cow_name || r.cow_id}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.recorded_at ? format(new Date(r.recorded_at), 'MMM d') : '—'}</td>
                    <td>{r.feed_type}</td>
                    <td style={{ fontWeight: 700, color: '#4CAF50' }}>{Number(r.feed_amount_kg).toFixed(1)}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                        background: r.methane_impact === 'Increases' ? '#fde8e8' : r.methane_impact === 'Reduces' ? '#e8f5e9' : '#f5f5f5',
                        color: r.methane_impact === 'Increases' ? '#c62828' : r.methane_impact === 'Reduces' ? '#2E7D32' : '#666'
                      }}>{r.methane_impact || 'Neutral'}</span>
                    </td>
                  </tr>
                ))}
                {feedRecs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No feed records</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_CREATE = {
  username: '', password: '', full_name: '',
  email: '', phone_number: '', role: 'Farmer', farm_id: 1,
};

export default function UserManagement() {
  const [showCreatePanel, setShowCreatePanel]   = useState(false);
  const [createForm, setCreateForm]             = useState(EMPTY_CREATE);
  const [createLocation, setCreateLocation]     = useState(EMPTY_LOCATION);
  const [createErr, setCreateErr]               = useState('');
  const [editUser, setEditUser]                 = useState(null);
  const [editErr, setEditErr]                   = useState('');
  const [resetTarget, setResetTarget]           = useState(null);
  const [resetPw, setResetPw]                   = useState('');
  const [resetMsg, setResetMsg]                 = useState('');
  const [viewUser, setViewUser]                 = useState(null);
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreatePanel(false);
      setCreateForm(EMPTY_CREATE);
      setCreateLocation(EMPTY_LOCATION);
      setCreateErr('');
    },
    onError: (e) => setCreateErr(e.response?.data?.detail || 'Failed to create user'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => updateUser(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); setEditErr(''); },
    onError: (e) => setEditErr(e.response?.data?.detail || 'Update failed'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => alert(e.response?.data?.detail || 'Delete failed'),
  });
  const resetMut = useMutation({
    mutationFn: ({ id, pw }) => adminResetPassword(id, pw),
    onSuccess: () => { setResetMsg('Password reset successfully!'); setResetPw(''); setTimeout(() => { setResetTarget(null); setResetMsg(''); }, 2000); },
    onError: (e) => setResetMsg(e.response?.data?.detail || 'Reset failed'),
  });

  const handleCreateChange = (e) => {
    const { name, value } = e.target;
    setCreateForm(prev => ({ ...prev, [name]: name === 'farm_id' ? Number(value) : value }));
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    setCreateErr('');
    if (!createForm.username.trim()) { setCreateErr('Username is required'); return; }
    if (createForm.password.length < 6) { setCreateErr('Password must be at least 6 characters'); return; }
    if (!createForm.full_name.trim()) { setCreateErr('Full name is required'); return; }
    createMut.mutate({
      ...createForm,
      province: createLocation.province || undefined,
      district: createLocation.district || undefined,
      sector:   createLocation.sector   || undefined,
      cell:     createLocation.cell     || undefined,
      village:  createLocation.village  || undefined,
    });
  };

  const openEdit = (u) => {
    setEditUser({ user_id: u.user_id, role: u.role, is_active: u.is_active, full_name: u.full_name, email: u.email || '', phone_number: u.phone_number || '' });
    setEditErr('');
  };

  const handleToggleActive = (u) => {
    updateMut.mutate({ id: u.user_id, body: { is_active: !u.is_active } });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    setEditErr('');
    const { user_id, ...fields } = editUser;
    // only send changed fields
    const original = users.find(u => u.user_id === user_id);
    const changed = {};
    if (fields.role !== original?.role) changed.role = fields.role;
    if (fields.is_active !== original?.is_active) changed.is_active = fields.is_active;
    if (fields.full_name !== (original?.full_name || '')) changed.full_name = fields.full_name;
    if (fields.email !== (original?.email || '')) changed.email = fields.email;
    if (fields.phone_number !== (original?.phone_number || '')) changed.phone_number = fields.phone_number;
    if (Object.keys(changed).length === 0) { setEditErr('No changes to save'); return; }
    updateMut.mutate({ id: user_id, body: changed });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)',
        borderRadius: 12, padding: '18px 24px', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={24} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>User Management</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: .8 }}>
              Manage platform access — create users, assign roles, toggle status
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowCreatePanel(true); setCreateErr(''); setCreateForm(EMPTY_CREATE); setCreateLocation(EMPTY_LOCATION); }}
          className="btn"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {/* Role legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
        {ROLES.map(r => (
          <div key={r} style={{
            padding: '12px 16px', borderRadius: 10,
            background: ROLE_BG[r], border: `1px solid ${ROLE_COLOR[r]}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ShieldCheck size={14} color={ROLE_COLOR[r]} />
              <span style={{ fontWeight: 700, fontSize: 13, color: ROLE_COLOR[r] }}>{r}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {users.filter(u => u.role === r && u.is_active).length} active
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{ROLE_DESC[r]}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={18} color="#1E4D7B" />
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>System Users</h2>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            {users.filter(u => u.is_active).length} active · {users.length} total
          </span>
        </div>

        {isLoading
          ? <div className="spinner" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Username</th><th>Email</th><th>Phone</th>
                    <th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id}>
                      <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>@{u.username}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.phone_number || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                          background: ROLE_BG[u.role] || '#f0f0f0',
                          color: ROLE_COLOR[u.role] || '#333',
                          border: `1px solid ${ROLE_COLOR[u.role] || '#ccc'}44`,
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${u.is_active ? 'healthy' : 'critical'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {u.last_login ? format(new Date(u.last_login), 'MMM d, yyyy HH:mm') : 'Never'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button onClick={() => setViewUser(u)} className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: '#1E4D7B' }}>
                            <Eye size={12} /> View
                          </button>
                          <button onClick={() => openEdit(u)} className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Edit2 size={12} /> Edit
                          </button>
                          <button onClick={() => { setResetTarget(u); setResetPw(''); setResetMsg(''); }} className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 11, color: '#FF9800', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Key size={12} /> Reset PW
                          </button>
                          <button onClick={() => { if (window.confirm(`Delete "${u.username}"? This cannot be undone.`)) deleteMut.mutate(u.user_id); }}
                            disabled={deleteMut.isPending} className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: 11, color: '#c62828', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Trash2 size={12} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={updateMut.isPending}
                            className="btn btn-ghost"
                            style={{
                              padding: '4px 10px', fontSize: 11,
                              color: u.is_active ? '#c62828' : '#2E7D32',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}
                            title={u.is_active ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.is_active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="empty-state"><Users size={40} /><span>No users found</span></div>
              )}
            </div>
          )
        }
      </div>

      {/* ── Create User Side Panel / Modal ── */}
      {showCreatePanel && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
            boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', color: '#fff',
              borderRadius: '16px 16px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Add New User</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .8 }}>Create a new platform account</p>
              </div>
              <button onClick={() => setShowCreatePanel(false)}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Username + Full Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={LABEL_STYLE}>Username *</label>
                  <input name="username" value={createForm.username} onChange={handleCreateChange}
                    placeholder="unique_username" style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Full Name *</label>
                  <input name="full_name" value={createForm.full_name} onChange={handleCreateChange}
                    placeholder="Jean Pierre" style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={LABEL_STYLE}>Password * (min 6 characters)</label>
                <input type="password" name="password" value={createForm.password} onChange={handleCreateChange}
                  placeholder="Secure password" style={INPUT_STYLE}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>

              {/* Email + Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={LABEL_STYLE}>Email</label>
                  <input type="email" name="email" value={createForm.email} onChange={handleCreateChange}
                    placeholder="email@example.com" style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Phone Number</label>
                  <input name="phone_number" value={createForm.phone_number} onChange={handleCreateChange}
                    placeholder="+250 7XX XXX XXX" style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>

              {/* Role */}
              <div>
                <label style={LABEL_STYLE}>Role *</label>
                <select name="role" value={createForm.role} onChange={handleCreateChange}
                  style={INPUT_STYLE}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {ROLE_DESC[createForm.role]}
                </p>
              </div>

              {/* Location */}
              <div style={{ display: 'grid', gap: 0 }}>
                <RwandaLocationFields location={createLocation} onChange={setCreateLocation} />
              </div>

              {/* Error */}
              {createErr && (
                <div style={{ color: '#c62828', fontSize: 13, padding: '10px 14px', background: '#fde8e8', borderRadius: 8 }}>
                  ⚠ {createErr}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreatePanel(false)}
                  className="btn"
                  style={{ padding: '9px 20px', fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={createMut.isPending}
                  className="btn btn-primary"
                  style={{ padding: '9px 24px', fontSize: 13 }}>
                  {createMut.isPending ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg,#37474F,#546E7A)', color: '#fff',
              borderRadius: '16px 16px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Edit User</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, opacity: .8 }}>
                  Update role, profile, or active status
                </p>
              </div>
              <button onClick={() => setEditUser(null)}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Full Name */}
              <div>
                <label style={LABEL_STYLE}>Full Name</label>
                <input value={editUser.full_name} onChange={e => setEditUser(p => ({ ...p, full_name: e.target.value }))}
                  style={INPUT_STYLE}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>

              {/* Email + Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={LABEL_STYLE}>Email</label>
                  <input type="email" value={editUser.email} onChange={e => setEditUser(p => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com" style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Phone</label>
                  <input value={editUser.phone_number} onChange={e => setEditUser(p => ({ ...p, phone_number: e.target.value }))}
                    placeholder="+250..." style={INPUT_STYLE}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>

              {/* Role */}
              <div>
                <label style={LABEL_STYLE}>Role</label>
                <select value={editUser.role} onChange={e => setEditUser(p => ({ ...p, role: e.target.value }))}
                  style={INPUT_STYLE}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {ROLE_DESC[editUser.role]}
                </p>
              </div>

              {/* Active status */}
              <div>
                <label style={LABEL_STYLE}>Account Status</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, padding: '10px', background: 'var(--bg)', borderRadius: 8 }}>
                  <input
                    type="checkbox"
                    checked={editUser.is_active}
                    onChange={e => setEditUser(p => ({ ...p, is_active: e.target.checked }))}
                    style={{ width: 18, height: 18, accentColor: '#4CAF50', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 600, color: editUser.is_active ? '#4CAF50' : '#c62828' }}>
                    {editUser.is_active ? 'Active — can log in' : 'Inactive — login disabled'}
                  </span>
                </label>
              </div>

              {/* Error */}
              {editErr && (
                <div style={{ color: '#c62828', fontSize: 13, padding: '10px 14px', background: '#fde8e8', borderRadius: 8 }}>
                  ⚠ {editErr}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditUser(null)}
                  className="btn"
                  style={{ padding: '9px 20px', fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={updateMut.isPending}
                  className="btn btn-primary"
                  style={{ padding: '9px 24px', fontSize: 13 }}>
                  {updateMut.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#E65100,#FF9800)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🔑 Reset Password</h2>
                <p style={{ margin: '3px 0 0', fontSize: 12, opacity: .8 }}>@{resetTarget.username}</p>
              </div>
              <button onClick={() => setResetTarget(null)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL_STYLE}>New Password (min 6 characters)</label>
                <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                  placeholder="Enter new password…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#FF9800'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              </div>
              {resetMsg && (
                <div style={{ color: resetMsg.includes('success') ? '#2E7D32' : '#c62828', fontSize: 13, padding: '8px 12px', background: resetMsg.includes('success') ? '#e8f5e9' : '#fde8e8', borderRadius: 8 }}>
                  {resetMsg}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setResetTarget(null)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button disabled={resetPw.length < 6 || resetMut.isPending} className="btn btn-primary"
                  onClick={() => resetMut.mutate({ id: resetTarget.user_id, pw: resetPw })}
                  style={{ padding: '9px 22px', fontSize: 13, background: '#E65100', border: 'none' }}>
                  {resetMut.isPending ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── User Activity Drill-down (read-only) ── */}
      {viewUser && <UserActivityPanel user={viewUser} onClose={() => setViewUser(null)} />}
    </div>
  );
}

const LABEL_STYLE = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--text-secondary)', textTransform: 'uppercase',
  letterSpacing: .5, marginBottom: 6,
};

const INPUT_STYLE = {
  width: '100%', padding: '9px 12px',
  borderRadius: 8, border: '2px solid var(--border)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  background: '#fff', boxSizing: 'border-box',
};

import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { CheckCircle, User, Lock, ShieldCheck, Users, FileText, ExternalLink, Globe, Camera } from 'lucide-react';
import { updateAvatar } from '../lib/api';

const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'rw', label: 'Kinyarwanda', flag: '🇷🇼' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
];
import { format } from 'date-fns';

const ROLE_COLOR = {
  Admin: '#1E4D7B', Farmer: '#4CAF50', Veterinarian: '#9C27B0', Technician: '#FF9800'
};
const ROLE_BG = {
  Admin: '#e8eef7', Farmer: '#e8f5e9', Veterinarian: '#f3e5f5', Technician: '#fff8e1'
};
const ROLE_DESC = {
  Admin:        'Full system access — herd, milk, feed, environment, alerts, economics, predictions, users, reports',
  Farmer:       'Farm operations — herd (register cows), milk/feed logging, alerts, economics; no health diagnostics or predictions',
  Veterinarian: 'Health & medical — herd health, health status updates, alerts, predictions, feed prescriptions; no economics',
  Technician:   'IoT operations — dashboard, environment calibration, economics; read-only on cows',
};

export default function Settings() {
  const { user, changePassword, logout } = useAuth();
  const p = usePermissions();
  const [pw, setPw]           = useState({ new: '', confirm: '' });
  const [msg, setMsg]         = useState('');
  const [err, setErr]         = useState('');
  const [saving, setSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [lang, setLang]       = useState(() => localStorage.getItem('moome_lang') || 'en');
  const [avatarMsg, setAvatarMsg] = useState('');
  const fileInputRef          = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { setAvatarMsg('Image too large — max 500 KB'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await updateAvatar(ev.target.result);
        setAvatarMsg('Avatar updated ✓');
        setTimeout(() => setAvatarMsg(''), 3000);
      } catch { setAvatarMsg('Upload failed'); }
    };
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (pw.new !== pw.confirm) { setErr('Passwords do not match'); return; }
    if (pw.new.length < 6) { setErr('Minimum 6 characters'); return; }
    setSaving(true);
    try {
      await changePassword(pw.new);
      setMsg('Password changed successfully!');
      setPw({ new: '', confirm: '' });
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to change password');
    } finally { setSaving(false); }
  };

  const tabs = [
    { id: 'profile',     label: '👤 Profile',        show: true },
    { id: 'permissions', label: '🛡 My Permissions',  show: true },
  ].filter(t => t.show);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="btn"
            style={{
              padding: '8px 16px', fontSize: 13,
              background: activeTab === t.id ? '#1E4D7B' : 'var(--bg)',
              color: activeTab === t.id ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              fontWeight: activeTab === t.id ? 700 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {activeTab === 'profile' && (
        <>
          {/* Profile card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {/* Avatar with upload */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: ROLE_COLOR[user?.role] || '#999',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <User size={30} color="#fff" />}
                </div>
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#1E4D7B', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Camera size={12} color="#fff" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
              </div>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>{user?.full_name || user?.username}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                    background: ROLE_BG[user?.role], color: ROLE_COLOR[user?.role],
                    border: `1px solid ${ROLE_COLOR[user?.role]}44`,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <ShieldCheck size={12} /> {user?.role}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { label: 'Username',   val: user?.username },
                { label: 'Email',      val: user?.email || '—' },
                { label: 'Phone',      val: user?.phone_number || '—' },
                { label: 'Last Login', val: user?.last_login ? format(new Date(user.last_login), 'MMM d, yyyy HH:mm') : 'This session' },
              ].map(({ label, val }) => (
                <div key={label} style={{ padding: '12px', background: 'var(--bg)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {avatarMsg && (
            <div style={{ marginTop: -12, marginBottom: 8, padding: '7px 12px', borderRadius: 8, background: avatarMsg.includes('✓') ? '#e8f5e9' : '#fde8e8', color: avatarMsg.includes('✓') ? '#2E7D32' : '#c62828', fontSize: 12, fontWeight: 600 }}>
              {avatarMsg}
            </div>
          )}

          {/* Change password */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={16} /> Change Password
            </h2>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'New Password',     key: 'new',     placeholder: 'Minimum 6 characters' },
                { label: 'Confirm Password', key: 'confirm', placeholder: 'Repeat new password' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
                    {label}
                  </label>
                  <input
                    type="password"
                    value={pw[key]}
                    onChange={e => setPw(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = '#4CAF50'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              ))}
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              {msg && <div style={{ color: '#2E7D32', fontSize: 13, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} /> {msg}</div>}
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Admin quick-links */}
          {p.isAdmin && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Admin Quick Access</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link to="/app/users" style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: '#e8eef7', borderRadius: 10, border: '1px solid #1E4D7B22',
                    cursor: 'pointer', transition: 'background .2s',
                  }}>
                    <Users size={18} color="#1E4D7B" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1E4D7B' }}>User Management</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Create users, assign roles, toggle access</div>
                    </div>
                    <ExternalLink size={14} color="#1E4D7B" />
                  </div>
                </Link>
                <Link to="/app/reports" style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: '#e8f5e9', borderRadius: 10, border: '1px solid #4CAF5022',
                    cursor: 'pointer',
                  }}>
                    <FileText size={18} color="#4CAF50" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#2E7D32' }}>Platform Reports</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Activity logs, alert history, analytics</div>
                    </div>
                    <ExternalLink size={14} color="#4CAF50" />
                  </div>
                </Link>
              </div>
            </div>
          )}

          {/* Language switcher */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} /> Language / Ururimi / Langue
            </h2>
            <div style={{ display: 'flex', gap: 10 }}>
              {LANGUAGES.map(l => (
                <button key={l.code}
                  onClick={() => { setLang(l.code); localStorage.setItem('moome_lang', l.code); }}
                  className="btn"
                  style={{ padding: '10px 20px', fontSize: 13, fontWeight: lang === l.code ? 700 : 400, background: lang === l.code ? '#1E4D7B' : 'var(--bg)', color: lang === l.code ? '#fff' : 'var(--text-secondary)', border: `2px solid ${lang === l.code ? '#1E4D7B' : 'var(--border)'}`, borderRadius: 8 }}>
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
            {lang !== 'en' && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
                Full multilingual support is coming soon. Selected language has been saved.
              </p>
            )}
          </div>

          {/* Sign out */}
          <div className="card">
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Session</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Signed in as <strong>{user?.username}</strong> with role <strong style={{ color: ROLE_COLOR[user?.role] }}>{user?.role}</strong>.
            </p>
            <button onClick={logout} className="btn btn-danger">Sign Out</button>
          </div>
        </>
      )}

      {/* ── Permissions tab ── */}
      {activeTab === 'permissions' && (
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color={ROLE_COLOR[user?.role]} />
            Role: <span style={{ color: ROLE_COLOR[user?.role] }}>{user?.role}</span>
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {ROLE_DESC[user?.role]}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'View Dashboard',               allowed: p.canViewDashboard },
              { label: 'View Herd',                    allowed: p.canViewHerd },
              { label: 'Register New Cow',             allowed: p.canRegisterCow },
              { label: 'Update Cow Weight / Lactation',allowed: p.canUpdateWeight },
              { label: 'Update Health Status',         allowed: p.canUpdateHealthStatus },
              { label: 'Retire / Deactivate Cow',      allowed: p.canRetireCow },
              { label: 'Log Milk Records',             allowed: p.canLogMilk },
              { label: 'Log Feed / Nutrition Records', allowed: p.canLogFeed },
              { label: 'Add Environmental Readings',   allowed: p.canAddEnvReading },
              { label: 'Resolve Alerts',               allowed: p.canResolveAlert },
              { label: 'Create Health Alerts',         allowed: p.canCreateHealthAlert },
              { label: 'View Economics',               allowed: p.canViewEconomics },
              { label: 'View AI Predictions',          allowed: p.canViewPredictions },
              { label: 'View Health Risk Predictions', allowed: p.canViewHealthRisks },
              { label: 'Admin Reports',                allowed: p.canViewReports },
              { label: 'User Management',              allowed: p.canManageUsers },
            ].map(({ label, allowed }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 8,
                background: allowed ? '#f1f8f1' : '#f9f9f9',
                border: `1px solid ${allowed ? '#c8e6c9' : '#e0e0e0'}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: allowed ? '#4CAF50' : '#e0e0e0',
                  color: allowed ? '#fff' : '#999',
                }}>
                  {allowed ? '✓ Allowed' : '✗ Restricted'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

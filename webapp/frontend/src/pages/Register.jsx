import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { registerUser } from '../lib/api';
import RwandaLocationFields from '../components/RwandaLocationFields';

const ROLES = [
  { value: 'Farmer',       label: 'Farmer',        desc: 'Manage your own herd, milk, feed, and records' },
  { value: 'Veterinarian', label: 'Veterinarian',  desc: 'Monitor herd health and manage treatments' },
  { value: 'Technician',   label: 'IoT Technician', desc: 'Manage IoT devices and environment systems' },
];

const EMPTY = {
  username: '', password: '', confirmPassword: '', full_name: '', email: '', phone_number: '', role: 'Farmer',
};

export default function Register() {
  const [form, setForm] = useState(EMPTY);
  const [location, setLocation] = useState({});
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: registerUser,
    onError: (e) => setErr(e.response?.data?.detail || 'Registration failed. Please try again.'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    if (form.password !== form.confirmPassword) { setErr('Passwords do not match.'); return; }
    if (form.password.length < 6) { setErr('Password must be at least 6 characters.'); return; }

    const { confirmPassword, ...body } = form;
    mut.mutate({ ...body, ...location });
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 50%, #1B5E20 100%)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ textAlign: 'center', color: '#fff', marginBottom: 8 }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', background: '#4CAF50',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
            margin: '0 auto 14px', boxShadow: '0 8px 32px rgba(76,175,80,.4)',
          }}>🐄</div>
          <h1 style={{ fontWeight: 900, fontSize: 28, letterSpacing: .5, margin: 0 }}>Create Your Account</h1>
          <p style={{ opacity: .75, fontSize: 13, marginTop: 6 }}>Join MooMe Smart Farm — Rwanda 🇷🇼</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
          {mut.isSuccess ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle2 size={48} color="#4CAF50" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>Registration received</h2>
              <p style={{ fontSize: 14, color: '#5a6a7e', marginTop: 10, lineHeight: 1.6 }}>
                {mut.data?.message || "An administrator will review your account before you can sign in."}
              </p>
              <Link to="/login" style={{
                display: 'inline-block', marginTop: 20, padding: '11px 24px', borderRadius: 10,
                background: '#4CAF50', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
              }}>
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>Account details</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Jane Uwase" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Username *</label>
                  <input required value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    placeholder="jane_uwase" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                    placeholder="+250 7xx xxx xxx" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Password *</label>
                <div style={{ position: 'relative' }}>
                  <input required type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="At least 6 characters" style={{ ...inputStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4 }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Confirm Password *</label>
                <input required type={showPw ? 'text' : 'password'} value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Re-enter your password" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>I am a…</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ROLES.map(r => (
                    <label key={r.value} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 10, border: `2px solid ${form.role === r.value ? '#4CAF50' : '#e0e0e0'}`,
                      background: form.role === r.value ? '#f0fff0' : '#fff', cursor: 'pointer',
                    }}>
                      <input type="radio" name="role" value={r.value} checked={form.role === r.value}
                        onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: '#5a6a7e' }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 8, color: '#1a1a2e' }}>Farm location (optional)</h2>
              <RwandaLocationFields location={location} onChange={setLocation} />

              {err && (
                <div style={{ background: '#fde8e8', color: '#c62828', borderRadius: 8, padding: '10px 14px', fontSize: 13, border: '1px solid #f5c6c6' }}>
                  ⚠ {err}
                </div>
              )}

              <button type="submit" disabled={mut.isPending} style={{
                background: mut.isPending ? '#ccc' : '#4CAF50', color: '#fff', border: 'none', borderRadius: 10,
                padding: '13px', fontSize: 15, fontWeight: 700, cursor: mut.isPending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
              }}>
                {mut.isPending ? <><Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} /> Submitting…</> : 'Create Account'}
              </button>

              <div style={{
                padding: '12px 14px', background: '#f0f7ff', borderRadius: 8, fontSize: 12,
                color: '#1565c0', border: '1px solid #bbdefb',
              }}>
                <strong>Note:</strong> An administrator must approve your account before you can sign in.
              </div>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.75)', fontSize: 13 }}>
          Already have an account? <Link to="/login" style={{ color: '#fff', fontWeight: 700 }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: .5,
};
const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10, border: '2px solid #e0e0e0',
  fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

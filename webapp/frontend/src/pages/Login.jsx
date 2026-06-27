import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { getFarmInfo } from '../lib/api';

const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin', role: 'Full access', color: '#1E4D7B' },
  { label: 'Farmer', username: 'farmer1', role: 'Farm operations', color: '#4CAF50' },
  { label: 'Veterinarian', username: 'vet1', role: 'Health & medical', color: '#9C27B0' },
];

export default function Login() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [farm, setFarm] = useState(null);

  useEffect(() => {
    getFarmInfo().then(setFarm).catch(() => null);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(username, password);
  };

  const fillDemo = (u) => {
    setUsername(u);
    setPassword('moome2026');   // placeholder accounts accept any password
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 50%, #1B5E20 100%)',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', color: '#fff', marginBottom: 8 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: '#4CAF50',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 42, margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(76,175,80,.4)',
          }}>🐄</div>
          <h1 style={{ fontWeight: 900, fontSize: 32, letterSpacing: .5, margin: 0 }}>FarmCareServices</h1>
          <p style={{ opacity: .75, fontSize: 14, marginTop: 4, letterSpacing: 1 }}>
            {farm?.farm_name || 'IoT-AI Smart Dairy Farm Platform'}
          </p>
          <p style={{ opacity: .5, fontSize: 11, marginTop: 2, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {farm?.location || 'Rwanda'}
          </p>
        </div>

        {/* Login card */}
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 24px 64px rgba(0,0,0,.25)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: '#1a1a2e' }}>
            Sign in to your farm
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Username */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
                style={{
                  width: '100%', padding: '11px 14px',
                  borderRadius: 10, border: '2px solid #e0e0e0',
                  fontSize: 14, outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color .2s',
                }}
                onFocus={e => e.target.style.borderColor = '#4CAF50'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#5a6a7e', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%', padding: '11px 44px 11px 14px',
                    borderRadius: 10, border: '2px solid #e0e0e0',
                    fontSize: 14, outline: 'none', fontFamily: 'inherit',
                    transition: 'border-color .2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#4CAF50'}
                  onBlur={e => e.target.style.borderColor = '#e0e0e0'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <Link
                  to="/forgot-password"
                  style={{ fontSize: 12, color: '#1E4D7B', textDecoration: 'none', fontWeight: 600 }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#fde8e8', color: '#c62828',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                border: '1px solid #f5c6c6',
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                background: loading ? '#ccc' : '#4CAF50',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '13px', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .2s',
                fontFamily: 'inherit',
              }}
            >
              {loading ? <><Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} /> Signing in…</> : '→ Sign In'}
            </button>
          </form>

          {/* First-run note */}
          <div style={{
            marginTop: 20, padding: '12px 14px',
            background: '#f0f7ff', borderRadius: 8, fontSize: 12,
            color: '#1565c0', border: '1px solid #bbdefb',
          }}>
            <strong>First run:</strong> Demo accounts accept any password.
            After login, change your password in Settings.
          </div>
        </div>

        {/* Demo account quick-fill */}
        <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: 16 }}>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Quick access — demo accounts
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DEMO_ACCOUNTS.map(a => (
              <button
                key={a.username}
                onClick={() => fillDemo(a.username)}
                style={{
                  background: a.color, color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: 1, transition: 'opacity .2s',
                }}
              >
                <span>{a.label}</span>
                <span style={{ opacity: .75, fontSize: 10 }}>{a.role}</span>
              </button>
            ))}
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
          {farm?.farm_name ? `${farm.farm_name} · ` : 'FarmCareServices · '}{farm?.location || 'Rwanda'} 🇷🇼
        </p>
      </div>
    </div>
  );
}

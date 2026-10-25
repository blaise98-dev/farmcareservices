import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { getFarmInfo } from '../lib/api';

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
          <Link to="/" style={{ display: 'inline-block', textDecoration: 'none' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#4CAF50', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 42, margin: '0 auto 16px',
              boxShadow: '0 8px 32px rgba(76,175,80,.4)',
            }}><img src="/images/farmcare-logo.svg" alt="FarmCare" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} /></div>
          </Link>
          <h1 style={{ fontWeight: 900, fontSize: 32, letterSpacing: .5, margin: 0 }}>FarmCare</h1>
          <p style={{ opacity: .75, fontSize: 14, marginTop: 4, letterSpacing: 1 }}>
            {farm?.farm_name || 'IoT-AI Smart Dairy Farm Platform'}
          </p>
          <p style={{ opacity: .5, fontSize: 11, marginTop: 2, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {farm?.location || 'Rwanda'}
          </p>
        </div>

        {/* Login card */}
        <div style={{
          background: 'var(--card)',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 24px 64px rgba(0,0,0,.25)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: 'var(--text)' }}>
            Sign in to your farm
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Username */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username here"
                required
                autoFocus
                style={{
                  width: '100%', padding: '11px 14px',
                  borderRadius: 10, border: '2px solid var(--border)',
                  fontSize: 14, outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color .2s',
                }}
                onFocus={e => e.target.style.borderColor = '#4CAF50'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>
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
                    borderRadius: 10, border: '2px solid var(--border)',
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
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4,
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <Link
                  to="/forgot-password"
                  style={{ fontSize: 12, color: 'var(--navy-ink)', textDecoration: 'none', fontWeight: 600 }}
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'var(--tint-red)', color: '#c62828',
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
            background: 'var(--tint-blue)', borderRadius: 8, fontSize: 12,
            color: '#1565c0', border: '1px solid #bbdefb',
          }}>
            <strong>First run:</strong> Demo accounts accept any password.
            After login, change your password in Settings.
          </div>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#4CAF50', fontWeight: 700, textDecoration: 'none' }}>
              Register here
            </Link>
          </div>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: 11 }}>
          {farm?.farm_name ? `${farm.farm_name} · ` : 'FarmCare · '}{farm?.location || 'Rwanda'} 🇷🇼
        </p>
      </div>
    </div>
  );
}

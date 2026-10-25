import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { resetPassword, validateResetToken } from '../lib/api';

const shell = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 50%, #1B5E20 100%)',
  padding: 20,
};

const card = {
  background: 'var(--card)',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 24px 64px rgba(0,0,0,.25)',
  width: '100%',
  maxWidth: 420,
};

const inputStyle = {
  width: '100%',
  padding: '11px 44px 11px 14px',
  borderRadius: 10,
  border: '2px solid var(--border)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .2s',
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  // No token means nothing to validate: start already resolved instead of
  // setting state synchronously inside the effect below.
  const [validating, setValidating] = useState(!!token);
  const [tokenValid, setTokenValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    validateResetToken(token)
      .then(res => setTokenValid(res.valid))
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#4CAF50', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, margin: '0 auto 12px',
            boxShadow: '0 8px 32px rgba(76,175,80,.4)',
          }}><img src="/images/farmcare-logo.svg" alt="FarmCare" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} /></div>
          <h1 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>FarmCare</h1>
        </div>

        <div style={card}>
          <Link
            to="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'none', marginBottom: 16,
            }}
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>

          {validating ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
              <Loader2 size={24} style={{ animation: 'spin .7s linear infinite' }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>Verifying reset link…</p>
            </div>
          ) : done ? (
            <div style={{
              background: 'var(--tint-green)', color: 'var(--green-ink)',
              borderRadius: 10, padding: '16px 18px',
              fontSize: 14, border: '1px solid #c8e6c9',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <CheckCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Password updated!</strong>
                <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                  Your password has been reset. Redirecting to sign in…
                </p>
              </div>
            </div>
          ) : !tokenValid ? (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                Invalid or expired link
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                This password reset link is no longer valid. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                style={{
                  display: 'inline-block',
                  background: '#4CAF50', overflow: 'hidden', color: '#fff',
                  padding: '12px 20px', borderRadius: 10,
                  fontWeight: 700, fontSize: 14, textDecoration: 'none',
                }}
              >
                Request new link
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
                Set a new password
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                Choose a strong password with at least 10 characters.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                    display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5,
                  }}>
                    New password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      minLength={10}
                      autoFocus
                      style={inputStyle}
                      onFocus={e => { e.target.style.borderColor = '#4CAF50'; }}
                      onBlur={e => { e.target.style.borderColor = '#e0e0e0'; }}
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
                </div>

                <div>
                  <label style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                    display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5,
                  }}>
                    Confirm password
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    minLength={10}
                    style={{ ...inputStyle, padding: '11px 14px' }}
                    onFocus={e => { e.target.style.borderColor = '#4CAF50'; }}
                    onBlur={e => { e.target.style.borderColor = '#e0e0e0'; }}
                  />
                </div>

                {error && (
                  <div style={{
                    background: 'var(--tint-red)', color: '#c62828',
                    borderRadius: 8, padding: '10px 14px',
                    fontSize: 13, border: '1px solid #f5c6c6',
                  }}>
                    ⚠ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !password || !confirm}
                  style={{
                    background: loading ? '#ccc' : '#4CAF50',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '13px', fontSize: 15, fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit',
                  }}
                >
                  {loading
                    ? <><Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} /> Saving…</>
                    : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

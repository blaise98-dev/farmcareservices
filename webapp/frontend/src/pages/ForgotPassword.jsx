import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';
import { requestPasswordReset } from '../lib/api';

const shell = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 50%, #1B5E20 100%)',
  padding: 20,
};

const card = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 24px 64px rgba(0,0,0,.25)',
  width: '100%',
  maxWidth: 420,
};

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '2px solid #e0e0e0',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .2s',
};

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(identifier.trim());
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
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
            background: '#4CAF50',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, margin: '0 auto 12px',
            boxShadow: '0 8px 32px rgba(76,175,80,.4)',
          }}>🐄</div>
          <h1 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>MooMe</h1>
        </div>

        <div style={card}>
          <Link
            to="/login"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: '#5a6a7e', fontSize: 13, textDecoration: 'none', marginBottom: 16,
            }}
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>

          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#1a1a2e' }}>
            Forgot your password?
          </h2>
          <p style={{ fontSize: 14, color: '#5a6a7e', marginBottom: 24, lineHeight: 1.5 }}>
            Enter your email or username. If an account exists with an email on file,
            we&apos;ll send you a reset link.
          </p>

          {sent ? (
            <div style={{
              background: '#e8f5e9', color: '#2e7d32',
              borderRadius: 10, padding: '16px 18px',
              fontSize: 14, border: '1px solid #c8e6c9',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <Mail size={20} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Check your inbox</strong>
                <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                  If an account with that email exists, a password reset link has been sent.
                  The link expires in 60 minutes.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{
                  fontSize: 12, fontWeight: 700, color: '#5a6a7e',
                  display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5,
                }}>
                  Email or username
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="you@example.com or farmer1"
                  required
                  autoFocus
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#4CAF50'; }}
                  onBlur={e => { e.target.style.borderColor = '#e0e0e0'; }}
                />
              </div>

              {error && (
                <div style={{
                  background: '#fde8e8', color: '#c62828',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 13, border: '1px solid #f5c6c6',
                }}>
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !identifier.trim()}
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
                  ? <><Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} /> Sending…</>
                  : 'Send reset link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

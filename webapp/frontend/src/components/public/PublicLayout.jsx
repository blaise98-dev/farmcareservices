import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Mail, Phone, MapPin } from 'lucide-react';

const NAV = [
  { to: '/',         label: 'Home' },
  { to: '/about',    label: 'About Us' },
  { to: '/partners', label: 'Partners' },
  { to: '/contact',  label: 'Contact Us' },
];

export function PublicHeader() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#fff', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1160, margin: '0 auto', padding: '0 24px',
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#4CAF50',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🐄</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 19, color: '#1a1a2e', letterSpacing: .3 }}>MooMe</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: -3 }}>Smart Farm</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="public-nav-desktop">
          {NAV.map(n => (
            <Link key={n.to} to={n.to} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: 'none',
              color: pathname === n.to ? '#2E7D32' : '#5a6a7e',
              background: pathname === n.to ? 'rgba(76,175,80,.12)' : 'transparent',
            }}>
              {n.label}
            </Link>
          ))}
          <Link to="/login" style={{
            marginLeft: 12, padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            textDecoration: 'none', color: '#1E4D7B', border: '2px solid #1E4D7B',
          }}>
            Sign In
          </Link>
          <Link to="/register" style={{
            padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            textDecoration: 'none', color: '#fff', background: '#4CAF50',
          }}>
            Get Started
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          className="public-nav-toggle"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="public-nav-mobile" style={{ borderTop: '1px solid var(--border)', padding: '12px 24px', display: 'none', flexDirection: 'column', gap: 4 }}>
          {NAV.map(n => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 15, fontWeight: 600,
              textDecoration: 'none', color: pathname === n.to ? '#2E7D32' : '#333',
            }}>
              {n.label}
            </Link>
          ))}
          <Link to="/login" onClick={() => setOpen(false)} style={{ padding: '10px 12px', fontSize: 15, fontWeight: 700, color: '#1E4D7B', textDecoration: 'none' }}>Sign In</Link>
          <Link to="/register" onClick={() => setOpen(false)} style={{ padding: '10px 12px', fontSize: 15, fontWeight: 700, color: '#4CAF50', textDecoration: 'none' }}>Get Started</Link>
        </div>
      )}

      <style>{`
        @media (max-width: 860px) {
          .public-nav-desktop { display: none !important; }
          .public-nav-toggle { display: block !important; }
          .public-nav-mobile { display: flex !important; }
        }
      `}</style>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer style={{ background: '#0f2a1f', color: 'rgba(255,255,255,.85)', marginTop: 80 }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '56px 24px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>🐄</div>
            <span style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>MooMe</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.7, opacity: .75, maxWidth: 260 }}>
            Affordable AI-IoT dairy farm management for smallholder farmers across Africa.
          </p>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#81C784', marginBottom: 14 }}>Navigate</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {NAV.map(n => (
              <Link key={n.to} to={n.to} style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', textDecoration: 'none' }}>{n.label}</Link>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#81C784', marginBottom: 14 }}>Account</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/login" style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', textDecoration: 'none' }}>Sign In</Link>
            <Link to="/register" style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', textDecoration: 'none' }}>Register</Link>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#81C784', marginBottom: 14 }}>Contact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, opacity: .85 }}>
            <a href="mailto:info@moome.com" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} /> info@moome.com
            </a>
            <a href="tel:+250780000001" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={14} /> +250 780 000 001
            </a>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={14} /> Kigali, Rwanda 🇷🇼
            </span>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', padding: '18px 24px', textAlign: 'center', fontSize: 12, opacity: .5 }}>
        © {new Date().getFullYear()} MooMe · FarmCareServices. All rights reserved.
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <PublicHeader />
      <main style={{ flex: 1 }}>{children}</main>
      <PublicFooter />
    </div>
  );
}

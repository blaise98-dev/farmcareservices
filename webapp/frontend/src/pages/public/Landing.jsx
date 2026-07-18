import { Link } from 'react-router-dom';
import PublicLayout from '../../components/public/PublicLayout';
import {
  Thermometer, Droplets, Wind, HeartPulse, MapPin, Activity,
  Bell, TrendingUp, ShieldCheck, Smartphone, Sun, Wifi, ArrowRight,
} from 'lucide-react';

const FEATURES = [
  { icon: Thermometer, color: '#FF9800', title: 'Health Monitoring', desc: 'Non-contact temperature sensors and RFID collars track every animal’s body temperature and vitals without disturbing them.' },
  { icon: Droplets,     color: '#00BCD4', title: 'Milk Production',  desc: 'Smart milk meters record volume per session, per cow — with automated income calculation and yield predictions.' },
  { icon: Wind,         color: '#4CAF50', title: 'Environment Control', desc: 'Temperature, humidity, and air-quality sensors trigger automatic fans and cooling sprays to keep the barn comfortable.' },
  { icon: HeartPulse,   color: '#E91E63', title: 'Vitals & Wearables', desc: 'Heart rate, SpO2, and motion tracking via wearable collars catch early signs of illness or distress.' },
  { icon: MapPin,       color: '#3F51B5', title: 'GPS Location',     desc: 'Know where every animal is, in real time, with GPS-enabled collar tags.' },
  { icon: Bell,         color: '#F44336', title: 'Smart Alerts',     desc: 'SMS and dashboard alerts the moment something needs attention — fever, low water, poor air quality, and more.' },
  { icon: TrendingUp,   color: '#9C27B0', title: 'AI Predictions',   desc: 'Forecast milk yield and detect early disease risk so you can act before problems become serious.' },
  { icon: Activity,     color: '#009688', title: 'Feed & Water',     desc: 'Automated feeding and watering per animal, with intake tracked and analyzed for optimal nutrition.' },
];

const STATS = [
  { value: '4', label: 'Countries deployed', sub: 'Kenya · Uganda · Nigeria · Tunisia' },
  { value: '$2,000', label: 'Per-farm hardware cost', sub: 'vs. $10,000–$50,000 for imported systems' },
  { value: '1–20', label: 'Cows per smallholder farm', sub: 'Built for Rwanda’s real farm sizes' },
  { value: '24/7', label: 'Monitoring, even offline', sub: 'GSM + solar backup keep it running' },
];

export default function Landing() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 50%, #1B5E20 100%)',
        color: '#fff', padding: '96px 24px 120px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            background: 'rgba(255,255,255,.12)', borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 24,
          }}>
            🇷🇼 Built for Rwanda's smallholder dairy farmers
          </div>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, lineHeight: 1.1, maxWidth: 780, margin: 0 }}>
            Affordable AI-IoT dairy farm management, made for real farms.
          </h1>
          <p style={{ fontSize: 18, opacity: .85, maxWidth: 620, marginTop: 20, lineHeight: 1.6 }}>
            MooMe monitors every cow's health, milk production, feed, and environment in real time —
            so smallholder farmers can increase yield and catch problems early, without $50,000 hardware
            or a reliable internet connection.
          </p>
          <div style={{ display: 'flex', gap: 14, marginTop: 36, flexWrap: 'wrap' }}>
            <Link to="/register" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 10,
              background: '#4CAF50', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
              boxShadow: '0 8px 24px rgba(76,175,80,.4)',
            }}>
              Get Started <ArrowRight size={17} />
            </Link>
            <Link to="/about" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 10,
              background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 700, fontSize: 15,
              textDecoration: 'none', border: '2px solid rgba(255,255,255,.3)',
            }}>
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px', marginTop: -56, position: 'relative', zIndex: 2 }}>
        <div style={{
          background: '#fff', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,.12)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 0, overflow: 'hidden',
        }}>
          {STATS.map((s, i) => (
            <div key={s.label} style={{
              padding: '32px 24px', textAlign: 'center',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#2E7D32' }}>{s.value}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '100px 24px 40px' }}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4CAF50', textTransform: 'uppercase', letterSpacing: 1.5 }}>What MooMe does</span>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 900, color: '#1a1a2e', marginTop: 10 }}>
            One dashboard for the whole farm
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.6 }}>
            From individual animal vitals to barn-wide environment control, MooMe brings IoT sensors,
            automation, and AI together in a single, easy-to-use platform.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
          {FEATURES.map(f => (
            <div key={f.title} className="card" style={{ borderTop: `4px solid ${f.color}` }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: `${f.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <f.icon size={22} color={f.color} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why MooMe */}
      <section style={{ background: '#f7faf7', padding: '100px 24px', marginTop: 60 }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4CAF50', textTransform: 'uppercase', letterSpacing: 1.5 }}>Why MooMe</span>
            <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: '#1a1a2e', marginTop: 10, lineHeight: 1.25 }}>
              Global platforms weren't built for Rwanda's farms. MooMe was.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.7 }}>
              Existing AI-enabled farm systems cost $10,000–$50,000 to install and depend on stable
              broadband. Rwanda's smallholder farmers — typically running 1 to 20 cows — need something
              built for their reality: affordable hardware, offline resilience, and a mobile-first
              interface that requires minimal training.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 28 }}>
              {[
                { icon: Smartphone, text: 'Runs on standard Android smartphones' },
                { icon: Wifi,       text: 'SMS and GSM keep you connected even without internet' },
                { icon: Sun,        text: 'Solar backup for continuous operation' },
                { icon: ShieldCheck,text: 'Field-validated across Kenya, Uganda, Nigeria, and Tunisia' },
              ].map(i => (
                <div key={i.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(76,175,80,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i.icon size={16} color="#2E7D32" />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{i.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #4CAF50, #1B5E20)', borderRadius: 20, padding: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320,
            boxShadow: '0 24px 64px rgba(0,0,0,.15)',
          }}>
            <span style={{ fontSize: 120 }}>🐄</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 900, margin: '100px auto', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 900, color: '#1a1a2e' }}>
          Ready to modernize your farm?
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 12 }}>
          Create an account to get started. An administrator will review and approve your access.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <Link to="/register" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 10,
            background: '#4CAF50', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none',
          }}>
            Create Account <ArrowRight size={17} />
          </Link>
          <Link to="/contact" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 10,
            border: '2px solid #1E4D7B', color: '#1E4D7B', fontWeight: 700, fontSize: 15, textDecoration: 'none',
          }}>
            Talk to Us
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

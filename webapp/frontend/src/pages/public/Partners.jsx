import PublicLayout from '../../components/public/PublicLayout';
import { Cpu, Landmark, Users2, ScrollText, Handshake } from 'lucide-react';

const PARTNERS = [
  {
    icon: Cpu, color: '#1E4D7B',
    name: 'ACTION FAMILY TECH LTD',
    role: 'Technology Partner',
    desc: 'Registered with the Rwanda Development Board (RDB), ACTION FAMILY TECH LTD leads the design, development, and deployment of the MooMe web application, IoT infrastructure, and AI-powered systems.',
  },
  {
    icon: Handshake, color: '#4CAF50',
    name: 'WOREX Ltd.',
    role: 'World Research and Extension',
    desc: 'WOREX Ltd. drives the project\'s field research, farmer extension, and implementation strategy across target districts in Eastern and Northern Rwanda.',
  },
  {
    icon: Landmark, color: '#9C27B0',
    name: 'Rwanda Agriculture Board (RAB)',
    role: 'Co-Implementing Government Partner',
    desc: 'RAB contributes extension services, policy alignment, and data-sharing infrastructure as a co-implementing government partner.',
  },
  {
    icon: ScrollText, color: '#FF9800',
    name: 'MINAGRI',
    role: 'Policy & Regulatory Anchor',
    desc: 'The Ministry of Agriculture and Animal Resources anchors the project within Rwanda\'s National Agricultural Policy and the National Strategy for Transformation (NST2).',
  },
  {
    icon: Users2, color: '#00838F',
    name: 'Food and Agriculture Organization (FAO)',
    role: 'Funding Partner',
    desc: 'The FAO\'s mandate on climate-smart agriculture and sustainable livestock systems aligns directly with MooMe\'s objectives for smallholder dairy farmers.',
  },
];

export default function Partners() {
  return (
    <PublicLayout>
      <section style={{
        background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 100%)', color: '#fff',
        padding: '80px 24px 64px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8 }}>Our Partners</span>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, marginTop: 12 }}>
          A multi-stakeholder partnership for lasting impact
        </h1>
        <p style={{ fontSize: 15, opacity: .8, marginTop: 12, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          MooMe combines technology innovation, government authority, and international support to deliver
          measurable, lasting impact for Rwanda's dairy farmers.
        </p>
      </section>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
          {PARTNERS.map(p => (
            <div key={p.name} className="card" style={{ borderTop: `4px solid ${p.color}` }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12, background: `${p.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <p.icon size={22} color={p.color} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>{p.name}</h3>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: .5 }}>{p.role}</span>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.65 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: '#f7faf7', marginTop: 56, padding: '64px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>Anchored in national policy</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 14 }}>
            This partnership is anchored in Rwanda's National Agricultural Policy, the National Strategy for
            Transformation (NST2, 2024–2029), and Rwanda's Nationally Determined Contributions (NDCs) under the
            Paris Agreement — mandating a transition to digital, climate-smart, and productivity-enhancing
            agricultural practices across the country.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 700, margin: '0 auto', padding: '64px 24px 100px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>Interested in partnering with us?</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>
          We're always open to collaborating with organizations working toward the same goal.
        </p>
        <a href="/contact" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 20, padding: '12px 26px',
          borderRadius: 10, background: '#4CAF50', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
        }}>
          Get in Touch
        </a>
      </section>
    </PublicLayout>
  );
}

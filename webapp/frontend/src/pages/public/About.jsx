import PublicLayout from '../../components/public/PublicLayout';
import { Target, TrendingDown, Globe2, CheckCircle2 } from 'lucide-react';

const COUNTRIES = [
  { flag: '🇰🇪', name: 'Kenya', context: 'Smallholder dairy farms in Rift Valley; mixed agro-pastoral systems', validation: 'IoT sensor accuracy for milk yield; mobile app adoption by low-literacy farmers' },
  { flag: '🇺🇬', name: 'Uganda', context: 'Cooperative dairy farming clusters; Western Uganda highlands', validation: 'Group-based feed management; multi-farm data aggregation' },
  { flag: '🇳🇬', name: 'Nigeria', context: 'Mixed-scale commercial and smallholder operations', validation: 'Scalability across farm sizes and regional infrastructure variance' },
  { flag: '🇹🇳', name: 'Tunisia', context: 'North African dairy sector with different regulatory context', validation: 'Cross-regional adaptability of the platform and reporting tools' },
];

const MODULES = [
  'Milk Production — daily recording of volumes sold, consumed, lost, and fed to calves, with automated income calculation in RWF',
  'Feed & Fodder Management — feed consumption tracking by animal group with inventory integration',
  'Herd Management — real-time monitoring of production cows, heifers, calves, dry cows, fattening and sick animals',
  'Reproductive Management — calving records, lactation days, and gestation tracking per animal',
  'Farm Economics & Income — financial recording including calf sales, bull sales, manure, culling, and other income streams',
  'Inventory Control — tracking for farm supplies and equipment',
  'Reports & Analysis — farm-level analytics for data-driven decisions',
  'Weekly Planning — structured planning for feed, health, and reproductive management',
];

export default function About() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #1E4D7B 0%, #2E7D32 100%)', color: '#fff',
        padding: '80px 24px 64px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8 }}>About Us</span>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, marginTop: 12, maxWidth: 780, marginLeft: 'auto', marginRight: 'auto' }}>
          Bringing precision dairy farming within reach for smallholder farmers
        </h1>
      </section>

      {/* Problem */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px 0' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          <TrendingDown size={26} color="#F44336" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>The problem</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 10 }}>
              Rwanda's dairy sector plays a critical role in national food security, rural livelihoods, and
              agricultural GDP. Yet the vast majority of Rwanda's dairy farmers — particularly smallholder
              producers operating with 1 to 20 cows — still rely on manual, paper-based record-keeping or no
              formal records at all. This leads to poor herd tracking, inefficient feed management, missed
              reproductive cycles, underestimated production costs, and ultimately reduced farm profitability.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 14 }}>
              Digital farm-management tools exist — but the solutions on the global market, originating from
              Europe, North America, or large commercial operations, come at a prohibitive cost ($10,000–$50,000
              per farm), require stable high-speed internet, and aren't adapted to the smallholder farming
              context in Sub-Saharan Africa.
            </p>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '56px 24px 0' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Target size={26} color="#4CAF50" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>What MooMe is</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 10 }}>
              MooMe is an AI-powered, IoT-integrated dairy farm management platform, developed and refined
              through field deployment across multiple African countries. It is purpose-built for smallholder
              and mid-scale dairy farms operating in environments with limited infrastructure.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 14 }}>
              Unlike its expensive counterparts, MooMe runs on standard Android smartphones, integrates with
              low-cost IoT sensor kits (approximately <strong>$2,000 per farm</strong>), and delivers actionable
              farm intelligence through an intuitive dashboard that requires minimal technical training. Each cow
              is uniquely identified via RFID tags or smart collars — non-contact sensors track body temperature
              without disturbing the animal, and environmental sensors monitor the cowshed for heat and poor
              ventilation. When conditions turn unhealthy, MooMe automatically activates cooling fans and water
              sprays to protect the herd.
            </p>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section style={{ maxWidth: 900, margin: '56px auto 0', padding: '0 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 20 }}>Core modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12 }}>
          {MODULES.map(m => {
            const [title, ...rest] = m.split(' — ');
            return (
              <div key={m} style={{ display: 'flex', gap: 10, padding: 16, background: '#f7faf7', borderRadius: 12 }}>
                <CheckCircle2 size={18} color="#4CAF50" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{rest.join(' — ')}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Track record */}
      <section style={{ background: '#f7faf7', marginTop: 72, padding: '72px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 36 }}>
            <Globe2 size={26} color="#1E4D7B" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>Proven track record — validated across Africa</h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 8, maxWidth: 700 }}>
                MooMe is not a prototype. It's an active platform with field-validated results across four
                reference countries, each presenting distinct dairy farming contexts and infrastructure challenges.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
            {COUNTRIES.map(c => (
              <div key={c.name} className="card">
                <div style={{ fontSize: 30, marginBottom: 10 }}>{c.flag}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>{c.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>{c.context}</p>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#4CAF50', textTransform: 'uppercase', letterSpacing: .5 }}>Key validation</span>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{c.validation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px 100px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>Based in Rwanda, built for Africa</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
          MooMe operates out of Kigali, Rwanda, working directly with smallholder dairy farmers to validate
          and improve the platform for local conditions — from Rwanda's cooperative farming clusters to
          nationwide dairy value chains.
        </p>
      </section>
    </PublicLayout>
  );
}

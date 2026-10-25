import PublicLayout from '../../components/public/PublicLayout';
import { Target, TrendingDown, CheckCircle2, Eye, Compass, HeartHandshake } from 'lucide-react';

const VALUES = [
  'Commitment to farmers’ prosperity and productivity',
  'Better decision making among livestock farmers',
  'Hardware and systems that raise productivity and support decisions',
  'Adding value for shareholders by focusing on key markets',
  'Innovation at the service of farming',
  'Bringing your farm into the future with innovative solutions',
];

const MODULES = [
  'Milk Production: daily recording of volumes sold, consumed, lost, and fed to calves, with automated income calculation in RWF',
  'Feed & Fodder Management: feed consumption tracking by animal group with inventory integration',
  'Herd Management: real-time monitoring of production cows, heifers, calves, dry cows, fattening and sick animals',
  'Reproductive Management: calving records, lactation days, and gestation tracking per animal',
  'Farm Economics & Income: financial recording including calf sales, bull sales, manure, culling, and other income streams',
  'Inventory Control: tracking for farm supplies and equipment',
  'Reports & Analysis: farm-level analytics for data-driven decisions',
  'Weekly Planning: structured planning for feed, health, and reproductive management',
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

      {/* Vision, mission and values */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 24px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
          <div className="card" style={{ borderTop: '4px solid #2E7D32' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Eye size={22} color="#2E7D32" />
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Our vision</h2>
            </div>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              To improve livestock production by transforming livestock farming, lifting millions of
              smallholder farmers in Africa out of poverty.
            </p>
          </div>
          <div className="card" style={{ borderTop: '4px solid #1E4D7B' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Compass size={22} color="#1E4D7B" />
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Our mission</h2>
            </div>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              To deliver services and solutions that give farmers the information they need to produce
              superior livestock and improve livestock performance, together with the hardware and systems
              that raise farm productivity and decision making, and to keep developing innovative solutions
              so farmers keep a competitive edge.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 12 }}>
              We work to make dairy farms more efficient and sustainable. Our IoT sensors and data analysis
              already track animal health in real time; heat detection and rumination monitoring are next.
              The aim is more profitable farms, with animal welfare at the centre.
            </p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <HeartHandshake size={22} color="#E65100" />
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Our values</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
            {VALUES.map(v => (
              <div key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle2 size={18} color="#4CAF50" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px 0' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          <TrendingDown size={26} color="#F44336" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>The problem</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 10 }}>
              Rwanda's dairy sector plays a critical role in national food security, rural livelihoods, and
              agricultural GDP. Yet the vast majority of Rwanda's dairy farmers, particularly smallholder
              producers, still rely on manual, paper-based record-keeping or no
              formal records at all. This leads to poor herd tracking, inefficient feed management, missed
              reproductive cycles, underestimated production costs, and ultimately reduced farm profitability.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 14 }}>
              Digital farm-management tools exist, but the solutions on the global market, originating from
              Europe, North America, or large commercial operations, are costly to buy and maintain, require
              stable high-speed internet, and aren't adapted to the smallholder farming
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
            <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>What FarmCare is</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 10 }}>
              FarmCare is an IoT-integrated dairy farm management platform by ACTION FAMILY TECH LTD, developed
              and tested with farmers in a working cowshed in Kanyinya, Nyarugenge. It is purpose-built for smallholder
              and mid-scale dairy farms operating in environments with limited infrastructure.
            </p>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 14 }}>
              FarmCare works in the browser on any phone or computer, connects to low-cost IoT sensor kits built
              by our team, and delivers actionable farm intelligence through an intuitive dashboard that requires
              minimal technical training. Each cow is uniquely identified via RFID tags or smart collars. Collar
              sensors track body temperature, heart rate and location without disturbing the animal, and environmental sensors monitor the cowshed for heat and poor
              ventilation. When conditions turn unhealthy, FarmCare automatically activates cooling fans and water
              sprays to protect the herd.
            </p>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section style={{ maxWidth: 900, margin: '56px auto 0', padding: '0 24px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>Core modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 12 }}>
          {MODULES.map(m => {
            const [title, ...rest] = m.split(': ');
            return (
              <div key={m} style={{ display: 'flex', gap: 10, padding: 16, background: 'var(--surface-2)', borderRadius: 12 }}>
                <CheckCircle2 size={18} color="#4CAF50" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{rest.join(': ')}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Location */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 24px 100px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Based in Rwanda, built for Africa</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: 12, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
          FarmCare operates out of Kigali, Rwanda, working directly with smallholder dairy farmers to validate
          and improve the platform for local conditions, from Rwanda's cooperative farming clusters to
          nationwide dairy value chains.
        </p>
      </section>
    </PublicLayout>
  );
}

import { useState } from 'react';
import { HelpCircle, Phone, Mail, MessageSquare, ChevronDown, ChevronRight, Book, Zap, Users, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const FAQS = [
  {
    category: 'Getting Started',
    icon: Zap,
    color: '#4CAF50',
    items: [
      { q: 'How do I add a new cow to the system?', a: 'Go to Herd → Cow Roster → click "Register Cow". Fill in the RFID tag, name, breed, birth date, weight and category. Only Farmers and Admins can register cows.' },
      { q: 'How do I record milk production?', a: 'Go to Milk Production → click "Record Milk". Select the cow, date, session (Morning/Evening), total litres, and optionally break it down into Sold, Consumed, Calves and Lost.' },
      { q: 'How do I log feed consumption?', a: 'Go to Feed & Fodder → click "Record Feeding". You can log per individual cow or per group. Vets can also add prescription notes.' },
    ],
  },
  {
    category: 'Herd & Health',
    icon: Book,
    color: '#9C27B0',
    items: [
      { q: 'What do the cow category tiles mean?', a: 'Production = lactating cows actively producing milk. Dry = cows in dry period before calving. Heifer = young female not yet calved. Calf = young animal under 1 year. Fattening = animals raised for beef.' },
      { q: 'How do I record a vaccination?', a: 'Go to Reproduction → Vaccinations tab → click "Add Vaccination". Only Vets and Admins can add vaccinations. You can also set the next due date.' },
      { q: 'How is the AI health risk % calculated?', a: 'The AI Predictions page uses body temperature trends, milk production changes, feeding behaviour and historical health events to estimate illness risk as a percentage over 1–3 days.' },
      { q: 'What is Body Condition Score (BCS)?', a: 'BCS is scored 1.0–5.0 where 3.5 is ideal. 1 = emaciated, 5 = obese. Record it in Reproduction → BCS tab. Vets and Admins can log BCS.' },
    ],
  },
  {
    category: 'IoT & Sensors',
    icon: Zap,
    color: '#FF9800',
    items: [
      { q: 'What sensors does MooMe use?', a: 'Each cow has: RFID tag (ID), Non-contact temperature sensor (body temp), Activity sensor (movement). The barn has: DHT22 (temp + humidity), MQ-135 (air quality/ammonia), Oxygen sensor, Smart milk meters, Load cells (feed), Water flow sensors.' },
      { q: 'How do I manually override a device?', a: 'Go to IoT Control. Technicians and Admins can turn fans on/off, change fan speed (25%/50%/75%/100%), control water pumps and feed motors.' },
      { q: 'How do I add a manual environment reading?', a: 'Go to Environment → click "Log Manual Reading". Enter temperature, humidity, air quality and oxygen values. Available to Admin and Technician roles.' },
      { q: 'How do I log a tank reading?', a: 'Go to Tanks → click "Log Reading". Select the tank, enter the current level in litres, and choose the action (Reading, Refill, or Drain).' },
    ],
  },
  {
    category: 'Alerts & Notifications',
    icon: Bell,
    color: '#F44336',
    items: [
      { q: 'How do SMS alerts work?', a: 'Critical and Emergency alerts trigger automatic SMS messages to registered phone numbers. Admins can manage subscribers under Settings → SMS Config.' },
      { q: 'Who can create manual alerts?', a: 'Any role can create alerts of type: Temperature, Air Quality, Feed, Water, Milk, System. Only Admins and Vets can create Health-type alerts.' },
      { q: 'How do I resolve an alert?', a: 'On the Alerts page, click "Resolve" next to any active alert. All roles can resolve alerts.' },
    ],
  },
  {
    category: 'User Roles',
    icon: Users,
    color: '#1E4D7B',
    items: [
      { q: 'What can a Farmer do?', a: 'Register cows, log milk and feed, manage groups, view economics, create alerts, manage weekly plan, use feed inventory, view environment.' },
      { q: 'What can a Veterinarian do?', a: 'View and update health status, log reproduction records (calving, insemination), add treatments and vaccinations, record BCS, view AI predictions, prescribe nutrition in feed.' },
      { q: 'What can a Technician do?', a: 'Add environmental readings, control IoT devices (fans, pumps, motors), log tank readings, log sensor calibrations, view economics.' },
      { q: 'What can an Admin do?', a: 'Full access to all features plus: user management (create, edit, delete, reset passwords), SMS alert configuration, platform reports, and all other features.' },
    ],
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '14px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit', textAlign: 'left', gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{q}</span>
        {open ? <ChevronDown size={16} color="var(--text-secondary)" /> : <ChevronRight size={16} color="var(--text-secondary)" />}
      </button>
      {open && (
        <div style={{ padding: '0 0 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Getting Started');

  const active = FAQS.find(c => c.category === activeCategory) || FAQS[0];
  const ActiveIcon = active.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)', borderRadius: 12, padding: '20px 24px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <HelpCircle size={28} />
          <div style={{ fontSize: 22, fontWeight: 800 }}>Help & Support</div>
        </div>
        <div style={{ fontSize: 13, opacity: .8 }}>
          MooMe IoT-AI Livestock Intelligence Platform — User Guide & FAQ
        </div>
        {user && <div style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>Signed in as <strong>{user.full_name || user.username}</strong> · Role: <strong>{user.role}</strong></div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Category sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FAQS.map(cat => {
            const CatIcon = cat.icon;
            return (
              <button key={cat.category} onClick={() => setActiveCategory(cat.category)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `2px solid ${activeCategory === cat.category ? cat.color : 'transparent'}`, background: activeCategory === cat.category ? `${cat.color}11` : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all .2s' }}>
                <CatIcon size={16} color={cat.color} />
                <span style={{ fontWeight: activeCategory === cat.category ? 700 : 500, fontSize: 13, color: activeCategory === cat.category ? cat.color : 'var(--text)' }}>{cat.category}</span>
              </button>
            );
          })}
        </div>

        {/* FAQ content */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '2px solid var(--border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${active.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ActiveIcon size={20} color={active.color} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: active.color }}>{active.category}</h2>
          </div>
          {active.items.map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>

      {/* Contact & Support */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
        {[
          { icon: Phone, color: '#4CAF50', title: 'Phone Support', detail: '+250 780 000 001', sub: 'Mon–Fri · 08:00–18:00 (CAT)', href: 'tel:+250780000001' },
          { icon: Mail,  color: '#1E4D7B', title: 'Email Support', detail: 'support@moome.rw', sub: 'Response within 24 hours', href: 'mailto:support@moome.rw' },
          { icon: MessageSquare, color: '#9C27B0', title: 'Send Feedback', detail: 'Report bugs or request features', sub: 'Answered by our team', href: '/feedback', isLink: true },
        ].map(({ icon: Icon, color, title, detail, sub, href, isLink }) => {
          const content = (
            <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', border: `1px solid ${color}22`, transition: 'box-shadow .2s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 20px ${color}22`}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={22} color={color} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
                <div style={{ fontSize: 13, color, fontWeight: 600, marginTop: 2 }}>{detail}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          );
          return isLink
            ? <Link key={title} to={href} style={{ textDecoration: 'none' }}>{content}</Link>
            : <a key={title} href={href} style={{ textDecoration: 'none' }}>{content}</a>;
        })}
      </div>

      {/* System info */}
      <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 14 }}>
        MooMe IoT-AI Livestock Intelligence Platform · Rwanda © 2024 · WOREX · v1.0.0
      </div>
    </div>
  );
}

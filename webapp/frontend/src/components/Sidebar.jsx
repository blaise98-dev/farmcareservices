import { NavLink } from 'react-router-dom';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  LayoutDashboard, Beef, Droplets, Leaf, Wind,
  Bell, TrendingUp, BarChart2, X, Wifi, WifiOff,
  Settings, LogOut, User, ShieldCheck, Users, FileText,
  HeartPulse, Activity, Stethoscope, Baby, Warehouse,
  CalendarDays, MessageSquare, Waves, Cpu, HelpCircle, Phone,
} from 'lucide-react';

const ROLE_COLOR    = { Admin: '#FFD700', Farmer: '#81C784', Veterinarian: '#CE93D8', Technician: '#FFCC80' };
const ROLE_BG       = { Admin: 'rgba(255,215,0,.15)', Farmer: 'rgba(129,199,132,.15)', Veterinarian: 'rgba(206,147,216,.15)', Technician: 'rgba(255,204,128,.15)' };

const ROLE_LABEL = {
  Admin:        '🛡 System Administrator',
  Farmer:       '🌾 Farm Operator',
  Veterinarian: '🩺 Veterinarian',
  Technician:   '⚙️ IoT Technician',
};

/**
 * Build role-specific nav items.
 * Same routes, but different display labels per role.
 * Items not in a role's list are completely absent from the DOM.
 */
function buildNav(p, role) {
  if (role === 'Farmer') {
    return [
      { to: '/',               icon: LayoutDashboard, label: 'Dashboard',       show: true },
      { to: '/herd',           icon: Beef,            label: 'My Cows',         show: true },
      { to: '/groups',         icon: Users,           label: 'Groups',          show: true },
      { to: '/milk',           icon: Droplets,        label: 'Milk Production', show: true },
      { to: '/feed',           icon: Leaf,            label: 'Feed & Fodder',   show: true },
      { to: '/feed-inventory', icon: Warehouse,       label: 'Feed Inventory',  show: true },
      { to: '/weekly-plan',    icon: CalendarDays,    label: 'Weekly Plan',     show: true },
      { to: '/environment',    icon: Wind,            label: 'Environment',     show: true },
      { to: '/alerts',         icon: Bell,            label: 'Alerts',          show: true, badge: true },
      { to: '/herd-analytics',  icon: BarChart2,       label: 'Herd Analytics',  show: true },
      { to: '/cow-economics',  icon: TrendingUp,      label: 'Cow Economics',   show: true },
      { to: '/feedback',       icon: MessageSquare,   label: 'Feedback',        show: true },
      { to: '/help',           icon: HelpCircle,      label: 'Help',            show: true },
      { to: '/settings',       icon: Settings,        label: 'Settings',        show: true },
    ];
  }

  if (role === 'Veterinarian') {
    return [
      { to: '/',               icon: LayoutDashboard, label: 'Dashboard',        show: true },
      { to: '/herd',           icon: Stethoscope,     label: 'Herd Health',      show: true },
      { to: '/reproduction',   icon: Baby,            label: 'Reproduction',     show: true },
      { to: '/milk',           icon: Droplets,        label: 'Milk Monitoring',  show: true },
      { to: '/feed',           icon: Leaf,            label: 'Nutrition & Feed', show: true },
      { to: '/environment',    icon: Wind,            label: 'Environment',      show: true },
      { to: '/alerts',         icon: Bell,            label: 'Alerts & Health',  show: true, badge: true },
      { to: '/herd-analytics',  icon: BarChart2,       label: 'Herd Analytics',   show: true },
      { to: '/cow-economics',  icon: TrendingUp,      label: 'Treatment Costs',  show: true },
      { to: '/predictions',    icon: TrendingUp,      label: 'AI Predictions',   show: true },
      { to: '/weekly-plan',    icon: CalendarDays,    label: 'Weekly Plan',      show: true },
      { to: '/feedback',       icon: MessageSquare,   label: 'Feedback',         show: true },
      { to: '/help',           icon: HelpCircle,      label: 'Help',             show: true },
      { to: '/settings',       icon: Settings,        label: 'Settings',         show: true },
    ];
  }

  if (role === 'Admin') {
    return [
      { to: '/',               icon: LayoutDashboard, label: 'Dashboard',        show: true },
      { to: '/herd',           icon: Beef,            label: 'Herd',             show: true },
      { to: '/groups',         icon: Users,           label: 'Groups',           show: true },
      { to: '/reproduction',   icon: Baby,            label: 'Reproduction',     show: true },
      { to: '/milk',           icon: Droplets,        label: 'Milk',             show: true },
      { to: '/feed',           icon: Leaf,            label: 'Feed',             show: true },
      { to: '/feed-inventory', icon: Warehouse,       label: 'Feed Inventory',   show: true },
      { to: '/environment',    icon: Wind,            label: 'Environment',      show: true },
      { to: '/tanks',          icon: Waves,           label: 'Tanks',            show: true },
      { to: '/iot-control',    icon: Cpu,             label: 'IoT Control',      show: true },
      { to: '/alerts',         icon: Bell,            label: 'Alerts',           show: true, badge: true },
      { to: '/herd-analytics',  icon: BarChart2,       label: 'Herd Analytics',   show: true },
      { to: '/cow-economics',  icon: TrendingUp,      label: 'Cow Economics',    show: true },
      { to: '/predictions',    icon: TrendingUp,      label: 'AI Predictions',   show: true },
      { to: '/weekly-plan',    icon: CalendarDays,    label: 'Weekly Plan',      show: true },
      { to: '/reports',        icon: FileText,        label: 'Reports',          show: true },
      { to: '/users',          icon: Users,           label: 'User Management',  show: true },
      { to: '/sms-config',     icon: Phone,           label: 'SMS Config',       show: true },
      { to: '/feedback',       icon: MessageSquare,   label: 'Feedback',         show: true },
      { to: '/help',           icon: HelpCircle,      label: 'Help',             show: true },
      { to: '/settings',       icon: Settings,        label: 'Settings',         show: true },
    ];
  }

  // Technician
  return [
    { to: '/',               icon: LayoutDashboard, label: 'Dashboard',   show: true },
    { to: '/environment',    icon: Wind,            label: 'Environment', show: true },
    { to: '/tanks',          icon: Waves,           label: 'Tanks',       show: true },
    { to: '/iot-control',    icon: Cpu,             label: 'IoT Control', show: true },
    { to: '/weekly-plan',    icon: CalendarDays,    label: 'Weekly Plan', show: true },
    { to: '/alerts',         icon: Bell,            label: 'Alerts',      show: true, badge: true },
    { to: '/help',           icon: HelpCircle,      label: 'Help',        show: true },
    { to: '/settings',       icon: Settings,        label: 'Settings',    show: true },
  ];
}

export default function Sidebar({ open, onClose }) {
  const { connected, alertsCount } = useRealtime();
  const { user, logout } = useAuth();
  const p = usePermissions();

  const NAV = buildNav(p, user?.role || '').filter(n => n.show);

  const roleColor = ROLE_COLOR[user?.role] || '#aaa';

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 199,
            display: typeof window !== 'undefined' && window.innerWidth < 768 ? 'block' : 'none',
          }}
        />
      )}

      <aside style={{
        width: 'var(--sidebar-w)',
        background: '#1E4D7B',
        color: '#fff',
        height: '100vh',
        position: 'fixed',
        top: 0, left: open ? 0 : 'calc(-1 * var(--sidebar-w))',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        transition: 'left .3s ease',
        boxShadow: '2px 0 20px rgba(0,0,0,.15)',
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{
          padding: '0 20px',
          height: 'var(--header-h)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,0,0,.2)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#4CAF50',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 20,
            }}>🐄</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: .5 }}>MooMe</div>
              <div style={{ fontSize: 10, opacity: .6, letterSpacing: 1 }}>SMART FARM</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* User badge + role chip */}
        {user && (
          <div style={{
            margin: '12px 12px 0', padding: '12px',
            background: ROLE_BG[user.role] || 'rgba(255,255,255,.08)',
            borderRadius: 12, flexShrink: 0,
            border: `1px solid ${roleColor}33`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: roleColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <User size={18} color="#1E4D7B" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.full_name || user.username}
                </div>
                <div style={{ fontSize: 10, opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{user.username}
                </div>
              </div>
            </div>
            {/* Role badge */}
            <div style={{
              marginTop: 10, padding: '5px 10px',
              background: `${roleColor}22`, borderRadius: 20,
              display: 'flex', alignItems: 'center', gap: 6,
              border: `1px solid ${roleColor}44`,
            }}>
              <ShieldCheck size={12} color={roleColor} />
              <span style={{ fontSize: 11, fontWeight: 700, color: roleColor }}>
                {ROLE_LABEL[user.role] || user.role}
              </span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to + label}
              to={to}
              end={to === '/'}
              onClick={() => window.innerWidth < 768 && onClose()}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 20px', margin: '2px 8px', borderRadius: 10,
                color: isActive ? '#fff' : 'rgba(255,255,255,.65)',
                background: isActive ? 'rgba(76,175,80,.25)' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: 14,
                transition: 'all .2s',
                borderLeft: isActive ? '3px solid #4CAF50' : '3px solid transparent',
                textDecoration: 'none',
              })}
            >
              <Icon size={18} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge && alertsCount > 0 && (
                <span style={{
                  background: '#F44336', color: '#fff',
                  borderRadius: 10, padding: '1px 7px',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {alertsCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '0 8px 8px', flexShrink: 0 }}>
          <button
            onClick={logout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, border: 'none',
              background: 'rgba(244,67,54,.15)', color: '#ef9a9a',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .2s',
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>

        {/* Connection status */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.1)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: connected ? '#81C784' : '#ef9a9a', flexShrink: 0,
        }}>
          {connected
            ? <><Wifi size={14} /> <span>Live — Realtime</span> <span className="live-dot" style={{ marginLeft: 'auto' }} /></>
            : <><WifiOff size={14} /> <span>Reconnecting…</span></>
          }
        </div>
      </aside>
    </>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Menu, Bell, RefreshCw, X, CheckCheck, Search } from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNotifications, getUnreadCount, markNotifRead, markAllNotifRead } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';

// ── Global search data ──────────────────────────────────────────────────────
const SEARCH_PAGES = [
  { label: 'Dashboard',        path: '/app',                icon: '📊', tags: ['home', 'overview', 'dashboard'] },
  { label: 'Herd Management',  path: '/app/herd',           icon: '🐄', tags: ['cows', 'herd', 'animals', 'cattle'] },
  { label: 'Milk Production',  path: '/app/milk',           icon: '🥛', tags: ['milk', 'litres', 'production', 'milking'] },
  { label: 'Feed & Fodder',    path: '/app/feed',           icon: '🌿', tags: ['feed', 'fodder', 'nutrition', 'silage'] },
  { label: 'Feed Inventory',   path: '/app/feed-inventory', icon: '🏚', tags: ['inventory', 'stock', 'dry matter', 'hay'] },
  { label: 'Reproduction',     path: '/app/reproduction',   icon: '🐣', tags: ['calving', 'pregnancy', 'vaccination', 'treatment', 'bcs'] },
  { label: 'Groups',           path: '/app/groups',         icon: '👥', tags: ['groups', 'herd groups', 'categories'] },
  { label: 'Environment',      path: '/app/environment',    icon: '🌡', tags: ['temperature', 'humidity', 'air quality', 'oxygen', 'sensor'] },
  { label: 'Tanks',            path: '/app/tanks',          icon: '🚰', tags: ['tanks', 'water', 'milk tank', 'level'] },
  { label: 'Alerts',           path: '/app/alerts',         icon: '🚨', tags: ['alerts', 'notifications', 'warnings', 'sms'] },
  { label: 'AI Predictions',   path: '/app/predictions',    icon: '🤖', tags: ['prediction', 'ai', 'forecast', 'health risk'] },
  { label: 'Weekly Plan',      path: '/app/weekly-plan',    icon: '📅', tags: ['tasks', 'schedule', 'weekly', 'plan', 'calendar'] },
  { label: 'IoT Control',      path: '/app/iot-control',    icon: '⚙️', tags: ['iot', 'fan', 'pump', 'motor', 'device', 'control', 'calibration'] },
  { label: 'Economics',        path: '/app/economics',      icon: '💰', tags: ['revenue', 'cost', 'roi', 'economics', 'income'] },
  { label: 'Reports',          path: '/app/reports',        icon: '📋', tags: ['reports', 'analytics', 'export', 'csv', 'pdf'] },
  { label: 'User Management',  path: '/app/users',          icon: '👤', tags: ['users', 'accounts', 'roles', 'admin'] },
  { label: 'SMS Config',       path: '/app/sms-config',     icon: '📱', tags: ['sms', 'phone', 'alerts', 'notifications'] },
  { label: 'Feedback',         path: '/app/feedback',       icon: '💬', tags: ['feedback', 'support', 'bug', 'feature'] },
  { label: 'Help & Support',   path: '/app/help',           icon: '❓', tags: ['help', 'faq', 'contact', 'support', 'guide'] },
  { label: 'Settings',         path: '/app/settings',       icon: '⚙', tags: ['settings', 'password', 'profile', 'language'] },
];

function SearchResults({ query, onSelect, navigate }) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    return (
      <div style={{ padding: '10px 16px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Quick Navigation</div>
        {SEARCH_PAGES.slice(0, 6).map(p => (
          <div key={p.path} onClick={() => { navigate(p.path); onSelect(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            <span style={{ fontWeight: 500 }}>{p.label}</span>
          </div>
        ))}
      </div>
    );
  }
  const results = SEARCH_PAGES.filter(p =>
    p.label.toLowerCase().includes(q) || p.tags.some(t => t.includes(q))
  );
  return (
    <div style={{ maxHeight: 320, overflowY: 'auto', padding: '8px 0' }}>
      {results.length === 0
        ? <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>No results for "{query}"</div>
        : results.map(p => (
          <div key={p.path} onClick={() => { navigate(p.path); onSelect(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{p.icon}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.path}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}

const TITLES = {
  '/app':                'Dashboard',
  '/app/herd':           'Herd Management',
  '/app/milk':           'Milk Production',
  '/app/feed':           'Feed & Fodder',
  '/app/feed-inventory': 'Feed Inventory',
  '/app/environment':    'Environment Monitoring',
  '/app/alerts':         'Alerts & Notifications',
  '/app/economics':      'Farm Economics',
  '/app/predictions':    'AI Predictions',
  '/app/reproduction':   'Reproduction & Health',
  '/app/groups':         'Animal Groups',
  '/app/tanks':          'Tanks & Water',
  '/app/weekly-plan':    'Weekly Plan',
  '/app/feedback':       'Feedback',
  '/app/settings':       'Settings',
  '/app/reports':        'Reports',
  '/app/users':          'User Management',
};

const ROLE_COLOR = { Admin: '#FFD700', Farmer: '#81C784', Veterinarian: '#CE93D8', Technician: '#FFCC80' };
const TYPE_COLOR = { Alert: '#F44336', Reminder: '#FF9800', System: '#607D8B', Info: '#1E4D7B' };

export default function Header({ onMenuClick }) {
  const { env, alertsCount, connected } = useRealtime();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs]   = useState(false);
  const [showSearch, setShowSearch]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const panelRef  = useRef(null);
  const searchRef = useRef(null);
  const qc = useQueryClient();

  const title = Object.entries(TITLES)
    .filter(([path]) => pathname === path || (path !== '/app' && pathname.startsWith(path)))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] || 'MooMe';

  const { data: notifications = [] } = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 30000 });
  const { data: unreadData }         = useQuery({ queryKey: ['notif-unread'],   queryFn: getUnreadCount,    refetchInterval: 30000 });
  const unread = unreadData?.count ?? 0;

  const readMut    = useMutation({ mutationFn: markNotifRead,   onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readAllMut = useMutation({ mutationFn: markAllNotifRead, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  // Close panels on outside click
  useEffect(() => {
    if (!showNotifs && !showSearch) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowNotifs(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs, showSearch]);

  return (
    <header style={{
      height: 'var(--header-h)', background: '#4CAF50',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,.15)', position: 'sticky',
      top: 0, zIndex: 100, color: '#fff', flexShrink: 0,
    }}>
      <button onClick={onMenuClick} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 6, borderRadius: 6, flexShrink: 0 }}>
        <Menu size={22} />
      </button>

      <h1 style={{ flex: 1, fontSize: 17, fontWeight: 700, letterSpacing: .3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </h1>

      {/* Live env readout */}
      {env && (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: .95, background: 'rgba(0,0,0,.15)', borderRadius: 20, padding: '5px 14px', flexShrink: 0 }}>
          <span title="Barn temperature">🌡 {Number(env.temperature_celsius || 0).toFixed(1)}°C</span>
          <span title="Humidity">💧 {Number(env.humidity_percent || 0).toFixed(0)}%</span>
          {env.air_quality_ppm && (
            <span title="Air quality" style={{ color: Number(env.air_quality_ppm) > 600 ? '#ffcdd2' : 'inherit' }}>
              🌬 {Number(env.air_quality_ppm).toFixed(0)} ppm
            </span>
          )}
        </div>
      )}

      {/* Global search */}
      <div ref={searchRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={() => { setShowSearch(v => !v); setTimeout(() => document.getElementById('header-search')?.focus(), 80); }}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
          <Search size={18} />
        </button>
        {showSearch && (
          <div style={{ position: 'absolute', top: 'calc(100% + 12px)', right: 0, width: 320, background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.2)', zIndex: 500, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <Search size={15} color="var(--text-secondary)" />
              <input id="header-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search cows, pages, features…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }} />
              {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><X size={14} /></button>}
            </div>
            <SearchResults query={searchQuery} navigate={navigate} onSelect={() => { setShowSearch(false); setSearchQuery(''); }} />
          </div>
        )}
      </div>

      {/* Connection indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, opacity: .9, flexShrink: 0 }}>
        {connected
          ? <><span className="live-dot" /> LIVE</>
          : <><RefreshCw size={11} style={{ animation: 'spin .7s linear infinite' }} /> SYNC</>}
      </div>

      {/* Notifications bell */}
      <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowNotifs(v => !v)}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, position: 'relative' }}>
          <Bell size={20} />
          {unread > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -6, background: '#F44336', color: '#fff', borderRadius: 10, padding: '1px 5px', fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>
              {unread}
            </span>
          )}
        </button>

        {showNotifs && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 12px)', right: 0,
            width: 360, maxHeight: 480, background: '#fff', borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,.2)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', zIndex: 500,
          }}>
            {/* Panel header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1E4D7B' }}>🔔 Notifications {unread > 0 && <span style={{ background: '#F44336', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 6 }}>{unread}</span>}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {unread > 0 && (
                  <button onClick={() => readAllMut.mutate()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#4CAF50', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><X size={16} /></button>
              </div>
            </div>

            {/* Notification list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No notifications</div>
                : notifications.map(n => (
                  <div key={n.notif_id}
                    onClick={() => { if (!n.is_read) readMut.mutate(n.notif_id); }}
                    style={{
                      padding: '12px 18px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                      background: n.is_read ? '#fff' : `${TYPE_COLOR[n.notif_type] || '#1E4D7B'}08`,
                      borderLeft: n.is_read ? 'none' : `3px solid ${TYPE_COLOR[n.notif_type] || '#1E4D7B'}`,
                      transition: 'background .2s',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: n.is_read ? 500 : 700, fontSize: 13, color: '#222' }}>{n.title}</span>
                      <span style={{ fontSize: 10, color: '#aaa', flexShrink: 0, marginLeft: 8 }}>{n.created_at ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true }) : ''}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4 }}>{n.message}</div>
                  </div>
                ))
              }
            </div>

            <div style={{ padding: '10px 18px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
              <button onClick={() => { navigate('/app/alerts'); setShowNotifs(false); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1E4D7B', fontWeight: 600, width: '100%', textAlign: 'center' }}>
                View all alerts →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alert bell shortcut (red badge for unresolved alerts) */}
      <div style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate('/app/alerts')}>
        {alertsCount > 0 && (
          <span style={{ background: '#F44336', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
            🚨 {alertsCount}
          </span>
        )}
      </div>

      {/* User chip */}
      {user && (
        <div onClick={() => navigate('/app/settings')} style={{
          background: 'rgba(0,0,0,.2)', borderRadius: 20, padding: '5px 12px',
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', flexShrink: 0, border: `1px solid ${ROLE_COLOR[user.role] || 'rgba(255,255,255,.3)'}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ROLE_COLOR[user.role] || '#fff', display: 'inline-block' }} />
          {user.username}
        </div>
      )}
    </header>
  );
}

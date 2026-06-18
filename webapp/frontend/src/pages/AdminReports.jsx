import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getAdminPlatformReport,
  getAdminUserActivity,
  getAdminAlertHistory,
  getAdminActivityLogs,
} from '../lib/api';
import {
  Beef, Droplets, Bell, Users, Cpu, CheckCircle,
  AlertTriangle, Activity, FileText, Search, Download, Printer,
} from 'lucide-react';
import { format } from 'date-fns';

// ── Export helpers ────────────────────────────────────────────────────────────
function exportCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] == null ? '' : String(r[h]);
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printTable(title, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`).join('');
  const html = `
    <html><head><title>${title}</title>
    <style>
      body{font-family:Inter,sans-serif;font-size:12px;padding:24px}
      h1{font-size:18px;margin-bottom:16px}
      table{border-collapse:collapse;width:100%}
      th{background:#1E4D7B;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:7px 10px;border-bottom:1px solid #eee}
      @media print{button{display:none}}
    </style></head>
    <body>
      <h1>${title} — MooMe Report · ${new Date().toLocaleDateString()}</h1>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
    </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

const SEV_COLOR = {
  Emergency: '#b71c1c', Critical: '#c62828', Warning: '#e65100', Info: '#1565c0',
};
const ROLE_COLOR = {
  Admin: '#FFD700', Farmer: '#4CAF50', Veterinarian: '#9C27B0', Technician: '#FF9800',
};
const ROLE_BG = {
  Admin: '#fffde7', Farmer: '#e8f5e9', Veterinarian: '#f3e5f5', Technician: '#fff8e1',
};

const fmt = (v, d = 1) => (v != null ? Number(v).toFixed(d) : '--');

export default function AdminReports() {
  const [alertSearch, setAlertSearch]   = useState('');
  const [alertDays, setAlertDays]       = useState(30);
  const [alertSeverity, setAlertSeverity] = useState('');
  const [alertType, setAlertType]       = useState('');
  const [activeTab, setActiveTab]       = useState('summary');

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['admin-platform-report'],
    queryFn: getAdminPlatformReport,
  });

  const { data: userActivity = [], isLoading: userLoading } = useQuery({
    queryKey: ['admin-user-activity'],
    queryFn: getAdminUserActivity,
    enabled: activeTab === 'users',
  });

  const { data: alertHistory = [], isLoading: alertLoading } = useQuery({
    queryKey: ['admin-alert-history', alertDays, alertType, alertSeverity],
    queryFn: () => getAdminAlertHistory(alertDays, alertType, alertSeverity),
    enabled: activeTab === 'alerts',
  });

  const { data: activityLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['admin-activity-logs'],
    queryFn: () => getAdminActivityLogs(150),
    enabled: activeTab === 'logs',
  });

  const TABS = [
    { id: 'summary', label: '📊 Platform Summary' },
    { id: 'users',   label: '👥 User Activity' },
    { id: 'alerts',  label: '🚨 Alert History' },
    { id: 'logs',    label: '⚙️ Activity Logs' },
  ];

  // Platform summary cards
  const summaryCards = report
    ? [
        {
          label: 'Total Cows',
          value: report.herd?.total_cows ?? '--',
          sub: `${report.herd?.lactating_cows ?? 0} lactating`,
          icon: Beef, color: '#1E4D7B',
        },
        {
          label: 'Milk (30 days)',
          value: `${fmt(report.milk_30d?.total_liters, 0)} L`,
          sub: `${report.milk_30d?.total_sessions ?? 0} sessions`,
          icon: Droplets, color: '#00BCD4',
        },
        {
          label: 'Alerts This Month',
          value: report.alerts?.total_30d ?? '--',
          sub: `${report.alerts?.resolved_pct ?? 0}% resolved`,
          icon: Bell, color: '#FF9800',
        },
        {
          label: 'Active Users',
          value: report.users?.active ?? '--',
          sub: `${report.users?.recent_7d ?? 0} logged in (7d)`,
          icon: Users, color: '#4CAF50',
        },
        {
          label: 'Components',
          value: `${report.components?.operational ?? '--'} / ${report.components?.total ?? '--'}`,
          sub: 'operational',
          icon: Cpu, color: '#9C27B0',
        },
        {
          label: 'Unresolved Alerts',
          value: report.alerts?.active_alerts ?? '--',
          sub: 'currently open',
          icon: AlertTriangle, color: report.alerts?.active_alerts > 0 ? '#F44336' : '#4CAF50',
        },
      ]
    : [];

  const filteredAlerts = alertHistory.filter(a => {
    if (!alertSearch) return true;
    const q = alertSearch.toLowerCase();
    return (
      a.message?.toLowerCase().includes(q) ||
      a.cow_name?.toLowerCase().includes(q) ||
      a.alert_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg,#1E4D7B,#2e6fa3)',
        borderRadius: 12, padding: '18px 24px', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileText size={24} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Admin Reports & Analytics</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: .8 }}>
              Platform-wide insights — all data live from the database
            </p>
          </div>
        </div>
        {report?.farm && (
          <div style={{ marginTop: 12, fontSize: 12, opacity: .75 }}>
            {report.farm.farm_name} &nbsp;·&nbsp; {report.farm.location} &nbsp;·&nbsp; Est. {report.farm.established_year}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="btn"
            style={{
              padding: '8px 18px', fontSize: 13,
              background: activeTab === t.id ? '#1E4D7B' : 'var(--bg)',
              color: activeTab === t.id ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              fontWeight: activeTab === t.id ? 700 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Platform Summary Tab ── */}
      {activeTab === 'summary' && (
        <>
          {reportLoading
            ? <div className="spinner" />
            : (
              <>
                {/* Stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
                  {summaryCards.map(({ label, value, sub, icon: Icon, color }) => (
                    <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="label">{label}</span>
                        <Icon size={18} color={color} />
                      </div>
                      <span className="value" style={{ color }}>{value}</span>
                      <span className="sub">{sub}</span>
                    </div>
                  ))}
                </div>

                {/* Herd health breakdown */}
                {report?.herd && (
                  <div className="card">
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Herd Health Breakdown</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
                      {[
                        { label: 'Healthy',          val: report.herd.healthy_cows,  color: '#4CAF50' },
                        { label: 'Warning',           val: report.herd.warning_cows,  color: '#FF9800' },
                        { label: 'Critical',          val: report.herd.critical_cows, color: '#F44336' },
                        { label: 'Total Active Cows', val: report.herd.total_cows,    color: '#1E4D7B' },
                      ].map(({ label, val, color }) => {
                        const pct = report.herd.total_cows > 0 ? Math.round((val / report.herd.total_cows) * 100) : 0;
                        return (
                          <div key={label} style={{ padding: 14, background: '#f7f9fc', borderRadius: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
                            <div style={{ fontSize: 26, fontWeight: 800, color, marginBottom: 8 }}>{val ?? 0}</div>
                            <div className="gauge-bar">
                              <div className="gauge-bar-fill" style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{pct}% of herd</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Economics snapshot */}
                {report?.components && (
                  <div className="card">
                    <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Economics Snapshot</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
                      {[
                        { label: 'Total Infrastructure Cost', val: `${(report.components.total_cost_rwf / 1_000_000).toFixed(2)} M RWF`, color: '#1E4D7B' },
                        { label: 'Operational Components',    val: `${report.components.operational} / ${report.components.total}`, color: '#4CAF50' },
                        { label: '30-Day Milk Revenue Est.',  val: `${((report.milk_30d?.total_liters || 0) * 400 / 1000).toFixed(1)} K RWF`, color: '#00BCD4' },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ padding: 14, background: '#f7f9fc', borderRadius: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          }
        </>
      )}

      {/* ── User Activity Tab ── */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Users size={18} color="#1E4D7B" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>User Activity</h2>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{userActivity.length} users</span>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => exportCSV(userActivity, 'moome-user-activity.csv')}>
              <Download size={13} /> CSV
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => printTable('User Activity', userActivity)}>
              <Printer size={13} /> Print/PDF
            </button>
          </div>
          {userLoading
            ? <div className="spinner" />
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Username</th><th>Role</th><th>Status</th>
                      <th>Last Login</th><th>Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userActivity.map(u => (
                      <tr key={u.user_id}>
                        <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>@{u.username}</td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: ROLE_BG[u.role] || '#f0f0f0',
                            color: ROLE_COLOR[u.role] || '#333',
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${u.is_active ? 'healthy' : 'critical'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {u.last_login
                            ? format(new Date(u.last_login), 'MMM d, yyyy HH:mm')
                            : <span style={{ color: '#aaa' }}>Never</span>}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: u.activity_status === 'Recent' ? '#e8f5e9' : '#f5f5f5',
                            color: u.activity_status === 'Recent' ? '#2E7D32' : '#9e9e9e',
                          }}>
                            {u.activity_status === 'Recent' ? '● Recent (7d)' : '○ Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {userActivity.length === 0 && (
                  <div className="empty-state"><Users size={40} /><span>No user data</span></div>
                )}
              </div>
            )
          }
        </div>
      )}

      {/* ── Alert History Tab ── */}
      {activeTab === 'alerts' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Filters toolbar */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Alert History</h2>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => exportCSV(filteredAlerts, 'moome-alert-history.csv')}>
              <Download size={13} /> CSV
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => printTable('Alert History', filteredAlerts)}>
              <Printer size={13} /> Print/PDF
            </button>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', borderRadius: 8, padding: '6px 12px', border: '1px solid var(--border)' }}>
              <Search size={14} color="var(--text-secondary)" />
              <input
                placeholder="Search alerts…"
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', fontSize: 13, outline: 'none', width: 160 }}
              />
            </div>

            {/* Days filter */}
            <select value={alertDays} onChange={e => setAlertDays(Number(e.target.value))}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            {/* Severity filter */}
            <select value={alertSeverity} onChange={e => setAlertSeverity(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">All Severities</option>
              <option value="Emergency">Emergency</option>
              <option value="Critical">Critical</option>
              <option value="Warning">Warning</option>
              <option value="Info">Info</option>
            </select>

            {/* Type filter */}
            <select value={alertType} onChange={e => setAlertType(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="">All Types</option>
              <option value="Health">Health</option>
              <option value="Temperature">Temperature</option>
              <option value="Air Quality">Air Quality</option>
              <option value="Feed">Feed</option>
              <option value="Water">Water</option>
              <option value="Milk">Milk</option>
              <option value="System">System</option>
            </select>
          </div>

          {alertLoading
            ? <div className="spinner" />
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th><th>Severity</th><th>Cow</th><th>Message</th>
                      <th>Status</th><th>Created</th><th>Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map(a => (
                      <tr key={a.alert_id}>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                            background: '#f0f0f0', color: '#555',
                          }}>
                            {a.alert_type}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                            background: `${SEV_COLOR[a.severity] || '#999'}22`,
                            color: SEV_COLOR[a.severity] || '#999',
                          }}>
                            {a.severity}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 600, color: '#1E4D7B' }}>
                          {a.cow_name || <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.message}
                        </td>
                        <td>
                          <span className={`badge badge-${a.is_resolved ? 'healthy' : 'warning'}`}>
                            {a.is_resolved ? '✓ Resolved' : 'Open'}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {a.created_at ? format(new Date(a.created_at), 'MMM d HH:mm') : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {a.resolved_at ? format(new Date(a.resolved_at), 'MMM d HH:mm') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredAlerts.length === 0 && (
                  <div className="empty-state"><Bell size={40} /><span>No alerts found for the selected filters</span></div>
                )}
              </div>
            )
          }
        </div>
      )}

      {/* ── Activity Logs Tab ── */}
      {activeTab === 'logs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Activity size={18} color="#1E4D7B" />
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>System Activity Logs</h2>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
              {activityLogs.length} records
            </span>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => exportCSV(activityLogs, 'moome-activity-logs.csv')}>
              <Download size={13} /> CSV
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              onClick={() => printTable('System Activity Logs', activityLogs)}>
              <Printer size={13} /> Print/PDF
            </button>
          </div>
          {logsLoading
            ? <div className="spinner" />
            : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Device</th><th>Action</th><th>Value</th>
                      <th>Trigger Reason</th><th>Recorded At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map(l => (
                      <tr key={l.log_id}>
                        <td style={{ fontSize: 11, color: '#aaa' }}>{l.log_id}</td>
                        <td>
                          <strong>{l.device_type}</strong>
                          {l.device_id ? <span style={{ color: '#aaa', fontSize: 11 }}> #{l.device_id}</span> : ''}
                        </td>
                        <td>
                          <span className={`badge badge-${l.action === 'ON' ? 'healthy' : l.action === 'OFF' ? 'normal' : 'warning'}`}>
                            {l.action}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                          {l.value != null ? l.value : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.trigger_reason || '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {l.recorded_at ? format(new Date(l.recorded_at), 'MMM d, yyyy HH:mm') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activityLogs.length === 0 && (
                  <div className="empty-state"><Activity size={40} /><span>No activity logs found</span></div>
                )}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

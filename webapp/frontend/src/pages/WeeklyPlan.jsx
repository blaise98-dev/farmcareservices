import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWeeklyTasks, getTodayTasks, createTask, updateTask, deleteTask, getCows, getGroups } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, X, Calendar, CheckCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

const PRIORITY_COLOR = { Low: '#4CAF50', Medium: '#FF9800', High: '#F44336', Urgent: '#b71c1c' };
const STATUS_COLOR   = { Pending: '#FF9800', InProgress: '#00BCD4', Completed: '#4CAF50', Cancelled: '#9E9E9E' };
const TASK_TYPES = ['Feeding','Milking','VetVisit','Cleaning','Maintenance','Vaccination','Other'];
const EMPTY = { title: '', description: '', task_type: 'Other', assigned_to: '', due_date: '', due_time: '', priority: 'Medium', cow_id: '', group_id: '' };

export default function WeeklyPlan() {
  const [view, setView]         = useState('week');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [err, setErr]           = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();

  const { data: weekTasks = []  } = useQuery({ queryKey: ['weekly-tasks', 7], queryFn: () => getWeeklyTasks(7), enabled: view === 'week' });
  const { data: todayTasks = [] } = useQuery({ queryKey: ['today-tasks'],      queryFn: getTodayTasks,          enabled: view === 'today' });
  const { data: cows = []       } = useQuery({ queryKey: ['cows'],             queryFn: getCows });
  const { data: groups = []     } = useQuery({ queryKey: ['groups'],           queryFn: getGroups });

  const createMut = useMutation({
    mutationFn: createTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekly-tasks'] }); qc.invalidateQueries({ queryKey: ['today-tasks'] }); setShowModal(false); setForm(EMPTY); setErr(''); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }) => updateTask(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekly-tasks'] }); qc.invalidateQueries({ queryKey: ['today-tasks'] }); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weekly-tasks'] }); qc.invalidateQueries({ queryKey: ['today-tasks'] }); },
  });

  const tasks = view === 'week' ? weekTasks : todayTasks;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.due_date) { setErr('Due date is required'); return; }
    createMut.mutate({
      ...form,
      cow_id: form.cow_id ? Number(form.cow_id) : null,
      group_id: form.group_id ? Number(form.group_id) : null,
    });
  };

  const typeIcon = { Feeding: '🌿', Milking: '🥛', VetVisit: '🩺', Cleaning: '🧹', Maintenance: '🔧', Vaccination: '💉', Other: '📋' };

  // Group tasks by date
  const byDate = tasks.reduce((acc, t) => {
    const d = t.due_date ? format(new Date(t.due_date + 'T00:00:00'), 'EEE, MMM d') : 'No date';
    if (!acc[d]) acc[d] = [];
    acc[d].push(t);
    return acc;
  }, {});

  const pending = tasks.filter(t => t.status === 'Pending' || t.status === 'InProgress').length;
  const done    = tasks.filter(t => t.status === 'Completed').length;
  const urgent  = tasks.filter(t => t.priority === 'Urgent' || t.priority === 'High').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#E65100,#FF9800)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📅 Weekly Plan</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Schedule and track farm tasks</div>
        </div>
        <button className="btn" onClick={() => { setShowModal(true); setErr(''); }} style={{ background: '#fff', color: '#E65100', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
          <Plus size={14} /> New Task
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14 }}>
        {[
          { label: 'Pending / In Progress', val: pending, color: '#FF9800' },
          { label: 'Completed',             val: done,    color: '#4CAF50' },
          { label: 'High Priority',         val: urgent,  color: '#F44336' },
          { label: 'Total Tasks',           val: tasks.length, color: '#1E4D7B' },
        ].map(({ label, val, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ id: 'today', label: "📅 Today's Tasks" }, { id: 'week', label: '📆 7-Day Plan' }].map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className="btn"
            style={{ padding: '8px 18px', fontSize: 13, background: view === v.id ? '#FF9800' : 'var(--bg)', color: view === v.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)', fontWeight: view === v.id ? 700 : 400 }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Task list grouped by date */}
      {Object.entries(byDate).map(([date, dayTasks]) => (
        <div key={date}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, paddingLeft: 4 }}>{date}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayTasks.map(t => (
              <div key={t.task_id} style={{
                display: 'flex', gap: 14, padding: '14px 18px', borderRadius: 12,
                background: t.status === 'Completed' ? '#f5f5f5' : '#fff',
                border: '1px solid var(--border)',
                opacity: t.status === 'Completed' ? .7 : 1,
                alignItems: 'center',
              }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{typeIcon[t.task_type] || '📋'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, textDecoration: t.status === 'Completed' ? 'line-through' : 'none' }}>{t.title}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${PRIORITY_COLOR[t.priority] || '#999'}22`, color: PRIORITY_COLOR[t.priority] || '#333', fontWeight: 600 }}>{t.priority}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: `${STATUS_COLOR[t.status] || '#999'}22`, color: STATUS_COLOR[t.status] || '#333', fontWeight: 600 }}>{t.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    {t.due_time && <span>⏰ {t.due_time.substring(0, 5)}</span>}
                    {t.assigned_to && <span>👤 {t.assigned_to}</span>}
                    {t.cow_name && <span>🐄 {t.cow_name}</span>}
                    {t.group_name && <span>👥 {t.group_name}</span>}
                  </div>
                  {t.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{t.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {t.status !== 'Completed' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11, color: '#4CAF50', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => updateMut.mutate({ id: t.task_id, body: { status: 'Completed' } })}>
                      <CheckCircle size={12} /> Done
                    </button>
                  )}
                  {t.status === 'Pending' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11, color: '#00BCD4' }}
                      onClick={() => updateMut.mutate({ id: t.task_id, body: { status: 'InProgress' } })}>
                      Start
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11, color: '#c62828' }}
                    onClick={() => { if (window.confirm('Delete this task?')) deleteMut.mutate(t.task_id); }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {tasks.length === 0 && <div className="empty-state"><Calendar size={40} /><span>No tasks scheduled</span></div>}

      {/* Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#E65100,#FF9800)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>📅 Create Task</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Title *</label><input style={INPUT} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title…" required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Task Type</label>
                  <select style={INPUT} value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}>
                    {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Priority</label>
                  <select style={INPUT} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
                  </select>
                </div>
                <div><label style={LABEL}>Due Date *</label><input type="date" style={INPUT} value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required /></div>
                <div><label style={LABEL}>Due Time</label><input type="time" style={INPUT} value={form.due_time} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))} /></div>
                <div><label style={LABEL}>Assign To</label><input style={INPUT} value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="username…" /></div>
                <div>
                  <label style={LABEL}>Related Cow</label>
                  <select style={INPUT} value={form.cow_id} onChange={e => setForm(f => ({ ...f, cow_id: e.target.value }))}>
                    <option value="">None</option>
                    {cows.map(c => <option key={c.cow_id} value={c.cow_id}>{c.cow_name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LABEL}>Related Group</label>
                  <select style={INPUT} value={form.group_id} onChange={e => setForm(f => ({ ...f, group_id: e.target.value }))}>
                    <option value="">None</option>
                    {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>Description</label><textarea style={{ ...INPUT, height: 70 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              </div>
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13, background: '#E65100', border: 'none' }} disabled={createMut.isPending}>Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

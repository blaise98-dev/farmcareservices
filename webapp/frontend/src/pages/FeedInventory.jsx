import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFeedInventory, getFeedInventorySummary, addFeedInventoryItem, updateFeedInventoryItem, deleteFeedInventoryItem } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
import { Plus, X, Leaf, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { HBarChart, ChartCard } from '../components/ChartKit';

const LABEL = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 };
const INPUT = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };

const CAT_COLOR = { Hay: '#FF9800', Silage: '#4CAF50', Concentrate: '#1E4D7B', 'Mixed Feed': '#00BCD4', Grass: '#8BC34A', Minerals: '#9C27B0', Other: '#9E9E9E' };
const CATS = ['Hay', 'Silage', 'Concentrate', 'Mixed Feed', 'Grass', 'Minerals', 'Other'];

const EMPTY = { item_name: '', category: 'Hay', quantity_kg: '', dry_matter_pct: 85, crude_protein_pct: 12, unit_cost_rwf: '', supplier: '', purchase_date: '', notes: '' };

function fmt(v, d = 1) { return v != null ? Number(v).toFixed(d) : '--'; }

export default function FeedInventory() {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [err, setErr]             = useState('');
  const p  = usePermissions();
  const qc = useQueryClient();
  const canWrite = p.isAdmin || p.isFarmer;

  const { data: items = []   } = useQuery({ queryKey: ['feed-inventory'],         queryFn: getFeedInventory });
  const { data: summary      } = useQuery({ queryKey: ['feed-inventory-summary'], queryFn: getFeedInventorySummary });

  const addMut = useMutation({
    mutationFn: addFeedInventoryItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feed-inventory'] }); closeModal(); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }) => updateFeedInventoryItem(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feed-inventory'] }); closeModal(); },
    onError: (e) => setErr(e.response?.data?.detail || 'Failed'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteFeedInventoryItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed-inventory'] }),
  });

  const openAdd = () => { setEditItem(null); setForm(EMPTY); setErr(''); setShowModal(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item, purchase_date: item.purchase_date ? item.purchase_date.substring(0, 10) : '' });
    setErr(''); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditItem(null); setForm(EMPTY); setErr(''); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.item_name.trim()) { setErr('Item name is required'); return; }
    if (!form.quantity_kg || Number(form.quantity_kg) < 0) { setErr('Valid quantity required'); return; }
    const body = { ...form, quantity_kg: Number(form.quantity_kg), dry_matter_pct: Number(form.dry_matter_pct), crude_protein_pct: Number(form.crude_protein_pct), unit_cost_rwf: Number(form.unit_cost_rwf || 0) };
    if (editItem) updateMut.mutate({ id: editItem.inventory_id, body });
    else addMut.mutate(body);
  };

  // Chart: stock by category
  const byCat = CATS.map(c => ({
    category: c,
    kg: items.filter(i => i.category === c).reduce((s, i) => s + Number(i.quantity_kg || 0), 0),
    fill: CAT_COLOR[c],
  })).filter(c => c.kg > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#388E3C,#4CAF50)', borderRadius: 12, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🌿 Feed Inventory</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Stock levels, dry matter & crude protein totals</div>
        </div>
        {canWrite && (
          <button className="btn" onClick={openAdd} style={{ background: '#fff', color: '#388E3C', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
            <Plus size={14} /> New Recording
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
        {[
          { label: 'Total Stock',       val: `${fmt(summary?.total_kg, 0)} kg`,            color: '#4CAF50' },
          { label: 'Dry Matter',        val: `${fmt(summary?.total_dry_matter_kg, 0)} kg`,  color: '#FF9800' },
          { label: 'Crude Protein',     val: `${fmt(summary?.total_crude_protein_kg, 0)} kg`, color: '#9C27B0' },
          { label: 'Stock Value',       val: `${((summary?.total_value_rwf || 0) / 1000).toFixed(0)}K RWF`, color: '#1E4D7B' },
          { label: 'Item Types',        val: summary?.item_count ?? '--',                   color: '#00BCD4' },
        ].map(({ label, val, color }) => (
          <div key={label} className="stat-card" style={{ borderLeftColor: color }}>
            <span className="label">{label}</span>
            <span className="value" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Stock by category chart */}
      {byCat.length > 0 && (
        <ChartCard title="📊 Stock by Category" sub="Current inventory levels in kg">
          <HBarChart
            data={byCat.map(c => ({ name: c.category, value: Number(Number(c.kg).toFixed(0)) }))}
            unit=" kg"
            colorFn={(d) => CAT_COLOR[d.name] || '#9E9E9E'}
            height={Math.max(180, byCat.length * 46)}
          />
        </ChartCard>
      )}

      {/* Items table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>📋 Inventory Items</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th>Qty (kg)</th><th>DM%</th><th>CP%</th><th>Unit Cost</th><th>Supplier</th><th>Purchased</th>{canWrite && <th></th>}</tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.inventory_id}>
                  <td style={{ fontWeight: 700 }}>{item.item_name}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${CAT_COLOR[item.category] || '#999'}22`, color: CAT_COLOR[item.category] || '#333', fontWeight: 600 }}>
                      {item.category}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: Number(item.quantity_kg) < 50 ? '#F44336' : '#4CAF50' }}>{fmt(item.quantity_kg, 0)}</td>
                  <td>{fmt(item.dry_matter_pct)}%</td>
                  <td>{fmt(item.crude_protein_pct)}%</td>
                  <td style={{ fontFamily: 'monospace' }}>{Number(item.unit_cost_rwf).toLocaleString()} RWF</td>
                  <td style={{ fontSize: 12 }}>{item.supplier || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.purchase_date ? format(new Date(item.purchase_date), 'MMM d, yyyy') : '—'}</td>
                  {canWrite && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => openEdit(item)}><Edit2 size={12} /></button>
                        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#c62828' }}
                          onClick={() => { if (window.confirm('Delete this item?')) deleteMut.mutate(item.inventory_id); }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="empty-state"><Leaf size={40} /><span>No feed inventory items</span></div>}
        </div>
      </div>

      {/* ── Modal ── */}
      {showModal && canWrite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 24px', background: 'linear-gradient(135deg,#388E3C,#4CAF50)', color: '#fff', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{editItem ? '✏️ Update Item' : '🌿 New Feed Inventory Entry'}</h2>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>Item Name *</label><input style={INPUT} value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} placeholder="e.g. Rhodes Grass Hay" required /></div>
                <div>
                  <label style={LABEL}>Category</label>
                  <select style={INPUT} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={LABEL}>Quantity (kg) *</label><input type="number" step="0.1" min="0" style={INPUT} value={form.quantity_kg} onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} required /></div>
                <div><label style={LABEL}>Dry Matter %</label><input type="number" step="0.1" min="0" max="100" style={INPUT} value={form.dry_matter_pct} onChange={e => setForm(f => ({ ...f, dry_matter_pct: e.target.value }))} /></div>
                <div><label style={LABEL}>Crude Protein %</label><input type="number" step="0.1" min="0" max="100" style={INPUT} value={form.crude_protein_pct} onChange={e => setForm(f => ({ ...f, crude_protein_pct: e.target.value }))} /></div>
                <div><label style={LABEL}>Unit Cost (RWF/kg)</label><input type="number" step="1" min="0" style={INPUT} value={form.unit_cost_rwf} onChange={e => setForm(f => ({ ...f, unit_cost_rwf: e.target.value }))} /></div>
                <div><label style={LABEL}>Supplier</label><input style={INPUT} value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div>
                <div><label style={LABEL}>Purchase Date</label><input type="date" style={INPUT} value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={LABEL}>Notes</label><textarea style={{ ...INPUT, height: 60 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              {err && <div style={{ color: '#c62828', fontSize: 13, padding: '8px 12px', background: '#fde8e8', borderRadius: 8 }}>⚠ {err}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeModal} className="btn" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '9px 22px', fontSize: 13 }} disabled={addMut.isPending || updateMut.isPending}>
                  {editItem ? 'Update' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { User } from 'lucide-react';

/**
 * EntryMeta — "who entered this" attribution, the same shape everywhere a
 * write-heavy list shows records from multiple same-role users (Milk, Feed,
 * Reproduction, Tanks, WeeklyPlan, ...). One template, values differ per row.
 */
export default function EntryMeta({ by, size = 12 }) {
  if (!by) return <span style={{ color: 'var(--text-secondary)', fontSize: size }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: size, color: 'var(--text-secondary)' }}>
      <User size={size} />
      {by}
    </span>
  );
}

import { CalendarRange } from 'lucide-react';
import { PERIODS } from '../lib/periods';

/** Period picker for history charts; `minHours` hides choices shorter than a list can use (e.g. 24 for daily data). */
export default function PeriodSelect({ value, onChange, minHours = 0, label = 'Period' }) {
  const choices = PERIODS.filter(p => p.hours === 0 || p.hours >= minHours);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <CalendarRange size={14} aria-hidden="true" />
      <select value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label}
        style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit', color: 'var(--text)' }}>
        {choices.map(p => <option key={p.hours} value={p.hours}>{p.label}</option>)}
      </select>
    </label>
  );
}

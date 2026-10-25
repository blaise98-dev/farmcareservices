import { format } from 'date-fns';

// Periods for history charts and lists, in hours; 0 means all time (since the
// first reading). Day-based lists use the same choices rounded up to days.
export const PERIODS = [
  { hours: 1,    label: 'Last hour' },
  { hours: 6,    label: 'Last 6 hours' },
  { hours: 24,   label: 'Last 24 hours' },
  { hours: 48,   label: 'Last 2 days' },
  { hours: 168,  label: 'Last week' },
  { hours: 336,  label: 'Last 2 weeks' },
  { hours: 720,  label: 'Last 30 days' },
  { hours: 1440, label: 'Last 2 months' },
  { hours: 0,    label: 'All time' },
];

export const periodLabel = (hours) => PERIODS.find(p => p.hours === hours)?.label || `Last ${hours} hours`;

/** Days for a day-based endpoint: 0 stays "all time", anything else rounds up to whole days. */
export const periodDays = (hours) => (hours ? Math.max(1, Math.ceil(hours / 24)) : 0);

/** A time-axis label that suits how much time the data covers. */
export function timeLabeler(rows, key = 'recorded_at') {
  const first = rows.length ? new Date(rows[0][key]).getTime() : 0;
  const last = rows.length ? new Date(rows[rows.length - 1][key]).getTime() : 0;
  const spanH = (last - first) / 3.6e6;
  const pattern = spanH <= 36 ? 'HH:mm' : spanH <= 24 * 8 ? 'MMM d HH:mm' : spanH <= 24 * 366 ? 'MMM d' : 'MMM d, yyyy';
  return (value) => (value ? format(new Date(value), pattern) : '');
}

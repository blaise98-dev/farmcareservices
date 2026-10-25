import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { onErrorToast } from '../lib/errors';

/** Bottom-right message for failed saves that the page itself does not report. */
export default function ErrorToast() {
  const [text, setText] = useState(null);
  useEffect(() => onErrorToast(setText), []);
  useEffect(() => {
    if (!text) return undefined;
    const t = setTimeout(() => setText(null), 8000);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <div role="alert" style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 2000, maxWidth: 'min(420px, calc(100vw - 32px))',
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 12,
      background: 'var(--card)', color: 'var(--text)', border: '1px solid #EF9A9A', boxShadow: 'var(--shadow-lg)', fontSize: 13,
    }}>
      <AlertTriangle size={16} color="#c62828" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, lineHeight: 1.45 }}>{text}</span>
      <button type="button" onClick={() => setText(null)} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}

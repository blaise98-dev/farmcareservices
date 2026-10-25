// Turn an API error into a sentence for the user. FastAPI sends a string, or
// a list of field errors when the input itself was invalid.
export function errorText(e, action = 'Save') {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) {
    return d.map(x => {
      const field = String((x.loc || []).slice(-1)[0] || 'field').replace(/_/g, ' ');
      return `${field}: ${String(x.msg || '').replace(/^Value error, /, '')}`;
    }).join('; ');
  }
  if (typeof d === 'string' && d) return d;
  if (e?.response) return `${action} failed (server error ${e.response.status})`;
  return `${action} failed: the server could not be reached`;
}

// A tiny broadcast so code outside React (the query client) can raise a toast.
const listeners = new Set();
export function onErrorToast(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function showErrorToast(text) { listeners.forEach(fn => fn(text)); }

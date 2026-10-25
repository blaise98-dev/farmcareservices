// Ages come from the server (seconds_since_seen): device timestamps are on the
// database clock, which can differ from the viewer's time zone.
export function lastSeenText(secs) {
  if (secs == null) return 'never seen';
  if (secs < 90) return `${secs}s ago`;
  if (secs < 5400) return `${Math.round(secs / 60)} min ago`;
  if (secs < 172800) return `${Math.round(secs / 3600)} h ago`;
  return `${Math.round(secs / 86400)} days ago`;
}

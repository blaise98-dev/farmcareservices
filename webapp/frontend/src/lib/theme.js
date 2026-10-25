// Light/dark theme. The saved choice wins; with none saved the app follows the
// device setting. The choice is applied as <html data-theme="..."> so the CSS
// tokens in index.css switch in one place.
import { THEME_KEY, readKey, writeKey } from './storage';

const EVENT = 'farmcare-theme';
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

export function savedTheme() {
  const v = readKey(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function effectiveTheme() {
  return savedTheme() || (media?.matches ? 'dark' : 'light');
}

function apply() {
  const saved = savedTheme();
  if (saved) document.documentElement.dataset.theme = saved;
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#0f1720' : '#4CAF50');
}

export function setTheme(choice) {
  writeKey(THEME_KEY, choice === 'light' || choice === 'dark' ? choice : null);
  apply();
  window.dispatchEvent(new Event(EVENT));
}

export function onThemeChange(fn) {
  window.addEventListener(EVENT, fn);
  media?.addEventListener?.('change', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    media?.removeEventListener?.('change', fn);
  };
}

apply();

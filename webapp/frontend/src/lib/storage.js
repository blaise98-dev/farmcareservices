// Browser storage keys, plus a one-time move from the old "moome_" names so
// people stay signed in after the rename.
export const TOKEN_KEY = 'farmcare_token';
export const USER_KEY  = 'farmcare_user';
export const FARM_KEY  = 'farmcare_farm';   // Admin farm picker: '' = all farms
export const THEME_KEY = 'farmcare_theme';  // 'light' | 'dark' | absent = follow the device
export const LANG_KEY  = 'farmcare_lang';

const LEGACY = { moome_token: TOKEN_KEY, moome_user: USER_KEY, moome_lang: LANG_KEY };

export function readKey(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeKey(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable: private window or blocked */ }
}

(function migrate() {
  for (const [old, now] of Object.entries(LEGACY)) {
    const v = readKey(old);
    if (v != null && readKey(now) == null) writeKey(now, v);
    if (v != null) writeKey(old, null);
  }
})();

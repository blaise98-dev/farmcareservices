import { useEffect, useState } from 'react';
import { effectiveTheme, onThemeChange, setTheme } from '../lib/theme';

/** The theme in effect ('light' | 'dark'), re-rendering when it changes. */
export function useTheme() {
  const [theme, setState] = useState(effectiveTheme);
  useEffect(() => onThemeChange(() => setState(effectiveTheme())), []);
  return [theme, setTheme];
}

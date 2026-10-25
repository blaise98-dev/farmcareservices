import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

/** Sun/moon button that switches between the bright and dark themes. */
export default function ThemeToggle({ color = 'currentColor', size = 18 }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Switch to bright theme' : 'Switch to dark theme';
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} title={label} aria-label={label}
      style={{ background: 'none', border: 'none', color, cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {dark ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  );
}

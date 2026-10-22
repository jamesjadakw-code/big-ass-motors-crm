// Theme from Settings: the primary gold is injected into :root as CSS variables, never hard-coded in components.
// --bam-gold is the hex; the -rgb triplets let Tailwind/CSS use alpha (rgb(var(--bam-gold-rgb) / .4)).
const CACHE_KEY = 'bam-theme';
const HEX = /^#[0-9a-f]{6}$/i;

export const DEFAULT_THEME = { goldHex: '#FFC400', density: 'standard' };

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (rgb, target, amt) => rgb.map((c) => Math.round(c + (target - c) * amt));
const triplet = (rgb) => rgb.join(' ');

export function applyGold(hex) {
  const gold = HEX.test(hex || '') ? hex : DEFAULT_THEME.goldHex;
  const rgb = toRgb(gold);
  const root = document.documentElement.style;
  root.setProperty('--bam-gold', gold);
  root.setProperty('--bam-gold-rgb', triplet(rgb));
  root.setProperty('--bam-gold-light-rgb', triplet(mix(rgb, 255, 0.45)));
  root.setProperty('--bam-gold-dark-rgb', triplet(mix(rgb, 0, 0.18)));
  return gold;
}

export function cacheTheme(theme) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(theme)); } catch { /* storage unavailable: fine */ }
}

export function cachedTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (t && HEX.test(t.goldHex || '')) return { ...DEFAULT_THEME, ...t };
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

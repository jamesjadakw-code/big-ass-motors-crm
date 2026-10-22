/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // "bam" is the per-tab accent (set by [data-view] in index.css), so every bam-* class re-themes per tab.
        bam: { DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)', dark: 'rgb(var(--accent-rgb) / <alpha-value>)' },
        // Primary gold comes from Settings via --bam-gold-rgb (injected on :root), never a hard-coded hex.
        gold: 'rgb(var(--bam-gold-rgb) / <alpha-value>)',
        // Neutral blacks and greys.
        // Neutral blacks and greys as variables, so Look & Layout → white mode can repaint the whole app.
        ink: Object.fromEntries([950, 900, 800, 700, 600, 400, 300].map((n) => [n, `rgb(var(--ink-${n}) / <alpha-value>)`])),
      },
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

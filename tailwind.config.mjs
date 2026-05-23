/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        surface2: '#1f1f1f',
        line: '#262626',
        'line-hi': '#404040',
        text: '#e5e5e5',
        mute: '#737373',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ok: '#22c55e',
        warn: '#eab308',
        err: '#ef4444',
        info: '#60a5fa',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        sans: ['Geist', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0b0d10',
          panel: '#121519',
          panelHi: '#171b21',
          line: '#1f242c',
        },
        ink: {
          primary: '#e7ebf0',
          secondary: '#a4adba',
          muted: '#6b7382',
          faint: '#3f4753',
        },
        signal: {
          ok: '#3f9a72',
          warn: '#c9a14a',
          alert: '#c66b5a',
          mute: '#5a6470',
          info: '#5a8fb3',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightish: '-0.005em',
      },
    },
  },
  plugins: [],
};

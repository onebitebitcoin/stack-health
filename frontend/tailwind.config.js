/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'ping-once': {
          '0%':   { transform: 'scale(0.8)', opacity: '1' },
          '60%':  { transform: 'scale(1.2)', opacity: '0.8' },
          '100%': { transform: 'scale(1.0)', opacity: '0' },
        },
      },
      animation: {
        'ping-once': 'ping-once 0.5s ease-out forwards',
      },
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          fg: 'var(--accent-fg)',
          text: 'var(--accent-text, var(--accent))',
        },
        theme: {
          page: 'var(--bg-page)',
          surface: 'var(--bg-surface)',
          surface2: 'var(--bg-surface-2)',
          border: 'var(--border)',
          primary: 'var(--text-primary)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
        },
      },
    },
  },
  plugins: [],
}

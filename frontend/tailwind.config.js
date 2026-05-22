/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          fg: 'var(--accent-fg)',
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

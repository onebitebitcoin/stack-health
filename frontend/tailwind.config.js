/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bitcoin: {
          DEFAULT: '#F7931A',
          dark: '#E07B0E',
        },
      },
    },
  },
  plugins: [],
}

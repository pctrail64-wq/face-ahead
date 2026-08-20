/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08080C', panel: '#141420', panel2: '#1C1C2B',
        line: '#2A2A3D', muted: '#8A8AA3',
        brand: '#7C5CFF', brand2: '#22D3EE', warn: '#FFB020',
        bad: '#FF5C7A', good: '#3DDC97',
      },
      fontFamily: { sans: ['Inter','system-ui','-apple-system','Segoe UI','Roboto','sans-serif'] },
      boxShadow: {
        glow: '0 10px 34px rgba(124,92,255,.32)',
        card: '0 2px 14px rgba(0,0,0,.35)',
      },
    },
  },
  plugins: [],
}

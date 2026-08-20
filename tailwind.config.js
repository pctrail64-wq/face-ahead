/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light (day) palette — day mode only.
        ink: '#1b1b2f',      // text / ink on paper
        paper: '#f6f5f0',    // page background
        panel: '#ffffff',    // card background
        panel2: '#f0efea',   // secondary surface
        line: '#e3e1d8',     // borders
        muted: '#6b6b76',    // secondary text
        brand: '#5a36d3',    // primary purple
        brand2: '#0e8f9e',   // teal accent
        warn: '#d97706',
        bad: '#d6455d',
        good: '#16a34a',
      },
      fontFamily: {
        // Typography system mirrored from aiengineeringfromscratch.com
        sans: ['Source Serif 4', 'Georgia', 'Iowan Old Style', 'serif'],
        display: ['VT323', 'ui-monospace', 'monospace'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 10px 34px rgba(90,54,211,.18)',
        card: '0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.06)',
      },
    },
  },
  plugins: [],
}

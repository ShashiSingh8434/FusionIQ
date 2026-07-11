/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // FusionIQ design-system tokens
        safe:     { DEFAULT: '#22c55e', light: '#bbf7d0', dark: '#15803d' },
        elevated: { DEFAULT: '#eab308', light: '#fef9c3', dark: '#a16207' },
        high:     { DEFAULT: '#f97316', light: '#ffedd5', dark: '#c2410c' },
        critical: { DEFAULT: '#ef4444', light: '#fee2e2', dark: '#991b1b' },
        surface: {
          DEFAULT: '#0f1117',
          card:    '#161b27',
          border:  '#1e2535',
          muted:   '#8892a4',
        },
      },
      animation: {
        'pulse-slow':     'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':        'fadeIn 0.4s ease-out',
        'slide-up':       'slideUp 0.3s ease-out',
        'glow-critical':  'glowCritical 2s ease-in-out infinite',
        'glow-high':      'glowHigh 2.5s ease-in-out infinite',
        'ticker':         'ticker 20s linear infinite',
      },
      keyframes: {
        fadeIn:        { from: { opacity: '0' },                              to: { opacity: '1' } },
        slideUp:       { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        glowCritical:  { '0%,100%': { boxShadow: '0 0 8px rgba(239,68,68,0.4)' }, '50%': { boxShadow: '0 0 24px rgba(239,68,68,0.8)' } },
        glowHigh:      { '0%,100%': { boxShadow: '0 0 8px rgba(249,115,22,0.4)' }, '50%': { boxShadow: '0 0 18px rgba(249,115,22,0.7)' } },
        ticker:        { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
    },
  },
  plugins: [],
}

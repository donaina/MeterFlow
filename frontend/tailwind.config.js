/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom palette per Design Brief (Deep Ink, Parchment/Slate, Copper/Amber Pulse, Ledger Emerald/Rose)
        ink: {
          950: '#07090E',
          900: '#0B0F19',
          850: '#101726',
          800: '#161F33',
          700: '#1E293B',
          600: '#334155',
          500: '#475569',
        },
        copper: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        ledger: {
          paper: '#0C101B',
          card: '#121829',
          ruled: '#1E293B',
          debit: '#F43F5E',
          credit: '#10B981',
          gold: '#EAB308',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Space Mono"', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'digit-flip': 'digitFlip 0.35s ease-out forwards',
        'ping-slow': 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.05)' },
        },
        digitFlip: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}

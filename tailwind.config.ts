import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#080b14',
          900: '#0d1020',
          850: '#111520',
          800: '#151a2a',
          750: '#1a2035',
          700: '#1e2440',
          600: '#252d50',
        },
        accent: {
          DEFAULT: '#5b6ef8',
          hover:   '#4a5de6',
          muted:   '#1e2456',
          subtle:  '#151b42',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}

export default config

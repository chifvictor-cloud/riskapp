import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        card: '#111111',
        'card-border': '#222222',
        accent: {
          DEFAULT: '#e85d24',
          hover: '#d14d18',
          light: '#ff8c5a',
        },
        muted: '#888888',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #e85d24, #ff8c5a)',
        'gradient-dark': 'linear-gradient(135deg, #111111, #1a1a1a)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(232, 93, 36, 0.2)' },
          '100%': { boxShadow: '0 0 30px rgba(232, 93, 36, 0.5)' },
        },
      },
    },
  },
  plugins: [],
}

export default config

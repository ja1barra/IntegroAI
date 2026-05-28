import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#1a1714',
        'ink-l': '#2a2520',
        'ink-ll': '#352e28',
        accent: '#d4501a',
        cream: '#f5f2ec',
        muted: '#8a8580',
        danger: '#fe4028',
      },
      fontFamily: {
        bebas: ['var(--font-bebas)', 'sans-serif'],
        dm: ['var(--font-dm-sans)', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config

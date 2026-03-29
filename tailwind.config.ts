import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1e2d3d',
        orange: '#e8842c',
        blue: '#1d617a',
        sand: '#e9d3bb',
        'page-bg': '#f8f8f6',
      },
      fontFamily: {
        sans: ['Trebuchet MS', 'Trebuchet', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}

export default config

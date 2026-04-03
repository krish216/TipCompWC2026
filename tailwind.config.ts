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
        green: {
          50:  '#E1F5EE',
          100: '#9FE1CB',
          200: '#5DCAA5',
          300: '#3DB892',
          400: '#2BAF85',
          500: '#1D9E75',
          600: '#0F6E56',
          700: '#085041',
          800: '#064033',
          900: '#04342C',
        },
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
      },
    },
  },
  plugins: [],
}

export default config

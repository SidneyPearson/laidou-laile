/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4ef',
          100: '#dceadc',
          200: '#c8ddc9',
          300: '#a6c6a8',
          400: '#7aad7d',
          500: '#5b8c5e',
          600: '#47764b',
          700: '#3a613e',
          800: '#315036',
          900: '#29422e',
        },
        warm: {
          50: '#fff7f1',
          100: '#feeadc',
          200: '#fbd3bc',
          300: '#f4b18d',
          400: '#e8956d',
          500: '#d87c55',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont',
          '"PingFang SC"', '"Helvetica Neue"',
          '"Microsoft YaHei"', 'sans-serif',
        ],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
}

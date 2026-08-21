/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Terracotta/orange. Every component below is written against
        // brand-* tokens, so this is the only place the theme's color
        // needs to change.
        brand: {
          50: '#fdf5ec',
          100: '#fbe8d4',
          200: '#f6cfa7',
          300: '#efb379',
          400: '#e6944e',
          500: '#dc7a2e',
          600: '#c4661e',
          700: '#9c4f18',
          800: '#753b14',
          900: '#4f280e',
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 4px 12px -2px rgb(15 23 42 / 0.08)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: 0, transform: 'translateY(4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
};

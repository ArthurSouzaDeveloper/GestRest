/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Valores via CSS var (com o azul de sempre como fallback) — permite retemar
        // uma subárvore inteira (ex.: o site público) só sobrescrevendo as variáveis
        // num wrapper, sem duplicar nenhum componente. Ver index.css pros defaults.
        // DEFAULT/500 usam canais RGB (não hex) porque são usados com modificador de
        // opacidade (bg-brand/10 etc.) — Tailwind só consegue aplicar opacidade em cima
        // de var() nesse formato rgb(var(...) / <alpha-value>).
        brand: {
          DEFAULT: 'rgb(var(--brand-rgb) / <alpha-value>)',
          50: 'var(--brand-50, #eff4ff)',
          100: 'var(--brand-100, #dbe6fe)',
          500: 'rgb(var(--brand-rgb) / <alpha-value>)',
          600: 'var(--brand-600, #1b3478)',
          700: 'var(--brand-700, #172c66)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#1E4D8C',
          'blue-light': '#2563A8',
          'blue-dark': '#163A6B',
          orange: '#FF6A00',
          'orange-light': '#FF8533',
          'orange-dark': '#CC5500',
          teal: '#20A39E',
          'teal-light': '#28C4BE',
          'teal-dark': '#187A76',
        },
        success: '#00B894',
        dark: '#2D3436',
        light: '#F5F6FA',
        surface: '#FFFFFF',
        status: {
          error: '#E74C3C',
          warning: '#F39C12',
          info: '#3498DB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};

export default config;

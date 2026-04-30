import type { Config } from 'tailwindcss';

/**
 * Tailwind config — single source of truth for design tokens.
 *
 * Tokens are mirrored in `DESIGN.md` (the Claude Design / brand-system
 * source of truth). If you change a value here, also update `DESIGN.md`
 * in the same PR — keep them aligned.
 *
 * Fonts come from `next/font/google` in `src/app/layout.tsx` via the
 * `--font-sans` and `--font-mono` CSS variables. Don't hardcode font
 * names — bind the variables here, then components use `font-sans` /
 * `font-mono` utility classes.
 */
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
        // Bound to CSS variables exposed by next/font in app/layout.tsx.
        // The fallback chain runs if next/font fails to load (e.g. during
        // a build with sandboxed network).
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};

export default config;

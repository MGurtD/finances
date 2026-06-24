import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/**/*.{vue,ts,tsx}',
    '../../packages/ui/src/**/*.{vue,ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1120px',
      },
    },
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        'ink-subtle': 'var(--ink-subtle)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        positive: 'var(--positive)',
        negative: 'var(--negative)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'finance-sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'finance-base': ['1rem', { lineHeight: '1.5rem' }],
        'finance-lg': ['1.25rem', { lineHeight: '1.75rem' }],
        'finance-xl': ['1.5rem', { lineHeight: '2rem' }],
        'finance-2xl': ['2rem', { lineHeight: '2.5rem' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgb(43 24 16 / 0.08), 0 4px 16px -4px rgb(43 24 16 / 0.04)',
        'soft-lg': '0 8px 24px -8px rgb(43 24 16 / 0.12), 0 16px 48px -16px rgb(43 24 16 / 0.06)',
        warm: '0 2px 8px -2px rgb(232 93 44 / 0.15)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 240ms cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
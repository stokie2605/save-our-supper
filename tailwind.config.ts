import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-cream': '#FAF8F5',
        'brand-forest': '#1E3F20',
        'brand-amber': '#E68A00',
        'brand-slateSoft': '#E2E8F0',
      },
    },
  },
} satisfies Config;

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#D9591A',
          orangeSoft: '#FDE2C8',
          mustard: '#F4C56F',
          brown: '#4A2912',
        },
        ink: {
          900: '#2A241F',
          700: '#5A5048',
          500: '#8A8079',
        },
        paper: {
          surface: '#FBF8F1',
          elevated: '#FFFFFF',
          muted: '#F1ECE1',
        },
        sticky: {
          yellow: '#FFF7C2',
        },
        status: {
          ok: {
            bg: '#EEF6EE',
            border: '#3E7A48',
          },
          warn: {
            bg: '#FFF5E8',
            border: '#A36A1D',
          },
          danger: {
            fg: '#A04015',
          },
        },
        quiet: {
          bg: '#F0EEE9',
        },
      },
      fontFamily: {
        sans: [
          'Roboto',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      fontSize: {
        // role-driven scale (see DESIGN_HANDOFF.md §4)
        display: ['32px', { lineHeight: '36px', fontWeight: '700' }],
        title: ['18px', { lineHeight: '24px', fontWeight: '700' }],
        subtitle: ['15px', { lineHeight: '20px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px' }],
        'body-sm': ['12px', { lineHeight: '16px' }],
        label: ['10px', { lineHeight: '12px', letterSpacing: '0.1em', fontWeight: '500' }],
      },
      spacing: {
        edge: '14px',
        'edge-public': '16px',
      },
      borderRadius: {
        card: '12px',
        input: '8px',
        btn: '12px',
        'btn-sm': '8px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
        sheet: '0 -4px 16px rgba(0,0,0,0.08), 0 -1px 4px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;

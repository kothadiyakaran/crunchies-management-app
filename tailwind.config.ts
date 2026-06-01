import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // orange darkened from #D9591A → #B8450F (contrast retune Sprint 10
          // close): #D9591A on white was 3.89:1, fails WCAG AA 4.5:1; #B8450F
          // hits ~5.1:1. orangeSoft / mustard / brown unchanged.
          orange: '#B8450F',
          orangeSoft: '#FDE2C8',
          mustard: '#F4C56F',
          brown: '#4A2912',
          // design-critique polish (additive): pack `brand` family
          DEFAULT: '#B8450F', // bg-brand == orange
          soft: '#EFD9C6', // discount chips, focus ring
          muted: '#F6E8DC', // Pending/Unpaid chip bg
          deep: '#A6420E', // bill header band only
        },
        ink: {
          900: '#2A241F',
          700: '#5A5048',
          // 500 darkened from #8A8079 → #6E655E (contrast retune Sprint 10
          // close): #8A8079 on paper-surface (#FBF8F1) was 3.63:1, fails
          // WCAG AA 4.5:1; #6E655E hits ~5.0:1 on paper-surface and 5.4:1
          // on white. Used for secondary text / labels — 108 nodes across
          // 8 routes were failing pre-retune.
          500: '#6E655E',
          // design-critique polish (additive)
          DEFAULT: '#2A211B', // text-ink — primary text (pack `ink`)
          2: '#6E655E', // text-ink-2 — secondary (alias of 500)
          3: '#A29A92', // text-ink-3 — tertiary/placeholder/stale (new)
        },
        paper: {
          surface: '#FBF8F1',
          elevated: '#FFFFFF',
          muted: '#F1ECE1',
          2: '#F1ECE1', // bg-paper-2 — wells/disabled fill (alias of muted)
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
        // design-critique polish (additive top-level semantic tokens)
        card: '#FFFFFF',
        rule: '#E8E0D1',
        mustard: '#C99B3B', // over-target bar fill (distinct from brand.mustard)
        brown: '#6E3A1B', // chip text on mustard/soft tints
        ok: { soft: '#E1F0E5', stamp: '#3C6B45' },
        warn: '#C46A1A',
        danger: '#A8331A',
        'mustard-tint': '#F2E4C9', // Partial chip bg
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
        // design-critique polish (additive type tokens; existing scale unchanged)
        amount: ['22px', { lineHeight: '28px', fontWeight: '700' }],
        small: ['14px', { lineHeight: '20px' }],
        meta: ['13px', { lineHeight: '18px' }],
        eyebrow: ['11px', { lineHeight: '14px', letterSpacing: '0.10em', fontWeight: '700' }],
        'eyebrow-tight': ['10px', { lineHeight: '12px', letterSpacing: '0.06em', fontWeight: '700' }],
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

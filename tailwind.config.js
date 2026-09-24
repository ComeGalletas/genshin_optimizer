/** @type {import('tailwindcss').Config} */
export default {
  // The engine moved out of src/ in TODO 0.3, but Tailwind extracts utilities
  // from tokens in those files too: without this glob the CSS lost ~0.3 kB of
  // rules the app had before the move.
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './packages/engine/src/**/*.ts',
  ],
  theme: {
    // Replaces Tailwind's default weight scale rather than extending it: only
    // these four weights are actually fetched in index.html, so `font-black`
    // and friends must not compile to a weight the browser would synthesise.
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Spline Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      // One step below text-xs, for the uppercase micro-labels; `label` and
      // `eyebrow` are the only two tracking values the display idiom uses.
      fontSize: {
        '2xs': ['0.7rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        label: '0.18em',
        eyebrow: '0.4em',
      },
      colors: {
        // Instrument chassis — graphite surfaces, constant across games.
        // Lower number = lighter; 500/400 exist only as scrollbar-thumb greys.
        surface: {
          900: '#0f1116',
          800: '#14161d',
          700: '#1b1e27',
          600: '#242833',
          500: '#2a2f3d',
          400: '#3a4152',
        },
        // The reading signal — swapped per game via CSS vars (see index.css).
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          bright: 'rgb(var(--accent-bright) / <alpha-value>)',
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
        },
        // The constraint/interactive signal — constant across games.
        flux: {
          DEFAULT: '#6aa6ff',
          bright: '#9dc0ff',
        },
        // Elemental hues — constant across the app (not game-swapped like
        // `accent`). rgb triplets so `/alpha` modifiers work; every one clears
        // 4.5:1 as text on surface-900. Colour is never the only channel: the
        // element name is always written next to it.
        element: {
          pyro: 'rgb(255 155 118 / <alpha-value>)',
          hydro: 'rgb(95 200 245 / <alpha-value>)',
          electro: 'rgb(207 155 245 / <alpha-value>)',
          cryo: 'rgb(143 227 240 / <alpha-value>)',
          anemo: 'rgb(116 223 192 / <alpha-value>)',
          geo: 'rgb(255 212 94 / <alpha-value>)',
          dendro: 'rgb(168 222 84 / <alpha-value>)',
        },
        paper: '#e9e7e0',
        muted: '#8d93a3',
        rose: '#e88b7d',
        jade: '#6fd39a',
        // Warning/caution signal — amber, distinct from `accent` (game-swapped
        // brand gold) and `element.geo` (an elemental hue, not a semantic
        // one). Measured as text on both dark surfaces per WCAG 2.1 relative
        // luminance: 10.15:1 on surface-900 (#0f1116), 8.94:1 on surface-700
        // (#1b1e27) — both clear the 4.5:1 AA floor with headroom.
        amber: '#f0b432',
      },
      boxShadow: {
        'glow-accent':
          '0 8px 30px -8px rgb(var(--accent) / 0.45), inset 0 1px 0 rgba(255,255,255,0.2)',
        panel: '0 24px 70px -30px rgba(0,0,0,0.9)',
        // Shallower than `panel`: a listbox floats a few px above the page,
        // not the whole instrument chassis.
        popover: '0 16px 40px -16px rgba(0,0,0,0.85)',
      },
      backgroundImage: {
        'hairline-accent':
          'linear-gradient(135deg, rgb(var(--accent) / 0.5), rgb(var(--accent) / 0.04) 40%, transparent 70%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Opacity only — animating `boxShadow` forces paint on every frame,
        // where opacity stays on the compositor.
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-glow': 'pulse-glow 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

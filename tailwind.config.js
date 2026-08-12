/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          subtle: 'var(--surface-subtle)',
          strong: 'var(--surface-strong)',
        },
        brand: {
          ink: 'var(--brand-ink)',
          primary: 'var(--brand-primary)',
          deep: 'var(--brand-deep)',
          vital: 'var(--brand-vital)',
          mint: 'var(--brand-mint)',
        },
        clinical: {
          ice: 'var(--clinical-ice)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        focus: 'var(--focus-ring)',
        hover: 'var(--hover)',
        selected: 'var(--selected)',
        disabled: {
          DEFAULT: 'var(--disabled)',
          foreground: 'var(--disabled-foreground)',
        },
        overlay: 'var(--overlay)',
        positive: {
          DEFAULT: 'var(--positive)',
          foreground: 'var(--positive-foreground)',
          bg: 'var(--positive-bg)',
          border: 'var(--positive-border)',
        },
        negative: {
          DEFAULT: 'var(--negative)',
          foreground: 'var(--negative-foreground)',
          bg: 'var(--negative-bg)',
          border: 'var(--negative-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--warning-foreground)',
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          foreground: 'var(--info-foreground)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
        severity: {
          low: 'var(--severity-low)',
          'low-bg': 'var(--severity-low-bg)',
          medium: 'var(--severity-medium)',
          'medium-bg': 'var(--severity-medium-bg)',
          high: 'var(--severity-high)',
          'high-bg': 'var(--severity-high-bg)',
          critical: 'var(--severity-critical)',
          'critical-bg': 'var(--severity-critical-bg)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      borderRadius: {
        '2xl': 'var(--radius-panel)',
        xl: 'var(--radius-panel)',
        lg: 'var(--radius-control)',
        md: 'var(--radius-control-compact)',
        sm: '4px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

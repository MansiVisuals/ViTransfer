import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // Dynamic user color borders for message bubbles
    // Sender colors (vibrant, high-contrast)
    'border-red-500',
    'border-orange-500',
    'border-amber-500',
    'border-yellow-400',
    'border-lime-500',
    'border-green-500',
    'border-emerald-500',
    'border-pink-500',
    'border-rose-500',
    'border-fuchsia-500',
    // Receiver colors (earth tones - beige, brown, army green)
    'border-amber-700',
    'border-orange-800',
    'border-stone-600',
    'border-yellow-700',
    'border-lime-700',
    'border-green-700',
    'border-emerald-800',
    'border-teal-800',
    'border-slate-600',
    'border-zinc-600',
    // Default
    'border-gray-500',
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          visible: "hsl(var(--primary-visible))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          visible: "hsl(var(--success-visible))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          visible: "hsl(var(--warning-visible))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          visible: "hsl(var(--destructive-visible))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          visible: "hsl(var(--info-visible))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius)",
        sm: "var(--radius-sm)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        'elevation-sm': 'var(--shadow-sm)',
        'elevation': 'var(--shadow)',
        'elevation-md': 'var(--shadow-md)',
        'elevation-lg': 'var(--shadow-lg)',
        'elevation-xl': 'var(--shadow-xl)',
      },
      backdropBlur: {
        'glass': '20px',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

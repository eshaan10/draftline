import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--brand)",
        "brand-fg": "var(--brand-fg)",
        "brand-soft": "var(--brand-soft)",
        surface: "var(--surface)",
        muted: "var(--muted)",
      },
    },
  },
  plugins: [],
};

export default config;

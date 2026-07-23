/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["'Space Grotesk'", "sans-serif"],
        body: ["'Space Grotesk'", "sans-serif"],
        mono: ["'Space Mono'", "monospace"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        amber: "#f0a500",
        "amber-dim": "rgba(240, 165, 0, 0.15)",
        panel: "#111111",
        raised: "#0f0f0f",
        "brand-gray": "#1A1A1A",
      },
      fontSize: {
        "display": ["clamp(3.5rem, 9vw, 8rem)", { lineHeight: "0.88", letterSpacing: "-0.03em" }],
        "display-sm": ["clamp(2.5rem, 6vw, 5rem)", { lineHeight: "0.9", letterSpacing: "-0.02em" }],
      },
    },
  },
  plugins: [],
}

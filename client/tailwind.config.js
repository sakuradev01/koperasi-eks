/** @type {import('tailwindcss').Config} */
const primary = {
  50: "#F5F8FB",
  100: "#E8EFF7",
  200: "#CCDBEC",
  300: "#9DB6D4",
  400: "#5F87B3",
  500: "#35619B",
  600: "#234A80",
  700: "#1A3A67",
  800: "#142D52",
  900: "#04214A",
  950: "#02142C",
};

const gold = {
  50: "#FBF7EA",
  100: "#F5EDD3",
  200: "#EADCA7",
  300: "#DCC675",
  400: "#CDAE4A",
  500: "#B8942F",
  600: "#96771F",
  700: "#745A16",
  800: "#4A3A12",
};

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary,
        gold,
        // Legacy remap: every pink-*/rose-* utility in the codebase now renders
        // the navy brand ramp (#04214A). New code must use primary-* instead.
        pink: primary,
        rose: { ...primary, 500: "#2E6AB0", 600: "#1E5290" },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(4,33,74,.06), 0 2px 6px rgba(4,33,74,.06)",
        "card-hover": "0 2px 4px rgba(4,33,74,.08), 0 8px 20px rgba(4,33,74,.10)",
      },
    },
  },
  plugins: [],
};

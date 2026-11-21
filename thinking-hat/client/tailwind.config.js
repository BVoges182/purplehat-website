import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(clientRoot, "index.html"), path.join(clientRoot, "src/**/*.{js,jsx}")],
  theme: {
    extend: {
      colors: {
        lilac: "var(--bg)",
        ink: "var(--text)",
        mute: "var(--text-mute)",
        plum: "var(--accent)",
        heading: "var(--heading)",
        hairline: "var(--hairline)",
        surface: "var(--surface)",
        band: "var(--band)",
      },
      fontFamily: {
        display: ["Barlow Condensed", "Arial Narrow", "sans-serif"],
        sans: ["Barlow", "Arial", "Helvetica", "sans-serif"],
      },
      boxShadow: {
        card: "none",
      },
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "0",
      },
    },
  },
  plugins: [],
};

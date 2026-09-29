export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        lilac: "#f6f3ff",
        ink: "#2a1548",
        mute: "#5c5470",
        plum: "#6d28d9",
      },
      fontFamily: {
        display: ["Nunito", "sans-serif"],
        sans: ["Outfit", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px rgba(76, 29, 149, 0.08)",
      },
    },
  },
  plugins: [],
};

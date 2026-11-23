/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Bricolage Grotesque"', "system-ui", "sans-serif"]
      },
      colors: {
        ink: "#1F1B3A",
        paper: "var(--bg)",
        night: "var(--bg)",
        plum: "rgb(var(--accent) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

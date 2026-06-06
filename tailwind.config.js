/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/index.html"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        kick: '#53fc18',
        darkBg: '#080a0d',
        darkCard: '#111519',
        darkInput: '#181d24'
      }
    }
  },
  plugins: [],
}

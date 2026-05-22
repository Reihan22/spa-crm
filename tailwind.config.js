module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#c46f62',
        blush: '#f8e7df',
        cream: '#fff8f5',
        ink: '#2f2422',
        muted: '#8b7470',
      },
      boxShadow: { soft: '0 12px 30px rgba(196,111,98,.18)' },
    },
  },
  plugins: [],
};

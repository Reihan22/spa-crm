module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        'primary-hover': '#1d4ed8',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        surface: 'var(--surface)',
        bg: 'var(--bg)',
        card: 'var(--card)',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,.05)',
        DEFAULT: '0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)',
        md: '0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1)',
        fab: '0 8px 24px -4px rgba(37,99,235,.5)',
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
      },
    },
  },
  plugins: [],
};

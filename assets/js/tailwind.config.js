/* Shared Tailwind (Play CDN) theme. Loaded right after the Tailwind CDN script. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#030720',
          900: '#050c2e',
          800: '#0b1645',
          700: '#111f5c',
          600: '#1a2b78',
          500: '#24389a',
        },
        neon: { DEFAULT: '#d4ff1a', 400: '#e2ff5c', 500: '#d4ff1a', 600: '#b8e000' },
        volt: { DEFAULT: '#3d6bff', 400: '#7393ff', 500: '#3d6bff', 600: '#2447e6' },
        muted: '#93a2d8',
        subtle: '#6474b0',
        danger: '#ff4d6d',
        warn: '#ffb547',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { site: '1240px' },
    },
  },
};

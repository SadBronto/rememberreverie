/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Reverie brand palette
        ink: {
          DEFAULT: '#1a1612',  // near-black warm background
          light: '#2a2420',
        },
        cream: {
          DEFAULT: '#f5f0e8',  // warm white for text/borders
          dark: '#e8e0d0',
        },
        amber: {
          film: '#c8a882',     // film/timestamp orange
        },
        gold: {
          soft: '#d4b896',     // subtle warm accent
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      aspectRatio: {
        '3/2': '3 / 2',
        '2/3': '2 / 3',
        '16/9': '16 / 9',
      }
    },
  },
  plugins: [],
}

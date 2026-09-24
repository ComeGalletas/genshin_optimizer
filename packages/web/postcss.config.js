import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // Tailwind looks for its config in the cwd by default; pin it to this
    // package so building from the repo root finds it too.
    tailwindcss: {
      config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)),
    },
    autoprefixer: {},
  },
};

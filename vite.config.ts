import { defineConfig } from 'vitest/config';
import { offline } from './scripts/offline.ts';

export default defineConfig({
  // Relative asset paths: the same build works at a domain root and under /hexdice/.
  base: './',
  plugins: [offline()],
  server: { port: Number(process.env.PORT ?? 5180), strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

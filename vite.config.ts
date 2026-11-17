import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: the same build works at a domain root and under /hexdice/.
  base: './',
  server: { port: Number(process.env.PORT ?? 5180), strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: Number(process.env.PORT ?? 5180), strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

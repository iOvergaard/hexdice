import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** The commit being built, shown under What's new; 'dev' where git can't tell. */
function buildHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}
import { offline } from './scripts/offline.ts';

export default defineConfig({
  // Relative asset paths: the same build works at a domain root and under /hexdice/.
  base: './',
  define: { __BUILD__: JSON.stringify(buildHash()) },
  plugins: [offline()],
  server: { port: Number(process.env.PORT ?? 5180), strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

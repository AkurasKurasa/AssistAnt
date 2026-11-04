import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  // Forks, not threads: the tests chdir into a temp folder, which worker threads can't do.
  test: { include: ['tests/**/*.test.ts'], pool: 'forks' },
});

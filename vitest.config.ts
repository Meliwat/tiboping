import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@tiboping/core': path.join(root, 'packages/core/src/index.ts'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: path.join(root, 'coverage'),
    },
    include: [
      'apps/**/test/**/*.{test,spec}.{ts,tsx}',
      'packages/**/test/**/*.{test,spec}.{ts,tsx}',
    ],
    passWithNoTests: false,
  },
});

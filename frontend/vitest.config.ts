import { defineConfig } from 'vitest/config';

// Unit-only: `npm run test` runs src/tests/** only.
// e2e/*.spec.ts needs @playwright/test — run separately via `npx playwright test`.
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});

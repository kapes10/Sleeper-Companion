// Live integration checks against real Sleeper data (network required). Run with: npm run test:live
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/live/**/*.live.ts'], testTimeout: 180_000 },
});

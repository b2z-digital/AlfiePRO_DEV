import { defineConfig } from 'vitest/config';
import path from 'path';

// Scoring tests. They lock today's desktop scoring (results table, handicaps, heat systems)
// and check the phone app produces exactly the same answers. Run with: npm test
export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^lucide-react$/, replacement: path.resolve(__dirname, './src/lib/lucide-alfie.tsx') },
    ],
  },
  define: {
    __APP_BUILD_DATE__: JSON.stringify('test'),
    __APP_BUILD_TIME__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    env: { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    silent: true,
  },
});

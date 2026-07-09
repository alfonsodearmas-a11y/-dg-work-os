import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      // Real 'server-only' throws under vitest's node env; stub it so modules
      // guarded for the client bundle (e.g. lib/db-admin) stay testable.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname, './'),
    }
  }
})

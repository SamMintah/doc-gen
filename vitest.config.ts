import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/index.ts',
        'src/cli/index.ts' // CLI entry point
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },

    // Global test setup
    globals: true,
    
    // Timeout settings
    testTimeout: 10000,
    hookTimeout: 10000,

    // Mock handling
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,

    // Setup files
    setupFiles: ['./test/setup.ts']
  },

  // Path resolution to match tsconfig.json
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/models': resolve(__dirname, './src/models'),
      '@/interfaces': resolve(__dirname, './src/interfaces'),
      '@/cli': resolve(__dirname, './src/cli'),
      '@/core': resolve(__dirname, './src/core'),
      '@/scanners': resolve(__dirname, './src/scanners'),
      '@/auth': resolve(__dirname, './src/auth'),
      '@/ai': resolve(__dirname, './src/ai'),
      '@/generators': resolve(__dirname, './src/generators'),
      '@/utils': resolve(__dirname, './src/utils')
    }
  },

  // TypeScript support
  esbuild: {
    target: 'es2022'
  },

  // Define global variables for testing
  define: {
    'process.env.NODE_ENV': '"test"'
  }
});
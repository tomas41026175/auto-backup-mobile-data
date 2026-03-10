import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Main process tests（Node.js 環境）
        test: {
          name: 'main',
          include: ['src/main/**/*.{test,spec}.ts'],
          environment: 'node'
        }
      },
      {
        // Renderer process tests（browser-like 環境）
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          environment: 'jsdom'
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    }
  }
})

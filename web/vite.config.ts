import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1/products': 'http://localhost:3080',
      '/api/v1/orders': 'http://localhost:3081',
      '/api/v1/screens': 'http://localhost:3090',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})

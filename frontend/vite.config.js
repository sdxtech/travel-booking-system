import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react(), {
    name: 'firebase-service-worker-scope',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/src/push-worker.js')) response.setHeader('Service-Worker-Allowed', '/')
        next()
      })
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'push-worker': fileURLToPath(new URL('./src/push-worker.js', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'push-worker' ? 'push-worker.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})

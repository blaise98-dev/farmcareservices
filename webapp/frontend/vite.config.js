import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  // Force Vite to resolve react/react-dom to a single copy so
  // echarts-for-react (and any other library with peerDeps) doesn't
  // get a second React instance, which breaks hooks.
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react:     path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    },
  },

  optimizeDeps: {
    include: ['echarts-for-react', 'echarts'],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})

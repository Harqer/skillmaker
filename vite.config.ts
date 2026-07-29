import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  optimizeDeps: {
    include: [
      '@clerk/clerk-react',
      '@clerk/tanstack-react-start',
      '@clerk/themes',
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/react-start',
      'seroval',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'framer-motion',
    ],
  },
  resolve: {
    alias: {
      '#': '/src',
      '@': '/src',
    },
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: ['@google/genai'],
    },
  },
})

export default config


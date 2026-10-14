import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base + HashRouter means the build works at any GitHub Pages path.
  base: './',
  server: {
    // The web app shares pure helpers with the Edge Functions (supabase/functions/_shared).
    fs: { allow: ['..'] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@supabase/supabase-js', '@tanstack/react-query'],
          charts: ['recharts'],
          ui: ['framer-motion', '@dnd-kit/core', 'cmdk', 'lucide-react'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

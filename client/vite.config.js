import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API_PORT lets you point the dev proxy at a non-default backend port
// (e.g. on macOS, port 5000 is often already taken by AirPlay Receiver).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 5000}`,
        changeOrigin: true,
      },
    },
  },
});

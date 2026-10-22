import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served by the PHP connector from /new/app/ (see HOSTINGER-DEPLOY-PACKAGE/public_html/new/index.php).
  base: process.env.BAM_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1 (not "localhost"): the API listens on IPv4 loopback only, and "localhost" can resolve to IPv6 first.
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});

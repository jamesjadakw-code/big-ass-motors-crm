import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Shared config written by Antigravity at the workspace root (CLAUDE CRM/.antigravity), bundled at build time.
const antigravityDir = fileURLToPath(new URL('../../.antigravity', import.meta.url));

export default defineConfig({
  // Served by the PHP connector from /new/app/ (see HOSTINGER-DEPLOY-PACKAGE/public_html/new/index.php).
  base: process.env.BAM_BASE || '/',
  plugins: [react()],
  resolve: { alias: { '@antigravity': antigravityDir } },
  server: {
    port: 5173,
    fs: { allow: ['.', antigravityDir] },
    // 127.0.0.1 (not "localhost"): the API listens on IPv4 loopback only, and "localhost" can resolve to IPv6 first.
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});

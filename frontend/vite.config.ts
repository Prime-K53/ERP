import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const cjsGuardPlugin = (): Plugin => ({
  name: 'prime-cjs-guard',
  enforce: 'pre',
  transform(code, id) {
    if (!id.includes('node_modules/react') && !id.includes('node_modules/react-dom') && !id.includes('node_modules/scheduler')) return;
    if (id.endsWith('.mjs') || id.endsWith('.esm.js')) return;
    if (code.includes('exports.') && !code.startsWith('var exports') && !code.startsWith('var module')) {
      return {
        code: `var exports = {};\nvar module = { exports: exports };\n${code}`,
        map: null,
      };
    }
  },
});

const inlineFontsPlugin = (): Plugin => ({
  name: 'prime-inline-fonts',
  enforce: 'pre',
  load(id: string) {
    if (!/\.(ttf|woff|woff2)$/.test(id)) return;
    const mimeMap: Record<string, string> = { ttf: 'font/truetype', woff: 'font/woff', woff2: 'font/woff2' };
    const ext = id.split('.').pop()!;
    const mime = mimeMap[ext] ?? 'font/truetype';
    try { const b64 = fs.readFileSync(id).toString('base64'); return `export default 'data:${mime};base64,${b64}'`; }
    catch { return null; }
  },
});

const CSP = "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:* data: blob: prime-pdf: https://*.supabase.co wss://*.supabase.co; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* https://primebooks-erp.onrender.com ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:* data: blob: https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://openrouter.ai https://open.bigmodel.cn https://api.openai.com https://api.opencode.ai; frame-src 'self' blob: data: prime-pdf: http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; object-src 'self' blob: data: prime-pdf:; worker-src 'self' blob:; child-src 'self' blob:; font-src 'self' data: blob: https://fonts.gstatic.com";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '127.0.0.1',
        https: true,
        allowedHosts: ['127.0.0.1', 'localhost'],
        headers: { 'Content-Security-Policy': CSP },
        proxy: {
          '/api': {
            // Use the explicit IPv4 loopback address. `localhost` can resolve to
            // IPv6 (::1) first on some systems, but the backend binds IPv4
            // (0.0.0.0). A IPv6-first resolution makes the proxy fail to connect
            // and Vite answers every /api request with a 500 "Proxy error".
            target: 'http://127.0.0.1:3000',
            changeOrigin: true,
            secure: false,
          },
        },
      },
      plugins: [basicSsl(), react(), inlineFontsPlugin()],
      optimizeDeps: { include: ['react','react-dom','recharts','lucide-react','react-router-dom','idb','date-fns','@react-pdf/renderer','zustand','dexie'], exclude: ['@supabase/supabase-js','yoga-layout'] },
      define: { 'process.env.API_KEY': JSON.stringify(''), 'process.env.GEMINI_API_KEY': JSON.stringify('') },
      esbuild: { drop: mode === 'production' ? ['console'] : [] },
      resolve: { dedupe: ['react', 'react-dom', 'dexie'], alias: [{ find: '@', replacement: path.resolve(__dirname, '.') }] },
      base: env.VITE_BASE_URL || './',
      build: { outDir: 'dist', emptyOutDir: true, manifest: 'asset-manifest.json', sourcemap: false, commonjsOptions: { transformMixedEsModules: true, requireReturnsDefault: 'auto' } }
    };
});

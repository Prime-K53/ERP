/**
 * Builds the server-side official-document renderer bundle consumed by the
 * ERP backend (backend/services/officialDocument/primeRenderer.cjs).
 *
 * The bundle contains ONLY ERP-owned template/mapping code; react,
 * @react-pdf/renderer and qrcode stay EXTERNAL so the backend resolves them
 * from the workspace at runtime (single source of truth, no vendored deps).
 *
 * Run: npm run build:doc-renderer  (workspace:frontend)
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.resolve(frontendRoot, '../backend/services/officialDocument/primeRenderer.cjs');

// Browser-only storage modules (IndexedDB/localStorage/Supabase web client)
// must NOT initialize inside the Node bundle. The document renderer never
// reads them; consumers degrade to built-in defaults (same as a fresh ERP
// install). One shim replaces all four modules.
const NODE_SAFE_STORAGE_STUB = [
  '// Node-safe shim: replaces the browser storage layer inside the official',
  '// document renderer bundle. Never used at render time.',
  'export const initDB = async () => undefined;',
  'const passthrough = { get: (_t, prop) => (prop === "then" ? undefined : async () => null) };',
  'export const dbService = new Proxy({}, passthrough);',
  'export const productionDb = new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : { toArray: async () => [] }) });',
  'export const supabase = null;',
  'export const OFFLINE_DB = null;',
].join('\n');

const nodeSafeStoragePlugin = {
  name: 'node-safe-storage',
  setup(build) {
    build.onLoad({ filter: /[\\\/]services[\\\/](db|productionDb|supabaseClient|cloudMode)\.ts$/ }, async (args) => ({
      contents: NODE_SAFE_STORAGE_STUB,
      loader: 'ts',
      resolveDir: path.dirname(args.path),
    }));
  },
};

await build({
  entryPoints: [path.join(frontendRoot, 'server', 'renderOfficialDocument.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  external: ['@react-pdf/renderer', 'react', 'qrcode'],
  alias: { '@': frontendRoot },
  plugins: [nodeSafeStoragePlugin],
  // The template graph touches Vite-only `import.meta.env` (debug flags,
  // supabase client). In the Node CJS bundle we substitute a safe stub so
  // those modules initialize without a browser environment.
  define: { 'import.meta.env': '__PRIME_DOC_VITE_ENV__' },
  banner: {
    js: [
      '// Vite-env shim for the server-side official document renderer.',
      'if (typeof globalThis.__PRIME_DOC_VITE_ENV__ === "undefined") {',
      '  globalThis.__PRIME_DOC_VITE_ENV__ = { DEV: false, PROD: true, MODE: "production" };',
      '}',
    ].join('\n'),
  },
  logLevel: 'info',
});

console.log(`[build-official-document-renderer] wrote ${outFile}`);

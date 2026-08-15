/**
 * Production server startup script for Prime ERP Web App
 * Starts the backend API server which also serves the built frontend.
 * Accessible at http://localhost:3000 and http://192.168.x.x:3000
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDistDir = path.join(rootDir, 'frontend', 'dist');
const backendEntry = path.join(backendDir, 'index.cjs');

// Verify backend entry exists
if (!fs.existsSync(backendEntry)) {
  console.error(`[STARTUP] Backend entry not found at: ${backendEntry}`);
  process.exit(1);
}

// Verify frontend dist exists (build if not found)
if (!fs.existsSync(frontendDistDir)) {
  console.log('[STARTUP] Frontend dist not found. Building frontend...');
  const buildResult = spawn('npm', ['run', 'build:frontend'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });
  buildResult.on('exit', (code) => {
    if (code !== 0) {
      console.error('[STARTUP] Frontend build failed.');
      process.exit(1);
    }
    startBackend();
  });
} else {
  startBackend();
}

function startBackend() {
  console.log('[STARTUP] Starting Prime ERP Server...');
  console.log(`[STARTUP] Backend: ${backendEntry}`);
  console.log(`[STARTUP] Frontend: ${frontendDistDir}`);
  console.log(`[STARTUP] Server will be available at:`);
  console.log(`[STARTUP]   http://localhost:3000`);
  console.log(`[STARTUP]   http://127.0.0.1:3000`);
  console.log(`[STARTUP]   http://<LAN-IP>:3000 (for other devices on your network)`);

  const server = spawn('node', [backendEntry], {
    cwd: backendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    shell: true,
  });

  server.on('exit', (code) => {
    console.log(`[STARTUP] Server exited with code ${code}`);
    process.exit(code || 0);
  });

  server.on('error', (error) => {
    console.error('[STARTUP] Failed to start server:', error.message);
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('[STARTUP] Shutting down server...');
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

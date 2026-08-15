const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const DIST_BACKEND = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');

function log(msg) { console.log(`[BUILD] ${msg}`); }

// Step 1: Ensure backend exe exists
const exePath = path.join(DIST_BACKEND, 'PrimeERP.exe');
if (!fs.existsSync(exePath)) {
  log('Backend exe not found. Compiling with pkg...');
  execSync('npx pkg index.cjs --targets node18-win-x64 --output ../dist/PrimeERP.exe', {
    cwd: BACKEND,
    stdio: 'inherit',
    timeout: 600000,
  });
}

// Step 2: Build frontend if not already built
const frontendDist = path.join(FRONTEND, 'dist');
if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  log('Frontend dist not found. Building with Vite...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit', timeout: 300000 });
}

// Step 3: Ensure frontend dist exists
if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  log('ERROR: Frontend build failed - no index.html found.');
  process.exit(1);
}

// Step 4: Clean and create release directory
if (fs.existsSync(RELEASE)) {
  fs.rmSync(RELEASE, { recursive: true, force: true });
}
fs.mkdirSync(RELEASE, { recursive: true });

// Step 5: Copy backend exe
fs.cpSync(exePath, path.join(RELEASE, 'PrimeERP.exe'));
log('Copied PrimeERP.exe');

// Step 6: Copy frontend dist
const releaseFrontend = path.join(RELEASE, 'frontend', 'dist');
fs.cpSync(frontendDist, releaseFrontend, { recursive: true });
log(`Copied frontend dist (${fs.readdirSync(releaseFrontend).length} files)`);

// Step 7: Create launcher batch file
const launcherContent = `@echo off
title Prime ERP Server
echo ========================================
echo   Prime ERP - Starting Server...
echo ========================================
echo.
start "" http://localhost:3000
"%~dp0PrimeERP.exe"
echo.
echo Server stopped.
pause
`;
fs.writeFileSync(path.join(RELEASE, 'Start PrimeERP.bat'), launcherContent);
log('Created launcher: Start PrimeERP.bat');

// Step 8: Create README
const readmeContent = `Prime ERP - Portable Edition
=============================

How to use:
1. Double-click "Start PrimeERP.bat"
2. Your browser will open to http://localhost:3000
3. Complete the Setup Wizard on first run
4. Close the console window to stop the server

System Requirements:
- Windows 10 or later (64-bit)
- No Node.js required - runtime is bundled

Data is stored in the "storage" folder (created on first run).
To reset all data, delete the "storage" folder.
`;
fs.writeFileSync(path.join(RELEASE, 'README.txt'), readmeContent);
log('Created README.txt');

// Step 9: Show result
const size = fs.statSync(exePath).size;
const releaseSize = fs.readdirSync(RELEASE).reduce((acc, f) => {
  const p = path.join(RELEASE, f);
  if (fs.statSync(p).isDirectory()) {
    return acc + fs.readdirSync(p, { recursive: true }).reduce((a, f2) => a + fs.statSync(path.join(p.split('\\').slice(-1)[0] === f ? p : path.join(RELEASE, f), f2)).size, 0);
  }
  return acc + fs.statSync(p).size;
}, 0);
log(`Done! Release folder: ${RELEASE}`);
log(`  PrimeERP.exe: ${(size / 1024 / 1024).toFixed(1)} MB`);
log(`  Total size: ~${(releaseSize / 1024 / 1024).toFixed(1)} MB`);
`;

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXE = path.join(ROOT, 'dist', 'PrimeERP.exe');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const RELEASE = path.join(ROOT, 'release');

function log(msg) { console.log(`[ASSEMBLE] ${msg}`); }

// Verify sources
if (!fs.existsSync(EXE)) { log('ERROR: PrimeERP.exe not found. Run pkg first.'); process.exit(1); }
if (!fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) { log('ERROR: Frontend dist not found. Run vite build first.'); process.exit(1); }

// Clean & create release
if (fs.existsSync(RELEASE)) fs.rmSync(RELEASE, { recursive: true, force: true });
fs.mkdirSync(RELEASE, { recursive: true });

// Copy exe
fs.cpSync(EXE, path.join(RELEASE, 'PrimeERP.exe'));
log('Copied PrimeERP.exe');

// Copy frontend dist
fs.cpSync(FRONTEND_DIST, path.join(RELEASE, 'frontend', 'dist'), { recursive: true });
log('Copied frontend dist');

// Launcher
fs.writeFileSync(path.join(RELEASE, 'Start PrimeERP.bat'), `@echo off
title Prime ERP Server
cd /d "%~dp0"
echo ========================================
echo   Prime ERP - Starting Server...
echo ========================================
echo.
echo Server will open at http://localhost:3000
echo Close this window to stop the server.
echo.
start "" http://localhost:3000
"%~dp0PrimeERP.exe"
echo.
echo Server stopped.
pause
`);

// README
fs.writeFileSync(path.join(RELEASE, 'README.txt'), `Prime ERP - Portable Edition
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
`);

const exeSize = (fs.statSync(EXE).size / 1024 / 1024).toFixed(1);
function dirSize(p) { return fs.readdirSync(p, { recursive: true, withFileTypes: true }).reduce((a, e) => a + (e.isFile() ? fs.statSync(path.join(e.path, e.name)).size : a), 0); }
const totalSize = ((fs.statSync(EXE).size + dirSize(FRONTEND_DIST)) / 1024 / 1024).toFixed(1);
log(`Done! Release at: ${RELEASE}`);
log(`  PrimeERP.exe: ${exeSize} MB`);
log(`  Frontend dist: ${totalSize - exeSize} MB`);
log(`  Total: ${totalSize} MB`);

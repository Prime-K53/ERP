/**
 * Stops the Prime ERP server by killing the process on port 3000.
 */
const { execSync } = require('child_process');
const os = require('os');

try {
  if (os.platform() === 'win32') {
    execSync('netstat -ano | findstr :3000', { stdio: 'pipe' });
    const output = execSync(
      'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :3000 ^| findstr LISTENING\') do @taskkill /F /PID %a',
      { shell: true, stdio: 'pipe' }
    );
    console.log('[STOP] Server stopped successfully.');
  } else {
    execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null', { stdio: 'pipe' });
    console.log('[STOP] Server stopped successfully.');
  }
} catch (err) {
  console.log('[STOP] No server running on port 3000.');
}

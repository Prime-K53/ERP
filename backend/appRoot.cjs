const path = require('path');

function getAppRoot() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return path.resolve(__dirname);
}

function getFrontendDistPath() {
  if (process.pkg) {
    return path.join(path.dirname(process.execPath), 'frontend', 'dist');
  }
  return path.resolve(__dirname, '..', 'frontend', 'dist');
}

module.exports = { getAppRoot, getFrontendDistPath };

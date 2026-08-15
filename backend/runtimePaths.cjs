const fs = require('fs');
const path = require('path');
const { getAppRoot } = require('./appRoot.cjs');

const resolveEnvPath = (value, fallback) => path.resolve(value || fallback);

const storageDir = resolveEnvPath(
  process.env.PRIME_ERP_STORAGE_DIR,
  path.join(getAppRoot(), 'storage')
);
const backupDir = resolveEnvPath(
  process.env.PRIME_ERP_BACKUP_DIR,
  path.join(storageDir, 'backups')
);
const tempDir = resolveEnvPath(
  process.env.PRIME_ERP_TEMP_DIR,
  path.join(storageDir, 'temp')
);
const secureKeysDir = resolveEnvPath(
  process.env.PRIME_ERP_SECURE_KEYS_DIR,
  path.join(storageDir, 'secure', 'keys')
);
const workspaceConfigPath = resolveEnvPath(
  process.env.PRIME_ERP_WORKSPACE_CONFIG,
  path.join(storageDir, 'workspace.json')
);
const licensePath = resolveEnvPath(
  process.env.PRIME_ERP_LICENSE_PATH,
  path.join(storageDir, 'license.json')
);

// Dynamic dbPath that checks workspace config first
const getDbPath = () => {
  // Default fallback path
  const defaultDbPath = resolveEnvPath(
    process.env.DB_PATH,
    path.join(storageDir, 'database.db')
  );

  // Check if workspace config exists and has a dbPath
  if (fs.existsSync(workspaceConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8'));
      if (config.dbPath) {
        // Validate the workspace database file is not empty/corrupt
        if (fs.existsSync(config.dbPath)) {
          const stat = fs.statSync(config.dbPath);
          if (stat.size === 0) {
            console.warn(`[RuntimePaths] Workspace database at "${config.dbPath}" is empty (0 bytes). Falling back to storage default.`);
            return defaultDbPath;
          }
        } else {
          console.warn(`[RuntimePaths] Workspace database at "${config.dbPath}" not found. Falling back to storage default.`);
          return defaultDbPath;
        }
        return config.dbPath;
      }
    } catch (e) {
      console.warn(`[RuntimePaths] Failed to read workspace config, falling back to storage default:`, e.message);
    }
  }
  // Fall back to default path
  return defaultDbPath;
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

const ensureRuntimeDirs = () => {
  const currentDbPath = getDbPath();
  [
    storageDir,
    backupDir,
    tempDir,
    secureKeysDir,
    path.dirname(currentDbPath),
    path.dirname(workspaceConfigPath),
    path.dirname(licensePath),
  ].forEach(ensureDir);
};

module.exports = {
  storageDir,
  backupDir,
  tempDir,
  secureKeysDir,
  getDbPath,
  workspaceConfigPath,
  licensePath,
  ensureDir,
  ensureRuntimeDirs,
};

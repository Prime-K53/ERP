const fs = require('fs');
const path = require('path');
const { backupDir, ensureRuntimeDirs } = require('../runtimePaths.cjs');

class BackupService {
  constructor(backupDir) {
    ensureRuntimeDirs();
  }

  async createBackup() {
    console.log('[BackupService] Skipping SQLite backup - using Supabase cloud backup.');
    return null;
  }

  cleanupOldBackups() {
  }

  async verifyIntegrity(filePath) {
    return true;
  }

  async exportData(exportDir = null) {
    console.log('[BackupService] Skipping SQLite export - data is stored in Supabase.');
    return { path: exportDir || backupDir };
  }
}

module.exports = BackupService;

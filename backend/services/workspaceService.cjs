const fs = require('fs');
const path = require('path');
const os = require('os');
const { workspaceConfigPath, ensureRuntimeDirs } = require('../runtimePaths.cjs');

class WorkspaceService {
  constructor() {
    this.workspaceConfigPath = workspaceConfigPath;
  }

  async initializeWorkspace(organizationName, userId = null) {
    const documentsPath = path.join(os.homedir(), 'Documents');
    const safeOrgName = organizationName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDir = userId ? `${safeOrgName}_${userId.replace(/[^a-zA-Z0-9_-]/g, '')}` : safeOrgName;
    const workspacePath = path.join(documentsPath, userDir);

    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    const syncFolder = path.join(workspacePath, 'Sync');
    if (!fs.existsSync(syncFolder)) {
      fs.mkdirSync(syncFolder, { recursive: true });
    }

    const config = {
      workspacePath,
      organizationName,
      userId,
      initializedAt: new Date().toISOString()
    };

    ensureRuntimeDirs();

    fs.writeFileSync(this.workspaceConfigPath, JSON.stringify(config, null, 2));

    return config;
  }

  getWorkspaceConfig() {
    if (fs.existsSync(this.workspaceConfigPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.workspaceConfigPath, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async saveToWorkspace(folder, filename, data) {
    const config = this.getWorkspaceConfig();
    if (!config || !config.workspacePath) {
      throw new Error('Workspace not initialized');
    }

    const targetDir = path.join(config.workspacePath, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    
    let content = data;
    if (typeof data === 'string' && data.startsWith('data:')) {
      const base64Data = data.split(',')[1];
      content = Buffer.from(base64Data, 'base64');
    } else if (typeof data === 'object' && data !== null) {
      content = JSON.stringify(data, null, 2);
    }

    fs.writeFileSync(targetPath, content);
    return targetPath;
  }
}

module.exports = new WorkspaceService();

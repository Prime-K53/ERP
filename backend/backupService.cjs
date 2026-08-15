const { db } = require('./db.cjs');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const backupDir = path.join(__dirname, '../backups');
const fullBackupDir = path.join(backupDir, 'full');
const incrementalBackupDir = path.join(backupDir, 'incremental');

[backupDir, fullBackupDir, incrementalBackupDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const ENCRYPTION_KEY = crypto.randomBytes(32);
const IV = crypto.randomBytes(16);

function encryptFile(inputPath, outputPath) {
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, IV);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);
  input.pipe(cipher).pipe(output);
  return new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

async function createBackup(backupType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupType === 'full' ? fullBackupDir : incrementalBackupDir,
    `prime-erp-backup-${timestamp}.${backupType}.db`
  );

  await new Promise((resolve, reject) => {
    db.backup(backupPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const encryptedPath = `${backupPath}.enc`;
  await encryptFile(backupPath, encryptedPath);
  fs.unlinkSync(backupPath);
  return encryptedPath;
}

setInterval(() => {
  createBackup('incremental').catch(console.error);
}, 3600000);

setInterval(() => {
  createBackup('full').catch(console.error);
}, 86400000);

module.exports = { createBackup };
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const { licensePath, ensureRuntimeDirs } = require('../runtimePaths.cjs');

class LicenseService {
  constructor() {
    this.licensePath = licensePath;
    this.fingerprint = this.generateFingerprint();
    ensureRuntimeDirs();
  }

  generateFingerprint() {
    const interfaces = os.networkInterfaces();
    const macs = Object.values(interfaces)
      .flat()
      .filter(i => !i.internal && i.mac !== '00:00:00:00:00:00')
      .map(i => i.mac);
    
    const cpuInfo = os.cpus()[0].model;
    const totalMemory = os.totalmem();
    
    const rawData = `${macs.sort().join(',')}|${cpuInfo}|${totalMemory}`;
    return crypto.createHash('sha256').update(rawData).digest('hex');
  }

  getFingerprint() {
    return this.fingerprint;
  }

  validateLicense() {
    if (!fs.existsSync(this.licensePath)) {
      console.warn('No license file found. System running in TRIAL/READ-ONLY mode.');
      return { valid: false, mode: 'TRIAL' };
    }

    try {
      const license = JSON.parse(fs.readFileSync(this.licensePath, 'utf8'));
      
      // Verify signature/hash against machine fingerprint
      const licenseSecret = process.env.LICENSE_SECRET || 'LOCAL_DEV_SECRET';
      if (!process.env.LICENSE_SECRET) {
        console.warn('[LICENSE NOTICE] Using fallback local secret for validation.');
      }
      const expectedHash = crypto.createHmac('sha256', licenseSecret)
        .update(this.fingerprint + license.expiry)
        .digest('hex');

      if (license.signature !== expectedHash) {
        return { valid: false, mode: 'INVALID' };
      }

      const now = Date.now();
      if (now > license.expiry) {
        return { valid: false, mode: 'EXPIRED' };
      }

      return { valid: true, mode: 'FULL', expires: new Date(license.expiry).toISOString() };
    } catch (err) {
      console.error('License validation error:', err);
      return { valid: false, mode: 'ERROR' };
    }
  }

  // Utility to generate a trial license for development
  generateTrialLicense(days = 30) {
    const expiry = Date.now() + (days * 24 * 60 * 60 * 1000);
    const licenseSecret = process.env.LICENSE_SECRET || 'LOCAL_DEV_SECRET';
    if (!process.env.LICENSE_SECRET) {
      console.warn('[LICENSE NOTICE] Generating trial license with fallback local secret.');
    }
    const signature = crypto.createHmac('sha256', licenseSecret)
      .update(this.fingerprint + expiry)
      .digest('hex');
    
    const license = {
      fingerprint: this.fingerprint,
      expiry,
      signature,
      type: 'TRIAL'
    };

    fs.writeFileSync(this.licensePath, JSON.stringify(license, null, 2));
    return license;
  }
}

module.exports = new LicenseService();

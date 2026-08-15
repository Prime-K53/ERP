/**
 * Jest stub for otplib (ESM-only package that cannot be parsed by the CJS jest runtime).
 * Provides the subset of the API used by the backend.
 */
module.exports = {
  totp: {
    generate: () => '000000',
    verify: () => true
  },
  authenticator: {
    generateSecret: () => 'test-secret',
    keyuri: () => 'otpauth://totp/Test',
    check: () => true,
    generate: () => '000000'
  }
};

module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^otplib$': '<rootDir>/tests/__mocks__/otplib.cjs'
  },
  testMatch: [
    '**/tests/**/*.test.cjs',
    '**/tests/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/integration/**/*.test.cjs'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'referral.test.cjs',
    'profitMargin.integration.test.js',
    'tenant_isolation_security.test.js',
    'multiTenantCompanyResolution.test.js'
  ],
  collectCoverageFrom: [
    'services/**/*.cjs',
    'middleware/**/*.cjs',
    '!node_modules/'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 65,
      statements: 65
    }
  },
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1
};

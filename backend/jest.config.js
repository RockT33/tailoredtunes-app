module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  testTimeout: 10000,
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  automock: false,
  moduleNameMapper: {
    '^express-rate-limit$': '<rootDir>/__mocks__/express-rate-limit.js'
  }
};

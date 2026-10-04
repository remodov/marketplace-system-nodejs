module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false }] },
  testTimeout: 30000,
};

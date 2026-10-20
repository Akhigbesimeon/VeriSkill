/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // Match ts-node-dev's --transpile-only to sidestep node16-module import rules.
      isolatedModules: true,
      tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true },
    }],
  },
}

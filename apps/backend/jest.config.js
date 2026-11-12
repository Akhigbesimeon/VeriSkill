/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // isolatedModules (transpile-only) matches ts-node-dev's --transpile-only and
      // sidesteps node16-module import rules. It lives in the tsconfig options now;
      // the top-level ts-jest `isolatedModules` option is deprecated.
      tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true, isolatedModules: true },
    }],
  },
}

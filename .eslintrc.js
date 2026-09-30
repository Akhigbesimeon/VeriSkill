module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Disallow console.log in production code; use a logger service
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Enforce explicit return types on exported functions
    '@typescript-eslint/explicit-module-boundary-types': 'warn',
    // Disallow any unless explicitly suppressed with a comment
    '@typescript-eslint/no-explicit-any': 'warn',
    // Unused variables are errors (catches dead code early)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'artifacts/',
    'cache/',
    'coverage/',
  ],
}

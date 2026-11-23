# Contributing to cronlint

Thank you for considering contributing to `cronlint`!

## Guiding Principles

- **Zero runtime dependencies**: Keep `package.json` free of runtime and dev dependencies; rely only on built-in Node.js APIs (`node:test`, `node:assert`, `node:fs`, etc.).
- **Node.js ESM**: Target Node.js `>=18.18.0` using standard ES Modules (`"type": "module"`).
- **Clear error messages**: Every validation failure should explain *what* failed and *which field* caused it.
- **TypeScript declarations**: Keep `src/index.d.ts` in sync with any public API changes in `src/index.js`.

## Local Setup

```bash
git clone https://github.com/quetaplays1999-art/cronlint.git
cd cronlint
npm test
```

## Making Changes

1. Fork the repository and create a topic branch from `main`.
2. Make your changes and add unit and/or CLI tests in `test/cronlint.test.js`.
3. Ensure `npm test` passes completely with zero failures.
4. Open a pull request describing the motivation and summary of your changes.

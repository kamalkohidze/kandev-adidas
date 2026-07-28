# Tech Stack

- Node.js ESM project (`package.json` has `type: module`).
- Requires Node >=20.
- No external runtime dependencies currently declared; code uses built-in Node APIs and local modules.
- Test runner is built-in `node --test`, exposed as `npm test`.
- Platform data fixtures come from `src/platform/seed-data.js` via `createSeedData()` using `structuredClone`.